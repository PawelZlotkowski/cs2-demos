"""Unit + integration tests for replay pipeline."""

from __future__ import annotations

import io
import json
from pathlib import Path

import pytest
import zstandard as zstd
from fastapi.testclient import TestClient

from app.main import app
from app.maps.metadata import get_map_meta, world_to_radar
from app.processing.decompress import DecompressError, decompress_demo, is_zstd
from app.processing.normalize import normalize_parsed
from app.processing.parse_demo import parse_demo_file
from app.processing.time_utils import seconds_to_tick, tick_stride, tick_to_seconds
from app.repositories.matches import repo

ROOT = Path(__file__).resolve().parents[3]
REAL_DEMO = ROOT / "1-5696bfd6-477d-422f-ab84-6914e9fc6d2e-1-1.dem.zst"
FIXTURE_DEM = Path(__file__).resolve().parents[1] / "data" / "fixtures" / "test-mirage.dem"


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(repo, "upload_dir", tmp_path / "uploads")
    monkeypatch.setattr(repo, "matches_dir", tmp_path / "matches")
    repo.upload_dir.mkdir(parents=True, exist_ok=True)
    repo.matches_dir.mkdir(parents=True, exist_ok=True)
    return TestClient(app)


def test_tick_seconds_roundtrip():
    assert tick_stride(64, 8) == 8
    assert tick_to_seconds(128, 0, 64) == 2.0
    assert seconds_to_tick(2.0, 0, 64) == 128


def test_world_to_radar_mirage():
    meta = get_map_meta("de_mirage")
    assert meta is not None
    rx, ry = world_to_radar(-1656.0, -1656.0, meta)  # CT spawn-ish from research
    assert 0 < rx < 1024
    assert 0 < ry < 1024


def test_world_to_radar_anubis():
    """Valve overview (GameTracking-CS2); CT/T spawns from match-d03751f42266."""
    meta = get_map_meta("de_anubis")
    assert meta is not None
    # CT spawn cluster
    rx_ct, ry_ct = world_to_radar(-476.0, 2216.0, meta)
    assert 0 < rx_ct < 1024
    assert 0 < ry_ct < 1024
    assert 150 < ry_ct < 300  # north — matches CTSpawn_y ≈ 0.22
    # T spawn cluster
    rx_t, ry_t = world_to_radar(-328.0, -1528.0, meta)
    assert 0 < rx_t < 1024
    assert 0 < ry_t < 1024
    assert 850 < ry_t < 1000  # south — matches TSpawn_y ≈ 0.93


def test_zstd_valid_and_invalid(tmp_path):
    good = tmp_path / "a.dem.zst"
    cctx = zstd.ZstdCompressor()
    # Minimal fake with wrong magic after decompress
    payload = b"NOTADEMO" + b"\x00" * 32
    good.write_bytes(cctx.compress(payload))
    assert is_zstd(good)
    dest = tmp_path / "out.dem"
    with pytest.raises(DecompressError, match="PBDEMS2"):
        decompress_demo(good, dest, max_output_bytes=10_000_000)

    bad = tmp_path / "bad.dem.zst"
    bad.write_bytes(b"not-zstd-at-all")
    with pytest.raises(DecompressError, match="zstd"):
        decompress_demo(bad, dest, max_output_bytes=10_000_000)


def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_upload_rejects_bad_extension(client: TestClient):
    files = {"file": ("notes.txt", io.BytesIO(b"not a demo"), "text/plain")}
    r = client.post("/matches/upload", files=files)
    assert r.status_code == 400


def test_get_sample_match_and_moments(client: TestClient):
    mid = repo.sample_id()
    r = client.get(f"/matches/{mid}")
    assert r.status_code == 200
    assert r.json()["map"] == "Mirage"
    r2 = client.get(f"/matches/{mid}/moments")
    assert r2.status_code == 200
    assert len(r2.json()) == 6


def test_coach_stub(client: TestClient):
    mid = repo.sample_id()
    r = client.post(
        f"/matches/{mid}/coach",
        json={"momentId": "m1", "question": "Why was this peek risky?"},
    )
    assert r.status_code == 200
    assert r.json()["mocked"] is True


@pytest.mark.skipif(not FIXTURE_DEM.exists(), reason="decompressed fixture dem missing")
def test_parse_and_normalize_fixture_dem():
    parsed = parse_demo_file(str(FIXTURE_DEM))
    assert parsed.header.get("map_name") == "de_mirage"
    assert len(parsed.players) == 10
    assert len(parsed.ticks) > 100
    out = normalize_parsed("match-test", parsed)
    assert out["match"]["map"] == "Mirage"
    assert out["match"]["rounds"] >= 10
    assert "r1" in out["round_replays"]
    r1 = out["round_replays"]["r1"]
    assert len(r1["samples"]) > 5
    assert any(p.get("rx") is not None for s in r1["samples"] for p in s["players"])
    assert any(e["type"] == "kill" for e in r1["events"])


@pytest.mark.skipif(not REAL_DEMO.exists(), reason="real dem.zst not in repo root")
def test_real_dem_zst_e2e(client: TestClient, tmp_path, monkeypatch):
    from app.core import config as cfg
    from app.processing import pipeline as pipe_mod

    monkeypatch.setattr(cfg.settings, "data_dir", tmp_path)
    monkeypatch.setattr(repo, "upload_dir", tmp_path / "uploads")
    monkeypatch.setattr(repo, "matches_dir", tmp_path / "matches")
    repo.upload_dir.mkdir(parents=True, exist_ok=True)
    repo.matches_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(cfg.settings, "work_dir", tmp_path / "work")
    (tmp_path / "work").mkdir(parents=True, exist_ok=True)

    raw = REAL_DEMO.read_bytes()
    files = {"file": (REAL_DEMO.name, io.BytesIO(raw), "application/octet-stream")}
    r = client.post("/matches/upload", files=files)
    assert r.status_code == 200
    match_id = r.json()["id"]

    # Run processing synchronously for the test
    pipe_mod.pipeline.process(match_id)

    status = client.get(f"/matches/{match_id}/status")
    assert status.status_code == 200
    body = status.json()
    assert body["status"] == "complete", body.get("error")

    match = client.get(f"/matches/{match_id}").json()
    assert match["map"] == "Mirage"
    assert match["rounds"] >= 10
    assert match["tickRate"] == 64

    rounds = client.get(f"/matches/{match_id}/rounds").json()
    assert len(rounds) == match["rounds"]
    rid = rounds[0]["id"]
    replay = client.get(f"/matches/{match_id}/rounds/{rid}/replay").json()
    assert replay["matchId"] == match_id
    assert len(replay["samples"]) > 0
    assert len(replay["players"]) == 10
    # Radar-relevant: interpolated positions present
    sample_player = replay["samples"][0]["players"][0]
    assert "rx" in sample_player and "ry" in sample_player
    assert "yaw" in sample_player

    events = client.get(f"/matches/{match_id}/events").json()
    assert events["total"] > 0

    # Persist perf snapshot for the milestone report
    record = repo.get(match_id)
    perf_path = tmp_path / "perf.json"
    perf_path.write_text(json.dumps(record.get("perf") or {}, indent=2), encoding="utf-8")
    assert (record.get("perf") or {}).get("decompressedBytes", 0) > 0
