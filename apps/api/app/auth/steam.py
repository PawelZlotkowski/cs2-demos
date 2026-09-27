"""Steam sign-in over OpenID 2.0 (doc 27 §1, A02).

Steam only proves a SteamID64; it gives no email or password. The callback
is checked three ways before it is trusted: the ``state`` we issued, the
``return_to`` we asked for, and Steam itself answering ``is_valid:true`` to a
``check_authentication`` request. Response nonces are single use.
"""

from __future__ import annotations

import re
import secrets
import threading
import time
from dataclasses import dataclass
from urllib.parse import urlencode

import httpx

from app.core.config import settings

OPENID_URL = "https://steamcommunity.com/openid/login"
OPENID_NS = "http://specs.openid.net/auth/2.0"
CLAIMED_ID_RE = re.compile(r"^https://steamcommunity\.com/openid/id/(\d{17})$")
STATE_TTL_S = 600


@dataclass
class PendingSignIn:
    next_path: str
    link_user_id: str | None
    invite_code: str | None
    created: float


_pending: dict[str, PendingSignIn] = {}
_used_nonces: dict[str, float] = {}
_lock = threading.Lock()


def _expire(now: float) -> None:
    for key in [k for k, p in _pending.items() if now - p.created > STATE_TTL_S]:
        _pending.pop(key, None)
    for key in [k for k, at in _used_nonces.items() if now - at > 24 * 3600]:
        _used_nonces.pop(key, None)


def start_url(base_url: str, next_path: str, link_user_id: str | None, invite_code: str | None) -> str:
    state = secrets.token_urlsafe(16)
    now = time.time()
    with _lock:
        _expire(now)
        _pending[state] = PendingSignIn(next_path, link_user_id, invite_code, now)
    params = {
        "openid.ns": OPENID_NS,
        "openid.mode": "checkid_setup",
        "openid.return_to": return_to(base_url, state),
        "openid.realm": base_url,
        "openid.identity": f"{OPENID_NS}/identifier_select",
        "openid.claimed_id": f"{OPENID_NS}/identifier_select",
    }
    return f"{OPENID_URL}?{urlencode(params)}"


def return_to(base_url: str, state: str) -> str:
    return f"{base_url}/api/auth/steam/callback?state={state}"


class SteamError(ValueError):
    pass


def verify_callback(base_url: str, params: dict[str, str], client: httpx.Client | None = None) -> tuple[str, PendingSignIn]:
    """(steamid64, the pending sign-in) or ``SteamError``."""
    state = params.get("state", "")
    with _lock:
        pending = _pending.pop(state, None)
    if pending is None or time.time() - pending.created > STATE_TTL_S:
        raise SteamError("That Steam sign-in expired. Try again.")
    if params.get("openid.mode") != "id_res":
        raise SteamError("Steam sign-in was cancelled.")
    if params.get("openid.return_to") != return_to(base_url, state):
        raise SteamError("Steam sent the sign-in to a different address.")
    match = CLAIMED_ID_RE.match(params.get("openid.claimed_id", ""))
    if not match or params.get("openid.identity") != params.get("openid.claimed_id"):
        raise SteamError("Steam did not return a SteamID.")
    nonce = params.get("openid.response_nonce", "")
    with _lock:
        if not nonce or nonce in _used_nonces:
            raise SteamError("That Steam sign-in was already used.")
        _used_nonces[nonce] = time.time()
    check = {k: v for k, v in params.items() if k.startswith("openid.")}
    check["openid.mode"] = "check_authentication"
    own = client is None
    http = client or httpx.Client(timeout=10)
    try:
        resp = http.post(OPENID_URL, data=check)
    except httpx.HTTPError as exc:
        raise SteamError("Could not reach Steam to check the sign-in.") from exc
    finally:
        if own:
            http.close()
    if "is_valid:true" not in resp.text:
        raise SteamError("Steam did not confirm the sign-in.")
    return match.group(1), pending


def player_summary(steam_id: str) -> tuple[str | None, str | None]:
    """(persona name, avatar URL) when ``RR_STEAM_API_KEY`` is set."""
    if not settings.steam_api_key:
        return None, None
    try:
        resp = httpx.get(
            "https://api.steampowered.com/ISteamUser/GetPlayerSummaries/v2/",
            params={"key": settings.steam_api_key, "steamids": steam_id},
            timeout=10,
        )
        players = resp.json().get("response", {}).get("players") or []
    except (httpx.HTTPError, ValueError):
        return None, None
    if not players:
        return None, None
    return players[0].get("personaname"), players[0].get("avatarmedium")
