"""Stores the doc 29 roadmap features add next to the analysis tables.

Same SQLite file as ``AnalysisRepository`` (``matches.db``), separate tables:

- ``bookmarks``: a time in a round with a note (A10, R08)
- ``plan_items`` / ``plan_ticks``: the Coach page practice plan and what was ticked off (R09)
- ``dataset_reviews``: Accept / Edit / Reject on fine-tuning examples (R11, T51)
- ``knowledge_flags``: passages marked wrong from the Knowledge tab (R12)
- ``review_versions``: a match's moments and explanations kept before a re-run (R13)
- ``ab_ratings``: blind A/B ratings of two models' answers to the same question (R10)

Detector labels and human moment picks are files in ``data/labels/`` (T17
format), not rows, so they can be committed; see ``services/labels.py``.
"""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

SCHEMA = """
CREATE TABLE IF NOT EXISTS bookmarks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    t REAL NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bookmarks_by_match ON bookmarks (match_id, round, t);
CREATE TABLE IF NOT EXISTS plans (
    player_id TEXT NOT NULL,
    lang TEXT NOT NULL,
    created_at TEXT NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (player_id, lang)
);
CREATE TABLE IF NOT EXISTS plan_ticks (
    player_id TEXT NOT NULL,
    detector TEXT NOT NULL,
    ticked_at TEXT NOT NULL,
    PRIMARY KEY (player_id, detector)
);
CREATE TABLE IF NOT EXISTS dataset_reviews (
    example_id TEXT PRIMARY KEY,
    verdict TEXT NOT NULL,
    text TEXT,
    reviewer TEXT,
    reviewed_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_flags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    passage_id TEXT NOT NULL,
    note TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS review_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    model TEXT NOT NULL,
    created_at TEXT NOT NULL,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS ab_ratings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    a TEXT NOT NULL,
    b TEXT NOT NULL,
    winner TEXT NOT NULL,
    rater TEXT,
    created_at TEXT NOT NULL
);
"""


def _now() -> str:
    return datetime.now(UTC).isoformat()


