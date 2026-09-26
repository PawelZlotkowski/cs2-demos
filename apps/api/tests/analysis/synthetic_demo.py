"""A tiny two-round ParsedDemo with demoparser2-shaped tables.

Column names follow demoparser2 0.42 (``user_``/``attacker_`` prefixes for
event player props, ``steamid`` in tick tables). Used to test extraction and
the pipeline without a real demo.
"""

from __future__ import annotations

import pandas as pd

from app.processing.parse_demo import ParsedDemo
from tests.analysis.builders import w

T_IDS = [76561198000000001 + i for i in range(5)]
CT_IDS = [76561198000000011 + i for i in range(5)]
FREEZE_ENDS = [1000, 9000]
ROUND_ENDS = [7000, 15000]


def sid(i: int) -> str:
    return str(i)


def build() -> ParsedDemo:
    t_pos, ct_pos = w("T spawn"), w("CT spawn")
    players = [{"id": sid(p), "name": f"T{i + 1}", "team_number": 2} for i, p in enumerate(T_IDS)]
    players += [{"id": sid(p), "name": f"CT{i + 1}", "team_number": 3} for i, p in enumerate(CT_IDS)]

    tick_rows = []
    for tick in range(0, ROUND_ENDS[-1] + 1, 8):
        for i, p in enumerate(T_IDS + CT_IDS):
            is_t = p in T_IDS
            x, y, z = t_pos if is_t else ct_pos
            tick_rows.append(
                {"tick": tick, "steamid": p, "X": x + i * 10, "Y": y, "Z": z, "yaw": 0.0, "health": 100,
                 "team_num": 2 if is_t else 3, "is_alive": True, "name": f"P{i}"}
            )
    ticks = pd.DataFrame(tick_rows)

    t1, t2 = T_IDS[0], T_IDS[1]
    ct1, ct2 = CT_IDS[0], CT_IDS[1]
    mid = w("Mid")
    deaths = pd.DataFrame(
        [
            {"tick": 2000, "attacker_steamid": ct1, "user_steamid": t1, "assister_steamid": None,
             "attacker_name": "CT1", "user_name": "T1", "weapon": "m4a1", "headshot": True, "assistedflash": False,
             "user_X": mid[0], "user_Y": mid[1], "user_Z": 0.0, "attacker_X": mid[0] - 500, "attacker_Y": mid[1], "attacker_Z": 0.0},
            {"tick": 2100, "attacker_steamid": t2, "user_steamid": ct1, "assister_steamid": None,
             "attacker_name": "T2", "user_name": "CT1", "weapon": "ak47", "headshot": False, "assistedflash": False,
             "user_X": mid[0] - 500, "user_Y": mid[1], "user_Z": 0.0, "attacker_X": mid[0], "attacker_Y": mid[1], "attacker_Z": 0.0},
            {"tick": 10000, "attacker_steamid": t1, "user_steamid": ct2, "assister_steamid": None,
             "attacker_name": "T1", "user_name": "CT2", "weapon": "ak47", "headshot": False, "assistedflash": False,
             "user_X": mid[0], "user_Y": mid[1], "user_Z": 0.0, "attacker_X": mid[0] + 300, "attacker_Y": mid[1], "attacker_Z": 0.0},
        ]
    )
    weapon_fires = pd.DataFrame(
        [{"tick": 1990, "user_steamid": t1, "weapon": "weapon_ak47", "user_X": mid[0], "user_Y": mid[1], "user_Z": 0.0,
          "user_velocity_X": 180.0, "user_velocity_Y": 100.0}]
    )
    hurts = pd.DataFrame(
        [{"tick": 1995, "attacker_steamid": ct1, "user_steamid": t1, "dmg_health": 40, "weapon": "m4a1"}]
    )
    blinds = pd.DataFrame([{"tick": 1500, "attacker_steamid": t1, "user_steamid": t2, "blind_duration": 2.4}])
    flashes = pd.DataFrame([{"tick": 1500, "user_steamid": t1, "x": mid[0], "y": mid[1], "z": 0.0}])
    purchases = pd.DataFrame([{"tick": 900, "user_steamid": t1, "weapon": "weapon_ak47"}])
    planted = pd.DataFrame([{"tick": 12000, "user_steamid": t2, "site": 1, "user_X": 0.0, "user_Y": 0.0, "user_Z": 0.0}])
    economy = pd.DataFrame(
        [{"tick": FREEZE_ENDS[r] + 1280, "steamid": p, "balance": 800, "current_equip_value": 4700,
          "armor_value": 100, "has_helmet": True, "team_num": 2 if p in T_IDS else 3}
         for r in range(2) for p in T_IDS + CT_IDS]
    )
    dense = pd.DataFrame(
        [{"tick": t, "steamid": p, "X": mid[0], "Y": mid[1], "Z": 0.0, "velocity_X": 0.0, "velocity_Y": 0.0,
          "yaw": 0.0, "pitch": 0.0, "health": 100, "team_num": 2, "is_alive": True,
          "active_weapon_name": "AK-47", "inventory": ["AK-47", "Flashbang", "Smoke Grenade"], "flash_duration": 0.0}
         for t in range(1808, 2001) for p in (t1, ct1)]
    )
    return ParsedDemo(
        header={"map_name": "de_mirage"},
        players=players,
        round_starts=pd.DataFrame({"tick": [0, 7100]}),
        round_ends=pd.DataFrame({"tick": ROUND_ENDS, "winner": ["CT", "T"], "reason": ["t_killed", "ct_killed"], "round": [1, 2]}),
        freeze_ends=pd.DataFrame({"tick": FREEZE_ENDS}),
        deaths=deaths,
        bomb_planted=planted,
        bomb_defused=pd.DataFrame(),
        flashes=flashes,
        smokes=pd.DataFrame(),
        hes=pd.DataFrame(),
        ticks=ticks,
        weapon_fires=weapon_fires,
        hurts=hurts,
        blinds=blinds,
        purchases=purchases,
        economy=economy,
        dense_ticks=dense,
    )
