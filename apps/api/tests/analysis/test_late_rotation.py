from app.analysis.detectors import late_rotation
from tests.analysis.builders import CT, T, bomb, frames, match, round_, w


def _round(ct1_moves):
    pos = {p: w("T spawn") for p in T}
    pos.update({p: w("B site") for p in CT})
    moves = {
        "ct2": [(38.0, w("A site"))],
        "ct3": [(40.0, w("A site"))],
        "ct4": [(42.0, w("A site"))],
        "ct1": ct1_moves,
    }
    return round_(frames=frames(pos, until=70, moves=moves), bomb=[bomb(30.0, "plant", "t1", w("A site"))])


def test_late_arrival_after_plant():
    rd = _round([(55.0, w("A site"))])
    out = late_rotation.detect(match(rd), 2, "ct1")
    assert len(out) == 1
    ev = out[0].evidence
    assert ev["site"] == "A site"
    assert ev["teamMedianArrivalS"] == 10.0
    assert ev["arrivalS"] == 25.0 and ev["delayS"] == 15.0


def test_on_time_arrival():
    rd = _round([(41.0, w("A site"))])
    assert late_rotation.detect(match(rd), 2, "ct1") == []


def test_never_arrived():
    rd = _round([])
    out = late_rotation.detect(match(rd), 2, "ct1")
    assert out[0].template == "late_rotation.never"


def test_t_side_is_not_checked():
    rd = _round([])
    assert late_rotation.detect(match(rd), 2, "t2") == []
