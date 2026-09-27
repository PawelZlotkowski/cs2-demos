"""Docs 27 and 30: accounts, roles, ownership, the admin panel's API, the GPU queue.

Every test here turns accounts on; the rest of the suite runs with them off,
which is the default and must keep behaving as before.
"""

from __future__ import annotations

import asyncio
import io
import sqlite3
import threading
import time
import zipfile

import pytest
from fastapi.routing import APIRoute
from fastapi.testclient import TestClient

from app.auth import steam
from app.auth.deps import SESSION_COOKIE
from app.auth.scope import can_write, visible_matches
from app.auth.store import digest, users
from app.coach import tools
from app.core.config import settings
from app.main import app
from app.repositories.matches import repo
from app.services.gpu import GpuQueue, JobCancelled, QueueFull

PASSWORD = "correct horse battery"


@pytest.fixture()
def auth_on(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "auth_enabled", True)
    monkeypatch.setattr(settings, "signup", "invite")
    monkeypatch.setattr(settings, "traces_dir", tmp_path / "traces")
    monkeypatch.setattr(settings, "work_dir", tmp_path / "work")
    steam._used_nonces.clear()


def new_client() -> TestClient:
    return TestClient(app, base_url="http://localhost:3000")


def register(c: TestClient, username: str, invite: str | None = None, status: int = 200) -> dict:
    r = c.post("/auth/register", json={"username": username, "password": PASSWORD, "inviteCode": invite})
    assert r.status_code == status, r.text
    return r.json()


def invite(admin: TestClient, role: str = "player") -> str:
    r = admin.post("/admin/invites", json={"count": 1, "role": role})
    assert r.status_code == 200, r.text
    return r.json()[0]["code"]


@pytest.fixture()
def people(analysed, auth_on):
    """(match id, player id, admin, alice who owns the match, bob, labeller)."""
    mid, pid = analysed
    admin = new_client()
    me = register(admin, "pawel")
    assert me["user"]["role"] == "admin"
    alice, bob, lab = new_client(), new_client(), new_client()
    a = register(alice, "alice", invite(admin))
    register(bob, "bob", invite(admin))
    register(lab, "partner", invite(admin, "labeller"))
    users().set_owner(mid, a["user"]["id"])
    return mid, pid, admin, alice, bob, lab


# --- sign-up, sign-in, sessions ---


def test_first_account_is_admin_then_invite_only(analysed, auth_on):
    anon = new_client()
    state = anon.get("/auth/me").json()
    assert state["authEnabled"] and state["needsSetup"] and state["user"] is None
    assert anon.get("/matches").status_code == 401
    admin = new_client()
    assert register(admin, "pawel")["user"]["role"] == "admin"
    register(new_client(), "stranger", status=403)
    code = invite(admin)
    register(new_client(), "friend", code)
    register(new_client(), "friend2", code, status=403)  # used once only


def test_login_lockout_and_hashed_sessions(analysed, auth_on):
    register(new_client(), "pawel")
    c = new_client()
    for _ in range(5):
        assert c.post("/auth/login", json={"username": "pawel", "password": "wrong password!"}).status_code == 401
    assert c.post("/auth/login", json={"username": "pawel", "password": PASSWORD}).status_code == 429

    other = new_client()
    register_again = other.post("/auth/login", json={"username": "PAWEL", "password": PASSWORD})
    assert register_again.status_code == 429  # the lock is per username, not per case
    token = next(iter(users().sessions()), None)
    assert token is not None
    with sqlite3.connect(repo.analysis.db_path) as conn:
        stored = [r[0] for r in conn.execute("SELECT token_hash FROM sessions")]
    assert all(len(h) == 64 for h in stored)


def test_logout_ends_the_session(analysed, auth_on):
    c = new_client()
    register(c, "pawel")
    assert c.get("/users/me").status_code == 200
    assert c.post("/auth/logout").status_code == 204
    assert c.get("/users/me").status_code == 401


def test_disabled_user_is_signed_out(people):
    _mid, _pid, admin, _alice, bob, _lab = people
    bob_id = bob.get("/users/me").json()["id"]
    assert admin.patch(f"/admin/users/{bob_id}", json={"disabled": True}).status_code == 200
    assert bob.get("/users/me").status_code == 401
    r = new_client().post("/auth/login", json={"username": "bob", "password": PASSWORD})
    assert r.status_code == 403


