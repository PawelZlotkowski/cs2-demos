"""Detectors on the real sample demo. Skips when the demo is not present
(demos are never committed; see data/README.md)."""

from __future__ import annotations

from pathlib import Path

import pytest

from app.analysis.match_data import build_match_data
from app.analysis.run import analyse_player
from app.processing.decompress import decompress_demo
from app.processing.normalize import normalize_parsed
from app.processing.parse_demo import parse_demo_file

ROOT = Path(__file__).resolve().parents[4]
REAL_DEMO = ROOT / "1-5696bfd6-477d-422f-ab84-6914e9fc6d2e-1-1.dem.zst"


@pytest.mark.skipif(not REAL_DEMO.exists(), reason="real dem.zst not in repo root")
def test_real_demo_analysis(tmp_path):
    dem = tmp_path / "real.dem"
    decompress_demo(REAL_DEMO, dem, max_output_bytes=2 * 1024**3)
    out = normalize_parsed("match-real", parse_demo_file(str(dem)))
    analysis = out["analysis"]
    assert analysis["rounds"] and all(r["sides"] for r in analysis["rounds"])
    assert any(r["shots"] for r in analysis["rounds"]), "weapon_fire with velocity"
    assert any(r["economy"] for r in analysis["rounds"]), "buy-time economy props"
    assert any(r["killWindows"] for r in analysis["rounds"]), "full-rate kill windows"

    match = build_match_data(analysis, out["round_replays"])
    good_counts = []
    for player in analysis["players"]:
        result = analyse_player(match, player["id"])
        playable = [r for r in analysis["rounds"] if not r["knifeRound"]]
        assert len(result.round_stats) == len(playable)
        assert 1 <= len(result.moments) <= 6
        good_counts.append(sum(1 for f in result.findings if f.kind == "good"))
    # T15 done-when: D10 finds at least one good play for most players
    assert sum(1 for c in good_counts if c >= 1) >= len(good_counts) // 2
