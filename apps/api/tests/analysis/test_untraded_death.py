import pytest

from app.analysis.detectors import good_plays, untraded_death
from app.analysis.trades import nearby_deaths, successful_trades
from tests.analysis.builders import frames, hurt, kill, match, offset, round_, w


def setup(distance=5, response=None):
    origin = w("A site")
    positions = {"t1": origin, "t2": offset(origin, distance), "t3": offset(origin, 2)}
    deaths = [kill(20, "ct1", "t2", vpos=positions["t2"])]
    return round_(kills=deaths + (response or []), frames=frames(positions))


def test_selected_player_does_not_need_to_die():
    rd = setup()
    out = untraded_death.detect(match(rd), 2, "t1")
    assert len(out) == 1 and out[0].player_id == "t1"
    assert out[0].kind == "context"
    assert out[0].evidence["teammateDistanceM"] == 5
    assert out[0].evidence["tradeOutcome"] == "not_traded"
    assert out[0].evidence["visibility"] == "unknown"
    assert untraded_death.detect(match(rd), 2, "t2") == []


def test_success_has_one_good_finding_and_no_missed_trade():
    rd = setup(response=[kill(25, "t1", "ct1")])
    assert untraded_death.detect(match(rd), 2, "t1") == []
    trades = [f for f in good_plays.detect(match(rd), 2, "t1") if f.evidence["play"] == "trade_kill"]
    assert len(trades) == 1 and trades[0].evidence["tradeTimeS"] == 5


@pytest.mark.parametrize("distance", [5.001, 10, 40])
def test_distance_gate_is_unrounded(distance):
    rd = setup(distance, [kill(21, "t1", "ct1")])
    assert nearby_deaths(rd, "t1") == []


def test_vertical_separation_and_stale_positions_abstain():
    rd = setup(0)
    rd.kills[0].victim_pos = (*w("A site")[:2], 6 / 0.0254)
    assert nearby_deaths(rd, "t1") == []
    rd = setup()
    rd.frames = rd.frames[:2]
    assert nearby_deaths(rd, "t1") == []
    rd.frames = []
    assert nearby_deaths(rd, "t1") == []
    rd = setup()
    rd.frames = rd.frames[170:]  # First sample is after the teammate's death.
    assert nearby_deaths(rd, "t1") == []


@pytest.mark.parametrize("response,outcome", [
    ([kill(25.01, "t1", "ct1")], "not_traded"),
    ([kill(21, "t3", "ct1")], "traded_by_teammate"),
    ([kill(21, "ct1", "t1")], "player_died"),
    ([kill(21, None, "ct1")], "killer_unavailable"),
])
def test_outcomes_remain_distinct(response, outcome):
    rd = setup(response=response)
    assert nearby_deaths(rd, "t1")[0].outcome == outcome


def test_round_end_truncates_window():
    rd = setup()
    rd.duration = 22
    event = nearby_deaths(rd, "t1")[0]
    assert event.outcome == "window_incomplete" and event.observed_s == 2


def test_complete_fractional_window_is_not_truncated_by_float_subtraction():
    rd = setup()
    rd.kills[0].t = 13.906
    event = nearby_deaths(rd, "t1")[0]
    assert event.outcome == "not_traded"
    assert event.observed_s == pytest.approx(5)


def test_dead_player_teamkill_and_unknown_sides_are_not_opportunities():
    rd = setup(response=[kill(19, "ct2", "t1")])
    assert nearby_deaths(rd, "t1") == []
    rd = setup()
    rd.kills[0].attacker = "t3"
    assert nearby_deaths(rd, "t1") == []
    assert nearby_deaths(rd, "missing") == []


def test_damage_is_attempt_evidence_not_proof_of_no_attempt():
    rd = setup()
    rd.hurts = [hurt(21, "t1", "ct1", 40)]
    assert untraded_death.detect(match(rd), 2, "t1")[0].evidence["damageToKiller"] == 40


def test_one_revenge_kill_does_not_create_two_good_plays():
    rd = setup(response=[kill(20.5, "ct1", "t3"), kill(21, "t1", "ct1")])
    rd.kills.append(rd.kills[0])
    assert len(successful_trades(rd, "t1")) == 1
