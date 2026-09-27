"""The cs2-demo MCP server over HTTP, behind API tokens when accounts are on (doc 30 AD12).

Tokens are made in the admin panel (Security). A token acts as the admin who
made it: it sees that admin's matches (all of them for an admin), and a
``read`` token cannot call ``select_moments`` or ``request_clip``. Without
accounts the server stays open, but listens on 127.0.0.1 only.
"""

from __future__ import annotations

import json
from typing import Any

from app.auth.scope import can_write, owner_scope, visible_matches
from app.core.config import settings


class TokenGate:
    """Pure ASGI, so the scope set here reaches the tool calls (they run in tasks started below it)."""

    def __init__(self, app: Any) -> None:
        self.app = app

    async def __call__(self, scope: dict, receive: Any, send: Any) -> None:
        if scope["type"] != "http" or not settings.auth_enabled:
            await self.app(scope, receive, send)
            return
        from app.auth.store import users

        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers") or []}
        auth = headers.get("authorization", "")
        found = users().token_user(auth[7:].strip()) if auth.lower().startswith("bearer ") else None
        if found is None:
            body = json.dumps({"error": "Send an API token from the admin panel as 'Authorization: Bearer rr_...'."}).encode()
            await send({"type": "http.response.start", "status": 401, "headers": [(b"content-type", b"application/json")]})
            await send({"type": "http.response.body", "body": body})
            return
        user, token_scope = found
        visible_matches.set(None if user["role"] == "admin" else owner_scope(user["id"]))
        can_write.set(token_scope == "write")
        await self.app(scope, receive, send)


def http_app(host: str = "127.0.0.1") -> Any:
    from app.coach.mcp_server import build_server

    server = build_server()
    # Stateless: each request runs its own tool calls, so each carries its token's scope
    return TokenGate(server.streamable_http_app(stateless_http=settings.auth_enabled, host=host))
