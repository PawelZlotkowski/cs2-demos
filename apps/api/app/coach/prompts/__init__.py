"""Versioned prompts (``<name>.v<N>.md``); the newest version is used and logged with every trace."""

from __future__ import annotations

import re
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from string import Template

PROMPTS_DIR = Path(__file__).resolve().parent


@dataclass(frozen=True)
class Prompt:
    name: str
    version: str  # "select_moments.v1"
    template: str

    def render(self, **values: object) -> str:
        return Template(self.template).safe_substitute({k: str(v) for k, v in values.items()})


@lru_cache(maxsize=None)
def load_prompt(name: str) -> Prompt:
    versions = []
    for path in PROMPTS_DIR.glob(f"{name}.v*.md"):
        m = re.fullmatch(rf"{re.escape(name)}\.v(\d+)\.md", path.name)
        if m:
            versions.append((int(m.group(1)), path))
    if not versions:
        raise FileNotFoundError(f"No prompt named {name}")
    number, path = max(versions)
    return Prompt(name=name, version=f"{name}.v{number}", template=path.read_text(encoding="utf-8"))
