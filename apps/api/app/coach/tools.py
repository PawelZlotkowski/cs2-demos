"""Coach tools (AI Coach plan §5), defined once for every adapter.

Each tool is a plain function with typed keyword arguments and a docstring
written for the model. The MCP server (``coach/mcp_server.py``, run from
``apps/mcp/``) and the in-process adapter (``coach/backends.py``) both read
the same signature, so the schema the model sees cannot drift.

Results are compact JSON dicts: short keys, rounded numbers, callouts instead
of coordinates, names instead of SteamIDs where the model has to talk about
people. The 14B model has a 32k context, so every result stays small (sizes
are logged per call). A tool that cannot answer returns ``{"error": ...}``
rather than raising, so the model can correct its arguments.

``search_knowledge`` reads the RAG index (``app/rag``). ``request_clip`` only
queues a job: the CS Demo Manager recorder (T00, T40) is not connected yet.
"""

from __future__ import annotations

import functools
import json
import logging
import threading
from collections import OrderedDict
from collections.abc import Callable
from typing import Annotated, Any, Literal

from pydantic import BaseModel, Field

from app.analysis.detectors import DETECTORS
from app.analysis.match_data import MatchData, RoundData, build_match_data
from app.maps.zones import zone_at
from app.models.contracts import Finding, SelectedMoment

logger = logging.getLogger(__name__)

MatchId = Annotated[str, Field(description="Match id from the context line.")]
PlayerId = Annotated[str, Field(description="SteamID64 of the coached player, from the context line.")]
RoundNo = Annotated[int, Field(ge=1, description="Round number, 1-based.")]

# Hard caps that keep results inside the context budget
MAX_FINDINGS = 40
MAX_TIMELINE_EVENTS = 60


class ToolError(ValueError):
    """The model asked for something that does not exist; shown to the model."""


# --- data access -----------------------------------------------------------


class _Data:
    """Repository access plus a small cache of built ``MatchData``."""

    def __init__(self) -> None:
        self._repo: Any = None
        self._cache: OrderedDict[str, MatchData] = OrderedDict()
        self._lock = threading.Lock()

    @property
    def repo(self) -> Any:
        if self._repo is None:
            from app.repositories.matches import repo

            self._repo = repo
        return self._repo

    def use(self, repository: Any) -> None:
        with self._lock:
            self._repo = repository
            self._cache.clear()

    def match(self, match_id: str) -> MatchData:
        with self._lock:
            if match_id in self._cache:
                self._cache.move_to_end(match_id)
                return self._cache[match_id]
        if not self.repo.get(match_id):
            raise ToolError(f"Unknown match_id {match_id!r}.")
        if not self.repo.has_analysis_input(match_id):
            raise ToolError("This match has no analysis data. It was parsed before the coach existed.")
        analysis, replays = self.repo.load_analysis_input(match_id)
        data = build_match_data(analysis, replays)
        with self._lock:
            self._cache[match_id] = data
            while len(self._cache) > 4:
                self._cache.popitem(last=False)
        return data

    def findings(self, match_id: str, player_id: str, **filters: Any) -> list[Finding]:
        if not self.repo.analysis.has_analysis(match_id, player_id):
            raise ToolError("No analysis for that player in this match.")
        return self.repo.analysis.findings(match_id, player_id, **filters)


data = _Data()


def use_repository(repository: Any) -> None:
    """Point the tools at another repository (tests, eval runs)."""
    data.use(repository)


# --- registry --------------------------------------------------------------

ToolFn = Callable[..., dict[str, Any]]
TOOLS: dict[str, ToolFn] = {}


def tool(fn: ToolFn) -> ToolFn:
    """Register a tool; turn ``ToolError`` into an ``{"error": ...}`` result and log sizes."""

    @functools.wraps(fn)
    def wrapper(**kwargs: Any) -> dict[str, Any]:
        try:
            result = fn(**kwargs)
        except ToolError as exc:
            result = {"error": str(exc)}
        logger.info("tool %s -> %d bytes", fn.__name__, len(to_json(result)))
        return result

    TOOLS[fn.__name__] = wrapper
    return wrapper


def to_json(result: Any) -> str:
    return json.dumps(result, separators=(",", ":"), ensure_ascii=False)


