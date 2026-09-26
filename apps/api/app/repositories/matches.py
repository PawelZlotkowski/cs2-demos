"""In-memory + filesystem match store with replay blobs on disk."""

from __future__ import annotations

import json
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.models.contracts import MatchStatus


PIPELINE_ORDER: list[MatchStatus] = [
    MatchStatus.uploaded,
    MatchStatus.decompressing,
    MatchStatus.decompressed,
    MatchStatus.parsing,
    MatchStatus.normalizing,
    MatchStatus.complete,
]

STAGE_LABELS: dict[MatchStatus, str] = {
    MatchStatus.uploaded: "Upload received",
    MatchStatus.decompressing: "Decompress",
    MatchStatus.decompressed: "Decompressed",
    MatchStatus.parsing: "Parse demo",
    MatchStatus.normalizing: "Normalise replay",
    MatchStatus.reconstructing: "Reconstruct rounds",
    MatchStatus.detecting: "Detect events",
    MatchStatus.ranking: "Rank moments",
    MatchStatus.rendering: "Render clips",
    MatchStatus.analyzing: "Write explanations",
    MatchStatus.complete: "Complete",
    MatchStatus.failed: "Failed",
}


class MatchRepository:
    def __init__(self) -> None:
        self._lock = threading.RLock()
        self.data_dir = settings.data_dir
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.upload_dir = settings.resolved_upload_dir()
        self.matches_dir = settings.resolved_matches_dir()
        self.db_path = self.data_dir / "matches.db"
        self._records: dict[str, dict[str, Any]] = {}
        self._fixture = self._load_fixture()
        self._init_db()
        self._seed_sample()
        self._hydrate_from_disk()

    def _load_fixture(self) -> dict[str, Any]:
        path = settings.resolved_fixture_path()
        return json.loads(path.read_text(encoding="utf-8"))

    def _hydrate_from_disk(self) -> None:
        """Reload previously parsed matches so restarts keep Studio playable."""
        if not self.matches_dir.exists():
            return
        for match_dir in sorted(self.matches_dir.iterdir()):
            if not match_dir.is_dir():
                continue
            meta_path = match_dir / "match.json"
            if not meta_path.exists():
                continue
            match_id = match_dir.name
            if match_id in self._records:
                continue
            try:
                payload = json.loads(meta_path.read_text(encoding="utf-8"))
                events_path = match_dir / "events.json"
                events = (
                    json.loads(events_path.read_text(encoding="utf-8"))
                    if events_path.exists()
                    else []
                )
                match = payload.get("match") or {}
                match["id"] = match_id
                match["status"] = MatchStatus.complete.value
                record = {
                    "id": match_id,
                    "filename": f"{match_id}.dem.zst",
                    "status": MatchStatus.complete,
                    "created_at": datetime.now(timezone.utc).isoformat(),
                    "error": None,
                    "match": match,
                    "moments": [],
                    "last7": [],
                    "home": {},
                    "rounds": payload.get("rounds") or [],
                    "events": events,
                    "round_replays": {},
                    "perf": payload.get("perf"),
                    "match_dir": str(match_dir),
                    "stage_started_at": None,
                    "is_sample": False,
                }
                with self._lock:
                    self._records[match_id] = record
                    self._upsert_row(record)
            except (OSError, json.JSONDecodeError, TypeError, ValueError):
                continue

    def _init_db(self) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS matches (
                    id TEXT PRIMARY KEY,
                    filename TEXT,
                    status TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    error TEXT,
                    meta_json TEXT
                )
                """
            )
            conn.commit()

    def _seed_sample(self) -> None:
        mid = self._fixture["matchId"]
        match = dict(self._fixture["match"])
        match["id"] = mid
        match["status"] = MatchStatus.complete.value
        record = {
            "id": mid,
            "filename": "sample-mirage.dem.zst",
            "status": MatchStatus.complete,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "error": None,
            "match": match,
            "moments": self._fixture["moments"],
            "last7": self._fixture["last7"],
            "home": self._fixture["home"],
            "rounds": [],
            "events": [],
            "round_replays": {},
            "stage_started_at": None,
            "is_sample": True,
        }
        with self._lock:
            self._records[mid] = record
            self._upsert_row(record)

    def _upsert_row(self, record: dict[str, Any]) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO matches (id, filename, status, created_at, error, meta_json)
                VALUES (?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    filename=excluded.filename,
                    status=excluded.status,
                    error=excluded.error,
                    meta_json=excluded.meta_json
                """,
                (
                    record["id"],
                    record.get("filename"),
                    record["status"].value
                    if isinstance(record["status"], MatchStatus)
                    else record["status"],
                    record["created_at"],
                    record.get("error"),
                    json.dumps(
                        {
                            "map": record.get("match", {}).get("map"),
                            "is_sample": record.get("is_sample", False),
                            "rounds": record.get("match", {}).get("rounds"),
                        }
                    ),
                ),
            )
            conn.commit()

    def create_upload(self, filename: str, raw: bytes) -> dict[str, Any]:
        if len(raw) > settings.max_upload_bytes:
            raise ValueError(
                f"File is too large. Maximum upload size is {settings.max_upload_bytes // (1024 * 1024)} MB."
            )
        match_id = f"match-{uuid.uuid4().hex[:12]}"
        if filename.lower().endswith(".dem.zst"):
            dest = self.upload_dir / f"{match_id}.dem.zst"
        else:
            dest = self.upload_dir / f"{match_id}.dem"
        dest.write_bytes(raw)
        now = datetime.now(timezone.utc).isoformat()
        match = {
            "id": match_id,
            "map": "…",
            "score": "–",
            "when": "just now",
            "rounds": 0,
            "won": [],
            "status": MatchStatus.uploaded.value,
            "clipDuration": 0,
        }
        record = {
            "id": match_id,
            "filename": filename,
            "path": str(dest),
            "status": MatchStatus.uploaded,
            "created_at": now,
            "error": None,
            "match": match,
            "moments": [],
            "last7": [],
            "home": {},
            "rounds": [],
            "events": [],
            "round_replays": {},
            "stage_started_at": datetime.now(timezone.utc).timestamp(),
            "is_sample": False,
        }
        with self._lock:
            self._records[match_id] = record
            self._upsert_row(record)
        return record

    def persist_replay(self, match_id: str, normalised: dict[str, Any]) -> dict[str, Any] | None:
        out_dir = self.matches_dir / match_id
        rounds_dir = out_dir / "rounds"
        rounds_dir.mkdir(parents=True, exist_ok=True)
        match = normalised["match"]
        rounds = normalised["rounds"]
        events = normalised["events"]
        round_replays = normalised["round_replays"]
        perf = normalised.get("perf")

        (out_dir / "match.json").write_text(
            json.dumps({"match": match, "rounds": rounds, "perf": perf}, indent=2),
            encoding="utf-8",
        )
        (out_dir / "events.json").write_text(json.dumps(events), encoding="utf-8")
        for rid, replay in round_replays.items():
            (rounds_dir / f"{rid}.json").write_text(json.dumps(replay), encoding="utf-8")

        with self._lock:
            record = self._records.get(match_id)
            if not record:
                return None
            record["match"] = match
            record["rounds"] = rounds
            record["events"] = events
            record["round_replays"] = round_replays
            record["perf"] = perf
            record["moments"] = []
            record["match_dir"] = str(out_dir)
            self._upsert_row(record)
            return record

    def get_round_replay(self, match_id: str, round_id: str) -> dict[str, Any] | None:
        with self._lock:
            record = self._records.get(match_id)
            if not record:
                return None
            cached = (record.get("round_replays") or {}).get(round_id)
            if cached:
                return cached
        path = self.matches_dir / match_id / "rounds" / f"{round_id}.json"
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return None

    def get(self, match_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._records.get(match_id)

    def list_ids(self) -> list[str]:
        with self._lock:
            return list(self._records.keys())

    def set_status(
        self,
        match_id: str,
        status: MatchStatus,
        error: str | None = None,
    ) -> dict[str, Any] | None:
        with self._lock:
            record = self._records.get(match_id)
            if not record:
                return None
            record["status"] = status
            record["match"]["status"] = status.value
            record["error"] = error
            record["stage_started_at"] = datetime.now(timezone.utc).timestamp()
            self._upsert_row(record)
            return record

    def sample_id(self) -> str:
        return self._fixture["matchId"]


repo = MatchRepository()
