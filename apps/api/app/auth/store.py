"""Accounts, ownership and admin records (docs 27 §10 and 30 §5.3).

Same SQLite file as ``AnalysisRepository`` (``matches.db``), separate tables.
Secrets (session tokens, invite codes, API tokens, reset codes) are stored
as SHA-256 hashes only; passwords as Argon2id hashes.
"""

from __future__ import annotations

import hashlib
import json
import secrets
import sqlite3
import threading
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

ROLES = ("admin", "labeller", "player")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    display_name TEXT NOT NULL,
    avatar_url TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'labeller', 'player')),
    password_hash TEXT,
    created_at TEXT NOT NULL,
    disabled_at TEXT,
    consented_at TEXT,
    last_seen_at TEXT
);
CREATE TABLE IF NOT EXISTS identities (
    user_id TEXT NOT NULL,
    provider TEXT NOT NULL,
    subject TEXT NOT NULL,
    created_at TEXT NOT NULL,
    PRIMARY KEY (provider, subject)
);
CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    user_agent TEXT,
    ip TEXT
);
CREATE TABLE IF NOT EXISTS user_settings (
    user_id TEXT PRIMARY KEY,
    json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS invites (
    code_hash TEXT PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    hint TEXT NOT NULL,
    role TEXT NOT NULL,
    created_by TEXT,
    created_at TEXT NOT NULL,
    expires_at TEXT,
    used_by TEXT,
    used_at TEXT,
    revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS reset_codes (
    code_hash TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT NOT NULL,
    at TEXT NOT NULL,
    ok INTEGER NOT NULL,
    ip TEXT
);
CREATE INDEX IF NOT EXISTS login_attempts_by_key ON login_attempts (key, at);
CREATE TABLE IF NOT EXISTS match_owners (
    match_id TEXT PRIMARY KEY,
    owner_id TEXT NOT NULL,
    title TEXT
);
CREATE INDEX IF NOT EXISTS match_owners_by_owner ON match_owners (owner_id);
CREATE TABLE IF NOT EXISTS review_progress (
    user_id TEXT NOT NULL,
    match_id TEXT NOT NULL,
    moment_id TEXT NOT NULL,
    seen_at TEXT NOT NULL,
    last_t REAL,
    PRIMARY KEY (user_id, match_id, moment_id)
);
CREATE TABLE IF NOT EXISTS ask_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    match_id TEXT,
    player_id TEXT NOT NULL,
    question TEXT NOT NULL,
    answer TEXT,
    citations_json TEXT,
    source TEXT,
    lang TEXT,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS ask_messages_by_match ON ask_messages (user_id, match_id);
CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    match_id TEXT NOT NULL,
    target TEXT NOT NULL,
    kind TEXT NOT NULL,
    verdict TEXT NOT NULL,
    note TEXT,
    created_at TEXT NOT NULL,
    UNIQUE (user_id, match_id, target, kind)
);
CREATE TABLE IF NOT EXISTS share_links (
    token_hash TEXT PRIMARY KEY,
    match_id TEXT NOT NULL,
    created_by TEXT NOT NULL,
    created_at TEXT NOT NULL,
    revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS api_tokens (
    token_hash TEXT PRIMARY KEY,
    id TEXT NOT NULL UNIQUE,
    name TEXT NOT NULL,
    scope TEXT NOT NULL CHECK (scope IN ('read', 'write')),
    user_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    last_used_at TEXT,
    revoked_at TEXT
);
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value_json TEXT NOT NULL,
    updated_by TEXT,
    updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS audit_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at TEXT NOT NULL,
    actor_id TEXT,
    action TEXT NOT NULL,
    target TEXT,
    detail_json TEXT,
    ip TEXT
);
"""


def now() -> datetime:
    return datetime.now(UTC)


def iso(dt: datetime | None = None) -> str:
    return (dt or now()).isoformat()


def digest(secret: str) -> str:
    return hashlib.sha256(secret.encode("utf-8")).hexdigest()


def new_id(prefix: str) -> str:
    return f"{prefix}_{secrets.token_hex(8)}"


USER_COLUMNS = "id, username, display_name, avatar_url, role, password_hash, created_at, disabled_at, consented_at, last_seen_at"


def _user(row: tuple | None) -> dict[str, Any] | None:
    if row is None:
        return None
    keys = [c.strip() for c in USER_COLUMNS.split(",")]
    return dict(zip(keys, row, strict=True))


class UserStore:
    def __init__(self, db_path: Path) -> None:
        self.db_path = db_path
        self._lock = threading.Lock()
        db_path.parent.mkdir(parents=True, exist_ok=True)
        with self._connect() as conn:
            conn.executescript(SCHEMA)

    def _connect(self) -> sqlite3.Connection:
        return sqlite3.connect(self.db_path)

    # --- users ---------------------------------------------------------------

    def count_users(self) -> int:
        with self._connect() as conn:
            return conn.execute("SELECT COUNT(*) FROM users").fetchone()[0]

    def create_user(
        self,
        *,
        display_name: str,
        role: str,
        username: str | None = None,
        password_hash: str | None = None,
        avatar_url: str | None = None,
    ) -> dict[str, Any]:
        if role not in ROLES:
            raise ValueError("Unknown role.")
        uid = new_id("u")
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO users (id, username, display_name, avatar_url, role, password_hash, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?)",
                (uid, username, display_name, avatar_url, role, password_hash, iso()),
            )
            first = conn.execute("SELECT COUNT(*) FROM users").fetchone()[0] == 1
            if first:
                # The first account takes over everything made before accounts existed
                conn.execute("UPDATE match_owners SET owner_id = ? WHERE owner_id = 'local'", (uid,))
        return self.user(uid)  # type: ignore[return-value]

    def user(self, user_id: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            return _user(conn.execute(f"SELECT {USER_COLUMNS} FROM users WHERE id = ?", (user_id,)).fetchone())

    def user_by_username(self, username: str) -> dict[str, Any] | None:
        with self._connect() as conn:
            return _user(
                conn.execute(
                    f"SELECT {USER_COLUMNS} FROM users WHERE username = ? COLLATE NOCASE", (username,)
                ).fetchone()
            )

    def users(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(f"SELECT {USER_COLUMNS} FROM users ORDER BY created_at").fetchall()
        return [_user(r) for r in rows]  # type: ignore[misc]

    def first_admin_id(self) -> str | None:
        with self._connect() as conn:
            row = conn.execute("SELECT id FROM users WHERE role = 'admin' ORDER BY created_at LIMIT 1").fetchone()
        return row[0] if row else None

    def admin_count(self) -> int:
        with self._connect() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM users WHERE role = 'admin' AND disabled_at IS NULL"
            ).fetchone()[0]

    def update_user(self, user_id: str, **fields: Any) -> dict[str, Any] | None:
        allowed = {"display_name", "role", "password_hash", "disabled_at", "consented_at", "avatar_url", "username"}
        sets = {k: v for k, v in fields.items() if k in allowed}
        if sets:
            cols = ", ".join(f"{k} = ?" for k in sets)
            with self._lock, self._connect() as conn:
                conn.execute(f"UPDATE users SET {cols} WHERE id = ?", (*sets.values(), user_id))
        return self.user(user_id)

    def touch_user(self, user_id: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (iso(), user_id))

    def delete_user(self, user_id: str) -> None:
        with self._lock, self._connect() as conn:
            for table in ("identities", "sessions", "user_settings", "review_progress", "ask_messages", "feedback", "api_tokens", "reset_codes"):
                conn.execute(f"DELETE FROM {table} WHERE user_id = ?", (user_id,))
            conn.execute("DELETE FROM share_links WHERE created_by = ?", (user_id,))
            conn.execute("DELETE FROM users WHERE id = ?", (user_id,))

    # --- identities (Steam) --------------------------------------------------

    def identity_user(self, provider: str, subject: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT user_id FROM identities WHERE provider = ? AND subject = ?", (provider, subject)
            ).fetchone()
        return row[0] if row else None

    def link_identity(self, user_id: str, provider: str, subject: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM identities WHERE user_id = ? AND provider = ?", (user_id, provider))
            conn.execute(
                "INSERT INTO identities (user_id, provider, subject, created_at) VALUES (?, ?, ?, ?)",
                (user_id, provider, subject, iso()),
            )

    def unlink_identity(self, user_id: str, provider: str) -> None:
        with self._lock, self._connect() as conn:
            conn.execute("DELETE FROM identities WHERE user_id = ? AND provider = ?", (user_id, provider))

    def steam_id(self, user_id: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT subject FROM identities WHERE user_id = ? AND provider = 'steam'", (user_id,)
            ).fetchone()
        return row[0] if row else None

    # --- sessions ------------------------------------------------------------

    def create_session(self, user_id: str, days: int, user_agent: str | None, ip: str | None) -> str:
        token = secrets.token_urlsafe(32)
        with self._lock, self._connect() as conn:
            conn.execute(
                "INSERT INTO sessions (token_hash, id, user_id, created_at, last_seen_at, expires_at, user_agent, ip)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
                (digest(token), new_id("s"), user_id, iso(), iso(), iso(now() + timedelta(days=days)), (user_agent or "")[:200], ip),
            )
            conn.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (iso(), user_id))
        return token

    def session_user(self, token: str) -> tuple[dict[str, Any], str] | None:
        """(user, session id) for a live session; bumps last_seen at most once a minute."""
        h = digest(token)
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, user_id, expires_at, last_seen_at FROM sessions WHERE token_hash = ?", (h,)
            ).fetchone()
            if row is None:
                return None
            sid, uid, expires, seen = row
            if datetime.fromisoformat(expires) <= now():
                conn.execute("DELETE FROM sessions WHERE token_hash = ?", (h,))
                return None
            if now() - datetime.fromisoformat(seen) > timedelta(minutes=1):
                conn.execute("UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?", (iso(), h))
                conn.execute("UPDATE users SET last_seen_at = ? WHERE id = ?", (iso(), uid))
        user = self.user(uid)
        if user is None or user["disabled_at"]:
            return None
        return user, sid

    def delete_session_token(self, token: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM sessions WHERE token_hash = ?", (digest(token),))

    def sessions(self, user_id: str | None = None) -> list[dict[str, Any]]:
        q = "SELECT id, user_id, created_at, last_seen_at, expires_at, user_agent, ip FROM sessions"
        args: tuple = ()
        if user_id:
            q += " WHERE user_id = ?"
            args = (user_id,)
        with self._connect() as conn:
            rows = conn.execute(q + " ORDER BY last_seen_at DESC", args).fetchall()
        keys = ["id", "userId", "createdAt", "lastSeenAt", "expiresAt", "userAgent", "ip"]
        return [dict(zip(keys, r, strict=True)) for r in rows]

    def delete_session(self, session_id: str, user_id: str | None = None) -> bool:
        q, args = "DELETE FROM sessions WHERE id = ?", [session_id]
        if user_id:
            q += " AND user_id = ?"
            args.append(user_id)
        with self._connect() as conn:
            return conn.execute(q, args).rowcount > 0

    def delete_sessions_of(self, user_id: str, keep: str | None = None) -> int:
        with self._connect() as conn:
            return conn.execute("DELETE FROM sessions WHERE user_id = ? AND id IS NOT ?", (user_id, keep)).rowcount

    # --- login attempts ------------------------------------------------------

    def record_login(self, key: str, ok: bool, ip: str | None) -> None:
        with self._connect() as conn:
            conn.execute("INSERT INTO login_attempts (key, at, ok, ip) VALUES (?, ?, ?, ?)", (key, iso(), int(ok), ip))
            conn.execute("DELETE FROM login_attempts WHERE at < ?", (iso(now() - timedelta(days=7)),))

    def recent_failures(self, key: str, minutes: int = 15) -> int:
        with self._connect() as conn:
            return conn.execute(
                "SELECT COUNT(*) FROM login_attempts WHERE key = ? AND ok = 0 AND at >= ?",
                (key, iso(now() - timedelta(minutes=minutes))),
            ).fetchone()[0]

    def failed_logins(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT key, at, ip FROM login_attempts WHERE ok = 0 ORDER BY at DESC LIMIT ?", (limit,)
            ).fetchall()
        return [{"username": k, "at": a, "ip": ip} for k, a, ip in rows]

    # --- settings per user ---------------------------------------------------

    def user_settings(self, user_id: str) -> dict[str, Any]:
        with self._connect() as conn:
            row = conn.execute("SELECT json FROM user_settings WHERE user_id = ?", (user_id,)).fetchone()
        return json.loads(row[0]) if row else {}

    def save_user_settings(self, user_id: str, values: dict[str, Any]) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO user_settings (user_id, json) VALUES (?, ?)"
                " ON CONFLICT(user_id) DO UPDATE SET json = excluded.json",
                (user_id, json.dumps(values)),
            )

    # --- invites and reset codes ---------------------------------------------

    def create_invite(self, created_by: str | None, role: str, days: int | None) -> tuple[str, dict[str, Any]]:
        code = "-".join(secrets.token_hex(2).upper() for _ in range(3))
        iid = new_id("i")
        expires = iso(now() + timedelta(days=days)) if days else None
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO invites (code_hash, id, hint, role, created_by, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
                (digest(code), iid, code[-4:], role, created_by, iso(), expires),
            )
        return code, next(i for i in self.invites() if i["id"] == iid)

    def invites(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, hint, role, created_by, created_at, expires_at, used_by, used_at, revoked_at FROM invites ORDER BY created_at DESC"
            ).fetchall()
        keys = ["id", "hint", "role", "createdBy", "createdAt", "expiresAt", "usedBy", "usedAt", "revokedAt"]
        return [dict(zip(keys, r, strict=True)) for r in rows]

    def check_invite(self, code: str) -> dict[str, Any] | None:
        """The invite if the code is live (unused, not revoked, not expired)."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, role, expires_at, used_by, revoked_at FROM invites WHERE code_hash = ?",
                (digest(code.strip().upper()),),
            ).fetchone()
        if not row:
            return None
        iid, role, expires, used_by, revoked = row
        if used_by or revoked or (expires and datetime.fromisoformat(expires) <= now()):
            return None
        return {"id": iid, "role": role}

    def use_invite(self, invite_id: str, user_id: str) -> None:
        with self._connect() as conn:
            conn.execute("UPDATE invites SET used_by = ?, used_at = ? WHERE id = ?", (user_id, iso(), invite_id))

    def revoke_invite(self, invite_id: str) -> bool:
        with self._connect() as conn:
            return conn.execute(
                "UPDATE invites SET revoked_at = ? WHERE id = ? AND used_by IS NULL AND revoked_at IS NULL",
                (iso(), invite_id),
            ).rowcount > 0

    def create_reset_code(self, user_id: str, hours: int = 24) -> str:
        code = secrets.token_urlsafe(18)
        with self._connect() as conn:
            conn.execute("DELETE FROM reset_codes WHERE user_id = ?", (user_id,))
            conn.execute(
                "INSERT INTO reset_codes (code_hash, user_id, expires_at) VALUES (?, ?, ?)",
                (digest(code), user_id, iso(now() + timedelta(hours=hours))),
            )
        return code

    def use_reset_code(self, code: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT user_id, expires_at FROM reset_codes WHERE code_hash = ?", (digest(code),)
            ).fetchone()
            if not row:
                return None
            conn.execute("DELETE FROM reset_codes WHERE code_hash = ?", (digest(code),))
        uid, expires = row
        return uid if datetime.fromisoformat(expires) > now() else None

    # --- match ownership -----------------------------------------------------

    def set_owner(self, match_id: str, owner_id: str) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO match_owners (match_id, owner_id) VALUES (?, ?)"
                " ON CONFLICT(match_id) DO UPDATE SET owner_id = excluded.owner_id",
                (match_id, owner_id),
            )

    def owner(self, match_id: str) -> str | None:
        """The owner; matches from before accounts belong to the first admin."""
        with self._connect() as conn:
            row = conn.execute("SELECT owner_id FROM match_owners WHERE match_id = ?", (match_id,)).fetchone()
        owner = row[0] if row else None
        if owner in (None, "local"):
            return self.first_admin_id() or "local"
        return owner

    def owners(self) -> dict[str, str]:
        with self._connect() as conn:
            return dict(conn.execute("SELECT match_id, owner_id FROM match_owners").fetchall())

    def titles(self) -> dict[str, str]:
        with self._connect() as conn:
            return dict(conn.execute("SELECT match_id, title FROM match_owners WHERE title IS NOT NULL").fetchall())

    def set_title(self, match_id: str, title: str | None) -> None:
        with self._connect() as conn:
            if not conn.execute("SELECT 1 FROM match_owners WHERE match_id = ?", (match_id,)).fetchone():
                conn.execute("INSERT INTO match_owners (match_id, owner_id) VALUES (?, 'local')", (match_id,))
            conn.execute("UPDATE match_owners SET title = ? WHERE match_id = ?", (title, match_id))

    def owned_match_ids(self, user_id: str, all_ids: list[str]) -> set[str]:
        return {mid for mid in all_ids if self.owner(mid) == user_id}

    def forget_match(self, match_id: str) -> None:
        with self._connect() as conn:
            for table in ("match_owners", "review_progress", "ask_messages", "feedback", "share_links"):
                conn.execute(f"DELETE FROM {table} WHERE match_id = ?", (match_id,))

    # --- review progress, Ask history, feedback ------------------------------

    def mark_seen(self, user_id: str, match_id: str, moment_id: str, t: float | None) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO review_progress (user_id, match_id, moment_id, seen_at, last_t) VALUES (?, ?, ?, ?, ?)"
                " ON CONFLICT(user_id, match_id, moment_id) DO UPDATE SET seen_at = excluded.seen_at,"
                " last_t = COALESCE(excluded.last_t, review_progress.last_t)",
                (user_id, match_id, moment_id, iso(), t),
            )

    def progress(self, user_id: str, match_id: str) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT moment_id, seen_at, last_t FROM review_progress WHERE user_id = ? AND match_id = ? ORDER BY seen_at",
                (user_id, match_id),
            ).fetchall()
        return [{"momentId": m, "seenAt": s, "lastT": t} for m, s, t in rows]

    def add_ask(self, user_id: str, match_id: str | None, player_id: str, question: str, answer: str | None,
                citations: list[str], source: str | None, lang: str | None) -> int:
        with self._connect() as conn:
            return conn.execute(
                "INSERT INTO ask_messages (user_id, match_id, player_id, question, answer, citations_json, source, lang, created_at)"
                " VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (user_id, match_id, player_id, question, answer, json.dumps(citations), source, lang, iso()),
            ).lastrowid or 0

    def asks(self, user_id: str | None = None, match_id: str | None = None, limit: int = 100) -> list[dict[str, Any]]:
        q = "SELECT id, user_id, match_id, player_id, question, answer, citations_json, source, lang, created_at FROM ask_messages WHERE 1=1"
        args: list[Any] = []
        if user_id:
            q += " AND user_id = ?"
            args.append(user_id)
        if match_id is not None:
            q += " AND match_id = ?"
            args.append(match_id)
        q += " ORDER BY id DESC LIMIT ?"
        args.append(limit)
        with self._connect() as conn:
            rows = conn.execute(q, args).fetchall()
        return [
            {"id": i, "userId": u, "matchId": m, "playerId": p, "question": qu, "answer": a,
             "citations": json.loads(c or "[]"), "source": s, "lang": lang, "createdAt": at}
            for i, u, m, p, qu, a, c, s, lang, at in reversed(rows)
        ]

    def set_feedback(self, user_id: str, match_id: str, target: str, kind: str, verdict: str, note: str | None) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO feedback (user_id, match_id, target, kind, verdict, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
                " ON CONFLICT(user_id, match_id, target, kind) DO UPDATE SET verdict = excluded.verdict,"
                " note = excluded.note, created_at = excluded.created_at",
                (user_id, match_id, target, kind, verdict, note, iso()),
            )

    def feedback(self, user_id: str | None = None, match_id: str | None = None) -> list[dict[str, Any]]:
        q = "SELECT id, user_id, match_id, target, kind, verdict, note, created_at FROM feedback WHERE 1=1"
        args: list[Any] = []
        if user_id:
            q += " AND user_id = ?"
            args.append(user_id)
        if match_id:
            q += " AND match_id = ?"
            args.append(match_id)
        with self._connect() as conn:
            rows = conn.execute(q + " ORDER BY id", args).fetchall()
        keys = ["id", "userId", "matchId", "target", "kind", "verdict", "note", "createdAt"]
        return [dict(zip(keys, r, strict=True)) for r in rows]

    # --- share links ---------------------------------------------------------

    def create_share(self, match_id: str, user_id: str) -> str:
        token = secrets.token_urlsafe(18)
        with self._connect() as conn:
            conn.execute(
                "UPDATE share_links SET revoked_at = ? WHERE match_id = ? AND revoked_at IS NULL", (iso(), match_id)
            )
            conn.execute(
                "INSERT INTO share_links (token_hash, match_id, created_by, created_at) VALUES (?, ?, ?, ?)",
                (digest(token), match_id, user_id, iso()),
            )
        return token

    def share_active(self, match_id: str) -> bool:
        with self._connect() as conn:
            return conn.execute(
                "SELECT 1 FROM share_links WHERE match_id = ? AND revoked_at IS NULL", (match_id,)
            ).fetchone() is not None

    def revoke_share(self, match_id: str) -> bool:
        with self._connect() as conn:
            return conn.execute(
                "UPDATE share_links SET revoked_at = ? WHERE match_id = ? AND revoked_at IS NULL", (iso(), match_id)
            ).rowcount > 0

    def shared_match(self, token: str) -> str | None:
        with self._connect() as conn:
            row = conn.execute(
                "SELECT match_id FROM share_links WHERE token_hash = ? AND revoked_at IS NULL", (digest(token),)
            ).fetchone()
        return row[0] if row else None

    # --- API tokens (MCP and other apps) -------------------------------------

    def create_token(self, user_id: str, name: str, scope: str) -> tuple[str, dict[str, Any]]:
        token = "rr_" + secrets.token_urlsafe(24)
        tid = new_id("t")
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO api_tokens (token_hash, id, name, scope, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?)",
                (digest(token), tid, name, scope, user_id, iso()),
            )
        return token, next(t for t in self.tokens() if t["id"] == tid)

    def tokens(self) -> list[dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute(
                "SELECT id, name, scope, user_id, created_at, last_used_at, revoked_at FROM api_tokens ORDER BY created_at DESC"
            ).fetchall()
        keys = ["id", "name", "scope", "userId", "createdAt", "lastUsedAt", "revokedAt"]
        return [dict(zip(keys, r, strict=True)) for r in rows]

    def token_user(self, token: str) -> tuple[dict[str, Any], str] | None:
        """(user, scope) for a live API token."""
        with self._connect() as conn:
            row = conn.execute(
                "SELECT user_id, scope FROM api_tokens WHERE token_hash = ? AND revoked_at IS NULL", (digest(token),)
            ).fetchone()
            if not row:
                return None
            conn.execute("UPDATE api_tokens SET last_used_at = ? WHERE token_hash = ?", (iso(), digest(token)))
        user = self.user(row[0])
        if user is None or user["disabled_at"]:
            return None
        return user, row[1]

    def revoke_token(self, token_id: str) -> bool:
        with self._connect() as conn:
            return conn.execute(
                "UPDATE api_tokens SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL", (iso(), token_id)
            ).rowcount > 0

    # --- runtime settings ----------------------------------------------------

    def app_settings(self) -> dict[str, dict[str, Any]]:
        with self._connect() as conn:
            rows = conn.execute("SELECT key, value_json, updated_by, updated_at FROM app_settings").fetchall()
        return {k: {"value": json.loads(v), "updatedBy": by, "updatedAt": at} for k, v, by, at in rows}

    def set_app_setting(self, key: str, value: Any, user_id: str | None) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO app_settings (key, value_json, updated_by, updated_at) VALUES (?, ?, ?, ?)"
                " ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json,"
                " updated_by = excluded.updated_by, updated_at = excluded.updated_at",
                (key, json.dumps(value), user_id, iso()),
            )

    def clear_app_setting(self, key: str) -> None:
        with self._connect() as conn:
            conn.execute("DELETE FROM app_settings WHERE key = ?", (key,))

    # --- audit log -----------------------------------------------------------

    def audit(self, actor_id: str | None, action: str, target: str | None = None,
              detail: dict[str, Any] | None = None, ip: str | None = None) -> None:
        with self._connect() as conn:
            conn.execute(
                "INSERT INTO audit_log (at, actor_id, action, target, detail_json, ip) VALUES (?, ?, ?, ?, ?, ?)",
                (iso(), actor_id, action, target, json.dumps(detail) if detail else None, ip),
            )

    def audit_rows(self, *, action: str | None = None, limit: int = 100, offset: int = 0) -> tuple[int, list[dict[str, Any]]]:
        where, args = "", []
        if action:
            where = " WHERE action LIKE ?"
            args.append(f"{action}%")
        with self._connect() as conn:
            total = conn.execute(f"SELECT COUNT(*) FROM audit_log{where}", args).fetchone()[0]
            rows = conn.execute(
                f"SELECT id, at, actor_id, action, target, detail_json, ip FROM audit_log{where} ORDER BY id DESC LIMIT ? OFFSET ?",
                (*args, limit, offset),
            ).fetchall()
            names = dict(conn.execute("SELECT id, display_name FROM users").fetchall())
        names["local"] = "You"
        return total, [
            {"id": i, "at": at, "actorId": a, "actorName": names.get(a), "action": act, "target": t,
             "targetName": names.get(t), "detail": json.loads(d) if d else None, "ip": ip}
            for i, at, a, act, t, d, ip in rows
        ]


_cache: dict[Path, UserStore] = {}


def users() -> UserStore:
    """The store next to the current analysis DB (tests swap ``repo.analysis``, so key by path)."""
    from app.repositories.matches import repo

    path = Path(repo.analysis.db_path)
    if path not in _cache:
        _cache[path] = UserStore(path)
    return _cache[path]