# --- helpers ---------------------------------------------------------------


def _round(match: MatchData, round_no: int) -> RoundData:
    rd = match.round(round_no)
    if rd is None or rd.is_knife:
        playable = [r.number for r in match.playable_rounds()]
        raise ToolError(f"No round {round_no}. Rounds are {playable[0]}-{playable[-1]}." if playable else "No rounds.")
    return rd


def _zone(match: MatchData, pos: tuple[float, ...] | None) -> str | None:
    return zone_at(match.map_name, pos[0], pos[1]) if pos else None


def _finding_row(f: Finding) -> dict[str, Any]:
    return {
        "id": f.id,
        "kind": f.kind,
        "detector": f.detector,
        "round": f.round,
        "t": round(f.t, 1),
        "zone": f.zone,
        "severity": round(f.severity, 2),
        "summary": f.summary,
    }


def _weapon(name: str) -> str:
    return name.removeprefix("weapon_") if name else name


# --- tools -----------------------------------------------------------------


@tool
def list_rounds(match_id: MatchId, player_id: PlayerId) -> dict[str, Any]:
    """List every round of the match for the coached player: side, whether the player's
    team won, the score after the round (player's team first), and the player's kills,
    deaths and damage. Use it to get an overview before looking at single rounds."""
    match = data.match(match_id)
    stats = {s.round: s for s in data.repo.analysis.round_stats(match_id, player_id)}
    own = opp = 0
    rows = []
    for rd in match.playable_rounds():
        side = rd.sides.get(player_id)
        if side is None:
            continue
        won = rd.winner == side if rd.winner else None
        if won is True:
            own += 1
        elif won is False:
            opp += 1
        s = stats.get(rd.number)
        rows.append(
            {
                "round": rd.number,
                "side": side,
                "won": won,
                "score": f"{own}-{opp}",
                "k": s.kills if s else None,
                "d": s.deaths if s else None,
                "dmg": s.damage if s else None,
            }
        )
    return {"map": match.map_name, "rounds": rows}


@tool
def get_round_stats(match_id: MatchId, player_id: PlayerId, round: RoundNo) -> dict[str, Any]:
    """Numbers for the coached player in one round (kills, deaths, damage, utility thrown,
    flashes, money, trades, time alive). Every number here may be quoted when you cite a
    finding from the same round."""
    stats = next((s for s in data.repo.analysis.round_stats(match_id, player_id) if s.round == round), None)
    if stats is None:
        raise ToolError(f"No stats for round {round}.")
    return stats.model_dump(by_alias=True, exclude={"player_id"}, exclude_none=True)


@tool
def list_findings(
    match_id: MatchId,
    player_id: PlayerId,
    round: Annotated[int | None, Field(description="Only this round.")] = None,
    kind: Annotated[
        Literal["mistake", "good", "context", "pattern"] | None, Field(description="Only this kind.")
    ] = None,
    detector: Annotated[str | None, Field(description="Only this detector, e.g. untraded_death.")] = None,
) -> dict[str, Any]:
    """Findings the detectors produced for the coached player: id, kind, detector, round,
    round clock time t (s), callout zone, severity 0-1 and a one-line summary. Filter by
    round, kind or detector. Cite findings as [F12]. Use get_finding for the evidence."""
    if detector is not None and detector not in DETECTORS:
        raise ToolError(f"Unknown detector {detector!r}. Known: {', '.join(DETECTORS)}.")
    rows = data.findings(match_id, player_id, round_no=round, kind=kind, detector=detector)
    rows = sorted(rows, key=lambda f: -f.severity)[:MAX_FINDINGS] if len(rows) > MAX_FINDINGS else rows
    return {"count": len(rows), "findings": [_finding_row(f) for f in rows]}


@tool
def get_finding(
    match_id: MatchId,
    player_id: PlayerId,
    finding_id: Annotated[str, Field(pattern=r"^F\d+$", description="Finding id, e.g. F12.")],
) -> dict[str, Any]:
    """One finding with its full evidence. The evidence holds every number you may quote
    about it (distances in m, times in s, speeds in u/s, money in $)."""
    f = next((f for f in data.findings(match_id, player_id) if f.id == finding_id), None)
    if f is None:
        raise ToolError(f"No finding {finding_id} for this player.")
    match = data.match(match_id)
    row = _finding_row(f)
    row["evidence"] = f.evidence
    row["others"] = [match.name(o) for o in f.other_ids]
    return row


