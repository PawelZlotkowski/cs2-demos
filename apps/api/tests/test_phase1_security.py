from __future__ import annotations

from pathlib import Path
import sqlite3
from types import SimpleNamespace
import asyncio

import pytest
from fastapi.testclient import TestClient
from pydantic import SecretStr

from app.api import routes
from app.core.config import settings
from app.core.access import AccessAndUploadMiddleware
from app.main import app
from app.models.contracts import ClipStatus
from app.processing.bounded_executor import QueueFullError
from app.repositories import matches
from app.repositories.matches import MatchRepository


@pytest.fixture
def isolated_repository(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> MatchRepository:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "upload_dir", None)
    monkeypatch.setattr(settings, "matches_dir", None)
    monkeypatch.setattr(settings, "work_dir", None)
    monkeypatch.setattr(settings, "access_mode", "local")
    monkeypatch.setattr(settings, "api_tokens", {})
    monkeypatch.setattr(settings, "local_trusted_networks", [])
    monkeypatch.setattr(settings, "local_trusted_hosts", [])
    repository = MatchRepository()
    # Storage behavior is tested via explicit quota failure below; these tests do
    # not depend on the host machine's free-space reserve.
    monkeypatch.setattr(repository, "check_storage", lambda additional_bytes=0: None)
    monkeypatch.setattr(matches, "repo", repository)
    monkeypatch.setattr(routes, "repo", repository)
    monkeypatch.setattr(routes.pipeline, "enqueue", lambda _match_id: None)
    return repository


def _client(*, peer: str = "127.0.0.1", base_url: str = "http://localhost:8000") -> TestClient:
    return TestClient(app, base_url=base_url, client=(peer, 50123))


def test_local_access_checks_peer_host_origin_and_ignores_forwarded_for(isolated_repository):
    with _client() as loopback:
        assert loopback.get("/").status_code == 200
        assert loopback.get("/", headers={"host": "untrusted.example"}).status_code == 403
        assert loopback.get("/", headers={"origin": "https://untrusted.example"}).status_code == 403

    # A proxy header cannot turn a non-loopback TCP peer into a trusted peer.
    with _client(peer="203.0.113.18") as remote:
        response = remote.get("/", headers={"x-forwarded-for": "127.0.0.1", "host": "localhost"})
    assert response.status_code == 403


def test_bearer_session_and_cross_owner_match_media_and_player_routes(
    isolated_repository: MatchRepository, monkeypatch: pytest.MonkeyPatch, tmp_path: Path
):
    alice_token = "a" * 40
    bob_token = "b" * 40
    monkeypatch.setattr(settings, "access_mode", "authenticated")
    monkeypatch.setattr(
        settings,
        "api_tokens",
        {"alice": SecretStr(alice_token), "bob": SecretStr(bob_token)},
    )
    repository = isolated_repository
    match_id, upload_path = repository.allocate_upload("private.dem")
    upload_path.write_bytes(b"local-test-demo")
    repository.register_upload("private.dem", upload_path, match_id, owner_id="bob")

    round_clip = tmp_path / "round.mp4"
    player_clip = tmp_path / "player.mp4"
    round_clip.write_bytes(b"round clip")
    player_clip.write_bytes(b"player clip")
    monkeypatch.setattr(routes, "clip_file", lambda _match_id, _round_id: round_clip)
    monkeypatch.setattr(
        routes,
        "find_clip",
        lambda _match_id, _round_id: SimpleNamespace(status=ClipStatus.ready, provenance="real"),
    )
    monkeypatch.setattr(routes, "moment_clip_file", lambda _match_id, _clip_id: player_clip)
    monkeypatch.setattr(
        routes,
        "list_moment_clips",
        lambda _match_id, _player_id: [SimpleNamespace(id="c1", status="ready")],
    )
    # The stream route requires an existing analysis record before it reaches
    # clip metadata. Only has_analysis reads this row in this request path.
    with sqlite3.connect(repository.db_path) as connection:
        connection.execute(
            "INSERT INTO round_stats (match_id, player_id, round, json) VALUES (?, ?, ?, ?)",
            (match_id, "player-1", 1, "{}"),
        )

    with _client(base_url="https://localhost:8000") as bob:
        own = bob.get(f"/matches/{match_id}", headers={"authorization": f"Bearer {bob_token}"})
        assert own.status_code == 200
        round_response = bob.get(
            f"/matches/{match_id}/clips/r1.mp4", headers={"authorization": f"Bearer {bob_token}"}
        )
        assert round_response.status_code == 200, round_response.text
        assert bob.get(
            f"/matches/{match_id}/players/player-1/clips/c1.mp4",
            headers={"authorization": f"Bearer {bob_token}"},
        ).status_code == 200

        opened = bob.post("/auth/session", headers={"authorization": f"Bearer {bob_token}"})
        assert opened.status_code == 200
        assert opened.json() == {"owner": "bob"}
        cookie = opened.headers["set-cookie"].lower()
        assert "rr_session=" in cookie and "httponly" in cookie and "secure" in cookie
        assert bob.get(f"/matches/{match_id}").status_code == 200

    with _client(base_url="https://localhost:8000") as alice:
        assert alice.get(f"/matches/{match_id}").status_code == 401
        headers = {"authorization": f"Bearer {alice_token}"}
        assert alice.get(f"/matches/{match_id}", headers=headers).status_code == 404
        assert alice.get(f"/matches/{match_id}/clips/r1.mp4", headers=headers).status_code == 404
        assert alice.get(
            f"/matches/{match_id}/players/player-1/clips/c1.mp4", headers=headers
        ).status_code == 404


