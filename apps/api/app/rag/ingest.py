"""Read ``data/knowledge/**/*.md`` into passages, one per ``##`` heading.

Files may sit in subfolders (``de_mirage/``, ``de_anubis/``, ``general/``);
the front matter, not the folder, sets the map.

Each file starts with a small front matter block::

    ---
    map: de_mirage        # de_mirage | de_anubis | all
    side: any             # T | CT | any
    topic: rotations
    source: own notes     # or "Liquipedia: <page>" (CC BY-SA 4.0)
    license: CC BY-SA 4.0 # only for copied text
    ---

Passage ids ``K1``, ``K2``… follow the sorted (file, heading) order, so they
stay the same while the files do not change. The coach cites them as ``[K7]``.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[4]
KNOWLEDGE_DIR = REPO_ROOT / "data" / "knowledge"

FRONT_RE = re.compile(r"\A---\n(.*?)\n---\n", re.DOTALL)


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
    for path in sorted(directory.rglob("*.md"), key=lambda p: p.relative_to(directory).as_posix()):
        if path.name.lower() == "readme.md":
            continue
        meta, body = parse_front_matter(path.read_text(encoding="utf-8"))
        for title, text in _sections(body):
            raw.append((path.relative_to(directory).as_posix(), title, meta, text))
    return [
        Passage(
            id=f"K{i}",
            file=file,
            title=title,
            map=meta.get("map", "all"),
            side=meta.get("side", "any"),
            topic=meta.get("topic", ""),
            source=meta.get("source", "own notes"),
            text=text,
        )
        for i, (file, title, meta, text) in enumerate(raw, start=1)
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
