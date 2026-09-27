"""Sign-in, sign-up, the account itself and its data (A01, A02, A05, A07, A12, A13)."""

from __future__ import annotations

import io
import json
import zipfile
from typing import Any
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import RedirectResponse, StreamingResponse

from app.auth import steam
from app.auth.deps import SESSION_COOKIE, LOCAL_USER, audit, client_ip, current_user, resolve_user
from app.auth.passwords import hash_password, password_problem, verify_password
from app.auth.store import users
from app.core.config import settings
from app.models.contracts import (
    AuthState,
    DeleteAccountRequest,
    LoginRequest,
    ProfileUpdate,
    RegisterRequest,
    ResetPasswordRequest,
    UserOut,
    UserSettings,
)

router = APIRouter()

MAX_FAILURES = 5  # per username in 15 minutes


def user_out(user: dict[str, Any]) -> UserOut:
    steam_id = users().steam_id(user["id"]) if user is not LOCAL_USER else None
    return UserOut(
        id=user["id"],
        username=user["username"],
        display_name=user["display_name"],
        avatar_url=user["avatar_url"],
        role=user["role"],
        steam_id=steam_id,
        has_password=bool(user["password_hash"]),
        created_at=user["created_at"],
        last_seen_at=user["last_seen_at"],
        disabled=bool(user["disabled_at"]),
        consented=bool(user["consented_at"]),
    )


def _signup_mode() -> str:
    return settings.signup if settings.signup in ("invite", "open", "closed") else "invite"


def _require_auth_on() -> None:
    if not settings.auth_enabled:
        raise HTTPException(status_code=409, detail="Accounts are off. Set RR_AUTH_ENABLED=true and restart the API.")


def _set_session(response: Response, request: Request, user_id: str) -> None:
    token = users().create_session(user_id, settings.session_days, request.headers.get("user-agent"), client_ip(request))
    response.set_cookie(
        SESSION_COOKIE,
        token,
        max_age=settings.session_days * 86400,
        httponly=True,
        samesite="lax",
        secure=request.url.scheme == "https" or request.headers.get("x-forwarded-proto") == "https",
        path="/",
    )


def _new_account_role(invite_code: str | None) -> tuple[str, dict[str, Any] | None]:
    """The role a new account gets, and the invite it uses; 403 when sign-up is shut."""
    if users().count_users() == 0:
        return "admin", None
    mode = _signup_mode()
    if invite_code:
        invite = users().check_invite(invite_code)
        if invite is None:
            raise HTTPException(status_code=403, detail="That invite code is not valid. Ask the admin for a new one.")
        return invite["role"], invite
    if mode == "open":
        return "player", None
    if mode == "invite":
        raise HTTPException(status_code=403, detail="You need an invite code to create an account.")
    raise HTTPException(status_code=403, detail="Sign-up is closed.")


@router.get("/auth/me", response_model=AuthState)
def auth_me(request: Request) -> AuthState:
    user = resolve_user(request)
    needs_setup = settings.auth_enabled and users().count_users() == 0
    return AuthState(
        auth_enabled=settings.auth_enabled,
        user=user_out(user) if user else None,
        needs_setup=needs_setup,
        signup=_signup_mode(),
        steam=True,
        study_mode=settings.study_mode,
        needs_consent=bool(settings.auth_enabled and settings.study_mode and user and not user["consented_at"]),
    )


@router.post("/auth/register", response_model=AuthState)
def register(body: RegisterRequest, request: Request, response: Response) -> AuthState:
    _require_auth_on()
    if users().user_by_username(body.username):
        raise HTTPException(status_code=409, detail="That username is taken.")
    problem = password_problem(body.password, body.username)
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    role, invite = _new_account_role(body.invite_code)
    user = users().create_user(
        display_name=(body.display_name or body.username).strip(),
        role=role,
        username=body.username,
        password_hash=hash_password(body.password),
    )
    if invite:
        users().use_invite(invite["id"], user["id"])
    _set_session(response, request, user["id"])
    users().audit(user["id"], "auth.register", user["id"], {"role": role, "invite": invite["id"] if invite else None}, client_ip(request))
    request.state.user = user
    return auth_me(request)


@router.post("/auth/login", response_model=AuthState)
def login(body: LoginRequest, request: Request, response: Response) -> AuthState:
    _require_auth_on()
    key = body.username.lower()
    if users().recent_failures(key) >= MAX_FAILURES:
        raise HTTPException(status_code=429, detail="Too many attempts. Wait 15 minutes and try again.")
    user = users().user_by_username(body.username)
    ok = verify_password(user["password_hash"] if user else None, body.password)
    users().record_login(key, ok and bool(user), client_ip(request))
    if not ok or user is None:
        raise HTTPException(status_code=401, detail="That username and password do not match.")
    if user["disabled_at"]:
        raise HTTPException(status_code=403, detail="This account is disabled. Ask the admin.")
    _set_session(response, request, user["id"])
    users().audit(user["id"], "auth.login", user["id"], None, client_ip(request))
    request.state.user = user
    return auth_me(request)


