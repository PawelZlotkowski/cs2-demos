"""What the admin panel reads and changes (doc 30 §5)."""

from __future__ import annotations

import io
import json
import shutil
import sqlite3
import tempfile
import time
import zipfile
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any, Literal, get_args

from pydantic import TypeAdapter, ValidationError

from app.auth.store import users
from app.core.config import Settings, settings
from app.models.contracts import MatchStatus

# --- runtime settings (AD07) ---------------------------------------------------

# Settings the API reads each time it uses them, so a change applies to the next
# job without a restart. Choices are listed where only some values make sense.
RUNTIME_SETTINGS: dict[str, dict[str, Any]] = {
    "llm_enabled": {"group": "Coach model", "label": "Use the local model"},
    "llm_base_url": {"group": "Coach model", "label": "llama-server address"},
    "llm_model": {"group": "Coach model", "label": "Model name"},
    "llm_timeout_seconds": {"group": "Coach model", "label": "Timeout per call (s)"},
    "llm_sampling": {"group": "Coach model", "label": "Sampling profile", "choices": ["auto", "qwen3", "gemma", "ministral", "gpt-oss"]},
    "llm_temperature": {"group": "Coach model", "label": "Temperature override"},
    "llm_top_p": {"group": "Coach model", "label": "Top-p override"},
    "llm_top_k": {"group": "Coach model", "label": "Top-k override"},
    "llm_min_p": {"group": "Coach model", "label": "Min-p override"},
    "coach_tools": {"group": "Coach model", "label": "Tool transport", "choices": ["mcp", "inprocess"]},
    "coach_max_steps": {"group": "Coach model", "label": "Tool steps per answer"},
    "embed_url": {"group": "Knowledge", "label": "Embedding server"},
    "embed_model": {"group": "Knowledge", "label": "Embedding model"},
    "csdm_enabled": {"group": "Clips", "label": "Record POV clips"},
    "csdm_mode": {"group": "Clips", "label": "Recorder", "choices": ["stub", "csdm"]},
    "csdm_width": {"group": "Clips", "label": "Width (px)"},
    "csdm_height": {"group": "Clips", "label": "Height (px)"},
    "csdm_fps": {"group": "Clips", "label": "Frames per second"},
    "csdm_timeout_seconds": {"group": "Clips", "label": "Timeout per clip (s)"},
    "csdm_moment_pad_before": {"group": "Clips", "label": "Seconds before a moment"},
    "csdm_moment_pad_after": {"group": "Clips", "label": "Seconds after a moment"},
    "csdm_round_clips": {"group": "Clips", "label": "Whole-round clips after parsing"},
    "csdm_max_rounds": {"group": "Clips", "label": "Most whole-round clips (0 = all)"},
    "max_upload_bytes": {"group": "Uploads", "label": "Largest upload (bytes)"},
    "parse_timeout_seconds": {"group": "Uploads", "label": "Parse timeout (s)"},
    "max_matches_per_user": {"group": "Accounts", "label": "Matches per user (0 = no limit)"},
    "signup": {"group": "Accounts", "label": "Sign-up", "choices": ["invite", "open", "closed"]},
    "session_days": {"group": "Accounts", "label": "Stay signed in for (days)"},
    "public_url": {"group": "Accounts", "label": "Address people open the app at"},
    "study_mode": {"group": "Accounts", "label": "User study (consent step)"},
    "share_links": {"group": "Accounts", "label": "Share links"},
    "lab_enabled": {"group": "Lab", "label": "Lab on"},
}
# Shown for reference; they need a change in apps/api/.env and a restart
RESTART_SETTINGS = ["auth_enabled", "data_dir", "cors_origins", "mcp_url", "mcp_command", "csdm_bin", "api_docs"]
SECRET_SETTINGS = {"steam_api_key"}

_env_values: dict[str, Any] = {}


