"""In-memory + filesystem match store with replay blobs on disk."""

from __future__ import annotations

import json
import copy
import shutil
import sqlite3
import re
import threading
import uuid
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.models.contracts import MatchStatus
from app.repositories.analysis import AnalysisRepository

ANALYSIS_FILE = "analysis.json"


def write_json_atomic(path: Path, payload: Any) -> None:
    """Publish whole JSON documents; readers never observe a partial write."""
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    try:
        temporary.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        temporary.replace(path)
    finally:
        temporary.unlink(missing_ok=True)

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
        self._storage_reservations: dict[str, int] = {}
        self._fixture = self._load_fixture()
        self._init_db()
        self.analysis = AnalysisRepository(self.db_path)
        self._seed_sample()
        self._hydrate_from_disk()

    def _load_fixture(self) -> dict[str, Any]:
        path = settings.resolved_fixture_path()
        return json.loads(path.read_text(encoding="utf-8"))

    def _hydrate_from_disk(self) -> None:
        """Restore durable records first, including uploads not yet parsed."""
        with sqlite3.connect(self.db_path) as connection:
            rows = connection.execute("SELECT id, owner_id, state_json, status, filename, created_at, error FROM matches").fetchall()
        persisted = {row[0]: row for row in rows}
        for match_id, owner_id, state, _status, _filename, _created, _error in rows:
            if match_id in self._records or not state:
                continue
            try:
                record = json.loads(state)
                record["owner_id"] = owner_id
                record["status"] = MatchStatus(record["status"])
                record.setdefault("moments", [])
                record.setdefault("last7", [])
                record.setdefault("home", {})
                record["events"] = []
                record["round_replays"] = {}
                match_dir = self.matches_dir / match_id
                if (match_dir / "match.json").exists():
                    meta = json.loads((match_dir / "match.json").read_text(encoding="utf-8"))
                    record["rounds"] = meta.get("rounds") or []
                    record["match_dir"] = str(match_dir)
                    if (match_dir / "events.json").exists():
                        record["events"] = json.loads((match_dir / "events.json").read_text(encoding="utf-8"))
                self._recover_interrupted(record)
                self._records[match_id] = record
                if record["status"] == MatchStatus.uploaded:
                    self._storage_reservations[match_id] = int(record.get("storage_reservation_bytes") or 0)
                self._upsert_row(record)
            except (OSError, ValueError, KeyError, TypeError):
                continue
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
                old = persisted.get(match_id)
                status = MatchStatus(old[3]) if old else self._restored_status(match_dir, match_id)
                match["status"] = status.value
                match["selectedPlayerId"] = self.analysis.get_player(match_id)
                record = {
                    "id": match_id,
                    "filename": old[4] if old else f"{match_id}.dem.zst",
                    "status": status,
                    "created_at": old[5] if old else datetime.now(timezone.utc).isoformat(),
                    "error": old[6] if old else None,
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
                    "owner_id": old[1] if old else "local",
                }
                # Legacy rows do not include their source path. Recover only a
                # generated upload for this identity, never a client filename.
                sources = list(self.upload_dir.glob(f"{match_id}.*"))
                if len(sources) == 1 and sources[0].is_file():
                    record["path"] = str(sources[0])
                self._recover_interrupted(record)
                with self._lock:
                    self._records[match_id] = record
                    self._upsert_row(record)
            except (OSError, json.JSONDecodeError, TypeError, ValueError):
                continue

    def _recover_interrupted(self, record: dict[str, Any]) -> None:
        cpu_stages = {MatchStatus.decompressing, MatchStatus.decompressed, MatchStatus.parsing, MatchStatus.normalizing}
        coach_stages = {MatchStatus.detecting, MatchStatus.selecting, MatchStatus.recording, MatchStatus.explaining}
        if record["status"] in cpu_stages:
            source = record.get("path")
            if source and Path(source).is_file():
                record["status"] = MatchStatus.uploaded
                record["error"] = "Processing was interrupted; parsing will resume."
            else:
                record["status"] = MatchStatus.failed
                record["error"] = "The source upload is missing. Upload the demo again."
        elif record["status"] in coach_stages:
            record["status"] = MatchStatus.awaiting_player
            record["error"] = "Review processing was interrupted. Choose the player again to resume."
        record["match"]["status"] = record["status"].value
        record["match"]["selectedPlayerId"] = self.analysis.get_player(record["id"])

    def _restored_status(self, match_dir: Path, match_id: str) -> MatchStatus:
        """Matches parsed before the coach milestone have no analysis.json."""
        if not (match_dir / ANALYSIS_FILE).exists():
            return MatchStatus.complete
        with sqlite3.connect(self.db_path) as connection:
            row = connection.execute("SELECT status FROM matches WHERE id = ?", (match_id,)).fetchone()
        if row and row[0] == MatchStatus.complete.value:
            return MatchStatus.complete
        # Stored detector results alone cannot prove downstream work finished.
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
            columns = {row[1] for row in conn.execute("PRAGMA table_info(matches)")}
            if "owner_id" not in columns:
                conn.execute("ALTER TABLE matches ADD COLUMN owner_id TEXT NOT NULL DEFAULT 'local'")
            if "state_json" not in columns:
                conn.execute("ALTER TABLE matches ADD COLUMN state_json TEXT")

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
            "owner_id": "sample",
        }
        with self._lock:
            self._records[mid] = record
            self._upsert_row(record)

    def _upsert_row(self, record: dict[str, Any]) -> None:
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                """
                INSERT INTO matches (id, filename, status, created_at, error, meta_json, owner_id, state_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                ON CONFLICT(id) DO UPDATE SET
                    filename=excluded.filename,
                    status=excluded.status,
                    error=excluded.error,
                    meta_json=excluded.meta_json,
                    owner_id=excluded.owner_id,
                    state_json=excluded.state_json
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
                    record.get("owner_id", "local"),
                    json.dumps({key: value for key, value in record.items()
                                if key not in {"events", "round_replays", "moments", "last7", "home"}}),
                ),
            )
            conn.commit()

    def create_upload(self, filename: str, raw: bytes, *, owner_id: str = "local") -> dict[str, Any]:
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
        return self.register_upload(filename, dest, match_id, owner_id=owner_id)

    def allocate_upload(self, filename: str) -> tuple[str, Path]:
        match_id = f"match-{uuid.uuid4().hex}"
        suffix = ".dem.zst" if filename.lower().endswith(".dem.zst") else ".dem"
        return match_id, self.upload_dir / f"{match_id}{suffix}"

    def register_upload(self, filename: str, dest: Path, match_id: str, *, owner_id: str = "local") -> dict[str, Any]:
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
            "owner_id": owner_id,
            "storage_reservation_bytes": self._storage_reservations.get(match_id, 0),
        }
        with self._lock:
            self._records[match_id] = record
            self._upsert_row(record)
        return copy.deepcopy(record)

    def check_storage(self, additional_bytes: int = 0) -> None:
        """Enforce a local disk quota and keep a free-space reserve."""
        roots = {self.upload_dir.resolve(), self.matches_dir.resolve(), settings.resolved_work_dir().resolve()}
        total = sum(path.stat().st_size for root in roots if root.exists()
                    for path in root.rglob("*") if path.is_file() and not path.is_symlink())
        if total + additional_bytes > settings.max_storage_bytes:
            raise ValueError("Demo storage quota exceeded. Remove old demo artifacts or increase the quota.")
        if shutil.disk_usage(self.upload_dir).free < settings.min_free_disk_bytes + additional_bytes:
            raise ValueError("Not enough free disk space to accept or process this demo.")

    def reserve_upload_storage(self, match_id: str) -> None:
        # Reserve the worst permitted source/work/replay size, rather than admitting
        # many compressed uploads against the same apparently free disk space.
        budget = settings.max_upload_bytes + settings.max_decompress_bytes + settings.max_replay_bytes
        with self._lock:
            self.check_storage(sum(self._storage_reservations.values()) + budget)
            self._storage_reservations[match_id] = budget

    def release_upload_storage(self, match_id: str) -> None:
        with self._lock:
            self._storage_reservations.pop(match_id, None)
            record = self._records.get(match_id)
            if record and record.get("storage_reservation_bytes"):
                record["storage_reservation_bytes"] = 0
                self._upsert_row(record)

    def remove_unprocessed_upload(self, match_id: str) -> None:
        with self._lock:
            record = self._records.get(match_id)
            if not record or record["status"] != MatchStatus.uploaded:
                return
            path = Path(record["path"])
            if path.resolve().parent != self.upload_dir.resolve():
                raise ValueError("Upload cleanup path is outside the upload directory.")
            path.unlink(missing_ok=True)
            with sqlite3.connect(self.db_path) as connection:
                connection.execute("DELETE FROM matches WHERE id = ?", (match_id,))
            self._records.pop(match_id, None)
            self._storage_reservations.pop(match_id, None)

    def owned_ids(self, owner_id: str) -> set[str]:
        with self._lock:
            return {mid for mid, record in self._records.items() if record.get("owner_id", "local") == owner_id}

    def persist_replay(self, match_id: str, normalised: dict[str, Any]) -> dict[str, Any] | None:
        out_dir = self.matches_dir / match_id
        rounds_dir = out_dir / "rounds"
        rounds_dir.mkdir(parents=True, exist_ok=True)
        match = normalised["match"]
        rounds = normalised["rounds"]
        events = normalised["events"]
        round_replays = normalised["round_replays"]
        perf = normalised.get("perf")

        write_json_atomic(out_dir / "events.json", events)
        replay_bytes = 0
        for rid, replay in round_replays.items():
            blob = json.dumps(replay)
            replay_bytes += len(blob.encode("utf-8"))
            write_json_atomic(rounds_dir / f"{rid}.json", replay)
        analysis = normalised.get("analysis")
        if analysis is not None:
            blob = json.dumps(analysis, separators=(",", ":"))
            write_json_atomic(out_dir / ANALYSIS_FILE, analysis)
            if perf is not None:
                # Replay blobs are unchanged by the coach parse; analysis data is separate
                perf["replayBytes"] = replay_bytes
                perf["analysisBytes"] = len(blob.encode("utf-8"))
        write_json_atomic(out_dir / "match.json", {"match": match, "rounds": rounds, "perf": perf})

        with self._lock:
            record = self._records.get(match_id)
            if not record:
                return None
            record["match"] = match
            record["match"]["status"] = record["status"].value
            record["rounds"] = rounds
            record["events"] = events
            record["round_replays"] = round_replays
            record["perf"] = perf
            record["moments"] = []
            record["match_dir"] = str(out_dir)
            self._upsert_row(record)
            return copy.deepcopy({k: v for k, v in record.items() if k != "round_replays"})

    def get_round_replay(self, match_id: str, round_id: str) -> dict[str, Any] | None:
        # A URL segment can contain backslashes on Windows even though it
        # cannot contain URL slashes. Never turn it into a filesystem path.
        if not re.fullmatch(r"r[1-9][0-9]*", round_id):
            return None
        with self._lock:
            record = self._records.get(match_id)
            if not record:
                return None
            if not any(r.get("id") == round_id for r in record.get("rounds") or []):
                return None
            cached = (record.get("round_replays") or {}).get(round_id)
            if cached:
                return copy.deepcopy(cached)
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
                self._upsert_row(record)

    def claim_player_analysis(self, match_id: str, player_id: str) -> bool:
        """Reserve the analysis stage atomically against concurrent selections."""
        with self._lock:
            record = self._records.get(match_id)
            if not record or record["status"] not in (MatchStatus.awaiting_player, MatchStatus.complete):
                return False
            self.set_selected_player(match_id, player_id)
            self.set_status(match_id, MatchStatus.detecting)
            return True

    def access_metadata(self, match_id: str) -> tuple[str, bool] | None:
        """Authorize without copying potentially large replay/event blobs."""
        with self._lock:
            record = self._records.get(match_id)
            return (record.get("owner_id", "local"), bool(record.get("is_sample"))) if record else None

    def get(self, match_id: str) -> dict[str, Any] | None:
        with self._lock:
            record = self._records.get(match_id)
            # Replay blobs are fetched one round at a time through
            # get_round_replay; metadata reads must not clone an entire demo.
            return copy.deepcopy({k: v for k, v in record.items() if k != "round_replays"}) if record else None

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
