"""SQLite storage for coach analysis: chosen player, findings, round stats, moments.

Shares ``matches.db`` with the match repository. Rows keep the full contract
as JSON plus the columns the tools filter on (round, kind, detector).
"""

from __future__ import annotations

import json
import sqlite3
import threading
from datetime import datetime, timezone
from pathlib import Path

from app.models.contracts import Finding, MomentExplanation, PlayerAnalysis, RoundStats, SelectedMoment

SCHEMA = """
CREATE TABLE IF NOT EXISTS match_players (
    match_id TEXT PRIMARY KEY,
    player_id TEXT NOT NULL,
    selected_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS findings (
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    finding_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    t REAL NOT NULL,
    kind TEXT NOT NULL,
    detector TEXT NOT NULL,
    severity REAL NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (match_id, player_id, finding_id)
);
CREATE INDEX IF NOT EXISTS findings_by_round ON findings (match_id, player_id, round);
CREATE TABLE IF NOT EXISTS round_stats (
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (match_id, player_id, round)
);
CREATE TABLE IF NOT EXISTS moments (
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    moment_id TEXT NOT NULL,
    source TEXT NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (match_id, player_id, moment_id)
);
CREATE TABLE IF NOT EXISTS explanations (
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    target TEXT NOT NULL,
    lang TEXT NOT NULL,
    json TEXT NOT NULL,
    PRIMARY KEY (match_id, player_id, target, lang)
);
CREATE TABLE IF NOT EXISTS clip_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    player_id TEXT NOT NULL,
    round INTEGER NOT NULL,
    t0 REAL NOT NULL,
    t1 REAL NOT NULL,
    status TEXT NOT NULL,
    created_at TEXT NOT NULL,
    UNIQUE (match_id, player_id, round, t0, t1)
);
"""
# Columns added after the first databases were created (added on open)
CLIP_JOB_COLUMNS = {"moment_id": "TEXT", "error": "TEXT"}


