import re
import string

import pytest

from app.coach.templates import LANGUAGES, load_templates, render


def _fields(template: str) -> set[str]:
    return {f for _, f, _, _ in string.Formatter().parse(template) if f}


def test_all_languages_have_the_same_keys():
    keys = [set(load_templates(lang)) for lang in LANGUAGES]
    assert keys[0] == keys[1] == keys[2]


@pytest.mark.parametrize("lang", ["pl", "nl"])
def test_translations_use_the_same_placeholders(lang):
    en = load_templates("en")
    other = load_templates(lang)
    for key, text in en.items():
        assert _fields(text) == _fields(other[key]), key


def test_every_detector_template_exists():
    from app.analysis.detectors import DETECTORS

    en = load_templates("en")
    for name in DETECTORS:
        assert any(k == name or k.startswith(name + ".") for k in en), name


def test_render_fills_zone_fallback_and_formats_numbers():
    text = render("dry_peek", "en", {"killerName": "CT1", "timeToDeathS": 0.4, "zone": None})
    assert "an unnamed area" in text and "0.4 s" in text
    text = render("untraded_death", "pl", {"killerName": "X", "tradeWindowS": 5.0, "teammatesAlive": 3, "nearestTeammateM": 12.5, "zone": "A site"})
    assert "5 s" in text and "A site" in text
    assert not re.search(r"\{\w+\}", text)
