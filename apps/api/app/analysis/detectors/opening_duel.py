"""D6 Opening duel.

Signal: the round's first kill involved the player, won or lost. Context for
the agent (who took the first fight, where, with what).

Not flagged: a lost duel the team traded within the trade window. The round
stays even, which is often the entry's job; Aleksander's clip reviews (Nov
2026) called all of these insignificant and kept the untraded ones.

Severity: 0.6 when lost (the team plays 4v5), 0.5 when won.
"""

from __future__ import annotations

from app.analysis.detectors.common import FindingDraft, first_kill, was_traded, zone_of
from app.analysis.match_data import MatchData, distance, to_m


def detect(match: MatchData, round_no: int, player_id: str) -> list[FindingDraft]:
    rd = match.round(round_no)
    if rd is None:
        return []
    k = first_kill(rd)
    if k is None or player_id not in (k.attacker, k.victim):
        return []
    won = k.attacker == player_id
    if not won and was_traded(rd, player_id, k.attacker, k.t):
        return []
    opponent = k.victim if won else k.attacker
    pos = (k.attacker_pos if won else k.victim_pos) or rd.position_at(player_id, k.t)
    evidence: dict[str, int | float | str] = {
        "result": "won" if won else "lost",
        "opponentName": match.name(opponent),
        "weapon": k.weapon,
    }
    dist = to_m(distance(k.attacker_pos, k.victim_pos))
    if dist is not None:
        evidence["distanceM"] = dist
    return [
        FindingDraft(
            detector="opening_duel",
            kind="context",
            round=round_no,
            t=k.t,
            tick=k.tick,
            player_id=player_id,
            template="opening_duel.won" if won else "opening_duel.lost",
            severity=0.5 if won else 0.6,
            evidence=evidence,
            other_ids=[opponent] if opponent else [],
            zone=zone_of(match, pos),
        )
    ]
