from app.analysis.detectors import economy_mismatch
from tests.analysis.builders import eco, match, round_, sides


def _economy(me, mates):
    out = {"t1": me}
    out.update({p: e for p, e in zip(("t2", "t3", "t4", "t5"), mates)})
    return out


def test_saved_while_team_bought():
    r1 = round_(1)
    r2 = round_(2, economy=_economy(eco(4100, 900), [eco(200, 4700)] * 4))
    out = economy_mismatch.detect(match(r1, r2), 2, "t1")
    assert len(out) == 1
    assert out[0].template == "economy_mismatch.saved_on_buy"
    assert out[0].evidence == {"equipValue": 900, "teamMedianEquip": 4700, "balance": 4100}


def test_forced_while_team_saved():
    r1 = round_(1)
    r2 = round_(2, economy=_economy(eco(100, 4000), [eco(3000, 800)] * 4))
    assert economy_mismatch.detect(match(r1, r2), 2, "t1")[0].template == "economy_mismatch.forced_on_save"


def test_broke_player_is_not_a_mismatch():
    r1 = round_(1)
    r2 = round_(2, economy=_economy(eco(800, 900), [eco(200, 4700)] * 4))
    assert economy_mismatch.detect(match(r1, r2), 2, "t1") == []


def test_pistol_after_side_swap_is_skipped():
    swapped = sides(t_side=[f"ct{i}" for i in range(1, 6)], ct_side=[f"t{i}" for i in range(1, 6)])
    r12 = round_(12)
    r13 = round_(13, side_map=swapped, economy=_economy(eco(100, 4000), [eco(3000, 800)] * 4))
    assert economy_mismatch.is_pistol_round(match(r12, r13), 13)
    assert economy_mismatch.detect(match(r12, r13), 13, "t1") == []
