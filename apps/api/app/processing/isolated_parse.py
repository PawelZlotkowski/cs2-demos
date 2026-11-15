"""Enforce native parser wall time, aggregate RSS and bounded JSON output."""

from __future__ import annotations

import json
import os
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import psutil

from app.core.config import settings
from app.processing.parse_demo import ParseError


def terminate_owned_process(process: subprocess.Popen) -> None:
    """Kill this worker and its descendants, never arbitrary Steam/CS2 processes."""
    try:
        descendants = psutil.Process(process.pid).children(recursive=True)
    except psutil.NoSuchProcess:
        descendants = []
    for child in reversed(descendants):
        try:
            child.kill()
        except (psutil.NoSuchProcess, psutil.AccessDenied):
            pass
    if process.poll() is None:
        process.kill()
    process.wait(timeout=5)
    psutil.wait_procs(descendants, timeout=2)


def run_bounded_process(command: list[str], *, timeout: float, memory_bytes: int, error_file: Path) -> None:
    flags = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {"start_new_session": True}
    with error_file.open("wb") as stderr:
        process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=stderr, **flags)
        deadline = time.monotonic() + timeout
        try:
            while process.poll() is None:
                if time.monotonic() >= deadline:
                    raise ParseError("Parsing timed out. The parser process was stopped.")
                try:
                    parent = psutil.Process(process.pid)
                    rss = parent.memory_info().rss
                    for child in parent.children(recursive=True):
                        try:
                            rss += child.memory_info().rss
                        except psutil.NoSuchProcess:
                            pass
                    if rss > memory_bytes:
                        raise ParseError("Parser memory limit exceeded. The parser process was stopped.")
                except psutil.NoSuchProcess:
                    pass
                if error_file.stat().st_size > 256 * 1024:
                    raise ParseError("Parser diagnostic output exceeded the size limit.")
                time.sleep(min(0.05, max(0.001, deadline - time.monotonic())))
            if process.returncode != 0:
                raise ParseError("Could not parse that CS2 demo. The parser worker failed.")
        finally:
            if process.poll() is None:
                terminate_owned_process(process)


def parse_and_normalize_isolated(demo: Path, match_id: str) -> dict:
    with tempfile.TemporaryDirectory(prefix=f"parse-{match_id}-", dir=settings.resolved_work_dir()) as scratch:
        output = Path(scratch) / "replay.json"
        command = [sys.executable, "-m", "app.processing.parse_worker", "--demo", str(demo),
                   "--match-id", match_id, "--output", str(output), "--max-bytes", str(settings.max_replay_bytes)]
        run_bounded_process(command, timeout=settings.parse_timeout_seconds,
                            memory_bytes=settings.parser_memory_bytes, error_file=Path(scratch) / "worker.err")
        if not output.is_file() or output.stat().st_size > settings.max_replay_bytes:
            raise ParseError("Parser did not produce a replay within the size limit.")
        try:
            result = json.loads(output.read_text(encoding="utf-8"))
            if not isinstance(result, dict) or result.get("match", {}).get("id") != match_id:
                raise ValueError("Incorrect worker output identity")
            if not all(key in result for key in ("rounds", "events", "round_replays")):
                raise ValueError("Incomplete worker output")
            return result
        except (ValueError, OSError, AttributeError) as exc:
            raise ParseError("Parser returned invalid replay data.") from exc
