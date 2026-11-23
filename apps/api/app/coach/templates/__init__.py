"""Finding summary templates in en/pl/nl (plan §6.3 fallback text).

English is the stored ``Finding.summary``. Polish and Dutch are the verifier's
fallback when the model's answer fails; they need a native speaker's review.
Callout names stay English in every language (players use them that way).
"""

from __future__ import annotations

import json
from functools import cache
from pathlib import Path
from typing import Any

LANGUAGES = ("en", "pl", "nl")
TEMPLATES_DIR = Path(__file__).resolve().parent


@cache
def load_templates(lang: str) -> dict[str, str]:
    if lang not in LANGUAGES:
        raise ValueError(f"Unsupported language: {lang}")
    return json.loads((TEMPLATES_DIR / f"findings.{lang}.json").read_text(encoding="utf-8"))


class _Value(str):
    """A field value. In a template, `{kills:kill|kills}` picks the word form for that number."""

    def __format__(self, spec: str) -> str:
        if "|" not in spec:
            return super().__format__(spec)
        one, many = spec.split("|", 1)
        return one if self == "1" else many


class _Fields(dict):
    def __missing__(self, key: str) -> str:
        return _Value("?")


def render(key: str, lang: str, fields: dict[str, Any]) -> str:
    templates = load_templates(lang)
    template = templates.get(key) or templates.get(key.split(".")[0])
    if template is None:
        raise KeyError(f"No {lang} template for {key}")
    values = _Fields({k: _fmt(v) for k, v in fields.items() if v is not None})
    if not fields.get("zone"):
        values["zone"] = templates["_unknown_zone"]
    return template.format_map(values)


def _fmt(v: Any) -> str:
    if isinstance(v, float) and v.is_integer():
        return _Value(int(v))
    return _Value(v)