def test_upload_size_queue_and_quota_rejections_clean_up(
    isolated_repository: MatchRepository, monkeypatch: pytest.MonkeyPatch
):
    repository = isolated_repository
    monkeypatch.setattr(settings, "max_upload_bytes", 8)

    before = set(repository.list_ids())
    with _client() as client:
        too_large = client.post(
            "/matches/upload",
            files={"file": ("large.dem", b"x" * 32_000, "application/octet-stream")},
        )
    assert too_large.status_code == 413
    assert set(repository.list_ids()) == before
    assert not list(repository.upload_dir.glob("*.dem"))
    assert repository._storage_reservations == {}


def test_upload_queue_and_quota_rejections_clean_up(isolated_repository, monkeypatch):
    repository = isolated_repository
    before = set(repository.list_ids())
    def reject_queue(_match_id):
        raise QueueFullError("Processing queue is full.")
    monkeypatch.setattr(routes.pipeline, "enqueue", reject_queue)
    with _client() as client:
        queue_full = client.post("/matches/upload", files={"file": ("queue.dem", b"small", "application/octet-stream")})
    assert queue_full.status_code == 503
    assert set(repository.list_ids()) == before
    assert not list(repository.upload_dir.glob("*.dem"))
    assert repository._storage_reservations == {}
    def reject_quota(_additional=0):
        raise ValueError("quota")
    monkeypatch.setattr(repository, "check_storage", reject_quota)
    with _client() as client:
        quota_full = client.post("/matches/upload", files={"file": ("quota.dem", b"small", "application/octet-stream")})
    assert quota_full.status_code == 507
    assert set(repository.list_ids()) == before
    assert not list(repository.upload_dir.glob("*.dem"))
    assert repository._storage_reservations == {}


def test_ingress_limits_chunked_body_before_multipart_spooling(monkeypatch):
    """Do not rely on either Content-Length or the endpoint's file-size loop."""
    monkeypatch.setattr(settings, "access_mode", "local")
    monkeypatch.setattr(settings, "max_upload_bytes", 8)
    monkeypatch.setattr(settings, "max_multipart_overhead_bytes", 1024)
    called = []

    async def downstream(scope, receive, send):
        while True:
            message = await receive()
            called.append(message)
            if not message.get("more_body"):
                break

    middleware = AccessAndUploadMiddleware(downstream)
    chunks = iter([
        {"type": "http.request", "body": b"x" * 600, "more_body": True},
        {"type": "http.request", "body": b"y" * 600, "more_body": False},
    ])

    async def receive():
        return next(chunks)

    async def send(message):
        raise AssertionError(message)

    scope = {"type": "http", "method": "POST", "path": "/matches/upload", "scheme": "http",
             "headers": [(b"host", b"localhost")], "client": ("127.0.0.1", 50000), "query_string": b""}
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as error:
        asyncio.run(middleware(scope, receive, send))
    assert error.value.status_code == 413
    assert len(called) == 1
    assert middleware._uploads == 0


def test_ingress_rejects_another_active_upload_and_releases_slot(monkeypatch):
    monkeypatch.setattr(settings, "access_mode", "local")
    monkeypatch.setattr(settings, "max_concurrent_uploads", 1)

    async def scenario():
        entered, release = asyncio.Event(), asyncio.Event()
        replies = []
        async def downstream(scope, receive, send):
            entered.set()
            await release.wait()
        async def receive():
            return {"type": "http.request", "body": b""}
        async def send(message):
            replies.append(message)
        middleware = AccessAndUploadMiddleware(downstream)
        scope = {"type": "http", "method": "POST", "path": "/matches/upload", "scheme": "http",
                 "headers": [(b"host", b"localhost")], "client": ("127.0.0.1", 50000), "query_string": b""}
        first = asyncio.create_task(middleware(dict(scope), receive, send))
        await entered.wait()
        try:
            await middleware(dict(scope), receive, send)
            assert replies[0]["status"] == 429
        finally:
            release.set()
            await first
        assert middleware._uploads == 0
    asyncio.run(scenario())