class ExtrasRepository:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._lock = threading.Lock()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    # --- bookmarks ---

    def bookmarks(self, match_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, round, t, note, created_at FROM bookmarks WHERE match_id = ? ORDER BY round, t, id",
                (match_id,),
            ).fetchall()
        return [{"id": f"b{i}", "round": r, "t": t, "note": n, "createdAt": c} for i, r, t, n, c in rows]

    def add_bookmark(self, match_id: str, round_no: int, t: float, note: str) -> dict[str, Any]:
        with self._lock, self._connect() as conn:
            cur = conn.execute(
                "INSERT INTO bookmarks (match_id, round, t, note, created_at) VALUES (?, ?, ?, ?, ?)",
                (match_id, round_no, round(t, 2), note, _now()),
            )
            bid = cur.lastrowid
        return next(b for b in self.bookmarks(match_id) if b["id"] == f"b{bid}")

    def delete_bookmark(self, match_id: str, bookmark_id: str) -> bool:
        if not bookmark_id.startswith("b") or not bookmark_id[1:].isdigit():
            return False
        with self._lock, self._connect() as conn:
            cur = conn.execute("DELETE FROM bookmarks WHERE match_id = ? AND id = ?", (match_id, int(bookmark_id[1:])))
        return cur.rowcount > 0

    def all_bookmarks(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT match_id, round, t, note FROM bookmarks ORDER BY match_id, round, t").fetchall()
        return [{"matchId": m, "round": r, "t": t, "note": n} for m, r, t, n in rows]

    # --- practice plan ---

    def plan(self, player_id: str, lang: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            row = conn.execute("SELECT json FROM plans WHERE player_id = ? AND lang = ?", (player_id, lang)).fetchone()
        return json.loads(row[0]) if row else None

    def save_plan(self, player_id: str, lang: str, plan: dict[str, Any]) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO plans VALUES (?, ?, ?, ?) ON CONFLICT(player_id, lang) DO UPDATE SET "
                "created_at = excluded.created_at, json = excluded.json",
                (player_id, lang, _now(), json.dumps(plan, ensure_ascii=False)),
            )

    def ticks(self, player_id: str) -> dict[str, str]:
        with self._connect() as conn:
            rows = conn.execute("SELECT detector, ticked_at FROM plan_ticks WHERE player_id = ?", (player_id,)).fetchall()
        return dict(rows)

    def set_tick(self, player_id: str, detector: str, done: bool) -> None:
        with self._lock, self._connect() as conn:
            if done:
                conn.execute("INSERT OR REPLACE INTO plan_ticks VALUES (?, ?, ?)", (player_id, detector, _now()))
            else:
                conn.execute("DELETE FROM plan_ticks WHERE player_id = ? AND detector = ?", (player_id, detector))

    # --- fine-tuning dataset review ---

    def dataset_reviews(self) -> dict[str, dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT example_id, verdict, text, reviewer, reviewed_at FROM dataset_reviews").fetchall()
        return {e: {"verdict": v, "text": t, "reviewer": r, "reviewedAt": at} for e, v, t, r, at in rows}

    def review_example(self, example_id: str, verdict: str, text: str | None, reviewer: str | None) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT OR REPLACE INTO dataset_reviews VALUES (?, ?, ?, ?, ?)",
                (example_id, verdict, text, reviewer, _now()),
            )

    # --- knowledge flags ---

    def flag_passage(self, passage_id: str, note: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO knowledge_flags (passage_id, note, created_at) VALUES (?, ?, ?)", (passage_id, note, _now())
            )

    def passage_flags(self) -> dict[str, list[str]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT passage_id, note FROM knowledge_flags ORDER BY id").fetchall()
        out: dict[str, list[str]] = {}
        for pid, note in rows:
            out.setdefault(pid, []).append(note)
        return out

    def flags(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT id, passage_id, note, created_at FROM knowledge_flags ORDER BY id DESC").fetchall()
        return [{"id": i, "passageId": p, "note": n, "createdAt": c} for i, p, n, c in rows]

    def resolve_flag(self, flag_id: int) -> bool:
        with self._lock, self._connect() as conn:
            return conn.execute("DELETE FROM knowledge_flags WHERE id = ?", (flag_id,)).rowcount > 0

    def forget_match(self, match_id: str) -> None:
        """Rows of a deleted match."""
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM bookmarks WHERE match_id = ?", (match_id,))
            conn.execute("DELETE FROM review_versions WHERE match_id = ?", (match_id,))

    def version(self, match_id: str, version_id: str) -> dict[str, Any] | None:
        if not version_id.startswith("v") or not version_id[1:].isdigit():
            return None
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, player_id, model, created_at, json FROM review_versions WHERE match_id = ? AND id = ?",
                (match_id, int(version_id[1:])),
            ).fetchone()
        if not row:
            return None
        i, pid, m, c, j = row
        return {"id": f"v{i}", "playerId": pid, "model": m, "createdAt": c, **json.loads(j)}

    # --- review versions ---

    def save_version(self, match_id: str, player_id: str, model: str, body: dict[str, Any]) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO review_versions (match_id, player_id, model, created_at, json) VALUES (?, ?, ?, ?, ?)",
                (match_id, player_id, model, _now(), json.dumps(body, ensure_ascii=False)),
            )

    def versions(self, match_id: str, player_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, model, created_at, json FROM review_versions WHERE match_id = ? AND player_id = ? ORDER BY id",
                (match_id, player_id),
            ).fetchall()
        return [{"id": f"v{i}", "model": m, "createdAt": c, **json.loads(j)} for i, m, c, j in rows]

    # --- blind A/B ratings ---

    def add_rating(self, a: str, b: str, winner: str, rater: str | None) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO ab_ratings (a, b, winner, rater, created_at) VALUES (?, ?, ?, ?, ?)",
                (a, b, winner, rater, _now()),
            )

    def ratings(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT a, b, winner, rater FROM ab_ratings ORDER BY id").fetchall()
        return [{"a": a, "b": b, "winner": w, "rater": r} for a, b, w, r in rows]


_cache: dict[Path, ExtrasRepository] = {}


def extras() -> ExtrasRepository:
    """The store next to the current analysis DB (tests swap ``repo.analysis``, so key by path)."""
    from app.repositories.matches import repo

    path = Path(repo.analysis.db_path)
    if path not in _cache:
        _cache[path] = ExtrasRepository(path)
    return _cache[path]