def _jsonable(value: Any) -> Any:
    if isinstance(value, Path):
        return str(value)
    if isinstance(value, list):
        return [_jsonable(v) for v in value]
    return value


def apply_overrides() -> None:
    """At start-up: remember the .env values, then apply the admin's overrides."""
    for key in RUNTIME_SETTINGS:
        _env_values.setdefault(key, getattr(settings, key))
    for key, row in users().app_settings().items():
        if key in RUNTIME_SETTINGS:
            try:
                setattr(settings, key, validate_setting(key, row["value"]))
            except ValueError:
                continue


def validate_setting(key: str, value: Any) -> Any:
    meta = RUNTIME_SETTINGS.get(key)
    if meta is None:
        raise ValueError("That setting cannot be changed while the API runs.")
    if value == "" and type(None) in get_args(Settings.model_fields[key].annotation):
        value = None
    try:
        checked = TypeAdapter(Settings.model_fields[key].annotation).validate_python(value)
    except ValidationError as exc:
        raise ValueError(f"Not a valid value for {key}.") from exc
    if "choices" in meta and checked not in meta["choices"]:
        raise ValueError(f"Choose one of {', '.join(meta['choices'])}.")
    if isinstance(checked, (int, float)) and not isinstance(checked, bool) and checked < 0:
        raise ValueError("Use a positive number.")
    return checked


def set_setting(key: str, value: Any, user_id: str | None) -> Any:
    checked = validate_setting(key, value)
    _env_values.setdefault(key, getattr(settings, key))
    users().set_app_setting(key, _jsonable(checked), user_id)
    setattr(settings, key, checked)
    return checked


def reset_setting(key: str) -> Any:
    if key not in RUNTIME_SETTINGS:
        raise ValueError("That setting cannot be changed while the API runs.")
    users().clear_app_setting(key)
    if key in _env_values:
        setattr(settings, key, _env_values[key])
    return getattr(settings, key)


def list_settings() -> dict[str, Any]:
    overrides = users().app_settings()
    rows = []
    for key, meta in RUNTIME_SETTINGS.items():
        annotation = Settings.model_fields[key].annotation
        kind = "bool" if annotation is bool else "number" if annotation in (int, float) or set(get_args(annotation)) & {int, float} else "text"
        rows.append(
            {
                "key": key,
                "env": f"RR_{key.upper()}",
                "group": meta["group"],
                "label": meta["label"],
                "kind": kind,
                "choices": meta.get("choices"),
                "value": _jsonable(getattr(settings, key)),
                "envValue": _jsonable(_env_values.get(key, getattr(settings, key))),
                "source": "admin" if key in overrides else "env",
                "updatedAt": overrides.get(key, {}).get("updatedAt"),
            }
        )
    fixed = [{"key": k, "env": f"RR_{k.upper()}", "value": _jsonable(getattr(settings, k))} for k in RESTART_SETTINGS]
    fixed += [{"key": k, "env": f"RR_{k.upper()}", "value": "set" if getattr(settings, k) else None} for k in SECRET_SETTINGS]
    return {"runtime": rows, "restart": fixed}


# --- deleting (AD05, A12) ------------------------------------------------------


def delete_match_everything(match_id: str) -> bool:
    """Files, clips, analysis rows, notes, versions, traces, ownership."""
    from app.repositories.extras import extras
    from app.repositories.matches import repo
    from app.services.traces import redact_match

    record = repo.get(match_id)
    if record is None or record.get("is_sample"):
        return False
    repo.delete(match_id)
    extras().forget_match(match_id)
    users().forget_match(match_id)
    try:
        redact_match(match_id)
    except OSError:
        pass
    return True


def delete_user_everything(user_id: str) -> int:
    """The user's matches and every row about them; returns the number of matches removed."""
    from app.repositories.matches import repo

    owned = [mid for mid in repo.list_ids() if users().owner(mid) == user_id]
    for mid in owned:
        delete_match_everything(mid)
    users().delete_user(user_id)
    return len(owned)


