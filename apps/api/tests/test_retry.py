"""POST /matches/{id}/retry: restart a failed match from its stored upload."""

from __future__ import annotations

import io
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core import config as cfg
from app.main import app
from app.models.contracts import MatchStatus
from app.processing.pipeline import pipeline
from app.repositories.matches import repo

CORRUPT_ZST = b"\x28\xb5\x2f\xfd" + b"not a real zstd frame" * 8


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(cfg.settings, "work_dir", tmp_path / "work")
    monkeypatch.setattr(repo, "upload_dir", tmp_path / "uploads")
    monkeypatch.setattr(repo, "matches_dir", tmp_path / "matches")
    for d in ("work", "uploads", "matches"):
        (tmp_path / d).mkdir()
    queued: list[str] = []
    monkeypatch.setattr(pipeline, "enqueue", queued.append)  # the test drives processing itself
    c = TestClient(app)
    c.queued = queued
    c.created = []
    yield c
    for match_id in c.created:
        repo.delete(match_id)


def _failed_match(client: TestClient) -> str:
    r = client.post("/matches/upload", files={"file": ("bad.dem.zst", io.BytesIO(CORRUPT_ZST), "application/octet-stream")})
    assert r.status_code == 200, r.text
    match_id = r.json()["id"]
    client.created.append(match_id)
    pipeline.process(match_id)
    assert repo.get(match_id)["status"] == "failed"
    client.queued.clear()  # the upload route queued it once
    return match_id


def test_retry_restarts_a_failed_match_and_keeps_setup(client: TestClient):
    match_id = _failed_match(client)
    first_error = repo.get(match_id)["error"]
    assert first_error
    repo.set_review_options(match_id, "76561198000000001", "utility", "pl")
    work_dem = cfg.settings.resolved_work_dir() / f"{match_id}.dem"
    work_dem.write_bytes(b"partial")

    r = client.post(f"/matches/{match_id}/retry")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["status"] == "uploaded"
    assert body["error"] is None
    assert all(s["state"] != "error" for s in body["stages"])
    assert match_id in client.queued
    assert not work_dem.exists()
    assert repo.review_options(match_id)["playerId"] == "76561198000000001"

    # The new attempt really runs from the upload again (and fails the same honest way here)
    pipeline.process(match_id)
    record = repo.get(match_id)
    assert record["status"] == "failed"
    assert record["error"] == first_error


def test_retry_refuses_a_match_that_did_not_fail(client: TestClient):
    match_id = _failed_match(client)
    repo.set_status(match_id, MatchStatus.complete)
    r = client.post(f"/matches/{match_id}/retry")
    assert r.status_code == 409
    assert repo.get(match_id)["status"] == "complete"


def test_retry_without_the_upload_asks_for_it_again(client: TestClient):
    match_id = _failed_match(client)
    Path(repo.get(match_id)["path"]).unlink()
    r = client.post(f"/matches/{match_id}/retry")
    assert r.status_code == 410
    assert "Upload the demo again" in r.json()["detail"]
    assert repo.get(match_id)["status"] == "failed"
    assert match_id not in client.queued


def test_retry_unknown_match(client: TestClient):
    assert client.post("/matches/nope/retry").status_code == 404
