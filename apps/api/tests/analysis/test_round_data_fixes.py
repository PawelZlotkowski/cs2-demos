"""Round data from the parser: knife and fake rounds, score, damage, after-round kills, trades, purchases."""

import pandas as pd

from app.analysis.match_data import build_match_data
from app.analysis.stats import round_stats
from app.processing.normalize import normalize_parsed
from tests.analysis import synthetic_demo as sd
from tests.analysis.builders import kill, match, round_

T1, T2 = sd.sid(sd.T_IDS[0]), sd.sid(sd.T_IDS[1])
CT1, CT2 = sd.sid(sd.CT_IDS[0]), sd.sid(sd.CT_IDS[1])


def test_knife_round_is_dropped_so_the_pistol_round_is_round_1():
    parsed = sd.build()
    first = parsed.deaths["tick"] < sd.ROUND_ENDS[0]
    parsed.deaths.loc[first, "weapon"] = "knife_t"
    parsed.weapon_fires["weapon"] = "weapon_knife"
    out = normalize_parsed("match-knife", parsed)
    assert [(r["id"], r["startTick"]) for r in out["rounds"]] == [("r1", 9000)]
    assert list(out["round_replays"]) == ["r1"] and out["round_replays"]["r1"]["startTick"] == 9000
    (r1,) = out["analysis"]["rounds"]
    assert (r1["number"], r1["startTick"], r1["knifeRound"]) == (1, 9000, False)
    assert r1["economy"] and r1["sides"][T1] == "T"
    assert out["match"]["rounds"] == 1 and out["match"]["score"] == "0–1"


def test_score_follows_teams_through_the_half_time_switch():
    parsed = sd.build()
    second_half = parsed.ticks["tick"] >= sd.FREEZE_ENDS[1]
    parsed.ticks.loc[second_half, "team_num"] = 5 - parsed.ticks.loc[second_half, "team_num"]
    parsed.round_ends["winner"] = ["CT", "CT"]  # each team wins its CT round
    out = normalize_parsed("match-score", parsed)
    assert out["match"]["score"] == "1–1" and out["match"]["won"] == [1, 0]


def test_warm_up_and_winnerless_rows_are_not_rounds_but_the_final_round_is():
    parsed = sd.build()
    parsed.freeze_ends = pd.DataFrame({"tick": [300, 1000, 7500, 9000]})
    parsed.round_ends = pd.DataFrame(
        {
            "tick": [600, 7000, 8000, 8500, 15000],
            # warm-up, round 1, restart, a "draw" row (anb-026-p1 reads winner 10), round 2
            "winner": ["CT", "CT", None, "10", "T"],
            "reason": ["t_killed", "t_killed", None, "draw", "ct_killed"],
            "round": [1, 2, 3, 4, 5],
            # The game-over row also reads False: only the rows before the match started go
            "is_match_started": [False, True, True, True, False],
        }
    )
    out = normalize_parsed("match-fake", parsed)
    assert [(r["number"], r["startTick"], r["endTick"]) for r in out["rounds"]] == [(1, 1000, 7000), (2, 9000, 15000)]


def test_damage_is_the_health_lost_not_the_hit_damage():
    parsed = sd.build()
    parsed.hurts = pd.DataFrame(
        [
            # dmg_health rounds down: the health field shows 40 lost
            {"tick": 1990, "attacker_steamid": sd.CT_IDS[0], "user_steamid": sd.T_IDS[0], "dmg_health": 39, "health": 60, "weapon": "m4a1"},
            {"tick": 1995, "attacker_steamid": sd.CT_IDS[0], "user_steamid": sd.T_IDS[0], "dmg_health": 90, "health": 0, "weapon": "m4a1"},
            # No health column value: tracked from 100
            {"tick": 2050, "attacker_steamid": sd.T_IDS[1], "user_steamid": sd.CT_IDS[0], "dmg_health": 440, "weapon": "awp"},
        ]
    )
    out = normalize_parsed("match-dmg", parsed)
    assert [h["damage"] for h in out["analysis"]["rounds"][0]["hurts"]] == [40, 60, 100]


def test_kills_after_the_round_end_count_for_round_stats_only():
    parsed = sd.build()
    late = {"tick": 7050, "attacker_steamid": sd.CT_IDS[1], "user_steamid": sd.T_IDS[1], "weapon": "m4a1",
            "headshot": False, "assistedflash": False, "assister_steamid": None}
    parsed.deaths = pd.concat([parsed.deaths, pd.DataFrame([late])], ignore_index=True)
    parsed.hurts = pd.concat([parsed.hurts, pd.DataFrame([{**late, "dmg_health": 100}])], ignore_index=True)
    out = normalize_parsed("match-post", parsed)
    r1 = out["analysis"]["rounds"][0]
    assert [k["tick"] for k in r1["postKills"]] == [7050] and 7050 not in [k["tick"] for k in r1["kills"]]
    m = build_match_data(out["analysis"])
    rd = m.rounds[0]
    assert all(k.tick <= rd.end_tick for k in rd.kills) and all(h.tick <= rd.end_tick for h in rd.hurts)
    victim, killer = round_stats(m, rd, T2), round_stats(m, rd, CT2)
    assert (victim.survived, victim.deaths) == (False, 1)
    assert (killer.kills, killer.damage) == (1, 100)


def test_trade_kills_use_the_same_rule_as_traded_deaths():
    # No positions at all: the 5 m radius of the untraded-death detector does not apply here
    rd = round_(2, kills=[kill(10.0, "ct1", "t2"), kill(12.0, "t1", "ct1")])
    m = match(rd)
    assert round_stats(m, rd, "t2").death_traded is True
    assert round_stats(m, rd, "t1").trade_kills == 1


def test_purchases_read_demoparser2_columns():
    parsed = sd.build()
    parsed.purchases = pd.DataFrame([{"tick": 900, "steamid": sd.T_IDS[0], "item_name": "AK-47", "name": "T1"}])
    out = normalize_parsed("match-buy", parsed)
    assert [(p["player"], p["item"]) for p in out["analysis"]["rounds"][0]["purchases"]] == [(T1, "AK-47")]
