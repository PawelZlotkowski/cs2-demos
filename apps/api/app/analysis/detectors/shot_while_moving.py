"""D2: moving rifle bursts during evidenced combat, for review only.

The legacy 34% speed proxy is not a probability of hitting a target and cannot
prove a mistake. Pistols/SMGs/shotguns and scoped weapons abstain until weapon,
stance, range and firing-mode calibration exists. Two moving shots and a
nearby firearm damage/kill event involving the player are required. Context
findings cannot start a ranked mistake clip. Priority = 0.3 + 0.3 * fraction.
Thresholds below are conservative product hypotheses, not validated mechanics.
"""
from __future__ import annotations

import math

from app.analysis.detectors.common import FindingDraft, weapon_key, zone_of
from app.analysis.match_data import MatchData, Shot

# Max speeds match CS2 weapons.vdata (checked 23 Nov 2026). The 0.34 x max speed rule comes
# from the CS:GO source; CS2's own ramp is not public.
WEAPON_MAX_SPEED = {
    "ak47": 215, "m4a1": 225, "m4a1_silencer": 225, "m4a4": 225,
    "m4a1s": 225, "famas": 220, "galilar": 215,
}
ACCURATE_FRACTION = 0.34  # Speed proxy, not a guarantee of accurate shooting.
BURST_GAP_S = 0.5
COMBAT_MARGIN_S = 0.5
MIN_MOVING_SHOTS = 2
MAX_PER_ROUND = 2
MIN_BURST_GAP_S = 3.0
NON_FIREARMS = {"hegrenade", "inferno", "molotov", "incgrenade", "smokegrenade", "flashbang", "decoy", "taser", "c4", "planted_c4", "world", ""}


def _firearm(weapon: str) -> bool:
    key = weapon_key(weapon)
    return key not in NON_FIREARMS and "knife" not in key and "bayonet" not in key


def _bursts(shots: list[Shot]) -> list[list[Shot]]:
    bursts: list[list[Shot]] = []
    seen = set()
    for s in sorted(shots, key=lambda s: s.tick):
        key = (s.tick, weapon_key(s.weapon))
        if key in seen:
            continue
        seen.add(key)
        if bursts and s.t - bursts[-1][-1].t <= BURST_GAP_S and weapon_key(s.weapon) == weapon_key(bursts[-1][-1].weapon):
            bursts[-1].append(s)
        else:
            bursts.append([s])
    return bursts


def detect(match: MatchData, round_no: int, player_id: str) -> list[FindingDraft]:
    rd = match.round(round_no)
    if rd is None or rd.sides.get(player_id) not in ("T", "CT"):
        return []
    enemies = {p for p, side in rd.sides.items()
               if side in ("T", "CT") and side != rd.sides[player_id]}
    own = [s for s in rd.shots if s.player == player_id and 0 <= s.t <= rd.duration]
    drafts = []
    for burst in _bursts(own):
        wk = weapon_key(burst[0].weapon)
        max_speed = WEAPON_MAX_SPEED.get(wk)
        if max_speed is None or any(s.speed is None or not math.isfinite(s.speed) for s in burst):
            continue
        threshold = ACCURATE_FRACTION * max_speed
        moving = [s for s in burst if s.speed > threshold]
        frac = len(moving) / len(burst)
        if len(moving) < MIN_MOVING_SHOTS or frac < 0.5:
            continue
        lo, hi = burst[0].t - COMBAT_MARGIN_S, burst[-1].t + COMBAT_MARGIN_S
        hurts = [h for h in rd.hurts if lo <= h.t <= hi and h.damage > 0 and _firearm(h.weapon)
                 and ((h.attacker == player_id and h.victim in enemies)
                      or (h.victim == player_id and h.attacker in enemies))]
        kills = [k for k in rd.kills if lo <= k.t <= hi and _firearm(k.weapon)
                 and ((k.attacker == player_id and k.victim in enemies)
                      or (k.victim == player_id and k.attacker in enemies))]
        if not hurts and not kills:
            continue
        first = moving[0]
        drafts.append(FindingDraft(
            detector="shot_while_moving", kind="context", round=round_no,
            t=first.t, tick=first.tick, player_id=player_id,
            template="shot_while_moving.review", severity=round(0.3 + 0.3 * frac, 3),
            evidence={
                "shots": len(burst), "movingShots": len(moving),
                "speedUps": round(max(s.speed for s in moving)),
                "accurateSpeedUps": round(threshold), "weapon": wk,
                "burstStartS": burst[0].t, "burstEndS": burst[-1].t,
                "combatEvents": len(hurts) + len(kills),
                "assessment": "review_required", "thresholdPolicy": "legacy_speed_proxy",
                "visibility": "unknown",
            },
            zone=zone_of(match, first.pos or rd.position_at(player_id, first.t)),
        ))
    picked = []
    for draft in sorted(drafts, key=lambda d: (-d.severity, d.t)):
        if all(abs(draft.t - other.t) >= MIN_BURST_GAP_S for other in picked):
            picked.append(draft)
            if len(picked) == MAX_PER_ROUND:
                break
    return sorted(picked, key=lambda d: d.t)
