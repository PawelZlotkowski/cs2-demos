"""Gameplay clip storage, stub worker, and stream API."""

from __future__ import annotations

import json
import subprocess
import time

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.models.contracts import ClipStatus, MatchStatus
from app.processing.video_clips import (
    VideoWorker,
    clip_file,
    csdm_record,
    init_manifest_for_match,
    public_clip_url,
    validate_recording,
    write_placeholder_mp4,
)
from app.processing import video_clips
from app.processing.bounded_executor import QueueFullError
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
    return TestClient(app, base_url="http://localhost:8000", client=("127.0.0.1", 50000))


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


def test_recording_validation_requires_new_probeable_video_and_expected_duration(tmp_path):
    media = tmp_path / "clip.mp4"
    payload = {"streams": [{"codec_type": "video", "width": 1280, "height": 720, "duration": "9.5", "avg_frame_rate": "30/1"}], "format": {}}

    def probe(_cmd, **_kwargs):
        return subprocess.CompletedProcess([], 0, json.dumps(payload), "")

    with pytest.raises(RuntimeError, match="media file"):
        validate_recording(media, runner=probe)

    media.write_bytes(b"new recording")
    assert validate_recording(media, expected_duration_sec=10.0, runner=probe)["durationSec"] == 9.5
    payload["streams"][0]["duration"] = "7.0"
    with pytest.raises(RuntimeError, match="too short"):
        validate_recording(media, expected_duration_sec=10.0, runner=probe)

    def corrupt(_cmd, **_kwargs):
        return subprocess.CompletedProcess([], 1, "", "moov atom not found")

    with pytest.raises(RuntimeError, match="ffprobe rejected"):
        validate_recording(media, runner=corrupt)


def test_csdm_record_refuses_preexisting_mp4_in_attempt_folder(tmp_path, monkeypatch):
    attempt = tmp_path / "attempt"
    attempt.mkdir()
    (attempt / "previous-round.mp4").write_bytes(b"stale")
    called = False

    def should_not_run(*_args, **_kwargs):
        nonlocal called
        called = True

    monkeypatch.setattr("app.processing.video_clips.run_csdm", should_not_run)
    with pytest.raises(RuntimeError, match="must be empty"):
        csdm_record(tmp_path / "match.dem", 1, 100, None, attempt / "r1.mp4")
    assert not called


def test_stub_worker_writes_clips_and_status(client: TestClient):
    mid = "match-clipstest01"
    _seed_fake_match(mid)
    worker = VideoWorker(repo)
    worker.process(mid)

    man = client.get(f"/matches/{mid}/clips").json()
    assert man["total"] == 2
    assert man["done"] == 2
    assert all(c["status"] == "skipped" for c in man["clips"])
    assert all(c["provenance"] == "synthetic" and c["url"] is None for c in man["clips"])
    assert man["focusSteamid"] == "76561198000000001"

    path = clip_file(mid, "r1")
    assert not path.exists()


def test_status_includes_clips_when_complete(client: TestClient):
    mid = "match-clipstest02"
    _seed_fake_match(mid)
    write_placeholder_mp4(clip_file(mid, "r1"))
    init_manifest_for_match(mid)

    status = client.get(f"/matches/{mid}/status").json()
    assert status["status"] == "complete"
    assert status["clips"] is not None
    assert status["clips"]["total"] >= 1


def test_legacy_ready_manifest_without_provenance_is_not_playable(client: TestClient):
    mid = "match-clipstest-legacy-ready"
    _seed_fake_match(mid)
    init_manifest_for_match(mid)
    write_placeholder_mp4(clip_file(mid, "r1"))
    path = repo.matches_dir / mid / "clips.json"
    data = json.loads(path.read_text(encoding="utf-8"))
    clip = next(c for c in data["clips"] if c["roundId"] == "r1")
    clip["status"] = "ready"
    clip["url"] = public_clip_url(mid, "r1")
    clip.pop("provenance", None)
    clip["error"] = None
    path.write_text(json.dumps(data), encoding="utf-8")

    manifest = client.get(f"/matches/{mid}/clips").json()
    legacy = next(c for c in manifest["clips"] if c["roundId"] == "r1")
    assert legacy["status"] == "failed"
    assert legacy["url"] is None
    assert "re-record" in legacy["error"]
    assert client.get(f"/matches/{mid}/clips/r1.mp4").status_code == 404