def test_the_last_admin_stays(people):
    _mid, _pid, admin, *_ = people
    me = admin.get("/users/me").json()
    r = admin.patch(f"/admin/users/{me['id']}", json={"role": "player"})
    assert r.status_code == 400


def test_reset_code(people):
    _mid, _pid, admin, _alice, bob, _lab = people
    bob_id = bob.get("/users/me").json()["id"]
    code = admin.post(f"/admin/users/{bob_id}/reset").json()["code"]
    c = new_client()
    assert c.post("/auth/reset", json={"code": code, "password": "a brand new password"}).status_code == 200
    assert bob.get("/users/me").status_code == 401  # old sessions end
    assert c.post("/auth/reset", json={"code": code, "password": "another new password"}).status_code == 400


# --- ownership: every match route, walked as another user ---


def _match_routes() -> list[tuple[str, str]]:
    from app.main import ROUTERS

    out = []
    for route in (r for router in ROUTERS for r in router.routes):
        if isinstance(route, APIRoute) and "{match_id}" in route.path and not route.path.startswith("/admin/"):
            for method in route.methods - {"HEAD"}:
                out.append((method, route.path))
    return sorted(out)


def test_other_users_cannot_reach_a_match(people):
    mid, pid, _admin, alice, bob, _lab = people
    routes = _match_routes()
    assert len(routes) > 30
    for method, path in routes:
        url = (
            path.replace("{match_id}", mid)
            .replace("{player_id}", pid)
            .replace("{round_id}", "r1")
            .replace("{round}", "1")
            .replace("{moment_id}", "m1")
            .replace("{clip_id}", "c1")
            .replace("{finding_id}", "F1")
            .replace("{bookmark_id}", "b1")
            .replace("{version_id}", "v1")
        )
        r = bob.request(method, url, json={})
        assert r.status_code in (403, 404), f"{method} {url} answered {r.status_code} to another user"
    assert alice.get(f"/matches/{mid}").status_code == 200


def test_matches_and_coach_are_scoped(people):
    mid, pid, _admin, alice, bob, _lab = people
    assert [m["id"] for m in alice.get("/matches").json()] == [mid]
    assert bob.get("/matches").json() == []
    assert [p["id"] for p in alice.get("/players").json()] == [pid]
    assert bob.get("/players").json() == []
    assert bob.get(f"/players/{pid}/progress").status_code == 404
    assert bob.post(f"/players/{pid}/ask", json={"question": "What do I do wrong?"}).status_code == 404


def test_labeller_reads_but_does_not_write(people):
    mid, pid, _admin, _alice, bob, lab = people
    assert lab.get(f"/matches/{mid}").status_code == 200
    assert lab.post(f"/matches/{mid}/bookmarks", json={"round": 1, "t": 2, "note": "x"}).status_code == 404
    assert lab.get("/admin/overview").status_code == 403
    settings_lab = settings.lab_enabled
    try:
        settings.lab_enabled = True
        assert lab.get("/lab/traces").status_code == 200
        assert bob.get("/lab/traces").status_code == 403
        assert lab.post("/lab/dataset/export").status_code == 403
    finally:
        settings.lab_enabled = settings_lab


def test_players_cannot_open_the_admin_panel(people):
    *_, bob, _lab = people
    for path in ("/admin/overview", "/admin/users", "/admin/settings", "/admin/audit", "/admin/backup"):
        assert bob.get(path).status_code == 403


def test_csrf_origin_check(people):
    mid, _pid, _admin, alice, *_ = people
    r = alice.post(f"/matches/{mid}/bookmarks", json={"round": 1, "t": 2, "note": "hi"}, headers={"Origin": "https://evil.example"})
    assert r.status_code == 403
    r = alice.post(f"/matches/{mid}/bookmarks", json={"round": 1, "t": 2, "note": "hi"}, headers={"Origin": "http://localhost:3000"})
    assert r.status_code == 200


# --- the user's own data ---


