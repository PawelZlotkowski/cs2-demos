"""D3 Died with unused utility.

Signal: grenades (not decoys) in the player's inventory on the last tick
before their death, read from the full-rate kill window.

Not flagged when the utility could no longer change the fight (Aleksander's
clip reviews, Nov 2026, called 6 of 7 train flags wrong for these reasons):
- the round was over or nearly over: after the defuse, or with less than
  ``NO_TIME_S`` left on the bomb (it had exploded or was about to);
- the player was the last alive against ``HOPELESS_ENEMIES`` or more;
- the player died within ``TRADED_AFTER_KILL_S`` of their own kill: they won
  the duel and were traded, so the fight was taken with the weapon out;
- the killer was not an enemy (team kill, fall, bomb), or a teammate traded
  the killer within the trade window (owner, 23 Nov 2026, after the labels:
  an instant trade is no mistake).

Severity = 0.25 + 0.15 per grenade, + 0.1 if the player had been alive for at
least ``LONG_ALIVE_S`` (time to use it), capped at 0.85.

Known false positives: utility saved on purpose for a retake that never came.
"""

from __future__ import annotations

from app.analysis.detectors.common import FindingDraft, clamp, is_grenade_item, was_traded, zone_of
from app.analysis.match_data import Kill, MatchData, RoundData

LONG_ALIVE_S = 30.0
BOMB_TIMER_S = 40.0  # CS2 competitive mp_c4timer
NO_TIME_S = 10.0  # a defuse without a kit takes 10 s
HOPELESS_ENEMIES = 3
TRADED_AFTER_KILL_S = 3.0


def _too_late_to_matter(rd: RoundData, player_id: str, death: Kill) -> bool:
    t, side = death.t, rd.sides.get(player_id)
    plant = rd.plant()
    if plant is not None and t >= plant.t + BOMB_TIMER_S - NO_TIME_S:
        return True
    if any(b.type == "defuse" and b.t <= t for b in rd.bomb):
        return True
    alive = rd.alive_at(t)
    enemies = sum(rd.sides.get(p) not in (side, None) for p in alive)
    if enemies >= HOPELESS_ENEMIES and sum(rd.sides.get(p) == side for p in alive) == 1:
        return True
    return any(k.attacker == player_id and rd.sides.get(k.victim) not in (side, None)
               and 0 <= t - k.t <= TRADED_AFTER_KILL_S for k in rd.kills)


def detect(match: MatchData, round_no: int, player_id: str) -> list[FindingDraft]:
    rd = match.round(round_no)
    if rd is None:
        return []
    death = rd.death_of(player_id)
    if (death is None or death.attacker not in rd.enemies(player_id)
            or was_traded(rd, player_id, death.attacker, death.t) or _too_late_to_matter(rd, player_id, death)):
        return []
    window = rd.window_for_kill(death)
    if window is None or player_id not in window.at_kill:
        return []
    grenades = [i for i in window.at_kill[player_id].get("inventory") or [] if is_grenade_item(i)]
    if not grenades:
        return []
    severity = 0.25 + 0.15 * len(grenades) + (0.1 if death.t >= LONG_ALIVE_S else 0.0)
    return [
        FindingDraft(
            detector="unused_utility",
            kind="mistake",
            round=round_no,
            t=death.t,
            tick=death.tick,
            player_id=player_id,
            template="unused_utility",
            severity=round(clamp(severity, 0.0, 0.85), 3),
            evidence={
                "grenadesUnused": len(grenades),
                "grenadeList": ", ".join(grenades),
                "timeAliveS": round(death.t, 1),
            },
            other_ids=[death.attacker] if death.attacker else [],
            zone=zone_of(match, death.victim_pos or rd.position_at(player_id, death.t)),
        )
    ]
