"""Content checks for the coach knowledge base in data/knowledge/ (T30)."""

from __future__ import annotations

import json
import re
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[4]
KNOWLEDGE = ROOT / "data" / "knowledge"
ZONES = ROOT / "apps" / "api" / "app" / "maps" / "zones"
DETECTORS = ROOT / "apps" / "api" / "app" / "analysis" / "detectors"

REQUIRED_KEYS = {"map", "side", "topic", "source", "license", "lang", "review"}
MIN_SECTIONS_PER_MAP = 40
MAX_SECTION_WORDS = 180


def _files() -> list[Path]:
    return sorted(p for p in KNOWLEDGE.rglob("*.md") if p.name not in {"README.md", "SOURCES.md"})


def _parse(path: Path) -> tuple[dict[str, str], list[tuple[str, str]]]:
    text = path.read_text(encoding="utf-8")
    m = re.match(r"^---\n(.*?)\n---\n(.*)$", text, re.S)
    assert m, f"{path}: missing frontmatter"
    meta = dict(line.split(": ", 1) for line in m.group(1).splitlines() if line.strip())
    parts = re.split(r"^## (.+)$", m.group(2), flags=re.M)
    sections = [(parts[i].strip(), parts[i + 1].strip()) for i in range(1, len(parts), 2)]
    return meta, sections


def _zone_names(map_key: str) -> set[str]:
    return {z["name"] for z in json.loads((ZONES / f"{map_key}.json").read_text())["zones"]}


def _detector_names() -> set[str]:
    names: set[str] = set()
    for p in DETECTORS.glob("*.py"):
        names |= set(re.findall(r'detector="([a-z_]+)"', p.read_text(encoding="utf-8")))
    return names


def test_files_exist() -> None:
    assert _files(), "no knowledge files"


@pytest.mark.parametrize("path", _files(), ids=lambda p: str(p.relative_to(KNOWLEDGE)))
def test_frontmatter_and_sections(path: Path) -> None:
    meta, sections = _parse(path)
    assert REQUIRED_KEYS <= meta.keys(), f"missing keys: {REQUIRED_KEYS - meta.keys()}"
    assert meta["map"] in {"de_mirage", "de_anubis", "all"}
    assert meta["side"] in {"T", "CT", "any"}
    assert meta["lang"] in {"en", "pl", "nl"}
    assert sections, "no ## sections"
    titles = [t for t, _ in sections]
    assert len(titles) == len(set(titles)), "duplicate section titles in one file"
    for title, body in sections:
        assert body, f"empty section {title!r}"
        if meta["source"] == "own notes":
            assert len(body.split()) <= MAX_SECTION_WORDS, f"section {title!r} is too long for one chunk"
    if meta["topic"] == "liquipedia":
        assert "Redirect to:" not in path.read_text(encoding="utf-8"), "redirect stub, re-fetch with redirects"
        assert sum(len(b.split()) for _, b in sections) >= 50, "almost empty Liquipedia page"


@pytest.mark.parametrize("map_key", ["de_mirage", "de_anubis"])
def test_map_sections_and_zone_names(map_key: str) -> None:
    zones = _zone_names(map_key)
    total = 0
    callout_titles: set[str] = set()
    for path in _files():
        meta, sections = _parse(path)
        if meta["map"] != map_key:
            continue
        total += len(sections)
        for title, body in sections:
            if meta["topic"] == "callouts":
                callout_titles.add(title)
            line = body.splitlines()[0]
            if line.startswith("Zones: "):
                named = {z.strip() for z in line.removeprefix("Zones: ").rstrip(".").split(",")}
                # sub-callouts (Firebox, Tetris...) may appear; each listed name must be a zone or a known sub-callout
                unknown = named - zones - {"Firebox"}
                assert not unknown, f"{path.name} / {title}: unknown zones {unknown}"
    assert total >= MIN_SECTIONS_PER_MAP, f"{map_key}: {total} sections"
    assert zones <= callout_titles, f"{map_key}: zones without a callout section: {zones - callout_titles}"