@router.post("/auth/logout", status_code=204)
def logout(request: Request) -> Response:
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        users().delete_session_token(token)
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response


@router.post("/auth/reset", response_model=AuthState)
def reset_password(body: ResetPasswordRequest, request: Request, response: Response) -> AuthState:
    """Set a new password with a one-time code from the admin panel."""
    _require_auth_on()
    uid = users().use_reset_code(body.code.strip())
    user = users().user(uid) if uid else None
    if user is None:
        raise HTTPException(status_code=400, detail="That reset code is not valid or has expired.")
    problem = password_problem(body.password, user["username"])
    if problem:
        raise HTTPException(status_code=400, detail=problem)
    users().update_user(user["id"], password_hash=hash_password(body.password))
    users().delete_sessions_of(user["id"])
    _set_session(response, request, user["id"])
    users().audit(user["id"], "auth.reset_password", user["id"], None, client_ip(request))
    request.state.user = users().user(user["id"])
    return auth_me(request)


# --- Steam ---


def base_url(request: Request) -> str:
    if settings.public_url:
        return settings.public_url.rstrip("/")
    proto = request.headers.get("x-forwarded-proto") or request.url.scheme
    host = request.headers.get("x-forwarded-host") or request.headers.get("host") or request.url.netloc
    return f"{proto.split(',')[0].strip()}://{host.split(',')[0].strip()}"


def _safe_next(path: str | None) -> str:
    return path if path and path.startswith("/") and not path.startswith("//") else "/"


@router.get("/auth/steam/start")
def steam_start(request: Request, next: str = "/", invite: str | None = None, link: bool = False) -> RedirectResponse:
    _require_auth_on()
    link_user = None
    if link:
        user = resolve_user(request)
        if user is None:
            raise HTTPException(status_code=401, detail="Sign in first.")
        link_user = user["id"]
    return RedirectResponse(steam.start_url(base_url(request), _safe_next(next), link_user, invite), status_code=303)


def _signin_error(message: str) -> RedirectResponse:
    return RedirectResponse(f"/signin?error={quote(message)}", status_code=303)


@router.get("/auth/steam/callback")
def steam_callback(request: Request) -> RedirectResponse:
    _require_auth_on()
    try:
        steam_id, pending = steam.verify_callback(base_url(request), dict(request.query_params))
    except steam.SteamError as exc:
        return _signin_error(str(exc))
    store = users()
    owner = store.identity_user("steam", steam_id)
    if pending.link_user_id:
        if owner and owner != pending.link_user_id:
            return RedirectResponse(f"/settings?error={quote('That Steam account is linked to another user.')}#profile", status_code=303)
        store.link_identity(pending.link_user_id, "steam", steam_id)
        store.audit(pending.link_user_id, "auth.steam_link", pending.link_user_id, {"steamId": steam_id}, client_ip(request))
        return RedirectResponse("/settings#profile", status_code=303)
    if owner is None:
        try:
            role, invite = _new_account_role(pending.invite_code)
        except HTTPException as exc:
            return _signin_error(str(exc.detail))
        name, avatar = steam.player_summary(steam_id)
        user = store.create_user(display_name=name or f"Steam {steam_id[-4:]}", role=role, avatar_url=avatar)
        store.link_identity(user["id"], "steam", steam_id)
        if invite:
            store.use_invite(invite["id"], user["id"])
        store.audit(user["id"], "auth.register", user["id"], {"role": role, "steam": True}, client_ip(request))
        target = "/welcome"
    else:
        user = store.user(owner)
        if user is None or user["disabled_at"]:
            return _signin_error("This account is disabled. Ask the admin.")
        store.audit(user["id"], "auth.login", user["id"], {"steam": True}, client_ip(request))
        target = pending.next_path
    response = RedirectResponse(target, status_code=303)
    _set_session(response, request, user["id"])
    return response


@router.post("/users/me/steam/unlink", response_model=UserOut)
def steam_unlink(request: Request, user: dict = Depends(current_user)) -> UserOut:
    _require_auth_on()
    if not user["password_hash"]:
        raise HTTPException(status_code=400, detail="Set a password first, or you could not sign in again.")
    users().unlink_identity(user["id"], "steam")
    audit(request, "auth.steam_unlink", user["id"])
    return user_out(user)


# --- the account ---


@router.get("/users/me", response_model=UserOut)
def get_me(user: dict = Depends(current_user)) -> UserOut:
    return user_out(user)


