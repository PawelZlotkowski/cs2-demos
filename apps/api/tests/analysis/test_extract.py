from app.analysis.match_data import build_match_data
from app.analysis.run import analyse_player
from app.processing.normalize import normalize_parsed
from tests.analysis import synthetic_demo as sd


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
    assert {"shot_while_moving", "unused_utility", "team_flash", "opening_duel", "good_plays"} <= detectors
    assert "untraded_death" not in detectors  # T2 traded within 1.6 s
    assert [f.id for f in result.findings] == [f"F{i}" for i in range(1, len(result.findings) + 1)]
    assert all(f.summary and "{" not in f.summary for f in result.findings)
    assert len(result.round_stats) == 2
    assert result.moments and all(set(m.finding_ids) <= {f.id for f in result.findings} for m in result.moments)