def test_rename_feedback_progress_and_history(people):
    mid, pid, _admin, alice, *_ = people
    assert alice.patch(f"/matches/{mid}", json={"title": "Scrim vs Ajax"}).status_code == 200
    assert alice.get("/matches").json()[0]["title"] == "Scrim vs Ajax"
    assert alice.post(f"/matches/{mid}/feedback", json={"target": "m1", "verdict": "useful"}).status_code == 204
    assert alice.post(f"/matches/{mid}/feedback", json={"target": "m1", "verdict": "not_right", "note": "wrong round"}).status_code == 204
    fb = alice.get(f"/matches/{mid}/feedback").json()
    assert [(f["target"], f["verdict"]) for f in fb] == [("m1", "not_right")]
    assert alice.post(f"/matches/{mid}/progress", json={"momentId": "m2", "t": 12.5}).status_code == 204
    assert alice.get(f"/matches/{mid}/progress").json()[0]["momentId"] == "m2"
    with alice.stream("POST", f"/matches/{mid}/players/{pid}/ask", json={"question": "Why did I die?"}) as r:
        body = "".join(r.iter_text())
    assert "event: answer" in body
    history = alice.get(f"/matches/{mid}/ask-history").json()
    assert history[-1]["question"] == "Why did I die?" and history[-1]["answer"]
    assert alice.get("/users/me/progress").status_code == 200


def test_export_and_delete_account(people):
    mid, _pid, admin, alice, *_ = people
    r = alice.get("/users/me/export")
    assert r.status_code == 200
    names = zipfile.ZipFile(io.BytesIO(r.content)).namelist()
    assert {"account.json", "matches.json", "ask.json", "feedback.json"} <= set(names)
    assert alice.request("DELETE", "/users/me", json={"confirm": "nope"}).status_code == 400
    assert alice.request("DELETE", "/users/me", json={"confirm": "alice"}).status_code == 204
    assert repo.get(mid) is None
    assert not (repo.matches_dir / mid).exists()
    assert "alice" not in [u["username"] for u in admin.get("/admin/users").json()]


def test_share_link(people, monkeypatch):
    mid, _pid, _admin, alice, *_ = people
    assert alice.post(f"/matches/{mid}/share").status_code == 404  # off by default
    monkeypatch.setattr(settings, "share_links", True)
    token = alice.post(f"/matches/{mid}/share").json()["token"]
    view = new_client().get(f"/shared/{token}").json()
    assert view["moments"] and "steam" not in str(view).lower()
    assert alice.delete(f"/matches/{mid}/share").status_code == 204
    assert new_client().get(f"/shared/{token}").status_code == 404


# --- admin panel API ---


def test_admin_settings_apply_without_restart(people, monkeypatch):
    admin = people[2]
    monkeypatch.setattr(settings, "coach_max_steps", settings.coach_max_steps)
    r = admin.put("/admin/settings/coach_max_steps", json={"value": 3})
    assert r.status_code == 200 and settings.coach_max_steps == 3
    assert admin.put("/admin/settings/coach_tools", json={"value": "carrier pigeon"}).status_code == 400
    assert admin.put("/admin/settings/auth_enabled", json={"value": False}).status_code == 400
    rows = {s["key"]: s for s in admin.get("/admin/settings").json()["runtime"]}
    assert rows["coach_max_steps"]["source"] == "admin"
    assert admin.delete("/admin/settings/coach_max_steps").status_code == 200
    actions = [a["action"] for a in admin.get("/admin/audit").json()["items"]]
    assert "admin.setting" in actions and "admin.setting_reset" in actions


def test_admin_overview_jobs_storage_and_matches(people):
    mid, _pid, admin, *_ = people
    ov = admin.get("/admin/overview").json()
    assert ov["counts"]["users"] == 4 and ov["counts"]["matches"] >= 1
    assert "gpu" in admin.get("/admin/jobs").json()
    assert admin.get("/admin/storage").json()["folders"]
    rows = admin.get("/admin/matches").json()
    assert any(r["id"] == mid and r["ownerName"] == "alice" for r in rows)
    assert admin.get("/admin/model").status_code == 200