@tool
def get_round_timeline(match_id: MatchId, round: RoundNo) -> dict[str, Any]:
    """What happened in a round, in order: kills (who, weapon, headshot, callout), grenades
    thrown (type, thrower, callout) and bomb plant/defuse, each with its round clock time t
    in seconds. Names are player names. Cite times as [t:34.5]."""
    match = data.match(match_id)
    rd = _round(match, round)
    events: list[dict[str, Any]] = []
    for k in rd.kills:
        events.append(
            {
                "t": round_t(k.t),
                "e": "kill",
                "by": match.name(k.attacker),
                "on": match.name(k.victim),
                "w": _weapon(k.weapon),
                "hs": k.headshot or None,
                "at": _zone(match, k.victim_pos),
            }
        )
    for g in rd.grenades:
        events.append({"t": round_t(g.t), "e": g.type, "by": match.name(g.thrower), "at": _zone(match, g.pos)})
    for b in rd.bomb:
        if b.type in ("plant", "defuse"):
            events.append({"t": round_t(b.t), "e": b.type, "by": match.name(b.player), "at": _zone(match, b.pos)})
    events.sort(key=lambda e: e["t"])
    truncated = len(events) > MAX_TIMELINE_EVENTS
    events = [{k: v for k, v in e.items() if v is not None} for e in events[:MAX_TIMELINE_EVENTS]]
    out: dict[str, Any] = {
        "round": rd.number,
        "winner": rd.winner,
        "reason": rd.reason,
        "duration": round_t(rd.duration),
        "events": events,
    }
    if truncated:
        out["truncated"] = True
    return out


@tool
def get_player_state(
    match_id: MatchId,
    round: RoundNo,
    t: Annotated[float, Field(ge=0, description="Round clock time in seconds.")],
) -> dict[str, Any]:
    """Every player at round clock time t: side, callout zone, health and whether alive.
    Positions come from 8 Hz samples, so t is rounded to the nearest earlier sample."""
    match = data.match(match_id)
    rd = _round(match, round)
    frame = rd.frame_at(t)
    if frame is None:
        raise ToolError("No position samples for this round.")
    # Kill events are the truth for deaths; samples can lag by one 8 Hz step
    alive_by_kills = rd.alive_at(t + 1e-6)
    players = []
    for pid, (x, y, _z, hp, sampled_alive) in sorted(
        frame.players.items(), key=lambda kv: (rd.sides.get(kv[0], ""), kv[0])
    ):
        alive = sampled_alive and pid in alive_by_kills
        players.append(
            {
                "name": match.name(pid),
                "side": rd.sides.get(pid),
                "zone": zone_at(match.map_name, x, y) if alive else None,
                "hp": hp if alive else 0,
                "alive": alive,
            }
        )
    return {"round": rd.number, "t": round_t(frame.t), "players": players}


@tool
def get_player_history(
    player_id: PlayerId,
    detector: Annotated[str | None, Field(description="Only this detector.")] = None,
    match_id: Annotated[str | None, Field(description="The current match, which is left out.")] = None,
) -> dict[str, Any]:
    """How often each detector fired for this player in their earlier analysed matches:
    findings per 10 rounds overall and per match, oldest match first. Use it to say whether
    a mistake is a habit. The current match is left out. Returns matches=0 when there is no history yet."""
    if detector is not None and detector not in DETECTORS:
        raise ToolError(f"Unknown detector {detector!r}. Known: {', '.join(DETECTORS)}.")
    history = data.repo.analysis.player_history(player_id, exclude_match_id=match_id)
    total_rounds = sum(h["rounds"] for h in history)
    detectors = [detector] if detector else sorted({d for h in history for d in h["counts"]})
    rates = {}
    for d in detectors:
        per_match = [h["counts"].get(d, 0) for h in history]
        count = sum(per_match)
        rates[d] = {
            "count": count,
            "per10Rounds": round(10 * count / total_rounds, 1) if total_rounds else None,
            "perMatch": per_match[-7:],
        }
    return {"matches": len(history), "rounds": total_rounds, "detectors": rates}


