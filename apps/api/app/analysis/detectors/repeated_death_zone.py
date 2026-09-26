"""D9 Repeated death zone (pattern).

Signal: the player's death in this round is their ``MIN_DEATHS``-th or later
death in the same zone in this match (counting this and earlier rounds only,
so the finding never uses the future).

Severity = 0.4 + 0.1 per death beyond ``MIN_DEATHS``, capped at 0.8.
"""

from __future__ import annotations

from app.analysis.detectors.common import FindingDraft, clamp, zone_of
from app.analysis.match_data import MatchData

MIN_DEATHS = 3


def detect(match: MatchData, round_no: int, player_id: str) -> list[FindingDraft]:
    rd = match.round(round_no)
    if rd is None:
        return []
    death = rd.death_of(player_id)
    if death is None:
        return []
    zone = zone_of(match, death.victim_pos or rd.position_at(player_id, death.t))
    if not zone:
        return []
    rounds: list[int] = []
    for other in match.playable_rounds():
        if other.number > round_no:
            continue
        d = other.death_of(player_id)
        if d and zone_of(match, d.victim_pos or other.position_at(player_id, d.t)) == zone:
            rounds.append(other.number)
    if len(rounds) < MIN_DEATHS:
        return []
    return [
        FindingDraft(
            detector="repeated_death_zone",
            kind="pattern",
            round=round_no,
            t=death.t,
            tick=death.tick,
            player_id=player_id,
            template="repeated_death_zone",
            severity=round(clamp(0.4 + 0.1 * (len(rounds) - MIN_DEATHS), 0.0, 0.8), 3),
            evidence={"deathsInZone": len(rounds), "rounds": ", ".join(str(r) for r in rounds)},
            other_ids=[death.attacker] if death.attacker else [],
            zone=zone,
        )
    ]
