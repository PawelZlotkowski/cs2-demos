"""In-memory match model the detectors read (plan §4).

Built from ``analysis.json`` (events, economy, kill windows written at parse
time) plus the 8 Hz samples of the round replay blobs. Plain dataclasses so
tests can build a round by hand without a demo.

Units: world units (1 unit = 1 inch = 0.0254 m), round clock seconds ``t``
measured from freeze end, the same clock as the replay.
"""

from __future__ import annotations

import bisect
import math
from dataclasses import dataclass, field
from typing import Any, Literal

UNITS_TO_M = 0.0254

Side = Literal["T", "CT"]
GrenadeType = Literal["flash", "smoke", "he", "molotov"]


@dataclass
class Kill:
    tick: int
    t: float
    attacker: str | None
    victim: str
    weapon: str = ""
    headshot: bool = False
    assister: str | None = None
    flash_assist: bool = False
    attacker_pos: tuple[float, float, float] | None = None
    victim_pos: tuple[float, float, float] | None = None


@dataclass
class Shot:
    tick: int
    t: float
    player: str
    weapon: str
    speed: float | None = None  # horizontal speed, units/s
    pos: tuple[float, float, float] | None = None


@dataclass
class Hurt:
    tick: int
    t: float
    attacker: str | None
    victim: str
    damage: int
    weapon: str = ""


@dataclass
class Blind:
    tick: int
    t: float
    attacker: str | None
    victim: str
    duration: float


@dataclass
class Grenade:
    tick: int
    t: float
    type: GrenadeType
    thrower: str | None
    pos: tuple[float, float, float] | None = None


@dataclass
class Purchase:
    tick: int
    t: float
    player: str
    item: str


@dataclass
class BombEvent:
    tick: int
    t: float
    type: Literal["plant_begin", "plant", "defuse_begin", "defuse"]
    player: str | None
    pos: tuple[float, float, float] | None = None


@dataclass
class Economy:
    balance: int = 0
    equip_value: int = 0
    armor: int = 0
    helmet: bool = False


@dataclass
class Frame:
    """8 Hz position sample: pid -> (x, y, z, hp, alive)."""

    tick: int
    t: float
    players: dict[str, tuple[float, float, float, int, bool]]


@dataclass
class KillWindow:
    """Full tick rate data before one kill for the victim and the killer."""

    kill_tick: int
    tick0: int
    # pid -> column -> values, one per tick from tick0 to kill_tick
    tracks: dict[str, dict[str, list[float]]] = field(default_factory=dict)
    # pid -> snapshot at the kill tick (inventory, weapon, flash, hp)
    at_kill: dict[str, dict[str, Any]] = field(default_factory=dict)


@dataclass
class RoundData:
    number: int
    start_tick: int
    end_tick: int
    winner: Side | None
    sides: dict[str, Side]
    duration: float = 0.0
    reason: str | None = None
    # Knife round for sides (not a real round): skipped by detectors and stats
    is_knife: bool = False
    economy: dict[str, Economy] = field(default_factory=dict)
    kills: list[Kill] = field(default_factory=list)
    shots: list[Shot] = field(default_factory=list)
    hurts: list[Hurt] = field(default_factory=list)
    blinds: list[Blind] = field(default_factory=list)
    grenades: list[Grenade] = field(default_factory=list)
    purchases: list[Purchase] = field(default_factory=list)
    bomb: list[BombEvent] = field(default_factory=list)
    frames: list[Frame] = field(default_factory=list)
    kill_windows: list[KillWindow] = field(default_factory=list)

    def teammates(self, pid: str) -> list[str]:
        side = self.sides.get(pid)
        return [p for p, s in self.sides.items() if s == side and p != pid]

    def enemies(self, pid: str) -> list[str]:
        side = self.sides.get(pid)
        return [p for p, s in self.sides.items() if s != side]

    def death_of(self, pid: str) -> Kill | None:
        return next((k for k in self.kills if k.victim == pid), None)

    def frame_at(self, t: float) -> Frame | None:
        """Last frame at or before t (first frame if t is earlier)."""
        if not self.frames:
            return None
        times = [f.t for f in self.frames]
        i = bisect.bisect_right(times, t) - 1
        return self.frames[max(0, i)]

    def position_at(self, pid: str, t: float) -> tuple[float, float, float] | None:
        frame = self.frame_at(t)
        if not frame or pid not in frame.players:
            return None
        x, y, z, _hp, _alive = frame.players[pid]
        return (x, y, z)

    def alive_at(self, t: float) -> set[str]:
        """Players alive just before t, from kill events (not from samples)."""
        dead = {k.victim for k in self.kills if k.t < t}
        return {p for p in self.sides if p not in dead}

    def plant(self) -> BombEvent | None:
        return next((b for b in self.bomb if b.type == "plant"), None)

    def window_for_kill(self, kill: Kill) -> KillWindow | None:
        return next((w for w in self.kill_windows if w.kill_tick == kill.tick), None)


@dataclass
class MatchData:
    match_id: str
    map_name: str
    tick_rate: int
    players: dict[str, str]  # pid -> name
    rounds: list[RoundData]

    def playable_rounds(self) -> list[RoundData]:
        """Rounds that count for analysis (knife rounds left out)."""
        return [r for r in self.rounds if not r.is_knife]

    def round(self, number: int) -> RoundData | None:
        return next((r for r in self.rounds if r.number == number), None)

    def name(self, pid: str | None) -> str:
        if not pid:
            return "unknown"
        return self.players.get(pid, pid)