# --- overview, matches, jobs (AD01, AD05, AD06) ---------------------------------


def _size(path: Path) -> int:
    if path.is_file():
        return path.stat().st_size
    if not path.is_dir():
        return 0
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())


def match_size(match_id: str) -> int:
    from app.repositories.matches import repo

    record = repo.get(match_id) or {}
    total = _size(repo.matches_dir / match_id) + _size(settings.resolved_work_dir() / f"{match_id}.dem")
    if record.get("path"):
        total += _size(Path(record["path"]))
    return total


def admin_matches() -> list[dict[str, Any]]:
    from app.repositories.matches import repo
    from app.services.progress import review_model

    store = users()
    names = {u["id"]: u["display_name"] for u in store.users()}
    titles = store.titles()
    rows = []
    for mid in repo.list_ids():
        record = repo.get(mid) or {}
        if record.get("is_sample"):
            continue
        match = record.get("match") or {}
        pid = repo.analysis.get_player(mid)
        owner = store.owner(mid)
        rows.append(
            {
                "id": mid,
                "title": titles.get(mid),
                "map": match.get("map"),
                "score": match.get("score"),
                "status": getattr(record.get("status"), "value", record.get("status")),
                "error": record.get("error"),
                "ownerId": owner,
                "ownerName": names.get(owner, "You" if owner == "local" else owner),
                "playerId": pid,
                "playerName": next((p.get("name") for p in match.get("players") or [] if p.get("id") == pid), None),
                "model": review_model(mid, pid) if pid else None,
                "bytes": match_size(mid),
                "createdAt": record.get("created_at"),
                "shared": store.share_active(mid),
            }
        )
    return sorted(rows, key=lambda r: r["createdAt"] or "", reverse=True)


PROCESSING = {
    MatchStatus.uploaded, MatchStatus.decompressing, MatchStatus.decompressed, MatchStatus.parsing,
    MatchStatus.normalizing, MatchStatus.detecting, MatchStatus.selecting, MatchStatus.recording,
    MatchStatus.explaining,
}


def jobs() -> dict[str, Any]:
    from app.repositories.matches import repo
    from app.services.gpu import gpu

    pipeline_rows = []
    for mid in repo.list_ids():
        record = repo.get(mid) or {}
        status = record.get("status")
        if status in PROCESSING or status == MatchStatus.failed:
            pipeline_rows.append(
                {
                    "matchId": mid,
                    "status": getattr(status, "value", status),
                    "error": record.get("error"),
                    "since": record.get("stage_started_at"),
                }
            )
    clips = [{**c, "id": f"c{c['id']}"} for c in repo.analysis.all_clip_jobs()]
    return {"gpu": gpu.snapshot(), "pipeline": pipeline_rows, "clips": clips}


def storage() -> dict[str, Any]:
    from app.repositories.matches import repo

    folders = {
        "uploads": repo.upload_dir,
        "work": settings.resolved_work_dir(),
        "matches": repo.matches_dir,
        "traces": settings.resolved_traces_dir(),
        "dataset": settings.dataset_dir or (settings.data_dir / "dataset"),
    }
    rows = [{"name": k, "path": str(v), "bytes": _size(Path(v))} for k, v in folders.items()]
    db = Path(repo.analysis.db_path)
    rows.append({"name": "database", "path": str(db), "bytes": _size(db)})
    try:
        usage = shutil.disk_usage(settings.data_dir)
        disk = {"total": usage.total, "free": usage.free}
    except OSError:
        disk = None
    return {"folders": rows, "disk": disk}