class AnalysisRepository:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._lock = threading.Lock()
        with self._connect() as conn:
            conn.executescript(SCHEMA)
            have = {row[1] for row in conn.execute("PRAGMA table_info(clip_jobs)")}
            for name, kind in CLIP_JOB_COLUMNS.items():
                if name not in have:
                    conn.execute(f"ALTER TABLE clip_jobs ADD COLUMN {name} {kind}")

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    # --- chosen player ---

    def set_player(self, match_id: str, player_id: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO match_players (match_id, player_id, selected_at) VALUES (?, ?, ?)
                ON CONFLICT(match_id) DO UPDATE SET player_id=excluded.player_id, selected_at=excluded.selected_at
                """,
                (match_id, player_id, datetime.now(timezone.utc).isoformat()),
            )

    def get_player(self, match_id: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute("SELECT player_id FROM match_players WHERE match_id = ?", (match_id,)).fetchone()
        return row[0] if row else None

    # --- analysis ---

    def save(self, analysis: PlayerAnalysis) -> None:
        mid, pid = analysis.match_id, analysis.player_id
        with self._lock, self._connect() as conn:
            for table in ("findings", "round_stats", "moments"):
                conn.execute(f"DELETE FROM {table} WHERE match_id = ? AND player_id = ?", (mid, pid))
            conn.executemany(
                "INSERT INTO findings VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (mid, pid, f.id, f.round, f.t, f.kind, f.detector, f.severity, f.model_dump_json(by_alias=True))
                    for f in analysis.findings
                ],
            )
            conn.executemany(
                "INSERT INTO round_stats VALUES (?, ?, ?, ?)",
                [(mid, pid, s.round, s.model_dump_json(by_alias=True)) for s in analysis.round_stats],
            )
            conn.executemany(
                "INSERT INTO moments VALUES (?, ?, ?, ?, ?)",
                [(mid, pid, m.id, m.source, m.model_dump_json(by_alias=True)) for m in analysis.moments],
            )

    def findings(
        self,
        match_id: str,
        player_id: str,
        *,
        round_no: int | None = None,
        kind: str | None = None,
        detector: str | None = None,
    ) -> list[Finding]:
        sql = "SELECT json FROM findings WHERE match_id = ? AND player_id = ?"
        args: list[object] = [match_id, player_id]
        for col, val in (("round", round_no), ("kind", kind), ("detector", detector)):
            if val is not None:
                sql += f" AND {col} = ?"
                args.append(val)
        sql += " ORDER BY round, t, finding_id"
        with self._connect() as conn:
            rows = conn.execute(sql, args).fetchall()
        return [Finding.model_validate(json.loads(r[0])) for r in rows]

    def round_stats(self, match_id: str, player_id: str) -> list[RoundStats]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT json FROM round_stats WHERE match_id = ? AND player_id = ? ORDER BY round",
                (match_id, player_id),
            ).fetchall()
        return [RoundStats.model_validate(json.loads(r[0])) for r in rows]

    def moments(self, match_id: str, player_id: str) -> list[SelectedMoment]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT json FROM moments WHERE match_id = ? AND player_id = ?",
                (match_id, player_id),
            ).fetchall()
        moments = [SelectedMoment.model_validate(json.loads(r[0])) for r in rows]
        return sorted(moments, key=lambda m: int(m.id.lstrip("m") or 0))

    def replace_moments(self, match_id: str, player_id: str, moments: list[SelectedMoment]) -> None:
        """Swap the stored moments (the agent's picks replace the ranker's)."""
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM moments WHERE match_id = ? AND player_id = ?", (match_id, player_id))
            conn.executemany(
                "INSERT INTO moments VALUES (?, ?, ?, ?, ?)",
                [(match_id, player_id, m.id, m.source, m.model_dump_json(by_alias=True)) for m in moments],
            )
            # Explanations belong to the old picks
            conn.execute(
                "DELETE FROM explanations WHERE match_id = ? AND player_id = ? AND target LIKE 'm%'",
                (match_id, player_id),
            )

    # --- explanations (moment "m3" or round "r12") ---

    def save_explanation(self, match_id: str, player_id: str, explanation: MomentExplanation) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO explanations VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(match_id, player_id, target, lang) DO UPDATE SET json=excluded.json
                """,
                (match_id, player_id, explanation.target, explanation.lang, explanation.model_dump_json(by_alias=True)),
            )

    def explanation(self, match_id: str, player_id: str, target: str, lang: str) -> MomentExplanation | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT json FROM explanations WHERE match_id = ? AND player_id = ? AND target = ? AND lang = ?",
                (match_id, player_id, target, lang),
            ).fetchone()
        return MomentExplanation.model_validate(json.loads(row[0])) if row else None

    # --- clip jobs (CS Demo Manager recorder, T40) ---

    def queue_clip(
        self, match_id: str, player_id: str, round_no: int, t0: float, t1: float, *, moment_id: str | None = None
    ) -> dict:
        """Queue a clip once per window; returns ``{clipJobId, status, round, t0, t1}``."""
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT OR IGNORE INTO clip_jobs (match_id, player_id, round, t0, t1, status, created_at, moment_id) "
                "VALUES (?, ?, ?, ?, ?, 'queued', ?, ?)",
                (match_id, player_id, round_no, t0, t1, datetime.now(timezone.utc).isoformat(), moment_id),
            )
            if moment_id:
                # The same window may have been queued by the agent first
                conn.execute(
                    "UPDATE clip_jobs SET moment_id = ? WHERE match_id = ? AND player_id = ? AND round = ? "
                    "AND t0 = ? AND t1 = ? AND moment_id IS NULL",
                    (moment_id, match_id, player_id, round_no, t0, t1),
                )
            row = conn.execute(
                "SELECT id, status FROM clip_jobs WHERE match_id = ? AND player_id = ? AND round = ? AND t0 = ? AND t1 = ?",
                (match_id, player_id, round_no, t0, t1),
            ).fetchone()
        return {"clipJobId": f"c{row[0]}", "status": row[1], "round": round_no, "t0": t0, "t1": t1}

    def clip_jobs(self, match_id: str, player_id: str) -> list[dict]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, round, t0, t1, status, moment_id, error FROM clip_jobs "
                "WHERE match_id = ? AND player_id = ? ORDER BY id",
                (match_id, player_id),
            ).fetchall()
        return [
            {"clipJobId": f"c{i}", "round": r, "t0": t0, "t1": t1, "status": st, "momentId": mom, "error": err}
            for i, r, t0, t1, st, mom, err in rows
        ]

    def unlink_moment_clips(self, match_id: str, player_id: str) -> None:
        """Forget which moment each clip belonged to (before a new moment selection)."""
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE clip_jobs SET moment_id = NULL WHERE match_id = ? AND player_id = ?", (match_id, player_id)
            )

    def set_clip_status(self, clip_job_id: str, status: str, error: str | None = None) -> None:
        with self._lock, self._connect() as conn:
            conn.execute(
                "UPDATE clip_jobs SET status = ?, error = ? WHERE id = ?",
                (status, error, int(clip_job_id.lstrip("c"))),
            )

    # --- player history across matches ---

    def player_history(self, player_id: str, *, exclude_match_id: str | None = None) -> list[dict]:
        """Per match: rounds played and finding counts per detector, oldest first."""
        with self._connect() as conn:
            rounds = conn.execute(
                "SELECT match_id, COUNT(*), MIN(rowid) FROM round_stats WHERE player_id = ? GROUP BY match_id",
                (player_id,),
            ).fetchall()
            counts = conn.execute(
                "SELECT match_id, detector, COUNT(*) FROM findings WHERE player_id = ? GROUP BY match_id, detector",
                (player_id,),
            ).fetchall()
        per_match: dict[str, dict[str, int]] = {}
        for mid, detector, n in counts:
            per_match.setdefault(mid, {})[detector] = n
        return [
            {"matchId": mid, "rounds": n_rounds, "counts": per_match.get(mid, {})}
            for mid, n_rounds, _order in sorted(rounds, key=lambda r: r[2])
            if mid != exclude_match_id
        ]

    def coached_players(self) -> list[tuple[str, list[str]]]:
        """Every player with analysis, and their analysed match ids (oldest first)."""
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT player_id, match_id, MIN(rowid) FROM round_stats GROUP BY player_id, match_id ORDER BY MIN(rowid)"
            ).fetchall()
        out: dict[str, list[str]] = {}
        for pid, mid, _order in rows:
            out.setdefault(pid, []).append(mid)
        return list(out.items())

    def has_analysis(self, match_id: str, player_id: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM round_stats WHERE match_id = ? AND player_id = ? LIMIT 1",
                (match_id, player_id),
            ).fetchone()
        return row is not None
