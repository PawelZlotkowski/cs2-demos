"""Hybrid knowledge index in SQLite (plan §7): FTS5 BM25, plus dense vectors
when a local embedding server is configured, fused by reciprocal rank.

- Sparse: SQLite FTS5 (``bm25``), always on, no extra service.
- Dense: optional. Set ``RR_EMBED_URL`` to an OpenAI-compatible
  ``/v1/embeddings`` endpoint (llama.cpp ``--embedding`` with bge-m3). Vectors
  are stored as JSON and compared in Python; a few hundred passages do not
  need sqlite-vec yet.

Re-index: ``python -m app.rag.index``. ``KnowledgeIndex.ensure()`` rebuilds
automatically when the markdown files change.
"""

from __future__ import annotations

import hashlib
import json
import math
import re
import sqlite3
import threading
from collections.abc import Callable
from pathlib import Path

from app.rag.ingest import KNOWLEDGE_DIR, Passage, load_passages

Embedder = Callable[[list[str]], list[list[float]]]
RRF_K = 60

SCHEMA = """
CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS passages (
    id TEXT PRIMARY KEY, file TEXT, title TEXT, map TEXT, side TEXT, topic TEXT,
    source TEXT, text TEXT, vector TEXT
);
CREATE VIRTUAL TABLE IF NOT EXISTS passages_fts USING fts5(id UNINDEXED, title, text, tokenize='porter unicode61');
"""


class KnowledgeIndex:
    def __init__(self, db_path: Path, knowledge_dir: Path | None = None, embedder: Embedder | None = None) -> None:
        self.db_path = db_path
        self.knowledge_dir = knowledge_dir or KNOWLEDGE_DIR
        self.embedder = embedder
        self._lock = threading.Lock()

    def _connect(self) -> sqlite3.Connection:
        self.db_path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(self.db_path)
        conn.executescript(SCHEMA)
        return conn

    def _fingerprint(self) -> str:
        h = hashlib.sha256()
        for path in sorted(self.knowledge_dir.rglob("*.md"), key=lambda p: p.relative_to(self.knowledge_dir).as_posix()):
            h.update(path.relative_to(self.knowledge_dir).as_posix().encode())
            h.update(path.read_bytes())
        h.update(b"dense" if self.embedder else b"sparse")
        return h.hexdigest()

    def ensure(self) -> None:
        """Rebuild when the knowledge files (or the embedder setting) changed."""
        fp = self._fingerprint()
        with self._lock:
            with self._connect() as conn:
                row = conn.execute("SELECT value FROM meta WHERE key = 'fingerprint'").fetchone()
            if not row or row[0] != fp:
                self._build(fp)

    def rebuild(self) -> int:
        with self._lock:
            return self._build(self._fingerprint())

    def _build(self, fingerprint: str) -> int:
        passages = load_passages(self.knowledge_dir)
        vectors: list[list[float] | None] = [None] * len(passages)
        if self.embedder and passages:
            vectors = list(self.embedder([f"{p.title}\n{p.text}" for p in passages]))
        with self._connect() as conn:
            conn.execute("DELETE FROM passages")
            conn.execute("DELETE FROM passages_fts")
            conn.executemany(
                "INSERT INTO passages VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
                [
                    (p.id, p.file, p.title, p.map, p.side, p.topic, p.source, p.text, json.dumps(v) if v else None)
                    for p, v in zip(passages, vectors)
                ],
            )
            conn.executemany(
                "INSERT INTO passages_fts (id, title, text) VALUES (?, ?, ?)",
                [(p.id, p.title, p.text) for p in passages],
            )
            conn.execute(
                "INSERT INTO meta VALUES ('fingerprint', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
                (fingerprint,),
            )
        return len(passages)

    def get(self, passage_id: str) -> Passage | None:
        self.ensure()
        with self._connect() as conn:
            row = conn.execute(
                "SELECT id, file, title, map, side, topic, source, text FROM passages WHERE id = ?", (passage_id,)
            ).fetchone()
        return Passage(*row) if row else None

    def search(self, query: str, *, map_name: str | None = None, k: int = 4) -> list[Passage]:
        self.ensure()
        maps = ("all", map_name) if map_name else None
        sparse = self._sparse(query, maps, limit=20)
        dense = self._dense(query, maps, limit=20) if self.embedder else []
        scores: dict[str, float] = {}
        for ranking in (sparse, dense):
            for rank, pid in enumerate(ranking):
                scores[pid] = scores.get(pid, 0.0) + 1.0 / (RRF_K + rank + 1)
        best = sorted(scores, key=lambda pid: -scores[pid])[:k]
        return [p for p in (self.get(pid) for pid in best) if p is not None]

    def _sparse(self, query: str, maps: tuple[str, ...] | None, limit: int) -> list[str]:
        terms = [t for t in re.findall(r"\w+", query.lower()) if len(t) > 1]
        if not terms:
            return []
        match = " OR ".join(f'"{t}"' for t in terms)
        sql = (
            "SELECT f.id FROM passages_fts f JOIN passages p ON p.id = f.id "
            "WHERE passages_fts MATCH ?"
        )
        args: list[object] = [match]
        if maps:
            sql += f" AND p.map IN ({','.join('?' * len(maps))})"
            args += list(maps)
        sql += " ORDER BY bm25(passages_fts) LIMIT ?"
        args.append(limit)
        with self._connect() as conn:
            return [r[0] for r in conn.execute(sql, args).fetchall()]

    def _dense(self, query: str, maps: tuple[str, ...] | None, limit: int) -> list[str]:
        assert self.embedder is not None
        qv = self.embedder([query])[0]
        sql = "SELECT id, vector FROM passages WHERE vector IS NOT NULL"
        args: list[object] = []
        if maps:
            sql += f" AND map IN ({','.join('?' * len(maps))})"
            args += list(maps)
        with self._connect() as conn:
            rows = conn.execute(sql, args).fetchall()
        scored = [(pid, _cosine(qv, json.loads(v))) for pid, v in rows]
        scored.sort(key=lambda x: -x[1])
        return [pid for pid, _ in scored[:limit]]


def _cosine(a: list[float], b: list[float]) -> float:
    dot = sum(x * y for x, y in zip(a, b))
    na = math.sqrt(sum(x * x for x in a))
    nb = math.sqrt(sum(y * y for y in b))
    return dot / (na * nb) if na and nb else 0.0


def http_embedder(url: str, model: str) -> Embedder:
    """OpenAI-compatible ``/v1/embeddings`` (llama.cpp ``--embedding``), local only."""
    import httpx

    def embed(texts: list[str]) -> list[list[float]]:
        r = httpx.post(f"{url.rstrip('/')}/embeddings", json={"model": model, "input": texts}, timeout=120)
        r.raise_for_status()
        data = sorted(r.json()["data"], key=lambda d: d["index"])
        return [d["embedding"] for d in data]

    return embed


_default: KnowledgeIndex | None = None


def default_index() -> KnowledgeIndex:
    global _default
    if _default is None:
        from app.core.config import settings

        embedder = http_embedder(settings.embed_url, settings.embed_model) if settings.embed_url else None
        _default = KnowledgeIndex(settings.data_dir / "knowledge.db", settings.knowledge_dir, embedder)
    return _default


def use_index(index: KnowledgeIndex | None) -> None:
    """Swap the index (tests)."""
    global _default
    _default = index


if __name__ == "__main__":
    n = default_index().rebuild()
    print(f"Indexed {n} passages from {default_index().knowledge_dir}")
