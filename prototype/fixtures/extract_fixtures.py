"""Extract prototype sample data into shared JSON fixtures."""
from __future__ import annotations

import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
html = (ROOT / "prototype" / "analysis-studio.html").read_text(encoding="utf-8")

# Slice from MATCH through HOME block using markers
start = html.index("const MATCH=")
end = html.index("let MOMENTS=")
block = html[start:end]

# Convert JS object/array literals to Python via a tiny transform
# Replace JS const assignments with Python names
py = block
py = py.replace("const MATCH=", "MATCH =")
py = py.replace("const LAST7=", "LAST7 =")
py = py.replace("const SAMPLE_MOMENTS=", "SAMPLE_MOMENTS =")
py = py.replace("const HOME=", "HOME =")
# true/false/null not present; JS uses bare identifiers for nothing else

ns: dict = {}
exec(py, ns)  # noqa: S102 — trusted local prototype

fixture = {
    "matchId": "match-sample-mirage",
    "match": {
        "id": "match-sample-mirage",
        "map": ns["MATCH"]["map"],
        "score": ns["MATCH"]["score"],
        "when": ns["MATCH"]["when"],
        "rounds": ns["MATCH"]["rounds"],
        "won": ns["MATCH"]["won"],
        "status": "complete",
        "clipDuration": 20,
    },
    "last7": ns["LAST7"],
    "moments": ns["SAMPLE_MOMENTS"],
    "home": ns["HOME"],
}

targets = [
    ROOT / "prototype" / "fixtures" / "sample-match.json",
    ROOT / "apps" / "api" / "data" / "fixtures" / "sample-match.json",
]
for path in targets:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(fixture, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
    print(f"wrote {path} ({len(fixture['moments'])} moments)")
