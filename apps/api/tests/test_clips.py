"""Gameplay clip storage, stub worker, and stream API."""

from __future__ import annotations

import json
import time

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.models.contracts import ClipStatus, MatchStatus
from app.processing.video_clips import (
    VideoWorker,
    clip_file,
    init_manifest_for_match,
    public_clip_url,
    write_placeholder_mp4,
)
from app.repositories.matches import repo


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(repo, "upload_dir", tmp_path / "uploads")
    monkeypatch.setattr(repo, "matches_dir", tmp_path / "matches")
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "work_dir", tmp_path / "work")
    monkeypatch.setattr(settings, "csdm_enabled", True)
    monkeypatch.setattr(settings, "csdm_mode", "stub")
    monkeypatch.setattr(settings, "csdm_round_clips", True)
    monkeypatch.setattr(settings, "csdm_max_rounds", 2)
    repo.upload_dir.mkdir(parents=True, exist_ok=True)
    repo.matches_dir.mkdir(parents=True, exist_ok=True)
    (tmp_path / "work").mkdir(parents=True, exist_ok=True)
    return TestClient(app)


def _seed_fake_match(match_id: str = "match-clipstest01") -> dict:
    rounds = [
        {
            "id": "r1",
            "number": 1,
            "winner": "CT",
            "reason": "elimination",
            "startTick": 1000,
            "endTick": 2280,
            "durationSec": 20.0,
        },
        {
            "id": "r2",
            "number": 2,
            "winner": "T",
            "reason": "bomb_exploded",
            "startTick": 3000,
            "endTick": 4280,
            "durationSec": 20.0,
        },
    ]
    record = {
        "id": match_id,
        "filename": f"{match_id}.dem.zst",
        "path": str(repo.upload_dir / f"{match_id}.dem.zst"),
        "status": MatchStatus.complete,
        "created_at": "2026-01-01T00:00:00+00:00",
        "error": None,
        "is_sample": False,
        "match": {
            "id": match_id,
            "map": "Mirage",
            "mapName": "de_mirage",
            "score": "1–1",
            "when": "today",
            "rounds": 2,
            "won": [1, 0],
            "status": "complete",
            "clipDuration": 40,
            "tickRate": 64,
            "players": [
                {"id": "76561198000000001", "name": "Alice", "team": "CT"},
                {"id": "76561198000000002", "name": "Bob", "team": "T"},
            ],
        },
        "rounds": rounds,
        "events": [],
        "moments": [],
        "round_replays": {},
        "stage_started_at": None,
    }
    with repo._lock:  # noqa: SLF001
        repo._records[match_id] = record  # noqa: SLF001
        repo._upsert_row(record)  # noqa: SLF001
    match_dir = repo.matches_dir / match_id
    match_dir.mkdir(parents=True, exist_ok=True)
    (match_dir / "match.json").write_text(
        json.dumps({"match": record["match"], "rounds": rounds}),
        encoding="utf-8",
    )
    (match_dir / "rounds").mkdir(exist_ok=True)
    for r in rounds:
        replay = {
            "matchId": match_id,
            "roundId": r["id"],
            "roundNumber": r["number"],
            "map": "de_mirage",
            "tickRate": 64,
            "startTick": r["startTick"],
            "endTick": r["endTick"],
            "durationSec": r["durationSec"],
            "players": record["match"]["players"],
            "samples": [],
            "events": [],
        }
        (match_dir / "rounds" / f"{r['id']}.json").write_text(
            json.dumps(replay), encoding="utf-8"
        )
        record["round_replays"][r["id"]] = replay
    return record


def test_public_clip_url():
    assert public_clip_url("match-abc", "r3") == "/matches/match-abc/clips/r3.mp4"


def test_stub_worker_writes_clips_and_status(client: TestClient):
    mid = "match-clipstest01"
    _seed_fake_match(mid)
    worker = VideoWorker(repo)
    worker.process(mid)

    man = client.get(f"/matches/{mid}/clips").json()
    assert man["total"] == 2
    assert man["done"] == 2
    assert all(c["status"] == "ready" for c in man["clips"])
    assert man["clips"][0]["url"] == f"/matches/{mid}/clips/r1.mp4"
    assert man["focusSteamid"] == "76561198000000001"

    path = clip_file(mid, "r1")
    assert path.exists() and path.stat().st_size > 0

    r = client.get(f"/matches/{mid}/clips/r1.mp4")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("video/mp4")
    assert len(r.content) > 0

    r2 = client.get(
        f"/matches/{mid}/clips/r1.mp4",
        headers={"Range": "bytes=0-3"},
    )
    assert r2.status_code in (200, 206)
    if r2.status_code == 206:
        assert len(r2.content) <= 4


def test_status_includes_clips_when_complete(client: TestClient):
    mid = "match-clipstest02"
    _seed_fake_match(mid)
    write_placeholder_mp4(clip_file(mid, "r1"))
    init_manifest_for_match(mid)

    status = client.get(f"/matches/{mid}/status").json()
    assert status["status"] == "complete"
    assert status["clips"] is not None
    assert status["clips"]["total"] >= 1


def test_replay_attaches_clip_metadata(client: TestClient):
    mid = "match-clipstest03"
    _seed_fake_match(mid)
    VideoWorker(repo).process(mid)

    replay = client.get(f"/matches/{mid}/rounds/r1/replay").json()
    assert replay["clip"]["status"] == "ready"
    assert replay["clip"]["startTick"] == 1000
    assert replay["clip"]["endTick"] == 2280

    rounds = client.get(f"/matches/{mid}/rounds").json()
    assert rounds[0]["clip"]["status"] == "ready"


def test_disabled_skips_clips(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "csdm_enabled", False)
    mid = "match-clipstest04"
    _seed_fake_match(mid)
    VideoWorker(repo).enqueue(mid)
    time.sleep(0.05)
    man = client.get(f"/matches/{mid}/clips").json()
    assert man["total"] == 2
    assert all(c["status"] == ClipStatus.skipped.value for c in man["clips"])


def test_sample_match_clips_endpoint(client: TestClient):
    mid = repo.sample_id()
    man = client.get(f"/matches/{mid}/clips").json()
    assert man["matchId"] == mid
    assert man["total"] == 0 or all(c["status"] == "skipped" for c in man["clips"])
