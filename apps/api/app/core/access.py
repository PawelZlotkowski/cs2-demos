"""Loopback-only personal use or explicit per-owner bearer/session access."""

from __future__ import annotations

import hmac
import ipaddress
import threading
from urllib.parse import urlsplit

from fastapi import HTTPException
from starlette.requests import Request
from starlette.responses import JSONResponse

from app.core.config import settings


SESSION_COOKIE = "rr_session"


def is_loopback(host: str) -> bool:
    try:
        return ipaddress.ip_address(host).is_loopback
    except ValueError:
        return False


def authenticated_owner(request: Request) -> str | None:
    authorization = request.headers.get("authorization", "")
    token = authorization[7:] if authorization.lower().startswith("bearer ") else request.cookies.get(SESSION_COOKIE, "")
    if not token or len(token) > 1024:
        return None
    for owner, configured in settings.api_tokens.items():
        expected = configured.get_secret_value() if hasattr(configured, "get_secret_value") else str(configured)
        if hmac.compare_digest(token.encode("utf-8"), expected.encode("utf-8")):
            return owner
    return None


class AccessAndUploadMiddleware:
    def __init__(self, app):
        self.app = app
        self._lock = threading.Lock()
        self._uploads = 0

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            return await self.app(scope, receive, send)
        request = Request(scope)
        if request.url.path == "/health" and request.method == "GET":
            return await self.app(scope, receive, send)
        origin = request.headers.get("origin")
        if origin and origin not in settings.cors_origins:
            return await JSONResponse({"detail": "This website is not allowed to access the API."}, status_code=403)(scope, receive, send)
        if settings.access_mode == "local":
            peer = request.client.host if request.client else ""
            try:
                host = urlsplit(f"//{request.headers.get('host', '')}").hostname or ""
            except ValueError:
                return await JSONResponse({"detail": "Invalid Host header."}, status_code=400)(scope, receive, send)
            try:
                trusted_peer = is_loopback(peer) or any(ipaddress.ip_address(peer) in ipaddress.ip_network(net)
                                                      for net in settings.local_trusted_networks)
            except ValueError:
                trusted_peer = False
            trusted_host = host == "localhost" or is_loopback(host) or host in settings.local_trusted_hosts
            if not trusted_peer or not trusted_host:
                return await JSONResponse({"detail": "Personal mode accepts loopback connections only."}, status_code=403)(scope, receive, send)
            owner = "local"
        else:
            owner = authenticated_owner(request)
            if not owner:
                return await JSONResponse({"detail": "Authentication required."}, status_code=401,
                                          headers={"WWW-Authenticate": "Bearer"})(scope, receive, send)
        scope.setdefault("state", {})["owner_id"] = owner
        parts = request.url.path.strip("/").split("/")
        if len(parts) >= 2 and parts[0] == "matches" and parts[1] != "upload":
            from app.repositories.matches import repo

            metadata = repo.access_metadata(parts[1])
            # The bundled sample is shared; mutation routes independently reject
            # it before starting real analysis/recording.
            if metadata and metadata[0] != owner and not metadata[1]:
                return await JSONResponse({"detail": "Match not found."}, status_code=404)(scope, receive, send)
        if len(parts) >= 2 and parts[0] == "users" and parts[1] not in {"me", owner}:
            return await JSONResponse({"detail": "User not found."}, status_code=404)(scope, receive, send)
        uploading = request.url.path == "/matches/upload" and request.method == "POST"
        maximum = settings.max_upload_bytes + settings.max_multipart_overhead_bytes
        if uploading:
            try:
                length = int(request.headers.get("content-length", "0"))
            except ValueError:
                return await JSONResponse({"detail": "Invalid Content-Length."}, status_code=400)(scope, receive, send)
            if length < 0:
                return await JSONResponse({"detail": "Invalid Content-Length."}, status_code=400)(scope, receive, send)
            if length > maximum:
                return await JSONResponse({"detail": "Upload exceeds the size limit."}, status_code=413)(scope, receive, send)
            with self._lock:
                admitted = self._uploads < settings.max_concurrent_uploads
                if admitted:
                    self._uploads += 1
            if not admitted:
                return await JSONResponse({"detail": "Too many uploads. Try again shortly."}, status_code=429,
                                          headers={"Retry-After": "5"})(scope, receive, send)
        received = 0

        async def bounded_receive():
            nonlocal received
            message = await receive()
            if uploading and message["type"] == "http.request":
                received += len(message.get("body", b""))
                if received > maximum:
                    raise HTTPException(status_code=413, detail="Upload exceeds the size limit.")
            return message

        try:
            await self.app(scope, bounded_receive, send)
        finally:
            if uploading:
                with self._lock:
                    self._uploads -= 1
