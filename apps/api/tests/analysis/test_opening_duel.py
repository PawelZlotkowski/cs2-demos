from app.analysis.detectors import opening_duel
from tests.analysis.builders import kill, match, round_, w


def test_lost_opening_duel():
    rd = round_(kills=[kill(12.0, "ct1", "t1", vpos=w("Mid"), apos=w("Top mid")), kill(20.0, "t2", "ct2")])
    out = opening_duel.detect(match(rd), 2, "t1")
    assert len(out) == 1
    assert out[0].kind == "context"
    assert out[0].evidence["result"] == "lost"
    assert out[0].zone == "Mid"
    assert out[0].template == "opening_duel.lost"


def test_won_opening_duel_uses_attacker_position():
    rd = round_(kills=[kill(12.0, "t1", "ct1", vpos=w("Mid"), apos=w("Top mid"))])
    out = opening_duel.detect(match(rd), 2, "t1")
    assert out[0].evidence["result"] == "won" and out[0].zone == "Top mid"


def test_team_kill_is_not_the_opening_duel():
    rd = round_(kills=[kill(5.0, "t2", "t3"), kill(12.0, "ct1", "t1")])
    assert opening_duel.detect(match(rd), 2, "t1")[0].t == 12.0


def test_not_involved():
    rd = round_(kills=[kill(12.0, "ct1", "t2")])
    assert opening_duel.detect(match(rd), 2, "t1") == []
