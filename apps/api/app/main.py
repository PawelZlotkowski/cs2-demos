from collections.abc import AsyncIterator
from contextlib import asynccontextmanager
from urllib.parse import urlsplit

from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.admin.routes import router as admin_router
from app.api.account import router as account_router
from app.api.lab import router as lab_router
from app.api.roadmap import router as roadmap_router
from app.api.routes import router
from app.auth.deps import SAFE_METHODS, SESSION_COOKIE, guard
from app.auth.routes import router as auth_router
from app.core.config import settings

docs = settings.docs_enabled()


@asynccontextmanager
async def lifespan(_app: FastAPI) -> AsyncIterator[None]:
    """Settings the admin changed in the panel win over apps/api/.env (AD07)."""
    from app.admin.services import apply_overrides

    apply_overrides()
    yield


app = FastAPI(
    lifespan=lifespan,
    title=settings.app_name,
    version="0.1.0",
    docs_url="/docs" if docs else None,
    redoc_url="/redoc" if docs else None,
    openapi_url="/openapi.json" if docs else None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def csrf_origin_check(request: Request, call_next):  # noqa: ANN001, ANN201 - Starlette middleware
    """A cookie-signed-in write must come from the app's own pages (doc 30 AD16).

    The session cookie is SameSite=Lax, which already stops cross-site POSTs in
    current browsers; checking ``Origin`` covers the rest. Requests without a
    cookie (API tokens, scripts) have nothing to forge.
    """
    if request.method not in SAFE_METHODS and request.cookies.get(SESSION_COOKIE):
        origin = request.headers.get("origin")
        if origin and not _same_origin(origin, request):
            return JSONResponse({"detail": "That request came from another site."}, status_code=403)
    return await call_next(request)


def _same_origin(origin: str, request: Request) -> bool:
    if origin in settings.cors_origins:
        return True
    if settings.public_url and origin.rstrip("/") == settings.public_url.rstrip("/"):
        return True
    host = urlsplit(origin).netloc
    forwarded = request.headers.get("x-forwarded-host")
    return host in {forwarded, request.headers.get("host")} - {None}


protected = [Depends(guard)]
for r in (auth_router, router, account_router, lab_router, roadmap_router, admin_router):
    app.include_router(r, dependencies=protected)


@app.get("/")
def root() -> dict[str, str | None]:
    return {
        "name": settings.app_name,
        "docs": "/docs" if docs else None,
        "health": "/health",
    }
