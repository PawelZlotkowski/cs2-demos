from app.analysis.detectors import unused_utility
from tests.analysis.builders import kill, match, round_, w, window


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