def distance(a: tuple[float, ...] | None, b: tuple[float, ...] | None) -> float | None:
    """Horizontal distance in world units."""
    if a is None or b is None:
        return None
    return math.hypot(a[0] - b[0], a[1] - b[1])


def to_m(units: float | None) -> float | None:
    return None if units is None else round(units * UNITS_TO_M, 1)


# --- JSON <-> dataclasses ---


def _pos(v: Any) -> tuple[float, float, float] | None:
    if not v:
        return None
    return (float(v[0]), float(v[1]), float(v[2]) if len(v) > 2 and v[2] is not None else 0.0)


def build_match_data(
    analysis: dict[str, Any],
    round_replays: dict[str, dict[str, Any]] | None = None,
) -> MatchData:
    """Combine ``analysis.json`` with 8 Hz samples from the replay blobs."""
    rounds: list[RoundData] = []
    for r in analysis.get("rounds") or []:
        rd = RoundData(
            number=int(r["number"]),
            start_tick=int(r["startTick"]),
            end_tick=int(r["endTick"]),
            winner=r.get("winner"),
            sides=dict(r.get("sides") or {}),
            duration=float(r.get("durationSec") or 0.0),
            reason=r.get("reason"),
            is_knife=bool(r.get("knifeRound")),
            economy={
                pid: Economy(
                    balance=int(e.get("balance") or 0),
                    equip_value=int(e.get("equipValue") or 0),
                    armor=int(e.get("armor") or 0),
                    helmet=bool(e.get("helmet")),
                )
                for pid, e in (r.get("economy") or {}).items()
            },
            kills=[
                Kill(
                    tick=int(k["tick"]),
                    t=float(k["t"]),
                    attacker=k.get("attacker"),
                    victim=k["victim"],
                    weapon=k.get("weapon") or "",
                    headshot=bool(k.get("headshot")),
                    assister=k.get("assister"),
                    flash_assist=bool(k.get("flashAssist")),
                    attacker_pos=_pos(k.get("attackerPos")),
                    victim_pos=_pos(k.get("victimPos")),
                )
                for k in r.get("kills") or []
            ],
            shots=[
                Shot(
                    tick=int(s["tick"]),
                    t=float(s["t"]),
                    player=s["player"],
                    weapon=s.get("weapon") or "",
                    speed=s.get("speed"),
                    pos=_pos(s.get("pos")),
                )
                for s in r.get("shots") or []
            ],
            hurts=[
                Hurt(
                    tick=int(h["tick"]),
                    t=float(h["t"]),
                    attacker=h.get("attacker"),
                    victim=h["victim"],
                    damage=int(h.get("damage") or 0),
                    weapon=h.get("weapon") or "",
                )
                for h in r.get("hurts") or []
            ],
            blinds=[
                Blind(
                    tick=int(b["tick"]),
                    t=float(b["t"]),
                    attacker=b.get("attacker"),
                    victim=b["victim"],
                    duration=float(b.get("duration") or 0.0),
                )
                for b in r.get("blinds") or []
            ],
            grenades=[
                Grenade(
                    tick=int(g["tick"]),
                    t=float(g["t"]),
                    type=g["type"],
                    thrower=g.get("thrower"),
                    pos=_pos(g.get("pos")),
                )
                for g in r.get("grenades") or []
            ],
            purchases=[
                Purchase(tick=int(p["tick"]), t=float(p["t"]), player=p["player"], item=p["item"])
                for p in r.get("purchases") or []
            ],
            bomb=[
                BombEvent(
                    tick=int(b["tick"]),
                    t=float(b["t"]),
                    type=b["type"],
                    player=b.get("player"),
                    pos=_pos(b.get("pos")),
                )
                for b in r.get("bomb") or []
            ],
            kill_windows=[
                KillWindow(
                    kill_tick=int(w["killTick"]),
                    tick0=int(w["tick0"]),
                    tracks=w.get("tracks") or {},
                    at_kill=w.get("atKill") or {},
                )
                for w in r.get("killWindows") or []
            ],
        )
        replay = (round_replays or {}).get(f"r{rd.number}")
        if replay:
            rd.frames = frames_from_samples(replay.get("samples") or [])
        rounds.append(rd)
    return MatchData(
        match_id=str(analysis.get("matchId") or ""),
        map_name=str(analysis.get("map") or ""),
        tick_rate=int(analysis.get("tickRate") or 64),
        players={p["id"]: p["name"] for p in analysis.get("players") or []},
        rounds=rounds,
    )


def frames_from_samples(samples: list[dict[str, Any]]) -> list[Frame]:
    frames: list[Frame] = []
    for s in samples:
        players = {
            p["id"]: (
                float(p["x"]),
                float(p["y"]),
                float(p.get("z") or 0.0),
                int(p.get("health") or 0),
                bool(p.get("alive")),
            )
            for p in s.get("players") or []
        }
        frames.append(Frame(tick=int(s["tick"]), t=float(s["t"]), players=players))
    frames.sort(key=lambda f: f.t)
    return frames
