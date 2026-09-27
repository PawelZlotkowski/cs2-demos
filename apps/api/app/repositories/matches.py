"""In-memory + filesystem match store with replay blobs on disk."""

from __future__ import annotations

import json
import os
import shutil
import sqlite3
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.models.contracts import MatchStatus
from app.repositories.analysis import AnalysisRepository

ANALYSIS_FILE = "analysis.json"

STAGE_LABELS: dict[MatchStatus, str] = {
    MatchStatus.uploaded: "Upload received",
    MatchStatus.decompressing: "Unpack demo",
    MatchStatus.decompressed: "Decompressed",
    MatchStatus.parsing: "Parse demo",
    MatchStatus.normalizing: "Normalise replay",
    MatchStatus.awaiting_player: "Choose a player",
    MatchStatus.detecting: "Find mistakes and good plays",
    MatchStatus.selecting: "Pick moments",
    MatchStatus.recording: "Record clips",
    MatchStatus.explaining: "Write explanations",
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
        self.analysis = AnalysisRepository(self.db_path)
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
                status = self._restored_status(match_dir, match_id)
                match["status"] = status.value
                match["selectedPlayerId"] = self.analysis.get_player(match_id)
                record = {
                    "id": match_id,
                    "filename": f"{match_id}.dem.zst",
                    "status": status,
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

    def _restored_status(self, match_dir: Path, match_id: str) -> MatchStatus:
        """Matches parsed before the coach milestone have no analysis.json."""
        if not (match_dir / ANALYSIS_FILE).exists():
            return MatchStatus.complete
        player = self.analysis.get_player(match_id)
        if player and self.analysis.has_analysis(match_id, player):
            return MatchStatus.complete
        return MatchStatus.awaiting_player

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
        return self._new_upload(filename, lambda dest: dest.write_bytes(raw))

    def create_upload_from_file(self, filename: str, src: Path) -> dict[str, Any]:
        """Takes over a file the upload route streamed to disk."""
        return self._new_upload(filename, lambda dest: os.replace(src, dest))

    def _new_upload(self, filename: str, write: Any) -> dict[str, Any]:
        match_id = f"match-{uuid.uuid4().hex[:12]}"
        if filename.lower().endswith(".dem.zst"):
            dest = self.upload_dir / f"{match_id}.dem.zst"
        else:
            dest = self.upload_dir / f"{match_id}.dem"
        write(dest)
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

        (out_dir / "events.json").write_text(json.dumps(events), encoding="utf-8")
        replay_bytes = 0
        for rid, replay in round_replays.items():
            blob = json.dumps(replay)
            replay_bytes += len(blob.encode("utf-8"))
            (rounds_dir / f"{rid}.json").write_text(blob, encoding="utf-8")
        analysis = normalised.get("analysis")
        if analysis is not None:
            blob = json.dumps(analysis, separators=(",", ":"))
            (out_dir / ANALYSIS_FILE).write_text(blob, encoding="utf-8")
            if perf is not None:
                # Replay blobs are unchanged by the coach parse; analysis data is separate
                perf["replayBytes"] = replay_bytes
                perf["analysisBytes"] = len(blob.encode("utf-8"))
        (out_dir / "match.json").write_text(
            json.dumps({"match": match, "rounds": rounds, "perf": perf}, indent=2),
            encoding="utf-8",
        )

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

    def has_analysis_input(self, match_id: str) -> bool:
        return (self.matches_dir / match_id / ANALYSIS_FILE).exists()

    def load_analysis_input(self, match_id: str) -> tuple[dict[str, Any], dict[str, dict[str, Any]]]:
        """``analysis.json`` plus every round replay blob, for ``build_match_data``."""
        analysis = json.loads((self.matches_dir / match_id / ANALYSIS_FILE).read_text(encoding="utf-8"))
        replays: dict[str, dict[str, Any]] = {}
        for r in analysis.get("rounds") or []:
            rid = f"r{r['number']}"
            replay = self.get_round_replay(match_id, rid)
            if replay:
                replays[rid] = replay
        return analysis, replays

    def set_selected_player(self, match_id: str, player_id: str) -> None:
        self.analysis.set_player(match_id, player_id)
        with self._lock:
            record = self._records.get(match_id)
            if record:
                record["match"]["selectedPlayerId"] = player_id

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

    def delete(self, match_id: str) -> dict[str, Any] | None:
        """Forget a match: the record, its row and its files (upload, work, replay, clips)."""
        with self._lock:
            record = self._records.pop(match_id, None)
            with sqlite3.connect(self.db_path) as conn:
                conn.execute("DELETE FROM matches WHERE id = ?", (match_id,))
        if record is None:
            return None
        for path in (record.get("path"), settings.resolved_work_dir() / f"{match_id}.dem"):
            if path:
                Path(path).unlink(missing_ok=True)
        for leftover in self.upload_dir.glob(f"{match_id}.*"):
            leftover.unlink(missing_ok=True)
        match_dir = self.matches_dir / match_id
        if match_dir.is_dir() and match_dir.resolve().parent == self.matches_dir.resolve():
            shutil.rmtree(match_dir, ignore_errors=True)
        self.analysis.forget_match(match_id)
        return record

    def sample_id(self) -> str:
        return self._fixture["matchId"]


repo = MatchRepository()
