"""D1 Untraded death.

Signal: the player died to an enemy, at least one teammate was still alive,
and no teammate killed that enemy within ``TRADE_WINDOW_S``.

Severity = 0.4 + 0.4 * min(1, nearest teammate distance / 30 m). An isolated
death (nobody close enough to trade) is the costlier habit. 0.5 when positions
are missing.

Known false positives: the killer dies to the bomb or a teammate's utility
(no kill credit), save rounds where not trading is the plan.
"""

from __future__ import annotations

from app.analysis.detectors.common import (
    TRADE_WINDOW_S,
    FindingDraft,
    clamp,
    is_team_kill,
    was_traded,
    zone_of,
)
from app.analysis.match_data import MatchData, distance, to_m

# Distance at which a teammate is treated as too far to trade (guess to tune on labels)
ISOLATED_M = 30.0


def detect(match: MatchData, round_no: int, player_id: str) -> list[FindingDraft]:
    rd = match.round(round_no)
    if rd is None:
        return []
    death = rd.death_of(player_id)
    if death is None or not death.attacker or death.attacker == player_id:
        return []
    if is_team_kill(rd, death.attacker, player_id):
        return []
    if was_traded(rd, player_id, death.attacker, death.t):
        return []
    alive = rd.alive_at(death.t)
    mates = [p for p in rd.teammates(player_id) if p in alive]
    if not mates:
        return []  # last alive: nobody could trade

    victim_pos = death.victim_pos or rd.position_at(player_id, death.t)
    dists = [distance(victim_pos, rd.position_at(p, death.t)) for p in mates]
    dists = [d for d in dists if d is not None]
    nearest_m = to_m(min(dists)) if dists else None

    evidence: dict[str, int | float | str] = {
        "tradeWindowS": TRADE_WINDOW_S,
        "teammatesAlive": len(mates),
        "killerName": match.name(death.attacker),
        "weapon": death.weapon,
    }
    if nearest_m is not None:
        evidence["nearestTeammateM"] = nearest_m
        severity = 0.4 + 0.4 * min(1.0, nearest_m / ISOLATED_M)
        template = "untraded_death"
    else:
        severity = 0.5
        template = "untraded_death.no_positions"
    return [
        FindingDraft(
            detector="untraded_death",
            kind="mistake",
            round=round_no,
            t=death.t,
            tick=death.tick,
            player_id=player_id,
            template=template,
            severity=round(clamp(severity), 3),
            evidence=evidence,
            other_ids=[death.attacker, *mates],
            zone=zone_of(match, victim_pos),
        )
    ]
