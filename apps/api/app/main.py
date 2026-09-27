from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.lab import router as lab_router
from app.api.roadmap import router as roadmap_router
from app.api.routes import router
from app.core.config import settings

app = FastAPI(title=settings.app_name, version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)
app.include_router(lab_router)
app.include_router(roadmap_router)


@app.get("/")
def root() -> dict[str, str]:
    return {
        "name": settings.app_name,
        "docs": "/docs",
        "health": "/health",
        "openapi": "/openapi.json",
    }