def cleanup(*, work: bool, traces_days: int | None, failed: bool) -> dict[str, Any]:
    """Frees space: decompressed .dem work files, old traces, failed uploads."""
    from app.repositories.matches import repo

    freed = 0
    removed: dict[str, int] = {"work": 0, "traces": 0, "failed": 0}
    if work:
        for path in settings.resolved_work_dir().glob("*.dem"):
            record = repo.get(path.stem) or {}
            if record.get("status") in PROCESSING:
                continue  # still being parsed
            freed += _size(path)
            path.unlink(missing_ok=True)
            removed["work"] += 1
    if traces_days:
        cutoff = (datetime.now(UTC) - timedelta(days=traces_days)).strftime("%Y-%m-%d")
        for path in settings.resolved_traces_dir().glob("*.jsonl"):
            if path.stem < cutoff:
                freed += _size(path)
                path.unlink(missing_ok=True)
                removed["traces"] += 1
    if failed:
        for mid in list(repo.list_ids()):
            record = repo.get(mid) or {}
            if record.get("status") == MatchStatus.failed:
                freed += match_size(mid)
                if delete_match_everything(mid):
                    removed["failed"] += 1
    return {"freedBytes": freed, "removed": removed}


# --- model and services (AD08) --------------------------------------------------


def model_stats(limit: int = 50) -> dict[str, Any]:
    """Verifier pass rate, latency and tokens per second over the latest coach runs."""
    from app.services.traces import iter_traces, verdict_of

    recent = list(iter_traces())[-limit:]
    rows: dict[str, dict[str, Any]] = {}
    for _tid, record in recent:
        model = str(record.get("model") or "templates")
        row = rows.setdefault(model, {"model": model, "runs": 0, "verified": 0, "checked": 0, "latency": 0.0, "tokens": 0, "genSeconds": 0.0})
        row["runs"] += 1
        ok, _ = verdict_of(record)
        if ok is not None:
            row["checked"] += 1
            row["verified"] += int(ok)
        parts = [*(record.get("runs") or []), *(record.get("attempts") or [])]
        for part in parts:
            usage = part.get("usage") or {}
            latency = part.get("latencyS") or 0
            row["latency"] += latency
            tokens = usage.get("completion_tokens") or 0
            if tokens and latency:
                row["tokens"] += tokens
                row["genSeconds"] += latency
    out = []
    for row in rows.values():
        out.append(
            {
                "model": row["model"],
                "runs": row["runs"],
                "verifiedRate": round(row["verified"] / row["checked"], 3) if row["checked"] else None,
                "avgLatencyS": round(row["latency"] / row["runs"], 2) if row["runs"] else None,
                "tokensPerSecond": round(row["tokens"] / row["genSeconds"], 1) if row["genSeconds"] else None,
            }
        )
    return {"window": len(recent), "models": sorted(out, key=lambda r: -r["runs"])}


def llama_command() -> str:
    return (
        f"llama-server -m {settings.llm_model}.gguf --jinja -c 32768 -ctk q8_0 -ctv q8_0 -ngl 99 "
        f"--port {settings.llm_base_url.rsplit(':', 1)[-1].split('/')[0] or '8080'}"
    )


# --- study export (AD14) --------------------------------------------------------


def pseudonym(user_id: str | None) -> str:
    import hashlib

    return "p_" + hashlib.sha256(f"rr-study:{user_id}".encode()).hexdigest()[:10] if user_id else ""


def study_csv() -> str:
    """Feedback, Ask and A/B ratings with pseudonymous ids: no names or SteamIDs."""
    import csv

    from app.repositories.extras import extras

    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(["type", "participant", "match", "target", "verdict_or_source", "text", "language", "at"])
    store = users()
    for f in store.feedback():
        w.writerow(["feedback", pseudonym(f["userId"]), f["matchId"], f"{f['kind']}:{f['target']}", f["verdict"], f["note"] or "", "", f["createdAt"]])
    for a in store.asks(limit=100000):
        w.writerow(["ask", pseudonym(a["userId"]), a["matchId"] or "", a["playerId"] and "player", a["source"] or "", a["question"], a["lang"] or "", a["createdAt"]])
    for r in extras().ratings():
        w.writerow(["ab_rating", pseudonym(r["rater"]), "", f"{r['a']} vs {r['b']}", r["winner"], "", "", ""])
    return buf.getvalue()


