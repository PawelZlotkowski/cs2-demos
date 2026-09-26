"""Download Liquipedia CS map pages into data/knowledge/liquipedia/ (T30).

Usage: python data/knowledge/fetch_liquipedia.py [--force] Mirage Anubis

Pages already in liquipedia/ are not downloaded again (the terms ask to reuse
results); pass --force to refresh them. Set LIQUIPEDIA_CONTACT to an email to
put it in the User-Agent next to the repo URL.

Liquipedia text is CC BY-SA 3.0; every file gets attribution frontmatter.
API rules (https://liquipedia.net/api-terms-of-use): a descriptive User-Agent,
gzip-encoded requests and at most one ``action=parse`` request per 30 seconds. Standard library only.
"""

from __future__ import annotations

import gzip
import json
import os
import re
import sys
import time
import urllib.parse
import urllib.request
from html.parser import HTMLParser
from pathlib import Path

API = "https://liquipedia.net/counterstrike/api.php"
REPO_URL = "https://github.com/PawelZlotkowski/cs2-demos"
_CONTACT = os.environ.get("LIQUIPEDIA_CONTACT", "").strip()
USER_AGENT = f"cs2-round-reviewer-coach/0.1 ({REPO_URL}{'; ' + _CONTACT if _CONTACT else ''})"
PARSE_INTERVAL_S = 30
OUT_DIR = Path(__file__).parent / "liquipedia"
MAP_KEYS = {"mirage": "de_mirage", "anubis": "de_anubis"}
SKIP_CLASSES = ("mw-editsection", "infobox", "toc", "navbox")
SKIP_SECTIONS = {"contents", "references", "external links", "see also", "gallery", "trivia", "map changes", "patch history"}


class _Sections(HTMLParser):
    """Collects plain text per h2/h3/h4 heading (h4 titles get their parent's name), skipping tables, references and edit links."""

    SKIP_TAGS = {"table", "style", "script", "sup"}
    VOID_TAGS = {"br", "img", "hr", "wbr", "input", "meta", "link", "source"}

    def __init__(self) -> None:
        super().__init__()
        self.sections: list[tuple[str, list[str]]] = [("Overview", [])]
        self._heading: list[str] | None = None
        self._level = ""
        self._parent = ""  # last h2/h3 title, prefixed to h4 titles
        self._skip = 0  # open-tag depth inside a skipped element
        self._para: list[str] = []

    def handle_starttag(self, tag, attrs):
        if tag in self.VOID_TAGS:
            if tag == "br" and not self._skip:
                self._para.append(" ")
            return
        if self._skip:
            self._skip += 1
        elif tag in self.SKIP_TAGS or any(c in (dict(attrs).get("class") or "") for c in SKIP_CLASSES):
            self._skip = 1
        elif tag in ("h2", "h3", "h4"):
            self._flush()
            self._heading = []
            self._level = tag

    def handle_endtag(self, tag):
        if tag in self.VOID_TAGS:
            return
        if self._skip:
            self._skip -= 1
        elif tag in ("h2", "h3", "h4") and self._heading is not None:
            title = " ".join("".join(self._heading).split())
            if self._level == "h4" and self._parent:
                title = f"{self._parent}, {title}"
            else:
                self._parent = title
            self.sections.append((title, []))
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
    query = urllib.parse.urlencode({"action": "parse", "page": page, "prop": "text", "format": "json", "formatversion": 2, "redirects": 1})
    req = urllib.request.Request(f"{API}?{query}", headers={"User-Agent": USER_AGENT, "Accept-Encoding": "gzip"})
    with urllib.request.urlopen(req, timeout=30) as resp:
        body = resp.read()
        if resp.headers.get("Content-Encoding") == "gzip":
            body = gzip.decompress(body)
    return json.loads(body)["parse"]["text"]


def to_markdown(page: str, html: str) -> str:
    parser = _Sections()
    parser.feed(html)
    parser.close()
    parser._flush()
    map_key = MAP_KEYS.get(page.lower().split("/")[0], "all")
    url = f"https://liquipedia.net/counterstrike/{urllib.parse.quote(page)}"
    lines = [
        "---",
        f"map: {map_key}",
        "side: any",
        "topic: liquipedia",
        f"source: Liquipedia: {url}",
        "license: CC-BY-SA-3.0",
        f"attribution: From Liquipedia ({url}), CC BY-SA 3.0",
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


def is_stub(markdown: str) -> bool:
    """True for a redirect page or a page with almost no text after the front matter."""
    body = markdown.split("\n---\n", 1)[-1]
    return "Redirect to:" in body or len(body.split()) < 50


def main(args: list[str]) -> int:
    force = "--force" in args
    pages = [a for a in args if a != "--force"]
    if not pages:
        print(__doc__)
        return 2
    OUT_DIR.mkdir(exist_ok=True)
    fetched = 0
    for page in pages:
        out = OUT_DIR / f"{page.lower().replace('/', '-')}.md"
        if out.exists() and not force:
            print(f"kept {out} (already downloaded; --force to refresh)")
            continue
        if fetched:
            time.sleep(PARSE_INTERVAL_S)
        md = to_markdown(page, fetch_html(page))
        fetched += 1
        if is_stub(md):
            print(f"skipped {page}: Liquipedia returned a redirect or an empty page")
            continue
        out.write_text(md, encoding="utf-8")
        print(f"wrote {out}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
