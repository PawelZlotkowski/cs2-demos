"""Who is asking, and may they (docs 27 §2, 30 §3).

``guard`` runs before every route of the API routers. It resolves the user
from the session cookie or an API token, applies the role rules by path,
checks ownership of any ``{match_id}`` in the path, and sets the coach scope.
Keeping it in one place means a new route is protected without remembering
to add a dependency; the route-walking test in ``tests/test_auth.py`` checks it.
"""

from __future__ import annotations

from typing import Any

from fastapi import Depends, HTTPException, Request

from app.auth import scope
from app.auth.store import users
from app.core.config import settings

SESSION_COOKIE = "rr_session"
SAFE_METHODS = {"GET", "HEAD", "OPTIONS"}

# With accounts off the app is one local user, who is also the admin
LOCAL_USER: dict[str, Any] = {
    "id": "local",
    "username": None,
    "display_name": "You",
    "avatar_url": None,
    "role": "admin",
    "password_hash": None,
    "created_at": None,
    "disabled_at": None,
    "consented_at": None,
    "last_seen_at": None,
}

# Reachable without signing in
PUBLIC_PATHS = {"/", "/health", "/features"}
PUBLIC_PREFIXES = ("/auth/", "/shared/")

# Role rules by path prefix: (method or None for any, prefix, roles)
ROLE_RULES: list[tuple[str | None, str, set[str]]] = [
    (None, "/admin/", {"admin"}),
    ("POST", "/lab/dataset/export", {"admin"}),
    (None, "/lab/", {"admin", "labeller"}),
    ("POST", "/knowledge/notes", {"admin"}),
]


def client_ip(request: Request) -> str | None:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip() or None
    return request.client.host if request.client else None


def resolve_user(request: Request) -> dict[str, Any] | None:
    """The signed-in user, cached on the request. Sets ``request.state.token_scope`` for API tokens."""
    if hasattr(request.state, "user"):
        return request.state.user
    request.state.token_scope = None
    request.state.session_id = None
    user: dict[str, Any] | None = None
    if not settings.auth_enabled:
        user = LOCAL_USER
    else:
        auth = request.headers.get("authorization") or ""
        if auth.lower().startswith("bearer "):
            found = users().token_user(auth[7:].strip())
            if found:
                user, request.state.token_scope = found
        else:
            token = request.cookies.get(SESSION_COOKIE)
            if token:
                found_session = users().session_user(token)
                if found_session:
                    user, request.state.session_id = found_session
    request.state.user = user
    return user


def is_public(path: str) -> bool:
    return path in PUBLIC_PATHS or path.startswith(PUBLIC_PREFIXES)


def roles_for(method: str, path: str) -> set[str] | None:
    for rule_method, prefix, roles in ROLE_RULES:
        if (rule_method is None or rule_method == method) and (path == prefix.rstrip("/") or path.startswith(prefix)):
            return roles
    return None


def check_match(user: dict[str, Any], match_id: str, method: str) -> None:
    """404 unless the user may use that match: owner, admin, or a labeller reading it."""
    from app.repositories.matches import repo

    record = repo.get(match_id)
    if record is None or record.get("is_sample") or not settings.auth_enabled:
        return  # the route answers 404 itself; the sample is everyone's
    if user["role"] == "admin" or users().owner(match_id) == user["id"]:
        return
    if user["role"] == "labeller" and method in SAFE_METHODS:
        return
    raise HTTPException(status_code=404, detail="Match not found.")


async def guard(request: Request) -> None:
    path = request.url.path
    user = resolve_user(request)
    if is_public(path):
        return
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in first.")
    if request.state.token_scope == "read" and request.method not in SAFE_METHODS:
        raise HTTPException(status_code=403, detail="This token can only read.")
    roles = roles_for(request.method, path)
    if roles is not None and user["role"] not in roles:
        raise HTTPException(status_code=403, detail="You do not have access to that.")
    match_id = request.path_params.get("match_id")
    if match_id:
        check_match(user, match_id, request.method)
    visible = scope.owner_scope(user["id"]) if user is not LOCAL_USER else None
    scope.visible_matches.set(visible)
    player_id = request.path_params.get("player_id")
    if player_id and not match_id and visible is not None:
        from app.repositories.matches import repo

        coached = {mid for pid, mids in repo.analysis.coached_players() if pid == player_id for mid in mids}
        if not coached & visible:
            raise HTTPException(status_code=404, detail="This player has no analysed matches yet.")


def current_user(request: Request) -> dict[str, Any]:
    user = resolve_user(request)
    if user is None:
        raise HTTPException(status_code=401, detail="Sign in first.")
    return user


def require_role(*roles: str):  # noqa: ANN201 - FastAPI dependency factory
    def dependency(user: dict[str, Any] = Depends(current_user)) -> dict[str, Any]:
        if user["role"] not in roles:
            raise HTTPException(status_code=403, detail="You do not have access to that.")
        return user

    return dependency


require_admin = require_role("admin")


def audit(request: Request, action: str, target: str | None = None, detail: dict[str, Any] | None = None) -> None:
    user = resolve_user(request)
    users().audit(user["id"] if user else None, action, target, detail, client_ip(request))
