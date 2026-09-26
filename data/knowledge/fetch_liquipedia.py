"""Download Liquipedia CS map pages into data/knowledge/liquipedia/ (T30).

Usage: python data/knowledge/fetch_liquipedia.py Mirage Anubis

Liquipedia text is CC BY-SA 3.0; every file gets attribution frontmatter.
API rules (https://liquipedia.net/api-terms-of-use): a descriptive User-Agent
and at most one ``action=parse`` request per 30 seconds. Standard library only.
"""

from __future__ import annotations

import json
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

API = "https://liquipedia.net/counterstrike/api.php"
USER_AGENT = "cs2-round-reviewer-coach/0.1 (school project; https://github.com/PawelZlotkowski/cs2-demos)"
PARSE_INTERVAL_S = 30
OUT_DIR = Path(__file__).parent / "liquipedia"
MAP_KEYS = {"mirage": "de_mirage", "anubis": "de_anubis"}
SKIP_SECTIONS = {"references", "external links", "see also", "gallery", "trivia", "map changes", "patch history"}


class _Sections(HTMLParser):
    """Collects plain text per h2/h3 heading, skipping tables, references and edit links."""

    SKIP_TAGS = {"table", "style", "script", "sup"}
    VOID_TAGS = {"br", "img", "hr", "wbr", "input", "meta", "link", "source"}

    def __init__(self) -> None:
        super().__init__()
        self.sections: list[tuple[str, list[str]]] = [("Overview", [])]
        self._heading: list[str] | None = None
        self._skip = 0  # open-tag depth inside a skipped element
        self._para: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in self.VOID_TAGS:
            if tag == "br" and not self._skip:
                self._para.append(" ")
            return
        if self._skip:
            self._skip += 1
        elif tag in self.SKIP_TAGS or "mw-editsection" in (dict(attrs).get("class") or ""):
            self._skip = 1
        elif tag in ("h2", "h3"):
            self._flush()
            self._heading = []

    def handle_endtag(self, tag):
        if tag in self.VOID_TAGS:
            return
        if self._skip:
            self._skip -= 1
        elif tag in ("h2", "h3") and self._heading is not None:
            self.sections.append((" ".join("".join(self._heading).split()), []))
            self._heading = None
        elif tag in ("p", "li"):
            self._flush()

    def handle_data(self, data):
        if self._skip:
            return
        if self._heading is not None:
            self._heading.append(data)
        else:
            self._para.append(data)

    def _flush(self) -> None:
        text = " ".join("".join(self._para).split())
        if text:
            self.sections[-1][1].append(text)
        self._para = []


def fetch_html(page: str) -> str:
    query = urllib.parse.urlencode({"action": "parse", "page": page, "prop": "text", "format": "json", "formatversion": 2})
    req = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": USER_AGENT, "Accept-Encoding": "identity"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return json.load(resp)["parse"]["text"]


def to_markdown(page: str, html: str) -> str:
    parser = _Sections()
    parser.feed(html)
    parser.close()
    parser._flush()
    map_key = MAP_KEYS.get(page.lower(), "any")
    url = f"https://liquipedia.net/counterstrike/{urllib.parse.quote(page)}"
    lines = [
        "---",
        f"map: {map_key}",
        "side: both",
        "topic: liquipedia",
        f"source: {url}",
        "license: CC-BY-SA-3.0",
        f'attribution: "From Liquipedia ({url}), CC BY-SA 3.0"',
        "lang: en",
        "review: draft",
        "---",
        "",
        f"# {page} (Liquipedia)",
        "",
    ]
    for title, paras in parser.sections:
        title = re.sub(r"\[edit\]$", "", title).strip()
        if not paras or title.lower() in SKIP_SECTIONS:
            continue
        lines += [f"## {title}", "", *[p + "\n" for p in paras]]
    return "\n".join(lines).rstrip() + "\n"


def main(pages: list[str]) -> int:
    if not pages:
        print(__doc__)
        return 2
    OUT_DIR.mkdir(exist_ok=True)
    for i, page in enumerate(pages):
        if i:
            time.sleep(PARSE_INTERVAL_S)
        out = OUT_DIR / f"{page.lower()}.md"
        out.write_text(to_markdown(page, fetch_html(page)), encoding="utf-8")
        print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
