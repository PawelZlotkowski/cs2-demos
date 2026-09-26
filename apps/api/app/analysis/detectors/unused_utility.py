"""D3 Died with unused utility.

Signal: grenades (not decoys) in the player's inventory on the last tick
before their death, read from the full-rate kill window.

Severity = 0.25 + 0.15 per grenade, + 0.1 if the player had been alive for at
least ``LONG_ALIVE_S`` (time to use it), capped at 0.85.

Known false positives: utility saved on purpose for a retake that never came.
"""

from __future__ import annotations

from app.analysis.detectors.common import FindingDraft, clamp, is_grenade_item, zone_of
from app.analysis.match_data import MatchData

LONG_ALIVE_S = 30.0


def detect(match: MatchData, round_no: int, player_id: str) -> list[FindingDraft]:
    rd = match.round(round_no)
    if rd is None:
        return []
    death = rd.death_of(player_id)
    if death is None:
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
