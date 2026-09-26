from app.analysis.detectors import untraded_death
from tests.analysis.builders import T, frames, kill, match, offset, round_, w


def _positions(mate_distance_m: float):
    site = w("A site")
    pos = {p: w("T spawn") for p in T[1:]}
    pos["t1"] = site
    pos["t2"] = offset(site, mate_distance_m)
    pos.update({p: w("CT spawn") for p in ("ct1", "ct2", "ct3", "ct4", "ct5")})
    return pos


def test_untraded_isolated_death_is_found():
    pos = _positions(40)
    rd = round_(kills=[kill(20.0, "ct1", "t1", vpos=pos["t1"])], frames=frames(pos))
    out = untraded_death.detect(match(rd), 2, "t1")
    assert len(out) == 1
    f = out[0]
    assert f.kind == "mistake" and f.zone == "A site"
    assert f.evidence["teammatesAlive"] == 4
    assert abs(f.evidence["nearestTeammateM"] - 40) < 0.5
    assert f.severity == 0.8  # capped isolation term


def test_traded_death_is_not_a_finding():
    pos = _positions(5)
    rd = round_(
        kills=[kill(20.0, "ct1", "t1", vpos=pos["t1"]), kill(22.5, "t2", "ct1")],
        frames=frames(pos),
    )
    assert untraded_death.detect(match(rd), 2, "t1") == []


def test_trade_after_window_does_not_count():
    pos = _positions(5)
    rd = round_(
        kills=[kill(20.0, "ct1", "t1", vpos=pos["t1"]), kill(26.0, "t2", "ct1")],
        frames=frames(pos),
    )
    out = untraded_death.detect(match(rd), 2, "t1")
    assert len(out) == 1
    assert out[0].severity < 0.6  # teammate was close


def test_last_alive_death_is_skipped():
    kills = [kill(5.0 + i, "ct1", p) for i, p in enumerate(T[1:])] + [kill(30.0, "ct1", "t1")]
    rd = round_(kills=kills)
    assert untraded_death.detect(match(rd), 2, "t1") == []
