from __future__ import annotations

import io

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.repositories.matches import repo


@pytest.fixture()
def client(tmp_path, monkeypatch):
    monkeypatch.setattr(repo, "upload_dir", tmp_path / "uploads")
    monkeypatch.setattr(repo, "matches_dir", tmp_path / "matches")
    repo.upload_dir.mkdir(parents=True, exist_ok=True)
    repo.matches_dir.mkdir(parents=True, exist_ok=True)
    return TestClient(app)


def test_health(client: TestClient):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json()["status"] == "ok"


def test_upload_rejects_bad_extension(client: TestClient):
    files = {"file": ("notes.txt", io.BytesIO(b"not a demo"), "text/plain")}
    r = client.post("/matches/upload", files=files)
    assert r.status_code == 400
    assert "isn't a demo file" in r.json()["detail"]


def test_upload_accepts_dem_zst_starts_processing(client: TestClient):
    # Invalid payload will fail later in background; upload itself must succeed
    files = {"file": ("faceit.dem.zst", io.BytesIO(b"\x28\xb5\x2f\xfdfake-demo-bytes"), "application/octet-stream")}
    r = client.post("/matches/upload", files=files)
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "uploaded"
    assert body["id"].startswith("match-")


def test_get_sample_match_and_moments(client: TestClient):
    mid = repo.sample_id()
    r = client.get(f"/matches/{mid}")
    assert r.status_code == 200
    match = r.json()
    assert match["map"] == "Mirage"
    assert match["status"] == "complete"
    assert match["rounds"] == 24

    r2 = client.get(f"/matches/{mid}/moments")
    assert r2.status_code == 200
    moments = r2.json()
    assert len(moments) == 6
    assert moments[0]["id"] == "m1"


def test_get_moment(client: TestClient):
    mid = repo.sample_id()
    r = client.get(f"/matches/{mid}/moments/m2")
    assert r.status_code == 200
    assert r.json()["label"] == "Leaves A"


def test_coach_uses_scripted_context(client: TestClient):
    mid = repo.sample_id()
    r = client.post(
        f"/matches/{mid}/coach",
        json={"momentId": "m1", "question": "Why was this peek risky?"},
    )
    assert r.status_code == 200
    body = r.json()
    assert "F4" in body["answer"] or "F4" in body["citations"]
    assert body["mocked"] is True


def test_upload_rejects_wrong_content(client: TestClient):
    files = {"file": ("x.dem.zst", io.BytesIO(b"not really zstd"), "application/octet-stream")}
    assert client.post("/matches/upload", files=files).status_code == 400
    files = {"file": ("old.dem", io.BytesIO(b"HL2DEMO\x00rest"), "application/octet-stream")}
    r = client.post("/matches/upload", files=files)
    assert r.status_code == 400
    assert "CS:GO" in r.json()["detail"]


def test_upload_stops_at_the_size_limit(client: TestClient, monkeypatch):
    from app.core.config import settings

    monkeypatch.setattr(settings, "max_upload_bytes", 3 * 1024 * 1024)
    big = b"\x28\xb5\x2f\xfd" + b"0" * (4 * 1024 * 1024)
    r = client.post("/matches/upload", files={"file": ("big.dem.zst", io.BytesIO(big), "application/octet-stream")})
    assert r.status_code == 400
    assert "too large" in r.json()["detail"]
    assert not list(repo.upload_dir.glob(".upload-*"))


def test_status_for_sample(client: TestClient):
    mid = repo.sample_id()
    r = client.get(f"/matches/{mid}/status")
    assert r.status_code == 200
    assert r.json()["status"] == "complete"
