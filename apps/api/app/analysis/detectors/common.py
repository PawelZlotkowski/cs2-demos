"""Shared pieces for detectors: the draft finding and small helpers."""

from __future__ import annotations

from dataclasses import dataclass, field

from app.analysis.match_data import MatchData, RoundData
from app.maps.zones import zone_at

# Seconds a teammate has to kill your killer for the death to count as traded.
# Common coaching convention (3–5 s); 5 s is the generous end.
TRADE_WINDOW_S = 5.0

GRENADE_ITEMS = ("flashbang", "smoke", "high explosive", "he grenade", "molotov", "incendiary")


@dataclass
class FindingDraft:
    """A finding before IDs are assigned (see ``analysis.run``)."""

    detector: str
    kind: str  # mistake | good | context | pattern
    round: int
    t: float
    tick: int
    player_id: str
    template: str  # key in coach/templates/findings.<lang>.json
    severity: float
    evidence: dict[str, int | float | str] = field(default_factory=dict)
    other_ids: list[str] = field(default_factory=list)
    zone: str | None = None


def clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    return max(lo, min(hi, v))


def zone_of(match: MatchData, pos: tuple[float, float, float] | None) -> str | None:
    if pos is None:
        return None
    return zone_at(match.map_name, pos[0], pos[1])


def weapon_key(weapon: str) -> str:
    """'weapon_ak47' / 'ak47' / 'AK-47' -> 'ak47'."""
    w = weapon.lower().strip()
    if w.startswith("weapon_"):
        w = w[len("weapon_") :]
    return w.replace("-", "").replace(" ", "")


def is_grenade_item(name: str) -> bool:
    n = name.lower()
    return any(g in n for g in GRENADE_ITEMS) and "decoy" not in n


def was_traded(rd: RoundData, victim: str, killer: str | None, t: float) -> bool:
    if not killer:
        return False
    mates = set(rd.teammates(victim))
    return any(
        k.victim == killer and k.attacker in mates and t < k.t <= t + TRADE_WINDOW_S for k in rd.kills
    )


def is_team_kill(rd: RoundData, attacker: str | None, victim: str) -> bool:
    return bool(attacker) and rd.sides.get(attacker) == rd.sides.get(victim)


def first_kill(rd: RoundData):
    """First enemy kill of the round (team kills and suicides skipped)."""
    for k in sorted(rd.kills, key=lambda k: k.tick):
        if k.attacker and k.attacker != k.victim and not is_team_kill(rd, k.attacker, k.victim):
            return k
    return None
