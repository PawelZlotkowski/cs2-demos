from app.analysis.detectors import good_plays
from tests.analysis.builders import hurt, kill, match, round_


def _plays(rd, pid="t1"):
    return {f.evidence["play"]: f for f in good_plays.detect(match(rd), rd.number, pid)}


def test_trade_kill_and_entry():
    rd = round_(winner="T", kills=[kill(10.0, "t1", "ct1"), kill(15.0, "ct2", "t2"), kill(17.0, "t1", "ct2")])
    plays = _plays(rd)
    assert plays["entry_kill"].evidence["victimName"] == "CT1"
    assert plays["trade_kill"].evidence["tradeTimeS"] == 2.0
    assert "multi_kill" not in plays


def test_entry_only_counts_on_t_side():
    rd = round_(kills=[kill(10.0, "ct1", "t1")])
    assert "entry_kill" not in _plays(rd, "ct1")


def test_multi_kill_and_clutch():
    kills = [kill(5.0 + i, "ct1", p) for i, p in enumerate(("t2", "t3", "t4", "t5"))]
    kills += [kill(30.0, "t1", "ct1"), kill(35.0, "t1", "ct2"), kill(40.0, "t1", "ct3")]
    rd = round_(winner="T", kills=kills)
    plays = _plays(rd)
    assert plays["multi_kill"].evidence["kills"] == 3
    assert plays["clutch"].evidence == {"play": "clutch", "enemiesAlive": 5, "killsInClutch": 3}
    assert plays["clutch"].severity == 0.95


def test_lost_clutch_is_not_good():
    kills = [kill(5.0 + i, "ct1", p) for i, p in enumerate(("t2", "t3", "t4", "t5"))] + [kill(30.0, "ct1", "t1")]
    assert "clutch" not in _plays(round_(winner="CT", kills=kills))


def test_flash_assist_and_utility_damage():
    rd = round_(
        kills=[kill(20.0, "t2", "ct1", assister="t1", flash_assist=True)],
        hurts=[hurt(12.0, "t1", "ct3", 30, "hegrenade"), hurt(12.0, "t1", "ct4", 25, "inferno"), hurt(13.0, "t1", "t2", 20, "hegrenade")],
    )
    plays = _plays(rd)
    assert plays["flash_assist"].evidence["killerName"] == "T2"
    assert plays["utility_damage"].evidence["utilityDamage"] == 55  # team damage ignored
