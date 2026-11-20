from app.analysis.match_data import build_match_data
from app.analysis.run import analyse_player
from app.processing.normalize import normalize_parsed
from tests.analysis import synthetic_demo as sd
import pandas as pd
import pytest
from app.processing.parse_demo import ParseError


def _normalised():
    return normalize_parsed("match-synth", sd.build())


def test_analysis_json_shape():
    out = _normalised()
    a = out["analysis"]
    assert a["map"] == "de_mirage" and a["tickRate"] == 64
    assert [r["number"] for r in a["rounds"]] == [1, 2]
    r1 = a["rounds"][0]
    t1, ct1 = sd.sid(sd.T_IDS[0]), sd.sid(sd.CT_IDS[0])
    assert r1["sides"][t1] == "T" and r1["sides"][ct1] == "CT"
    assert r1["knifeRound"] is False
    assert r1["kills"][0]["victim"] == t1 and r1["kills"][0]["t"] == round((2000 - 1000) / 64, 3)
    assert r1["shots"][0]["speed"] == 205.9
    assert r1["blinds"][0]["duration"] == 2.4
    assert r1["purchases"][0]["t"] < 0  # bought during freeze time
    assert r1["economy"][t1] == {"balance": 800, "equipValue": 4700, "armor": 100, "helmet": True}
    assert r1["grenades"][0]["type"] == "flash"
    window = r1["killWindows"][0]
    assert window["killTick"] == 2000 and window["tick0"] == 2000 - 192
    assert window["atKill"][t1]["inventory"] == ["AK-47", "Flashbang", "Smoke Grenade"]
    assert len(window["tracks"][t1]["x"]) == 193  # tick0 through the kill tick
    assert a["rounds"][1]["bomb"][0]["type"] == "plant"


def test_replay_blobs_do_not_carry_analysis_fields():
    out = _normalised()
    sample = out["round_replays"]["r1"]["samples"][0]["players"][0]
    assert set(sample) == {"id", "x", "y", "z", "yaw", "health", "alive", "rx", "ry"}


def test_end_to_end_analysis_on_synthetic_demo():
    out = _normalised()
    match = build_match_data(out["analysis"], out["round_replays"])
    assert match.rounds[0].frames, "8 Hz frames come from the replay blobs"
    t1 = sd.sid(sd.T_IDS[0])
    result = analyse_player(match, t1)
    detectors = {f.detector for f in result.findings}
    assert {"unused_utility", "team_flash", "opening_duel", "good_plays"} <= detectors
    moving = next(f for f in result.findings if f.detector == "shot_while_moving")
    assert moving.kind == "context" and moving.evidence["shots"] == 2
    assert "untraded_death" not in detectors  # Selected player died, no nearby mate death while alive.
    assert [f.id for f in result.findings] == [f"F{i}" for i in range(1, len(result.findings) + 1)]
    assert all(f.summary and "{" not in f.summary for f in result.findings)
    assert len(result.round_stats) == 2
    assert result.moments and all(set(m.finding_ids) <= {f.id for f in result.findings} for m in result.moments)


def test_restart_does_not_create_a_round_or_duplicate_kills():
    parsed = sd.build()
    parsed.round_ends = pd.concat([parsed.round_ends, pd.DataFrame([
        {"tick": 8000, "winner": None, "round": 2, "reason": None},
        {"tick": 7000, "winner": "CT", "round": 1, "reason": "t_killed"},
    ])], ignore_index=True)
    normal = normalize_parsed("restart", parsed)
    assert [(r["startTick"], r["endTick"]) for r in normal["rounds"]] == [(1000, 7000), (9000, 15000)]
    assert [[k["tick"] for k in r["kills"]] for r in normal["analysis"]["rounds"]] == [[2000, 2100], [10000]]


def test_missing_freeze_end_uses_this_round_start():
    parsed = sd.build()
    parsed.freeze_ends = parsed.freeze_ends.iloc[:1]
    normal = normalize_parsed("missing-freeze", parsed)
    assert normal["rounds"][1]["startTick"] == 7100
    assert [k["tick"] for k in normal["analysis"]["rounds"][1]["kills"]] == [10000]


def test_missing_boundaries_fail_instead_of_inventing_a_clock():
    parsed = sd.build()
    parsed.freeze_ends = parsed.freeze_ends.iloc[:1]
    parsed.round_starts = parsed.round_starts.iloc[:1]
    with pytest.raises(ParseError, match="missing round boundaries"):
        normalize_parsed("missing-start", parsed)


def test_aborted_round_freeze_is_not_reused_after_restart():
    parsed = sd.build()
    parsed.round_ends = pd.concat([parsed.round_ends, pd.DataFrame([
        {"tick": 8500, "winner": None, "round": 2, "reason": None},
    ])], ignore_index=True)
    parsed.freeze_ends = pd.DataFrame({"tick": [1000, 8000]})
    parsed.round_starts = pd.DataFrame({"tick": [0, 7100, 8500]})
    # round_start may share the restart tick; there is no completed round there.
    normal = normalize_parsed("restart-without-freeze", parsed)
    assert normal["rounds"][1]["startTick"] >= 8500
