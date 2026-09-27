from app.analysis.detectors import dry_peek
from tests.analysis.builders import blind, grenade, hurt, kill, match, offset, round_, shot, w


def _death():
    victim = w("A ramp")
    return kill(30.0, "ct1", "t1", vpos=victim, apos=offset(victim, -15))


def test_quick_death_without_utility():
    k = _death()
    rd = round_(kills=[k], shots=[shot(29.6, "t1", 0)], hurts=[hurt(29.7, "ct1", "t1", 27)])
    out = dry_peek.detect(match(rd), 2, "t1")
    assert len(out) == 1
    f = out[0]
    assert f.evidence["timeToDeathS"] == 0.4
    assert f.evidence["distanceToKillerM"] == 15.0
    assert f.t == 29.6
    assert f.zone == "A ramp"
    assert f.template == "dry_peek.instant"


def test_under_a_second_keeps_the_number():
    k = _death()
    rd = round_(kills=[k], shots=[shot(29.2, "t1", 0)])
    (f,) = dry_peek.detect(match(rd), 2, "t1")
    assert f.evidence["timeToDeathS"] == 0.8
    assert f.template == "dry_peek"


def test_teammate_flash_nearby_means_not_dry():
    k = _death()
    rd = round_(
        kills=[k],
        shots=[shot(29.6, "t1", 0)],
        grenades=[grenade(28.5, "flash", "t2", offset(k.victim_pos, -5))],
    )
    assert dry_peek.detect(match(rd), 2, "t1") == []


def test_long_fight_is_not_dry():
    k = _death()
    rd = round_(kills=[k], shots=[shot(27.5, "t1", 0)])
    assert dry_peek.detect(match(rd), 2, "t1") == []


def test_killer_flashed_is_not_dry():
    k = _death()
    rd = round_(kills=[k], blinds=[blind(29.5, "t2", "ct1", 2.0)])
    assert dry_peek.detect(match(rd), 2, "t1") == []


def test_enemy_flash_does_not_count_as_support():
    k = _death()
    rd = round_(kills=[k], grenades=[grenade(29.0, "flash", "ct2", k.victim_pos)])
    assert len(dry_peek.detect(match(rd), 2, "t1")) == 1
