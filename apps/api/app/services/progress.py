"""Matches list and Progress page (A08 / A11 without accounts; doc 29 R13, R17).

Before accounts (doc 27) every match on the PC is listed, and Progress runs
over one coached player's analysed matches, in the M1, M2, … order the Coach
page cites.
"""

from __future__ import annotations

from collections import Counter, defaultdict
from datetime import datetime
from pathlib import Path

from app.coach.plan import RECENT, label
from app.coach.tools import _map_key, cross_match_findings, player_match_refs
from app.maps.zones import zone_at
from app.models.contracts import MatchRow, ProgressDetector, ProgressMatch, ProgressResponse, ProgressZone
from app.repositories.extras import extras
from app.repositories.matches import repo

GOOD_LABEL = {"good_plays": "Good plays"}


def review_model(match_id: str, player_id: str) -> str | None:
    """The model that wrote the stored review, or None when only templates did."""
    models = Counter(e.model for e in repo.analysis.explanations(match_id, player_id) if e.source == "agent" and e.model)
    return models.most_common(1)[0][0] if models else None


def _added(record: dict) -> float:
    """When the match was parsed: its match.json survives restarts, unlike the in-memory created_at."""
    meta = Path(record.get("match_dir") or "") / "match.json"
    if record.get("match_dir") and meta.exists():
        return meta.stat().st_mtime
    try:
        return datetime.fromisoformat(record.get("created_at") or "").timestamp()
    except ValueError:
        return 0.0


def match_rows() -> list[MatchRow]:
    rows = []
    records = sorted((repo.get(mid) or {} for mid in repo.list_ids()), key=_added, reverse=True)
    for record in records:
        mid = record.get("id")
        if not mid:
            continue
        if record.get("is_sample"):
            continue
        match = record.get("match") or {}
        pid = repo.analysis.get_player(mid) or match.get("selectedPlayerId")
        name = next((p.get("name") for p in match.get("players") or [] if p.get("id") == pid), None)
        rows.append(
            MatchRow(
                id=mid,
                map=match.get("map") or "Unknown",
                score=match.get("score") or "",
                when=match.get("when") or "",
                status=record.get("status") or match.get("status"),
                player_id=pid,
                player_name=name,
                moments=len(repo.analysis.moments(mid, pid)) if pid else 0,
                model=review_model(mid, pid) if pid else None,
                versions=len(extras().versions(mid, pid)) if pid else 0,
            )
        )
    return rows  # newest first


def _per10(counts: list[int], rounds: list[int]) -> float | None:
    return round(10 * sum(counts) / sum(rounds), 1) if sum(rounds) else None


def progress(player_id: str) -> ProgressResponse | None:
    refs = player_match_refs(player_id)
    if not refs:
        return None
    history = {h["matchId"]: h for h in repo.analysis.player_history(player_id)}
    matches = []
    for ref, mid in refs.items():
        match = (repo.get(mid) or {}).get("match") or {}
        matches.append(
            ProgressMatch(ref=ref, match_id=mid, map=match.get("map") or "Unknown", when=match.get("when") or "", rounds=history[mid]["rounds"])
        )
    rounds = [m.rounds for m in matches]

    found = cross_match_findings(player_id)
    kinds = {f.detector.split(".")[0]: f.kind for _r, _rec, f in found}
    detectors = []
    for d, kind in kinds.items():
        if kind not in ("mistake", "good"):
            continue
        counts = [sum(n for k, n in history[m.match_id]["counts"].items() if k.split(".")[0] == d) for m in matches]
        recent = before = None
        if len(matches) > RECENT:
            recent, before = _per10(counts[-RECENT:], rounds[-RECENT:]), _per10(counts[:-RECENT], rounds[:-RECENT])
        detectors.append(
            ProgressDetector(
                detector=d, kind=kind, label=GOOD_LABEL.get(d) or label(d), counts=counts, per10_recent=recent, per10_before=before
            )
        )
    # Mistakes first, the most frequent on top; good plays last
    detectors.sort(key=lambda p: (p.kind == "good", -sum(p.counts), p.label))

    # Deaths per callout, from the kill events (their position is the victim's)
    deaths: Counter[tuple[str, str]] = Counter()
    for m in matches:
        record = repo.get(m.match_id) or {}
        map_name = f"de_{_map_key((record.get('match') or {}).get('map'))}"
        for e in record.get("events") or []:
            if e.get("type") == "kill" and e.get("victimId") == player_id and e.get("pos"):
                zone = zone_at(map_name, e["pos"]["x"], e["pos"]["y"])
                if zone:
                    deaths[(map_name, zone)] += 1
    examples: dict[tuple[str, str], list[str]] = defaultdict(list)
    for _ref, rec, f in found:
        key = (f"de_{_map_key((rec.get('match') or {}).get('map'))}", f.zone or "")
        if f.kind == "mistake" and key in deaths and len(examples[key]) < 3:
            examples[key].append(f.id)
    zones = [
        ProgressZone(map=map_name, zone=zone, deaths=n, examples=examples[(map_name, zone)])
        for (map_name, zone), n in sorted(deaths.items(), key=lambda kv: (kv[0][0], -kv[1], kv[0][1]))
    ]
    return ProgressResponse(player_id=player_id, matches=matches, detectors=detectors, zones=zones)