def test_admin_deletes_a_match(people):
    mid, _pid, admin, alice, *_ = people
    assert admin.delete(f"/admin/matches/{mid}").status_code == 204
    assert alice.get(f"/matches/{mid}").status_code == 404
    assert not (repo.matches_dir / mid).exists()


def test_backup_and_restore(people):
    _mid, _pid, admin, *_ = people
    r = admin.get("/admin/backup")
    assert r.status_code == 200
    assert "matches.db" in zipfile.ZipFile(io.BytesIO(r.content)).namelist()
    r2 = admin.post("/admin/restore", files={"file": ("b.zip", io.BytesIO(r.content), "application/zip")})
    assert r2.status_code == 200 and r2.json()["restart"] is True
    bad = admin.post("/admin/restore", files={"file": ("b.zip", io.BytesIO(b"not a zip"), "application/zip")})
    assert bad.status_code == 400


def test_study_export_is_pseudonymous(people):
    mid, _pid, admin, alice, *_ = people
    alice.post(f"/matches/{mid}/feedback", json={"target": "m1", "verdict": "useful"})
    csv = admin.get("/admin/study/export.csv").text
    assert "feedback" in csv and "alice" not in csv


def test_read_tokens_cannot_write(people):
    mid, _pid, admin, *_ = people
    token = admin.post("/admin/tokens", json={"name": "LM Studio", "scope": "read"}).json()["token"]
    bare = TestClient(app)
    headers = {"Authorization": f"Bearer {token}"}
    assert bare.get("/matches", headers=headers).status_code == 200
    assert bare.post(f"/matches/{mid}/bookmarks", json={"round": 1, "t": 1, "note": "x"}, headers=headers).status_code == 403
    tid = next(t["id"] for t in admin.get("/admin/security").json()["tokens"])
    assert admin.delete(f"/admin/tokens/{tid}").status_code == 204
    assert bare.get("/matches", headers=headers).status_code == 401


# --- coach scope (A04) and MCP ---


def test_coach_tools_follow_the_scope(analysed):
    mid, pid = analysed
    assert tools.list_matches(player_id=pid)["playerMatches"]
    token = visible_matches.set(frozenset())
    try:
        assert "error" in tools.list_matches(player_id=pid)
        assert "error" in tools.list_rounds(match_id=mid, player_id=pid)
    finally:
        visible_matches.reset(token)
    token = can_write.set(False)
    try:
        assert "only read" in tools.request_clip(match_id=mid, player_id=pid, round=1, t0=0, t1=5)["error"]
    finally:
        can_write.reset(token)


def test_mcp_http_needs_a_token(auth_on, analysed):
    from app.coach.mcp_http import http_app

    c = TestClient(http_app())
    assert c.post("/mcp", json={}).status_code == 401


# --- Steam (A02) ---


class FakeSteam:
    def __init__(self, valid: bool = True) -> None:
        self.valid = valid

    def post(self, url, data):  # noqa: ANN001, ANN201
        class R:
            text = f"ns:http://specs.openid.net/auth/2.0\nis_valid:{'true' if self.valid else 'false'}\n"

        return R()


def _callback_params(start: str, steam_id: str = "76561198000000001", nonce: str = "2026-09-27T10:00:00Zabc") -> dict:
    from urllib.parse import parse_qs, urlsplit

    q = {k: v[0] for k, v in parse_qs(urlsplit(start).query).items()}
    ret = q["openid.return_to"]
    state = parse_qs(urlsplit(ret).query)["state"][0]
    claimed = f"https://steamcommunity.com/openid/id/{steam_id}"
    return {
        "state": state,
        "openid.mode": "id_res",
        "openid.return_to": ret,
        "openid.claimed_id": claimed,
        "openid.identity": claimed,
        "openid.response_nonce": nonce,
        "openid.sig": "x",
        "openid.signed": "x",
    }


