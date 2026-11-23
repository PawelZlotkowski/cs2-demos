"""Read ``data/knowledge/**/*.md`` into passages, one per ``##`` heading.

Files may sit in subfolders (``de_mirage/``, ``de_anubis/``, ``general/``);
the front matter, not the folder, sets the map.

Each file starts with a small front matter block::

    ---
    map: de_mirage        # de_mirage | de_anubis | all
    side: any             # T | CT | any
    topic: rotations
    source: own notes     # or "Liquipedia: <page>" (CC BY-SA 3.0)
    license: CC BY-SA 3.0 # only for copied text
    ---

Passage ids are ``K`` and a number from a hash of the file path and heading
(``K10000``–``K99999``), so adding, removing or reordering other passages
does not change them; renaming a file or heading does. The coach cites them as
``[K48213]``. Ids below 10000 belong to the old positional scheme and no longer
resolve.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
KNOWLEDGE_DIR = REPO_ROOT / "data" / "knowledge"

FRONT_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)
# Five-digit ids, clear of the old positional K1..K158
ID_FIRST, ID_SPAN = 10000, 90000
# Bump when the id scheme changes so ``KnowledgeIndex`` rebuilds with the new ids
ID_SCHEME = "hash-v1"
DETECTORS_LINE_RE = re.compile(r"^Detectors:.*(?:\n|$)", re.MULTILINE)


def shown_text(text: str) -> str:
    """Passage text for people and the model: without the ``Detectors:`` routing line."""
    return DETECTORS_LINE_RE.sub("", text).strip()


@dataclass(frozen=True)
class Passage:
    id: str
    file: str
    title: str
    map: str
    side: str
    topic: str
    source: str
    text: str


def parse_front_matter(text: str) -> tuple[dict[str, str], str]:
    m = FRONT_RE.match(text)
    if not m:
        return {}, text
    meta = {}
    for line in m.group(1).splitlines():
        if ":" in line:
            key, _, value = line.partition(":")
            meta[key.strip()] = value.split("#", 1)[0].strip()
    return meta, text[m.end() :]


def load_passages(directory: Path | None = None) -> list[Passage]:
    directory = directory or KNOWLEDGE_DIR
    raw: list[tuple[str, str, dict[str, str], str]] = []
    # Keep the Knowledge tab's append-only notes after all curated folders,
    # including newer folders such as research/, rather than relying on names.
    paths = sorted(directory.rglob("*.md"), key=lambda p: (
        p.relative_to(directory).parts[0] == "notes", p.relative_to(directory).as_posix(),
    ))
    for path in paths:
        if path.name.lower() in {"readme.md", "sources.md"}:
            continue
        meta, body = parse_front_matter(path.read_text(encoding="utf-8"))
        for title, text in _sections(body):
            raw.append((path.relative_to(directory).as_posix(), title, meta, text))
    ids: list[str] = []
    for file, title, _meta, _text in raw:
        n = int(hashlib.sha256(f"{file}#{title}".encode()).hexdigest()[:12], 16) % ID_SPAN
        # shortcut: a hash collision moves the later passage (sorted order) to the next free number;
        # one new passage can then shift one old id. Rare at a few hundred passages in 90000 numbers.
        while f"K{ID_FIRST + n}" in ids:
            n = (n + 1) % ID_SPAN
        ids.append(f"K{ID_FIRST + n}")
    return [
        Passage(
            id=pid,
            file=file,
            title=title,
            map=meta.get("map", "all"),
            side=meta.get("side", "any"),
            topic=meta.get("topic", ""),
            source=meta.get("source", "own notes"),
            text=text,
        )
        for pid, (file, title, meta, text) in zip(ids, raw)
    ]


def _sections(body: str) -> list[tuple[str, str]]:
    out: list[tuple[str, str]] = []
    title, lines = None, []
    for line in body.splitlines():
        if line.startswith("## "):
            if title and "".join(lines).strip():
                out.append((title, "\n".join(lines).strip()))
            title, lines = line[3:].strip(), []
        elif title is not None:
            lines.append(line)
    if title and "".join(lines).strip():
        out.append((title, "\n".join(lines).strip()))
    return out
