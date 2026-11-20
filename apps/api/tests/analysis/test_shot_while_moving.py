import pytest

from app.analysis.detectors import shot_while_moving
from tests.analysis.builders import hurt, kill, match, round_, shot, w


def burst(weapon="weapon_ak47", speed=200):
    return [shot(10, "t1", speed, weapon=weapon, pos=w("Mid")),
            shot(10.1, "t1", speed, weapon=weapon), shot(10.2, "t1", 40, weapon=weapon)]


def test_combat_burst_is_context_not_proven_mistake():
    rd = round_(shots=burst(), hurts=[hurt(10.15, "ct1", "t1", 30)])
    out = shot_while_moving.detect(match(rd), 2, "t1")
    assert len(out) == 1
    assert out[0].kind == "context"
    assert out[0].evidence["movingShots"] == 2
    assert out[0].evidence["combatEvents"] == 1
    assert out[0].zone == "Mid"


def test_empty_shooting_and_unrelated_later_death_are_ignored():
    for kills in ([], [kill(12, "ct1", "t1")], [kill(10.2, "ct1", "t2")]):
        rd = round_(shots=burst(), kills=kills)
        assert shot_while_moving.detect(match(rd), 2, "t1") == []


@pytest.mark.parametrize("weapon", ["glock", "tec9", "deagle", "usp_silencer", "mac10", "nova", "awp", "aug"])
def test_unmodelled_weapons_abstain_even_during_combat(weapon):
    rd = round_(shots=burst(weapon), hurts=[hurt(10.1, "ct1", "t1", 30)])
    assert shot_while_moving.detect(match(rd), 2, "t1") == []


@pytest.mark.parametrize("speed", [0, 20, 73.1, None, float("nan"), float("inf")])
def test_stationary_or_missing_speed_abstains(speed):
    rd = round_(shots=burst(speed=speed), kills=[kill(10.2, "ct1", "t1")])
    assert shot_while_moving.detect(match(rd), 2, "t1") == []


def test_grenade_damage_does_not_establish_a_gunfight():
    rd = round_(shots=burst(), hurts=[hurt(10.1, "ct1", "t1", 30, "hegrenade")])
    assert shot_while_moving.detect(match(rd), 2, "t1") == []


def test_duplicate_fire_events_are_not_extra_shots():
    shots = [shot(10, "t1", 200)] * 3
    rd = round_(shots=shots, kills=[kill(10.1, "ct1", "t1")])
    assert shot_while_moving.detect(match(rd), 2, "t1") == []