def test_steam_callback_checks(auth_on):
    base = "http://localhost:3000"
    params = _callback_params(steam.start_url(base, "/", None, None))
    sid, pending = steam.verify_callback(base, params, FakeSteam())
    assert sid == "76561198000000001" and pending.next_path == "/"
    with pytest.raises(steam.SteamError):  # the state is used up
        steam.verify_callback(base, params, FakeSteam())
    p2 = _callback_params(steam.start_url(base, "/", None, None), nonce="n2")
    with pytest.raises(steam.SteamError):
        steam.verify_callback(base, {**p2, "openid.claimed_id": "https://evil.example/id/1"}, FakeSteam())
    p3 = _callback_params(steam.start_url(base, "/", None, None), nonce="n3")
    with pytest.raises(steam.SteamError):
        steam.verify_callback(base, {**p3, "openid.return_to": "https://evil.example/cb"}, FakeSteam())
    p4 = _callback_params(steam.start_url(base, "/", None, None), nonce="n4")
    with pytest.raises(steam.SteamError):
        steam.verify_callback(base, p4, FakeSteam(valid=False))
    p5 = _callback_params(steam.start_url(base, "/", None, None), nonce="2026-09-27T10:00:00Zabc")
    with pytest.raises(steam.SteamError):  # a nonce is used once
        steam.verify_callback(base, p5, FakeSteam())


def test_steam_sign_up_and_auto_pick(analysed, auth_on, monkeypatch):
    from app.processing import pipeline as pipe_mod

    mid, pid = analysed
    real_verify = steam.verify_callback
    monkeypatch.setattr(steam, "verify_callback", lambda base, params: real_verify(base, params, FakeSteam()))
    c = new_client()
    start = c.get("/auth/steam/start", follow_redirects=False).headers["location"]
    r = c.get("/auth/steam/callback", params=_callback_params(start, steam_id=pid, nonce="auto"), follow_redirects=False)
    assert r.status_code == 303 and r.headers["location"] == "/welcome"
    me = c.get("/users/me").json()
    assert me["role"] == "admin" and me["steamId"] == pid
    # A06: the linked SteamID is in the demo, so the player is picked without asking
    users().set_owner(mid, me["id"])
    repo.set_status(mid, pipe_mod.MatchStatus.awaiting_player)
    repo.analysis.forget_match(mid)
    pipe_mod.pipeline._auto_pick(mid)
    assert repo.analysis.get_player(mid) == pid


# --- the GPU queue (AD06) ---


def test_gpu_queue_runs_one_at_a_time_and_cancels():
    q = GpuQueue()
    order: list[str] = []
    started = threading.Event()

    def first() -> None:
        with q.slot("select", match_id="a"):
            started.set()
            time.sleep(0.3)
            order.append("first")

    def second() -> None:
        with q.slot("explain", match_id="b"):
            order.append("second")

    t1 = threading.Thread(target=first)
    t1.start()
    started.wait()
    t2 = threading.Thread(target=second)
    t2.start()
    time.sleep(0.05)
    snap = q.snapshot()
    assert len(snap["running"]) == 1 and len(snap["waiting"]) == 1
    t1.join()
    t2.join()
    assert order == ["first", "second"]

    async def asks() -> None:
        async with q.aslot("ask", user_id="u1"):
            with pytest.raises(QueueFull):
                async with q.aslot("ask", user_id="u1"):
                    pass

    asyncio.run(asks())

    hold = threading.Event()
    release = threading.Event()

    def holder() -> None:
        with q.slot("select"):
            hold.set()
            release.wait()

    th = threading.Thread(target=holder)
    th.start()
    hold.wait()
    errors: list[Exception] = []

    def waiter() -> None:
        try:
            with q.slot("explain"):
                pass
        except JobCancelled as exc:
            errors.append(exc)

    tw = threading.Thread(target=waiter)
    tw.start()
    time.sleep(0.05)
    job_id = q.snapshot()["waiting"][0]["id"]
    assert q.cancel(job_id)
    tw.join(timeout=3)
    release.set()
    th.join()
    assert errors and q.snapshot()["finished"][0]["state"] in ("cancelled", "done")


def test_session_token_is_not_stored_in_plain_text(analysed, auth_on):
    c = new_client()
    register(c, "pawel")
    raw = c.cookies.get(SESSION_COOKIE)
    with sqlite3.connect(repo.analysis.db_path) as conn:
        rows = [r[0] for r in conn.execute("SELECT token_hash FROM sessions")]
    assert raw not in rows and digest(raw) in rows