def test_fundamentals_cover_every_detector() -> None:
    detectors = _detector_names()
    assert detectors, "no detectors found"
    covered: set[str] = set()
    for path in _files():
        _, sections = _parse(path)
        for _, body in sections:
            line = body.splitlines()[0]
            if line.startswith("Detectors: "):
                named = {d.strip() for d in line.removeprefix("Detectors: ").rstrip(".").split(",")}
                assert named <= detectors, f"{path.name}: unknown detectors {named - detectors}"
                covered |= named
    assert detectors <= covered, f"detectors without a fundamentals section: {detectors - covered}"


def test_liquipedia_parser_keeps_attribution() -> None:
    sys.path.insert(0, str(KNOWLEDGE))
    try:
        import fetch_liquipedia as fl
    finally:
        sys.path.pop(0)
    html = (
        "<p>Intro<sup>[1]</sup>.</p>"
        '<h2>Layout<span class="mw-editsection"><span>[</span>edit<span>]</span></span></h2>'
        "<p>Two sites.<br>Mid.</p><table><tr><td>skip</td></tr></table>"
        "<h2>References</h2><p>r</p>"
    )
    md = fl.to_markdown("Anubis", html)
    assert "license: CC-BY-SA-3.0" in md and "attribution:" in md and "map: de_anubis" in md
    assert '"' not in md.split("\n---\n", 1)[0], "the ingest front matter takes no quotes"
    assert fl.to_markdown("Anubis/cs2", html).count("map: de_anubis") == 1
    assert "## Layout\n\nTwo sites. Mid." in md
    assert "skip" not in md and "References" not in md and "[1]" not in md and "edit" not in md


def test_liquipedia_fetch_asks_for_gzip(monkeypatch: pytest.MonkeyPatch) -> None:
    import gzip
    import io

    sys.path.insert(0, str(KNOWLEDGE))
    try:
        import fetch_liquipedia as fl
    finally:
        sys.path.pop(0)
    seen = {}

    class _Resp(io.BytesIO):
        headers = {"Content-Encoding": "gzip"}

    def fake_urlopen(req, timeout):
        seen["encoding"] = req.get_header("Accept-encoding")
        return _Resp(gzip.compress(json.dumps({"parse": {"text": "<p>hi</p>"}}).encode()))

    monkeypatch.setattr(fl.urllib.request, "urlopen", fake_urlopen)
    assert fl.fetch_html("Mirage") == "<p>hi</p>"
    assert seen["encoding"] == "gzip"


def test_liquipedia_skips_downloaded_pages(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    sys.path.insert(0, str(KNOWLEDGE))
    try:
        import fetch_liquipedia as fl
    finally:
        sys.path.pop(0)
    (tmp_path / "mirage.md").write_text("cached", encoding="utf-8")
    calls: list[str] = []
    monkeypatch.setattr(fl, "OUT_DIR", tmp_path)
    monkeypatch.setattr(fl, "fetch_html", lambda page: calls.append(page) or "<p>x</p>")
    monkeypatch.setattr(fl.time, "sleep", lambda s: None)
    assert fl.main(["Mirage", "Anubis"]) == 0
    assert calls == ["Anubis"]
    assert (tmp_path / "mirage.md").read_text(encoding="utf-8") == "cached"
    assert fl.main(["--force", "Mirage"]) == 0
    assert calls == ["Anubis", "Mirage"]


def test_liquipedia_follows_redirects_and_skips_stubs(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    import gzip
    import io

    sys.path.insert(0, str(KNOWLEDGE))
    try:
        import fetch_liquipedia as fl
    finally:
        sys.path.pop(0)
    queries: list[str] = []

    class _Resp(io.BytesIO):
        headers = {"Content-Encoding": "gzip"}

    def fake_urlopen(req, timeout):
        queries.append(req.full_url)
        html = '<div class="redirectMsg"><p>Redirect to:</p><ul><li>Mirage/cs2</li></ul></div>'
        return _Resp(gzip.compress(json.dumps({"parse": {"text": html}}).encode()))

    monkeypatch.setattr(fl.urllib.request, "urlopen", fake_urlopen)
    monkeypatch.setattr(fl, "OUT_DIR", tmp_path)
    assert fl.main(["Mirage"]) == 0
    assert "redirects=1" in queries[0]
    assert not list(tmp_path.iterdir()), "a redirect stub must not be written"