def test_unmarked_existing_mp4_is_not_promoted_by_media_probe(client: TestClient, monkeypatch):
    mid = "match-clipstest-unmarked-file"
    _seed_fake_match(mid)
    out = clip_file(mid, "r1")
    out.write_bytes(b"old but nonempty")

    def should_not_promote(*_args, **_kwargs):
        raise AssertionError("an unmarked file must not be probed and promoted to real")

    monkeypatch.setattr(video_clips, "validate_recording", should_not_promote)
    manifest = init_manifest_for_match(mid)
    clip = next(c for c in manifest.clips if c.round_id == "r1")
    assert clip.status == ClipStatus.failed
    assert clip.provenance is None and clip.url is None
    assert "no verified capture provenance" in clip.error


def test_real_capture_provenance_survives_manifest_reinitialization(client: TestClient, monkeypatch):
    mid = "match-clipstest-real-preserved"
    _seed_fake_match(mid)
    init_manifest_for_match(mid)
    clip_file(mid, "r1").write_bytes(b"validated real capture")
    video_clips.update_clip(mid, "r1", status=ClipStatus.ready, provenance="real")

    def should_preserve_marker(*_args, **_kwargs):
        raise AssertionError("init must preserve the durable real marker, not reprobe and infer it")

    monkeypatch.setattr(video_clips, "validate_recording", should_preserve_marker)
    manifest = init_manifest_for_match(mid)
    clip = next(c for c in manifest.clips if c.round_id == "r1")
    assert clip.status == ClipStatus.ready and clip.provenance == "real"
    assert clip.url == public_clip_url(mid, "r1")


def test_new_validated_round_recording_is_ready_with_real_provenance(client: TestClient, monkeypatch):
    mid = "match-clipstest-new-real"
    _seed_fake_match(mid)
    (settings.resolved_work_dir() / f"{mid}.dem").write_bytes(b"demo")
    monkeypatch.setattr(settings, "csdm_mode", "csdm")
    monkeypatch.setattr(video_clips, "csdm_analyze", lambda _dem: None)

    def write_capture(_dem, clip, out):
        out.write_bytes(b"validated by the test probe")

    monkeypatch.setattr(VideoWorker, "_csdm_video", lambda self, _dem, clip, out: write_capture(_dem, clip, out))
    monkeypatch.setattr(video_clips, "validate_recording", lambda *_a, **_kw: {"durationSec": 20.0})

    VideoWorker(repo).process(mid)
    manifest = client.get(f"/matches/{mid}/clips").json()
    assert all(c["status"] == "ready" and c["provenance"] == "real" for c in manifest["clips"])
    assert all(c["url"] for c in manifest["clips"])


def test_replay_attaches_clip_metadata(client: TestClient):
    mid = "match-clipstest03"
    _seed_fake_match(mid)
    VideoWorker(repo).process(mid)

    replay = client.get(f"/matches/{mid}/rounds/r1/replay").json()
    assert replay["clip"]["status"] == "skipped"
    assert replay["clip"]["provenance"] == "synthetic"
    assert replay["clip"]["startTick"] == 1000
    assert replay["clip"]["endTick"] == 2280

    rounds = client.get(f"/matches/{mid}/rounds").json()
    assert rounds[0]["clip"]["status"] == "skipped"


def test_disabled_skips_clips(client: TestClient, monkeypatch):
    monkeypatch.setattr(settings, "csdm_enabled", False)
    mid = "match-clipstest04"
    _seed_fake_match(mid)
    VideoWorker(repo).enqueue(mid)
    time.sleep(0.05)
    man = client.get(f"/matches/{mid}/clips").json()
    assert man["total"] == 2
    assert all(c["status"] == ClipStatus.skipped.value for c in man["clips"])


def test_full_video_queue_releases_claim_and_keeps_rounds_queued(client: TestClient, monkeypatch):
    mid = "match-clipstest-queue-full"
    _seed_fake_match(mid)

    def full(*_args, **_kwargs):
        raise QueueFullError("Processing queue is full")

    monkeypatch.setattr(video_clips._video_executor, "submit", full)
    VideoWorker(repo).enqueue(mid)

    assert mid not in video_clips._video_running
    manifest = client.get(f"/matches/{mid}/clips").json()
    assert all(c["status"] == "queued" and c["url"] is None for c in manifest["clips"])


def test_sample_match_clips_endpoint(client: TestClient):
    mid = repo.sample_id()
    man = client.get(f"/matches/{mid}/clips").json()
    assert man["matchId"] == mid
    assert man["total"] == 0 or all(c["status"] == "skipped" for c in man["clips"])
