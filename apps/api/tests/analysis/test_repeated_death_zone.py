from app.analysis.detectors import repeated_death_zone
from tests.analysis.builders import kill, match, round_, w


def test_third_death_in_zone_is_a_pattern():
    rounds = [round_(n, kills=[kill(20.0, "ct1", "t1", vpos=w("Mid"))]) for n in (3, 7, 9)]
    m = match(*rounds)
    assert repeated_death_zone.detect(m, 7, "t1") == []  # only two so far, no looking ahead
    out = repeated_death_zone.detect(m, 9, "t1")
    assert len(out) == 1
    assert out[0].kind == "pattern"
    assert out[0].evidence == {"deathsInZone": 3, "rounds": "3, 7, 9"}


def test_different_zones_do_not_count():
    spots = ["Mid", "A site", "Mid"]
    rounds = [round_(n, kills=[kill(20.0, "ct1", "t1", vpos=w(s))]) for n, s in zip((1, 2, 3), spots)]
    assert repeated_death_zone.detect(match(*rounds), 3, "t1") == []