class MomentPick(BaseModel):
    """One picked moment, as the model writes it (camelCase like the contracts)."""

    round: int = Field(ge=1)
    t0: float = Field(ge=0, description="Window start, round clock seconds.")
    t1: float = Field(ge=0, description="Window end, round clock seconds.")
    findingIds: list[str] = Field(min_length=1, description="Cited findings, most important first.")
    kind: Literal["mistake", "good"]
    pickedBecause: str = Field(description="One sentence citing the lead finding, e.g. '[F12] ...'.")


@tool
def select_moments(
    match_id: MatchId,
    player_id: PlayerId,
    moments: Annotated[list[MomentPick], Field(description="Your 5-6 picks.")],
) -> dict[str, Any]:
    """Validate and store your 5-6 picked moments for the player. Returns ok and the stored
    moment ids, or the list of problems to fix. Rules: every finding id exists, each window
    contains its findings and is at most 30 s long, at least 2 mistakes and 2 good plays when
    the match has them, no two moments within 10 s in the same round."""
    from app.coach.verify import verify_moments

    findings = data.findings(match_id, player_id)
    result = verify_moments([m.model_dump() if isinstance(m, BaseModel) else m for m in moments], findings)
    if not result.ok:
        return {"ok": False, "errors": result.errors}
    stored = [m.model_copy(update={"source": "agent"}) for m in result.moments]
    data.repo.analysis.replace_moments(match_id, player_id, stored)
    return {"ok": True, "moments": [m.id for m in stored]}


@tool
def search_knowledge(
    query: Annotated[str, Field(min_length=2, description="What to look up, in English, e.g. 'trading distance'.")],
    map: Annotated[
        Literal["de_mirage", "de_anubis"] | None, Field(description="Also search this map's notes.")
    ] = None,
    k: Annotated[int, Field(ge=1, le=6, description="How many passages.")] = 3,
) -> dict[str, Any]:
    """Search the coaching knowledge base (fundamentals and map notes) for passages that
    explain why something is a mistake and what to do instead. Cite a passage as [K7].
    Search in English even when you answer in Polish or Dutch."""
    from app.rag.index import default_index

    passages = default_index().search(query, map_name=map, k=k)
    return {
        "passages": [
            {"id": p.id, "title": p.title, "map": p.map, "source": p.source, "text": p.text[:700]}
            for p in passages
        ]
    }


@tool
def request_clip(
    match_id: MatchId,
    player_id: PlayerId,
    round: RoundNo,
    t0: Annotated[float, Field(ge=0, description="Clip start, round clock seconds.")],
    t1: Annotated[float, Field(ge=0, description="Clip end, round clock seconds.")],
) -> dict[str, Any]:
    """Queue a gameplay clip of the coached player's view for a round window (at most 60 s).
    Returns the clip job id and status. The radar replay is available meanwhile."""
    if t1 <= t0 or t1 - t0 > 60:
        raise ToolError("Use 0 <= t0 < t1 with a window of at most 60 s.")
    match = data.match(match_id)
    _round(match, round)
    job = data.repo.analysis.queue_clip(match_id, player_id, round, round_t(t0), round_t(t1))
    return {**job, "note": "Queued. The CS Demo Manager recorder is not connected yet, so the clip will not render."}


def round_t(t: float) -> float:
    return round(t, 1)


def match_overview(match_id: str) -> dict[str, Any]:
    """Resource ``match://{id}/overview``: map, players and rounds (not a tool)."""
    match = data.match(match_id)
    record = data.repo.get(match_id) or {}
    return {
        "id": match_id,
        "map": match.map_name,
        "score": (record.get("match") or {}).get("score"),
        "players": [{"id": pid, "name": name} for pid, name in match.players.items()],
        "rounds": len(match.playable_rounds()),
        "selectedPlayerId": data.repo.analysis.get_player(match_id),
    }


def moments_for(match_id: str, player_id: str) -> list[SelectedMoment]:
    return data.repo.analysis.moments(match_id, player_id)
