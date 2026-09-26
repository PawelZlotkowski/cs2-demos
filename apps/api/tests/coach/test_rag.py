"""T31–T32: knowledge ingest, hybrid index and the committed starter knowledge."""

from __future__ import annotations

from pathlib import Path

from app.rag.index import KnowledgeIndex
from app.rag.ingest import KNOWLEDGE_DIR, load_passages

DOC = """---
map: de_mirage
side: T
topic: test
source: own notes
---

Intro text before the first heading is ignored.

## Palace exits

Leave Palace with a flash.

## Empty

## Window smoke

Smoke Window before crossing mid.
"""


def test_ingest_chunks_by_heading(tmp_path):
    (tmp_path / "a.md").write_text(DOC)
    (tmp_path / "README.md").write_text("## Not indexed\n\ntext")
    passages = load_passages(tmp_path)
    assert [(p.id, p.title) for p in passages] == [("K1", "Palace exits"), ("K2", "Window smoke")]
    assert passages[0].map == "de_mirage" and passages[0].side == "T" and passages[0].source == "own notes"


def test_ingest_reads_subfolders(tmp_path):
    (tmp_path / "de_mirage").mkdir()
    (tmp_path / "general").mkdir()
    (tmp_path / "de_mirage" / "palace.md").write_text(DOC)
    (tmp_path / "general" / "trading.md").write_text("---\nmap: all\n---\n\n## Trade spacing\n\nStay close enough to trade.\n")
    passages = load_passages(tmp_path)
    assert [(p.id, p.file, p.map) for p in passages] == [
        ("K1", "de_mirage/palace.md", "de_mirage"),
        ("K2", "de_mirage/palace.md", "de_mirage"),
        ("K3", "general/trading.md", "all"),
    ]


def test_committed_knowledge_parses():
    passages = load_passages(KNOWLEDGE_DIR)
    assert len(passages) >= 15
    assert {p.map for p in passages} == {"all", "de_mirage", "de_anubis"}
    assert all(p.text and p.source for p in passages)


def test_search_filters_by_map_and_rebuilds_on_change(tmp_path):
    kdir = tmp_path / "k"
    kdir.mkdir()
    (kdir / "a.md").write_text(DOC)
    (kdir / "b.md").write_text(DOC.replace("de_mirage", "de_anubis").replace("Palace exits", "Anubis palace"))
    index = KnowledgeIndex(tmp_path / "k.db", kdir)
    hits = index.search("palace flash", map_name="de_mirage")
    assert [p.title for p in hits] == ["Palace exits"]
    assert len(index.search("palace flash")) == 2

    (kdir / "a.md").write_text(DOC.replace("Leave Palace with a flash.", "Leave Palace with a flash and a smoke."))
    assert "smoke" in index.search("palace", map_name="de_mirage")[0].text
    assert index.get("K1").title == "Palace exits" and index.get("K99") is None


def test_dense_ranking_is_fused_with_bm25(tmp_path):
    kdir = tmp_path / "k"
    kdir.mkdir()
    (kdir / "a.md").write_text(DOC)

    def embed(texts: list[str]) -> list[list[float]]:
        # "window" texts point one way, everything else the other
        return [[1.0, 0.0] if "window" in t.lower() or "fenêtre" in t.lower() else [0.0, 1.0] for t in texts]

    index = KnowledgeIndex(tmp_path / "k.db", kdir, embedder=embed)
    # No shared words with the passage, so only the dense side can find it
    assert index.search("fenêtre", k=1)[0].title == "Window smoke"


def test_empty_query(tmp_path):
    assert KnowledgeIndex(tmp_path / "k.db", Path(tmp_path)).search("?") == []
