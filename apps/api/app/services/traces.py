"""Coach runs as the Lab's Runs tab shows them (roadmap R03, doc 29 §2.2).

``CoachJobs`` appends one JSON line per job to ``data/traces/<date>.jsonl``.
The files are append-only, so ``<date>:<line>`` is a stable id. Two record
shapes exist: the tool-loop jobs (explain, ask, summary, wrapup) keep their
agent runs under ``runs``; moment selection keeps its JSON attempts under
``attempts`` and has no tool loop.
"""

from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any

from app.coach.jobs import knowledge_in
from app.core.config import settings
from app.models.contracts import TraceDetail, TracePage, TraceSummary, TraceToolStep

DAY_RE = re.compile(r"^\d{4}-\d{2}-\d{2}$")


def _folder() -> Path:
    return settings.resolved_traces_dir()


def _lines(day: str) -> list[str]:
    path = _folder() / f"{day}.jsonl"
    if not DAY_RE.match(day) or not path.is_file():
        return []
    return path.read_text(encoding="utf-8").splitlines()


def _load(line: str) -> dict[str, Any] | None:
    try:
        record = json.loads(line)
    except json.JSONDecodeError:
        return None
    return record if isinstance(record, dict) else None


def _steps(record: dict[str, Any]) -> list[dict[str, Any]]:
    return [s for run in record.get("runs") or [] for s in run.get("steps") or []]


def _verifier(record: dict[str, Any]) -> tuple[bool | None, list[str]]:
    if isinstance(record.get("verifier"), dict):
        v = record["verifier"]
        return bool(v.get("ok")), [str(e) for e in v.get("errors") or []]
    if "ok" in record:  # moment selection
        return bool(record["ok"]), [str(e) for e in record.get("errors") or []]
    return None, []


def _summary(trace_id: str, record: dict[str, Any]) -> dict[str, Any]:
    ok, _ = _verifier(record)
    latency = record.get("latencyS")
    if latency is None and record.get("attempts"):
        latency = round(sum(a.get("latencyS") or 0 for a in record["attempts"]), 3)
    return {
        "id": trace_id,
        "ts": str(record.get("ts") or ""),
        "job": str(record.get("job") or "unknown"),
        "match_id": record.get("matchId"),
        "player_id": record.get("playerId"),
        "lang": record.get("lang"),
        "model": record.get("model"),
        "source": record.get("source"),
        "verifier_ok": ok,
        "repaired": bool(record.get("repaired")) or len(record.get("attempts") or []) > 1,
        "latency_s": latency,
        "tool_calls": len(_steps(record)),
    }


def list_traces(
    *,
    job: str | None = None,
    match_id: str | None = None,
    source: str | None = None,
    limit: int = 50,
    offset: int = 0,
) -> TracePage:
    """Newest first, across all days."""
    items: list[TraceSummary] = []
    days = sorted((p.stem for p in _folder().glob("*.jsonl") if DAY_RE.match(p.stem)), reverse=True)
    for day in days:
        lines = _lines(day)
        for n in range(len(lines), 0, -1):
            record = _load(lines[n - 1])
            if record is None:
                continue
            if job and record.get("job") != job:
                continue
            if match_id and record.get("matchId") != match_id:
                continue
            if source and record.get("source") != source:
                continue
            items.append(TraceSummary.model_validate(_summary(f"{day}:{n}", record)))
    return TracePage(items=items[offset : offset + limit], total=len(items))


def get_trace(trace_id: str) -> TraceDetail | None:
    day, _, n = trace_id.partition(":")
    if not n.isdigit():
        return None
    lines = _lines(day)
    idx = int(n) - 1
    if not 0 <= idx < len(lines):
        return None
    record = _load(lines[idx])
    if record is None:
        return None
    _, errors = _verifier(record)
    messages = [m for run in record.get("runs") or [] for m in run.get("messages") or []]
    output = record.get("runs", [{}])[-1].get("output") if record.get("runs") else None
    if output is None and record.get("attempts"):
        output = record["attempts"][-1].get("output")
    return TraceDetail.model_validate(
        {
            **_summary(trace_id, record),
            "steps": [TraceToolStep.model_validate(s) for s in _steps(record)],
            "knowledge_ids": sorted(knowledge_in(messages)),
            "verifier_errors": errors,
            "output": output,
            "fallback": record.get("fallback"),
            "record": record,
        }
    )
