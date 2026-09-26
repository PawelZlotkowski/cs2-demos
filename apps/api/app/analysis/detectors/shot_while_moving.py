"""D2 Shot while moving.

Signal: a burst of shots (gaps <= ``BURST_GAP_S``) where at least half of the
shots were fired above the weapon's accurate speed. Accurate speed is
``ACCURATE_FRACTION`` of the weapon's max move speed (CS2 weapon data; 34 % is
the commonly quoted threshold where standing accuracy is kept). Only rifles,
snipers and pistols are checked; SMGs and shotguns are built for moving.

Severity = 0.3 + 0.3 * moving fraction + 0.3 if the player died within 3 s of
the burst. At most ``MAX_PER_ROUND`` findings per round, highest severity first.

Known false positives: jiggle-peek shots that are counter-strafed between
ticks (speed is read at the shot tick), velocity missing in older demos.
"""

from __future__ import annotations

from app.analysis.detectors.common import FindingDraft, clamp, weapon_key, zone_of
from app.analysis.match_data import MatchData, Shot

# Max move speed per weapon (units/s), CS2 weapon data
WEAPON_MAX_SPEED: dict[str, float] = {
    "ak47": 215,
    "m4a1": 225,
    "m4a1_silencer": 225,
    "m4a4": 225,
    "m4a1s": 225,
    "famas": 220,
    "galilar": 215,
    "aug": 220,
    "sg556": 210,
    "awp": 200,
    "ssg08": 230,
    "scar20": 215,
    "g3sg1": 215,
    "deagle": 230,
    "revolver": 220,
    "usp_silencer": 240,
    "hkp2000": 240,
    "glock": 240,
    "p250": 240,
    "fiveseven": 240,
    "tec9": 240,
    "cz75a": 240,
    "elite": 240,
}
ACCURATE_FRACTION = 0.34
BURST_GAP_S = 0.5
DEATH_AFTER_S = 3.0
MAX_PER_ROUND = 2


def _bursts(shots: list[Shot]) -> list[list[Shot]]:
    bursts: list[list[Shot]] = []
    for s in sorted(shots, key=lambda s: s.tick):
        if bursts and s.t - bursts[-1][-1].t <= BURST_GAP_S and weapon_key(s.weapon) == weapon_key(bursts[-1][-1].weapon):
            bursts[-1].append(s)
        else:
            bursts.append([s])
    return bursts


def detect(match: MatchData, round_no: int, player_id: str) -> list[FindingDraft]:
    rd = match.round(round_no)
    if rd is None:
        return []
    death = rd.death_of(player_id)
    own = [s for s in rd.shots if s.player == player_id and s.speed is not None]
    drafts: list[FindingDraft] = []
    for burst in _bursts(own):
        wk = weapon_key(burst[0].weapon)
        max_speed = WEAPON_MAX_SPEED.get(wk)
        if max_speed is None:
            continue
        threshold = ACCURATE_FRACTION * max_speed
        moving = [s for s in burst if (s.speed or 0.0) > threshold]
        frac = len(moving) / len(burst)
        if not moving or frac < 0.5:
            continue
        died_after = death is not None and 0 <= death.t - burst[-1].t <= DEATH_AFTER_S
        severity = 0.3 + 0.3 * frac + (0.3 if died_after else 0.0)
        first = moving[0]
        drafts.append(
            FindingDraft(
                detector="shot_while_moving",
                kind="mistake",
                round=round_no,
                t=first.t,
                tick=first.tick,
                player_id=player_id,
                template="shot_while_moving",
                severity=round(clamp(severity), 3),
                evidence={
                    "shots": len(burst),
                    "movingShots": len(moving),
                    "speedUps": round(max(s.speed or 0.0 for s in moving)),
                    "accurateSpeedUps": round(threshold),
                    "weapon": wk,
                    "diedWithinS": DEATH_AFTER_S if died_after else 0,
                },
                zone=zone_of(match, first.pos or rd.position_at(player_id, first.t)),
            )
        )
    drafts.sort(key=lambda d: -d.severity)
    return sorted(drafts[:MAX_PER_ROUND], key=lambda d: d.t)