@router.patch("/users/me", response_model=UserOut)
def patch_me(body: ProfileUpdate, request: Request, user: dict = Depends(current_user)) -> UserOut:
    _require_auth_on()
    changes: dict[str, Any] = {}
    if body.display_name is not None:
        changes["display_name"] = body.display_name.strip()
    if body.username is not None and body.username != user["username"]:
        taken = users().user_by_username(body.username)
        if taken and taken["id"] != user["id"]:
            raise HTTPException(status_code=409, detail="That username is taken.")
        changes["username"] = body.username
    if body.new_password is not None:
        if user["password_hash"] and not verify_password(user["password_hash"], body.current_password or ""):
            raise HTTPException(status_code=400, detail="The current password is wrong.")
        problem = password_problem(body.new_password, changes.get("username") or user["username"])
        if problem:
            raise HTTPException(status_code=400, detail=problem)
        if not (changes.get("username") or user["username"]):
            raise HTTPException(status_code=400, detail="Choose a username to sign in with the password.")
        changes["password_hash"] = hash_password(body.new_password)
    updated = users().update_user(user["id"], **changes)
    audit(request, "user.update", user["id"], {"fields": sorted(k for k in changes if k != "password_hash") + (["password"] if "password_hash" in changes else [])})
    return user_out(updated or user)


@router.post("/users/me/consent", response_model=UserOut)
def consent(request: Request, user: dict = Depends(current_user)) -> UserOut:
    _require_auth_on()
    from app.auth.store import iso

    updated = users().update_user(user["id"], consented_at=iso())
    audit(request, "study.consent", user["id"])
    return user_out(updated or user)


@router.get("/users/me/settings", response_model=UserSettings)
def get_settings(user: dict = Depends(current_user)) -> UserSettings:
    return UserSettings.model_validate(users().user_settings(user["id"]))


@router.put("/users/me/settings", response_model=UserSettings)
def put_settings(body: UserSettings, user: dict = Depends(current_user)) -> UserSettings:
    users().save_user_settings(user["id"], body.model_dump(by_alias=True))
    return body


def user_language(user: dict[str, Any] | None) -> str:
    if not user:
        return "en"
    return users().user_settings(user["id"]).get("language") or "en"


@router.get("/users/me/sessions")
def my_sessions(request: Request, user: dict = Depends(current_user)) -> list[dict[str, Any]]:
    current = getattr(request.state, "session_id", None)
    return [{**s, "current": s["id"] == current} for s in users().sessions(user["id"])]


@router.delete("/users/me/sessions/{session_id}", status_code=204)
def end_session(session_id: str, request: Request, user: dict = Depends(current_user)) -> Response:
    if not users().delete_session(session_id, user["id"]):
        raise HTTPException(status_code=404, detail="Session not found.")
    audit(request, "auth.session_end", session_id)
    return Response(status_code=204)


@router.get("/users/me/export")
def export_me(request: Request, user: dict = Depends(current_user)) -> StreamingResponse:
    """Everything stored about the account as JSON files in a zip (no demos or clips)."""
    from app.repositories.extras import extras
    from app.repositories.matches import repo

    store = users()
    owned = sorted(store.owned_match_ids(user["id"], repo.list_ids())) if settings.auth_enabled else repo.list_ids()
    matches = []
    for mid in owned:
        record = repo.get(mid) or {}
        if record.get("is_sample"):
            continue
        pid = repo.analysis.get_player(mid)
        matches.append(
            {
                "id": mid,
                "match": record.get("match"),
                "player": pid,
                "moments": [m.model_dump(by_alias=True) for m in repo.analysis.moments(mid, pid)] if pid else [],
                "explanations": [e.model_dump(by_alias=True) for e in repo.analysis.explanations(mid, pid)] if pid else [],
                "bookmarks": extras().bookmarks(mid),
            }
        )
    files = {
        "account.json": user_out(user).model_dump(by_alias=True),
        "settings.json": store.user_settings(user["id"]),
        "matches.json": matches,
        "ask.json": store.asks(user["id"], limit=10000),
        "feedback.json": store.feedback(user["id"]),
        "sessions.json": store.sessions(user["id"]),
    }
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for name, data in files.items():
            zf.writestr(name, json.dumps(data, indent=2, ensure_ascii=False, default=str))
    buf.seek(0)
    audit(request, "user.export", user["id"])
    return StreamingResponse(
        buf,
        media_type="application/zip",
        headers={"Content-Disposition": 'attachment; filename="round-reviewer-export.zip"'},
    )


@router.delete("/users/me", status_code=204)
def delete_me(body: DeleteAccountRequest, request: Request, user: dict = Depends(current_user)) -> Response:
    _require_auth_on()
    expected = user["username"] or "DELETE"
    if body.confirm != expected:
        raise HTTPException(status_code=400, detail=f"Type {expected} to confirm.")
    if user["role"] == "admin" and users().admin_count() <= 1:
        raise HTTPException(status_code=400, detail="You are the only admin. Make someone else admin first.")
    from app.admin.services import delete_user_everything

    delete_user_everything(user["id"])
    users().audit(user["id"], "user.delete", user["id"], {"self": True}, client_ip(request))
    response = Response(status_code=204)
    response.delete_cookie(SESSION_COOKIE, path="/")
    return response
