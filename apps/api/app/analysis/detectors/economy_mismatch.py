"""D7 Economy mismatch.

Signal, read at the end of buy time (freeze end + 20 s):
- saved on a buy: team median equipment >= ``TEAM_BUY_EQUIP`` but the player's
  equipment is below half of it while they still hold >= ``COULD_BUY_MONEY``;
- forced on a save: team median <= ``TEAM_SAVE_EQUIP`` but the player bought
  >= ``TEAM_BUY_EQUIP``.
Pistol rounds (round 1, the round after a knife round and the first round
after sides swap) are skipped.

Severity: 0.5 saved on a buy, 0.45 forced on a save.

Known false positives: a teammate is about to drop a weapon after buy time;
agreed "one player buys AWP" plans.
"""

from __future__ import annotations

import statistics

from app.analysis.detectors.common import FindingDraft
from app.analysis.match_data import MatchData

TEAM_BUY_EQUIP = 3500  # roughly rifle + armour
TEAM_SAVE_EQUIP = 1500
COULD_BUY_MONEY = 2500


def is_pistol_round(match: MatchData, round_no: int) -> bool:
    if round_no == 1:
        return True
    prev, cur = match.round(round_no - 1), match.round(round_no)
    if prev is None or cur is None:
        return False
    if prev.is_knife:
        return True
    shared = set(prev.sides) & set(cur.sides)
    return any(prev.sides[p] != cur.sides[p] for p in shared)


def detect(match: MatchData, round_no: int, player_id: str) -> list[FindingDraft]:
    rd = match.round(round_no)
    if rd is None or is_pistol_round(match, round_no):
        return []
    me = rd.economy.get(player_id)
    mates = [rd.economy[p] for p in rd.teammates(player_id) if p in rd.economy]
    if me is None or len(mates) < 2:
        return []
    team_median = statistics.median(e.equip_value for e in mates)

    if team_median >= TEAM_BUY_EQUIP and me.equip_value < team_median / 2 and me.balance >= COULD_BUY_MONEY:
        template, severity = "economy_mismatch.saved_on_buy", 0.5
    elif team_median <= TEAM_SAVE_EQUIP and me.equip_value >= TEAM_BUY_EQUIP:
        template, severity = "economy_mismatch.forced_on_save", 0.45
    else:
        return []
    return [
        FindingDraft(
            detector="economy_mismatch",
            kind="mistake",
            round=round_no,
            t=0.0,
            tick=rd.start_tick,
            player_id=player_id,
            template=template,
            severity=severity,
            evidence={
                "equipValue": me.equip_value,
                "teamMedianEquip": int(team_median),
                "balance": me.balance,
            },
        )
    ]
