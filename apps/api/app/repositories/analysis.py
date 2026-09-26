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

from app.models.contracts import Finding, PlayerAnalysis, RoundStats, SelectedMoment

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
"""


class AnalysisRepository:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._lock = threading.Lock()
        with self._connect() as conn:
            conn.executescript(SCHEMA)

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

    def has_analysis(self, match_id: str, player_id: str) -> bool:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT 1 FROM round_stats WHERE match_id = ? AND player_id = ? LIMIT 1",
                (match_id, player_id),
            ).fetchone()
        return row is not None
