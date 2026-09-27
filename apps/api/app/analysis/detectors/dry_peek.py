"""D4 Dry peek.

Signal: the player died within ``MAX_TIME_TO_DEATH_S`` of first contact with
their killer, dealt the killer less than ``MAX_DAMAGE_DEALT`` damage, and no
flash or smoke from the player or a teammate went off within
``SUPPORT_RADIUS_M`` of the fight in the ``SUPPORT_BEFORE_S`` before contact.
The killer was not flashed at the time.

First contact = the earliest of: the player's first shot, or the first damage
between the player and the killer, in the 5 s before the death.

Severity = 0.45 + 0.35 * (1 - time to death / MAX_TIME_TO_DEATH_S).

Known false positives: we have no view angles of who peeked whom, so being
caught in a rotation or pushed by the enemy also fires. Tune on labels.
"""

from __future__ import annotations

from app.analysis.detectors.common import FindingDraft, clamp, is_team_kill, zone_of
from app.analysis.match_data import UNITS_TO_M, MatchData, distance, to_m

MAX_TIME_TO_DEATH_S = 1.0
MAX_DAMAGE_DEALT = 50
SUPPORT_BEFORE_S = 3.0
SUPPORT_RADIUS_M = 25.0
LOOKBACK_S = 5.0


def detect(match: MatchData, round_no: int, player_id: str) -> list[FindingDraft]:
    rd = match.round(round_no)
    if rd is None:
        return []
    death = rd.death_of(player_id)
    if death is None or not death.attacker or is_team_kill(rd, death.attacker, player_id):
        return []
    killer = death.attacker
    lo = death.t - LOOKBACK_S

    contacts = [death.t]
    contacts += [s.t for s in rd.shots if s.player == player_id and lo <= s.t <= death.t]
    contacts += [
        h.t
        for h in rd.hurts
        if lo <= h.t <= death.t and {h.attacker, h.victim} == {player_id, killer}
    ]
    contact = min(contacts)
    ttd = death.t - contact
    if ttd > MAX_TIME_TO_DEATH_S:
        return []

    dealt = sum(h.damage for h in rd.hurts if h.attacker == player_id and h.victim == killer and lo <= h.t <= death.t)
    if dealt >= MAX_DAMAGE_DEALT:
        return []

    if any(b.victim == killer and b.t <= death.t <= b.t + b.duration for b in rd.blinds):
        return []

    victim_pos = death.victim_pos or rd.position_at(player_id, death.t)
    killer_pos = death.attacker_pos or rd.position_at(killer, death.t)
    team = {player_id, *rd.teammates(player_id)}
    radius = SUPPORT_RADIUS_M / UNITS_TO_M
    for g in rd.grenades:
        if g.type not in ("flash", "smoke") or g.thrower not in team:
            continue
        if not (contact - SUPPORT_BEFORE_S <= g.t <= death.t):
            continue
        near = [d for d in (distance(g.pos, victim_pos), distance(g.pos, killer_pos)) if d is not None]
        if near and min(near) <= radius:
            return []

    severity = 0.45 + 0.35 * (1 - ttd / MAX_TIME_TO_DEATH_S)
    evidence: dict[str, int | float | str] = {
        "timeToDeathS": round(ttd, 2),
        "damageToKiller": dealt,
        "supportUtility": 0,
        "killerName": match.name(killer),
    }
    dist = to_m(distance(victim_pos, killer_pos))
    if dist is not None:
        evidence["distanceToKillerM"] = dist
    return [
        FindingDraft(
            detector="dry_peek",
            kind="mistake",
            round=round_no,
            t=round(contact, 3),
            tick=death.tick,
            player_id=player_id,
            template="dry_peek",
            severity=round(clamp(severity), 3),
            evidence=evidence,
            other_ids=[killer],
            zone=zone_of(match, victim_pos),
        )
    ]