def study_summary() -> dict[str, Any]:
    from app.repositories.matches import repo

    store = users()
    feedback = store.feedback()
    asks = store.asks(limit=100000)
    rows = []
    for u in store.users():
        owned = store.owned_match_ids(u["id"], repo.list_ids())
        rows.append(
            {
                "participant": pseudonym(u["id"]),
                "userId": u["id"],
                "name": u["display_name"],
                "role": u["role"],
                "consented": bool(u["consented_at"]),
                "matches": len(owned),
                "reviewed": sum(1 for mid in owned if repo.analysis.get_player(mid)),
                "feedback": sum(1 for f in feedback if f["userId"] == u["id"]),
                "useful": sum(1 for f in feedback if f["userId"] == u["id"] and f["verdict"] == "useful"),
                "asks": sum(1 for a in asks if a["userId"] == u["id"]),
            }
        )
    return {"studyMode": settings.study_mode, "participants": rows}


# --- backup (AD15) ---------------------------------------------------------------

BACKUP_DB = "matches.db"


def backup_zip() -> tuple[bytes, str]:
    """The database (a consistent copy), labels and own knowledge notes; no demos or clips."""
    from app.repositories.matches import repo
    from app.services.knowledge import knowledge_dir
    from app.services.labels import labels_dir

    buf = io.BytesIO()
    with tempfile.TemporaryDirectory() as tmp:
        copy = Path(tmp) / BACKUP_DB
        with sqlite3.connect(repo.analysis.db_path) as src, sqlite3.connect(copy) as dst:
            src.backup(dst)
        with zipfile.ZipFile(buf, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(copy, BACKUP_DB)
            for base, prefix in ((labels_dir(), "labels"), (knowledge_dir() / "notes", "knowledge-notes")):
                base = Path(base)
                if base.is_dir():
                    for path in base.rglob("*"):
                        if path.is_file():
                            zf.write(path, f"{prefix}/{path.relative_to(base).as_posix()}")
            zf.writestr("backup.json", json.dumps({"createdAt": datetime.now(UTC).isoformat(), "app": settings.app_name}))
    name = f"round-reviewer-backup-{time.strftime('%Y%m%d-%H%M')}.zip"
    return buf.getvalue(), name


def restore_zip(raw: bytes) -> dict[str, Any]:
    """Puts a backup's database, labels and notes back. The API must restart afterwards."""
    from app.repositories.matches import repo
    from app.services.knowledge import knowledge_dir
    from app.services.labels import labels_dir

    try:
        zf = zipfile.ZipFile(io.BytesIO(raw))
    except zipfile.BadZipFile as exc:
        raise ValueError("That is not a backup zip.") from exc
    names = zf.namelist()
    if BACKUP_DB not in names or "backup.json" not in names:
        raise ValueError("That zip is not a Round Reviewer backup.")
    with tempfile.TemporaryDirectory() as tmp:
        db = Path(tmp) / BACKUP_DB
        db.write_bytes(zf.read(BACKUP_DB))
        try:
            with sqlite3.connect(db) as conn:
                conn.execute("SELECT COUNT(*) FROM users").fetchone()
        except sqlite3.Error as exc:
            raise ValueError("The backup's database is unreadable.") from exc
        with sqlite3.connect(db) as src, sqlite3.connect(repo.analysis.db_path) as dst:
            src.backup(dst)
    restored = {"labels": 0, "notes": 0}
    for name in names:
        for prefix, base, key in (("labels/", Path(labels_dir()), "labels"), ("knowledge-notes/", knowledge_dir() / "notes", "notes")):
            if name.startswith(prefix) and not name.endswith("/"):
                target = (base / name[len(prefix):]).resolve()
                if base.resolve() not in target.parents:
                    continue  # a path outside the folder
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(zf.read(name))
                restored[key] += 1
    return restored
