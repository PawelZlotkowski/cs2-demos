"""What the local setup is doing right now (roadmap R01, doc 29 §4.1).

One call answers the questions that cost the most time on the owner's PC:
is llama-server up, is it serving the model ``RR_LLM_MODEL`` names (an old
server on port 8080 once was not), can the agent reach the ``cs2-demo`` MCP
tools, is CS Demo Manager configured, is the knowledge base indexed. Each
check is cheap and times out fast, so the Settings page can poll it.
"""

from __future__ import annotations

import shutil
import sqlite3
from collections.abc import Callable
from pathlib import Path
from typing import Any

import anyio
import httpx

from app.core.config import settings
from app.models.contracts import SystemCheck, SystemStatus

LLM_TIMEOUT_S = 2.0
MCP_TIMEOUT_S = 5.0


def _norm(name: str) -> str:
    """Model ids differ in case, path and file suffix: compare the bare stem."""
    return name.lower().rsplit("/", 1)[-1].rsplit("\\", 1)[-1].removesuffix(".gguf")


def served_models(get: Callable[[str], Any] | None = None) -> list[str] | None:
    """Model ids from ``/v1/models``, or None when the server does not answer."""
    url = f"{settings.llm_base_url.rstrip('/')}/models"
    try:
        r = get(url) if get else httpx.get(url, timeout=LLM_TIMEOUT_S)
        if r.status_code != 200:
            return None
        body = r.json()
    except (httpx.HTTPError, ValueError):
        return None
    return [str(m.get("id")) for m in body.get("data") or [] if isinstance(m, dict) and m.get("id")]


def llm_check(served: list[str] | None) -> SystemCheck:
    if not settings.llm_enabled:
        return SystemCheck(name="llm", state="off", detail="RR_LLM_ENABLED is off, so the coach uses templates.")
    if served is None:
        return SystemCheck(
            name="llm", state="problem", detail=f"No model server answers at {settings.llm_base_url}. Start llama-server."
        )
    want = _norm(settings.llm_model)
    if any(want == _norm(s) or want in _norm(s) or _norm(s) in want for s in served):
        return SystemCheck(name="llm", state="ok", detail=f"Serving {', '.join(served)}.")
    return SystemCheck(
        name="llm",
        state="problem",
        detail=f"The server serves {', '.join(served) or 'no model'}, but RR_LLM_MODEL is {settings.llm_model}. "
        "Stop the other llama-server or change RR_LLM_MODEL, then restart the API.",
    )


async def mcp_tool_names() -> list[str]:
    from app.coach.backends import InProcessTools, MCPTools

    backend = InProcessTools() if settings.coach_tools == "inprocess" else MCPTools.from_settings(settings.mcp_url, settings.mcp_command)
    async with backend as tools:
        return [t.name for t in await tools.list_tools()]


def mcp_check(names: list[str] | None, error: str | None) -> SystemCheck:
    where = settings.mcp_url or settings.mcp_command or "in-process"
    if names is None:
        return SystemCheck(name="mcp", state="problem", detail=f"Could not list the cs2-demo tools ({where}): {error}")
    return SystemCheck(name="mcp", state="ok", detail=f"{len(names)} tools over {settings.coach_tools} ({where}).")


def csdm_check() -> SystemCheck:
    if not settings.csdm_enabled:
        return SystemCheck(name="csdm", state="off", detail="RR_CSDM_ENABLED is off, so moments play on the radar only.")
    if settings.csdm_mode == "stub":
        return SystemCheck(name="csdm", state="ok", detail="Stub clips (RR_CSDM_MODE=stub).")
    from app.processing.video_clips import resolve_csdm_bin

    binary = resolve_csdm_bin()
    if Path(binary).is_file() or shutil.which(binary):
        return SystemCheck(
            name="csdm",
            state="ok",
            detail=f"CS Demo Manager at {binary}. CS2, Steam and the csdm-postgres container must be running to record.",
        )
    return SystemCheck(name="csdm", state="problem", detail=f"CS Demo Manager was not found ({settings.csdm_bin}). Set RR_CSDM_BIN.")


def knowledge_check() -> SystemCheck:
    db = settings.data_dir / "knowledge.db"
    if not db.exists():
        return SystemCheck(name="knowledge", state="ok", detail="Not indexed yet; the first search builds the index.")
    try:
        with sqlite3.connect(db) as conn:
            n = conn.execute("SELECT COUNT(*) FROM passages").fetchone()[0]
    except sqlite3.Error as exc:
        return SystemCheck(name="knowledge", state="problem", detail=f"Index unreadable: {exc}. Run python -m app.rag.index.")
    dense = "hybrid search" if settings.embed_url else "keyword search"
    return SystemCheck(name="knowledge", state="ok", detail=f"{n} passages, {dense}.")


def traces_check() -> SystemCheck:
    try:
        folder = settings.resolved_traces_dir()
    except OSError as exc:
        return SystemCheck(name="traces", state="problem", detail=f"Traces folder not writable: {exc}.")
    files = sorted(folder.glob("*.jsonl"))
    return SystemCheck(name="traces", state="ok", detail=f"{len(files)} {'day' if len(files) == 1 else 'days'} of coach runs in {folder}.")


async def system_status(get: Callable[[str], Any] | None = None) -> SystemStatus:
    served = served_models(get) if settings.llm_enabled else None
    names: list[str] | None
    error: str | None = None
    try:
        with anyio.fail_after(MCP_TIMEOUT_S):
            names = await mcp_tool_names()
    except Exception as exc:  # noqa: BLE001 - any failure is the answer here
        names, error = None, str(exc) or type(exc).__name__
    checks = [llm_check(served), mcp_check(names, error), csdm_check(), knowledge_check(), traces_check()]
    return SystemStatus(
        ok=all(c.state != "problem" for c in checks),
        llm_model=settings.llm_model,
        served_models=served or [],
        mcp_tools=names or [],
        checks=checks,
    )
