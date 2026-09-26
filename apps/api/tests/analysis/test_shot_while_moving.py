from app.analysis.detectors import shot_while_moving
from tests.analysis.builders import kill, match, round_, shot, w


def test_moving_burst_before_death():
    rd = round_(
        shots=[shot(10.0, "t1", 200, pos=w("Mid")), shot(10.1, "t1", 180), shot(10.2, "t1", 40)],
        kills=[kill(11.0, "ct1", "t1")],
    )
    out = shot_while_moving.detect(match(rd), 2, "t1")
    assert len(out) == 1
    f = out[0]
    assert f.evidence["movingShots"] == 2 and f.evidence["shots"] == 3
    assert f.evidence["accurateSpeedUps"] == 73  # 0.34 * 215
    assert f.evidence["diedWithinS"] == 3.0
    assert f.zone == "Mid"
    assert f.severity == 0.8


def test_counter_strafed_shots_are_fine():
    rd = round_(shots=[shot(10.0, "t1", 20), shot(10.1, "t1", 10), shot(10.2, "t1", 0)])
    assert shot_while_moving.detect(match(rd), 2, "t1") == []


def test_smg_is_not_checked():
    rd = round_(shots=[shot(10.0, "t1", 230, weapon="weapon_mac10")])
    assert shot_while_moving.detect(match(rd), 2, "t1") == []


def test_at_most_two_bursts_per_round():
    shots = [shot(10.0 + 2 * i, "t1", 200) for i in range(5)]
    rd = round_(shots=shots)
    assert len(shot_while_moving.detect(match(rd), 2, "t1")) == 2
