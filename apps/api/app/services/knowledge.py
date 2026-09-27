"""Coach page Knowledge tab (doc 29 §2.3, R12): browse, flag and add knowledge passages.

Passages come from ``data/knowledge`` as the retriever sees them. Notes added
from the page go to ``data/knowledge/notes/<map>.md``, which sorts after every
other folder, so adding one never renumbers the ``[K..]`` ids that stored
explanations already cite (only later added notes move).
"""

from __future__ import annotations

import json
import re
import sqlite3
from collections import Counter
from pathlib import Path

from app.core.config import settings
from app.maps.zones import load_zones
from app.models.contracts import KnowledgeNoteRequest, KnowledgeRow, MapZone
from app.rag.ingest import KNOWLEDGE_DIR, Passage, load_passages
from app.repositories.extras import extras

ZONES_RE = re.compile(r"^Zones:\s*(.+?)\.?\s*$", re.MULTILINE)


def knowledge_dir() -> Path:
    return settings.knowledge_dir or KNOWLEDGE_DIR


def passage_zones(p: Passage) -> list[str]:
    m = ZONES_RE.search(p.text)
    return [z.strip() for z in m.group(1).split(",") if z.strip()] if m else []


def citation_counts() -> Counter[str]:
    """How many stored explanations cite each passage."""
    from app.repositories.matches import repo

    counts: Counter[str] = Counter()
    try:
        with sqlite3.connect(repo.analysis.db_path) as conn:
            rows = conn.execute("SELECT json FROM explanations").fetchall()
    except sqlite3.Error:
        return counts
    for (body,) in rows:
        for c in set(json.loads(body).get("citations") or []):
            if c.startswith("K"):
                counts[c] += 1
    return counts


def list_knowledge(map_name: str | None = None, zone: str | None = None, q: str | None = None) -> list[KnowledgeRow]:
    cited = citation_counts()
    flags = extras().passage_flags()
    rows = []
    for p in load_passages(knowledge_dir()):
        if map_name and p.map not in (map_name, "all"):
            continue
        zones = passage_zones(p)
        if zone and zone.lower() not in {z.lower() for z in zones}:
            continue
        if q and q.lower() not in f"{p.title}\n{p.text}".lower():
            continue
        rows.append(
            KnowledgeRow(
                id=p.id, title=p.title, map=p.map, side=p.side, topic=p.topic, source=p.source,
                text=p.text, zones=zones, cited=cited.get(p.id, 0), flags=flags.get(p.id, []),
            )
        )
    return rows


def map_zones(map_name: str) -> list[MapZone]:
    return [MapZone(name=z.name, polygons=[[list(pt) for pt in poly] for poly in z.polygons]) for z in load_zones(map_name)]


def add_note(req: KnowledgeNoteRequest) -> KnowledgeRow:
    """Append a section to ``notes/<map>.md`` and rebuild the index."""
    path = knowledge_dir() / "notes" / f"{req.map}.md"
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        path.write_text(f"---\nmap: {req.map}\nside: any\ntopic: own notes\nsource: own notes\n---\n", encoding="utf-8")
    title = " ".join(req.title.split())
    zones = f"Zones: {', '.join(z.strip() for z in req.zones if z.strip())}.\n" if req.zones else ""
    body = req.text.strip().replace("\n## ", "\n### ")  # a heading in the text would split the passage
    with path.open("a", encoding="utf-8") as fh:
        fh.write(f"\n## {title}\n\n{zones}{body}\n")
    from app.rag.index import default_index

    try:
        default_index().rebuild()
    except Exception:  # noqa: BLE001 - the next search rebuilds it anyway
        pass
    row = next(r for r in reversed(list_knowledge(req.map)) if r.title == title)
    return row


# --- own notes in the admin panel (doc 30 AD10) ---

NOTE_MAPS = ("de_mirage", "de_anubis")


def _note_sections(path: Path) -> tuple[str, list[tuple[str, str]]]:
    """(front matter and preamble, [(title, body)]) of a notes file."""
    text = path.read_text(encoding="utf-8") if path.exists() else ""
    head, *parts = re.split(r"^## ", text, flags=re.MULTILINE)
    sections = []
    for part in parts:
        title, _, body = part.partition("\n")
        sections.append((title.strip(), body.strip("\n")))
    return head, sections


def _write_sections(path: Path, head: str, sections: list[tuple[str, str]]) -> None:
    out = head.rstrip("\n") + "\n"
    for title, body in sections:
        out += f"\n## {title}\n\n{body.strip()}\n"
    path.write_text(out, encoding="utf-8")


def own_notes() -> list[dict[str, str]]:
    rows = []
    for map_name in NOTE_MAPS:
        _, sections = _note_sections(knowledge_dir() / "notes" / f"{map_name}.md")
        for i, (title, body) in enumerate(sections):
            rows.append({"map": map_name, "index": str(i), "title": title, "text": body})
    return rows


def _rebuild() -> None:
    from app.rag.index import default_index

    try:
        default_index().rebuild()
    except Exception:  # noqa: BLE001 - the next search rebuilds it anyway
        pass


def edit_note(map_name: str, index: int, title: str, text: str) -> None:
    """Change a note in place; its [K..] id stays the same."""
    path = knowledge_dir() / "notes" / f"{map_name}.md"
    head, sections = _note_sections(path)
    if map_name not in NOTE_MAPS or not 0 <= index < len(sections):
        raise KeyError(index)
    body = text.strip().replace("\n## ", "\n### ")
    sections[index] = (" ".join(title.split()), body)
    _write_sections(path, head, sections)
    _rebuild()


def delete_note(map_name: str, index: int) -> None:
    """Remove a note; the notes after it on that map get new [K..] ids."""
    path = knowledge_dir() / "notes" / f"{map_name}.md"
    head, sections = _note_sections(path)
    if map_name not in NOTE_MAPS or not 0 <= index < len(sections):
        raise KeyError(index)
    del sections[index]
    _write_sections(path, head, sections)
    _rebuild()


def rebuild_index() -> int:
    from app.rag.index import default_index

    return default_index().rebuild()
