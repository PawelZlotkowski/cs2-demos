"""Nearby teammate deaths from the selected player's perspective.

The owner requested a 5 m radius (20 November 2026). This is an eligibility
filter, not proof of visibility or a missed opportunity. Distances use the
project's world-unit conversion and all three axes. The existing 5 s response
window is a product convention, not a universal Counter-Strike rule.
"""
from __future__ import annotations

import math
from dataclasses import dataclass

from app.analysis.match_data import Kill, RoundData, UNITS_TO_M

TRADE_RADIUS_M = 5.0
TRADE_WINDOW_S = 5.0
MAX_POSITION_AGE_S = 0.25  # Two 8 Hz intervals; stale/missing data abstains.


@dataclass(frozen=True)
class NearbyDeath:
    death: Kill
    distance_m: float
    response: Kill | None
    observed_s: float
    outcome: str


def nearby_deaths(rd: RoundData, player_id: str) -> list[NearbyDeath]:
    side = rd.sides.get(player_id)
    if side not in ("T", "CT"):
        return []
    mates = set(rd.teammates(player_id))
    enemies = {p for p, s in rd.sides.items() if s in ("T", "CT") and s != side}
    own_death = rd.death_of(player_id)
    out = []
    seen = set()
    kills = sorted(rd.kills, key=lambda k: k.tick)
    for death in kills:
        key = (death.tick, death.victim, death.attacker)
        if key in seen or death.victim not in mates or death.attacker not in enemies:
            continue
        seen.add(key)
        if death.t < 0 or death.t >= rd.duration or (own_death and own_death.t <= death.t):
            continue
        frame = rd.frame_at(death.t)
        if frame is None or not 0 <= death.t - frame.t <= MAX_POSITION_AGE_S:
            continue
        player = frame.players.get(player_id)
        mate = frame.players.get(death.victim)
        victim_pos = death.victim_pos or (mate[:3] if mate else None)
        if not player or not player[4] or victim_pos is None:
            continue
        separation = math.dist(player[:3], victim_pos) * UNITS_TO_M
        if not math.isfinite(separation) or separation > TRADE_RADIUS_M + 1e-9:
            continue
        deadline = min(death.t + TRADE_WINDOW_S, rd.duration)
        response = next((k for k in kills if k.victim == death.attacker
                         and death.t < k.t <= deadline), None)
        observed = deadline - death.t
        if response:
            observed = response.t - death.t
            outcome = ("traded" if response.attacker == player_id else
                       "traded_by_teammate" if response.attacker in mates else "killer_unavailable")
        elif own_death and own_death.t <= deadline:
            observed = own_death.t - death.t
            outcome = "player_died"
        else:
            # Comparing a subtraction to 5 can turn a complete window into
            # 4.999999999999998 (observed on an Ancient cached round).
            outcome = "not_traded" if death.t + TRADE_WINDOW_S <= rd.duration else "window_incomplete"
        out.append(NearbyDeath(death, separation, response, observed, outcome))
    return out


def successful_trades(rd: RoundData, player_id: str) -> list[NearbyDeath]:
    """One positive finding/count per revenge kill, even after a multi-kill."""
    out, seen = [], set()
    for event in nearby_deaths(rd, player_id):
        response = event.response
        if event.outcome == "traded" and response is not None:
            key = (response.tick, response.victim)
            if key not in seen:
                seen.add(key)
                out.append(event)
    return out
