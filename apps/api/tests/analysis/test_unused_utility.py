import pytest

from app.analysis.detectors import unused_utility
from tests.analysis.builders import bomb, kill, match, round_, w, window

FLASH = {"t1": {"inventory": ["AK-47", "Flashbang"]}}


@pytest.mark.parametrize("case", ["bomb_about_to_explode", "after_defuse", "last_alive_v3", "traded_after_own_kill"])
def test_utility_that_could_no_longer_matter_is_not_flagged(case):
    death = kill(60.0, "ct1", "t1")
    other: list = []
    bombs: list = []
    if case == "bomb_about_to_explode":
        bombs = [bomb(25.0, "plant", "t2", None)]  # explodes at 65 s, 5 s after the death
    elif case == "after_defuse":
        bombs = [bomb(30.0, "plant", "t2", None), bomb(55.0, "defuse", "ct2", None)]
    elif case == "last_alive_v3":
        other = [kill(10.0 + i, "ct1", f"t{i}") for i in range(2, 6)] + [kill(20.0, "t1", "ct5"), kill(21.0, "t1", "ct4")]
    else:
        other = [kill(58.0, "t1", "ct3")]
    rd = round_(kills=[*other, death], kill_windows=[window(death, FLASH)], bomb=bombs)
    assert unused_utility.detect(match(rd), 2, "t1") == []
    # Last alive against two is still a fight utility can win
    if case == "last_alive_v3":
        rd = round_(kills=[*other, kill(22.0, "t1", "ct3"), death], kill_windows=[window(death, FLASH)])
        assert len(unused_utility.detect(match(rd), 2, "t1")) == 1


@pytest.mark.parametrize("killer,trade", [("t2", None), (None, None), ("t1", None), ("ct1", kill(41.0, "t2", "ct1"))])
def test_team_kill_world_death_and_traded_death_are_not_flagged(killer, trade):
    death = kill(40.0, killer, "t1")
    rd = round_(kills=[death] + ([trade] if trade else []), kill_windows=[window(death, FLASH)])
    assert unused_utility.detect(match(rd), 2, "t1") == []
    # Traded too late (after the trade window) is still flagged
    if trade:
        rd.kills[1] = kill(46.0, "t2", "ct1")
        assert len(unused_utility.detect(match(rd), 2, "t1")) == 1


def test_died_holding_grenades():
    k = kill(40.0, "ct1", "t1", vpos=w("Palace"))
    inv = ["AK-47", "Glock-18", "Flashbang", "Smoke Grenade", "Decoy Grenade", "knife"]
    rd = round_(kills=[k], kill_windows=[window(k, {"t1": {"inventory": inv}})])
    out = unused_utility.detect(match(rd), 2, "t1")
    assert len(out) == 1
    f = out[0]
    assert f.evidence["grenadesUnused"] == 2  # decoy ignored
    assert f.evidence["grenadeList"] == "Flashbang, Smoke Grenade"
    assert f.zone == "Palace"
    assert f.severity == 0.65


def test_no_grenades_no_finding():
    k = kill(40.0, "ct1", "t1")
    rd = round_(kills=[k], kill_windows=[window(k, {"t1": {"inventory": ["AK-47", "Decoy Grenade"]}})])
    assert unused_utility.detect(match(rd), 2, "t1") == []


def test_missing_window_is_skipped():
    rd = round_(kills=[kill(40.0, "ct1", "t1")])
    assert unused_utility.detect(match(rd), 2, "t1") == []
