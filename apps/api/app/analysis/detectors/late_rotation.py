"""D8 Late rotation (CT side, after a plant).

Signal: the bomb was planted at a site; the player was alive and off site at
the plant; teammates who were also off site reached it (zone match or within
``ARRIVE_RADIUS_M`` of the bomb) with a median time M; the player arrived
``MIN_DELAY_S`` or more after M, or never arrived while alive for longer
than M + ``MIN_DELAY_S``.

Severity = 0.4 + 0.4 * min(1, delay / 15 s).

Not covered yet: rotations before a plant (after first contact) and the T side.
Known false positives: a CT holding a flank on purpose.
"""

from __future__ import annotations

import statistics

from app.analysis.detectors.common import FindingDraft, clamp, zone_of
from app.analysis.match_data import UNITS_TO_M, MatchData, RoundData, distance

ARRIVE_RADIUS_M = 15.0
MIN_DELAY_S = 5.0


def _arrival(match: MatchData, rd: RoundData, pid: str, site: str, bomb_pos, t_plant: float, t_dead: float) -> float | None:
    radius = ARRIVE_RADIUS_M / UNITS_TO_M
    for f in rd.frames:
        if f.t < t_plant or f.t > t_dead:
            continue
        st = f.players.get(pid)
        if not st or not st[4]:
            continue
        pos = (st[0], st[1], st[2])
        near = distance(pos, bomb_pos)
        if zone_of(match, pos) == site or (near is not None and near <= radius):
            return f.t - t_plant
    return None


def detect(match: MatchData, round_no: int, player_id: str) -> list[FindingDraft]:
    rd = match.round(round_no)
    if rd is None or rd.sides.get(player_id) != "CT":
        return []
    plant = rd.plant()
    if plant is None or plant.pos is None:
        return []
    site = zone_of(match, plant.pos)
    if not site or "site" not in site.lower():
        return []

    alive = rd.alive_at(plant.t)
    if player_id not in alive:
        return []
    ends: dict[str, float] = {}
    for pid in [player_id, *rd.teammates(player_id)]:
        d = rd.death_of(pid)
        ends[pid] = d.t if d else rd.duration or (rd.frames[-1].t if rd.frames else plant.t)

    def off_site(pid: str) -> bool:
        pos = rd.position_at(pid, plant.t)
        return pos is not None and zone_of(match, pos) != site

    if not off_site(player_id):
        return []
    mates = [p for p in rd.teammates(player_id) if p in alive and off_site(p)]
    mate_arrivals = [
        a for a in (_arrival(match, rd, p, site, plant.pos, plant.t, ends[p]) for p in mates) if a is not None
    ]
    if not mate_arrivals:
        return []
    median = statistics.median(mate_arrivals)
    mine = _arrival(match, rd, player_id, site, plant.pos, plant.t, ends[player_id])
    if mine is not None:
        delay = mine - median
    elif ends[player_id] - plant.t > median + MIN_DELAY_S:
        delay = ends[player_id] - plant.t - median
    else:
        return []
    if delay < MIN_DELAY_S:
        return []
    t = plant.t + median + MIN_DELAY_S
    evidence: dict[str, int | float | str] = {
        "site": site,
        "teamMedianArrivalS": round(median, 1),
        "delayS": round(delay, 1),
        "arrived": "yes" if mine is not None else "no",
    }
    if mine is not None:
        evidence["arrivalS"] = round(mine, 1)
    return [
        FindingDraft(
            detector="late_rotation",
            kind="mistake",
            round=round_no,
            t=round(t, 3),
            tick=plant.tick + int((t - plant.t) * match.tick_rate),
            player_id=player_id,
            template="late_rotation" if mine is not None else "late_rotation.never",
            severity=round(clamp(0.4 + 0.4 * min(1.0, delay / 15.0)), 3),
            evidence=evidence,
            zone=zone_of(match, rd.position_at(player_id, t)),
        )
    ]
