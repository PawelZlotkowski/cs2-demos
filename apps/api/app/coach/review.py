"""Match overview summary and end-of-review wrap-up (design plan items 2 and 3).

The texts come from the coach jobs (``CoachJobs.review``) and pass the same
verifier as the moment explanations. This module holds the code side: the
findings a review talks about, the numbers it may quote, the drills picked
from the knowledge base, and the template fallbacks in en/pl/nl.
"""

from __future__ import annotations

from collections import Counter
from typing import Literal

from app.coach.verify import fallback_text
from app.core.config import settings
from app.models.contracts import Finding, PracticeDrill, SelectedMoment
from app.rag.ingest import Passage, load_passages

ReviewPart = Literal["summary", "wrapup"]
PARTS: tuple[ReviewPart, ...] = ("summary", "wrapup")


def review_findings(moments: list[SelectedMoment], findings: list[Finding]) -> list[Finding]:
    """The findings of the picked moments, in moment order, each once."""
    by_id = {f.id: f for f in findings}
    out: list[Finding] = []
    for m in moments:
        for fid in m.finding_ids:
            f = by_id.get(fid)
            if f is not None and f not in out:
                out.append(f)
    return out


def leads(moments: list[SelectedMoment], findings: list[Finding]) -> list[Finding]:
    by_id = {f.id: f for f in findings}
    return [by_id[m.finding_ids[0]] for m in moments if m.finding_ids and m.finding_ids[0] in by_id]


def detector_key(f: Finding) -> str:
    """``opening_duel.lost`` and ``opening_duel.won`` share the ``opening_duel`` drill."""
    return f.detector.split(".")[0]


def review_numbers(moments: list[SelectedMoment], findings: list[Finding]) -> set[float]:
    """Counts the review may quote: moments, mistakes, good plays and findings per detector."""
    lead = leads(moments, findings)
    counts = Counter(detector_key(f) for f in review_findings(moments, findings))
    numbers = {float(len(moments)), float(sum(m.kind == "mistake" for m in moments))}
    numbers.add(float(sum(m.kind == "good" for m in moments)))
    numbers.update(float(n) for n in counts.values())
    numbers.update(float(n) for n in Counter(detector_key(f) for f in lead).values())
    return numbers


def practice_drills(
    moments: list[SelectedMoment],
    findings: list[Finding],
    passages: list[Passage] | None = None,
) -> list[PracticeDrill]:
    """One drill per mistake type among the moments, from ``data/knowledge/general/practice.md``."""
    passages = passages if passages is not None else load_passages(settings.knowledge_dir)
    drills = [p for p in passages if p.topic == "practice"]
    mistakes: dict[str, list[str]] = {}
    for m in moments:
        if m.kind != "mistake":
            continue
        for f in review_findings([m], findings):
            if f.kind == "mistake":
                mistakes.setdefault(detector_key(f), []).append(f.id)
    out: list[PracticeDrill] = []
    for detector, ids in mistakes.items():
        passage = next((p for p in drills if _names_detector(p, detector)), None)
        if passage is None:
            continue
        out.append(
            PracticeDrill(
                detector=detector,
                finding_ids=list(dict.fromkeys(ids)),
                passage_id=passage.id,
                title=passage.title,
                text=_body(passage),
                source=passage.source,
            )
        )
    return out


def _names_detector(p: Passage, detector: str) -> bool:
    first = p.text.splitlines()[0] if p.text else ""
    if not first.startswith("Detectors:"):
        return False
    named = first.removeprefix("Detectors:").strip().rstrip(".")
    return detector in {d.strip() for d in named.split(",")}


def _body(p: Passage) -> str:
    """The passage without its ``Detectors:`` line."""
    return "\n".join(p.text.splitlines()[1:]).strip()


# --- template fallbacks ------------------------------------------------------------


def _pl(n: int, one: str, few: str, many: str) -> str:
    if n == 1:
        return one
    if n % 10 in (2, 3, 4) and n % 100 not in (12, 13, 14):
        return few
    return many


def _counts_sentence(moments: list[SelectedMoment], lang: str) -> str:
    n = len(moments)
    bad = sum(m.kind == "mistake" for m in moments)
    good = sum(m.kind == "good" for m in moments)
    if lang == "pl":
        return (
            f"Coach wybrał {n} {_pl(n, 'moment', 'momenty', 'momentów')}: "
            f"{bad} {_pl(bad, 'błąd', 'błędy', 'błędów')} i "
            f"{good} {_pl(good, 'dobre zagranie', 'dobre zagrania', 'dobrych zagrań')}."
        )
    if lang == "nl":
        return (
            f"De coach koos {n} {'moment' if n == 1 else 'momenten'}: "
            f"{bad} {'fout' if bad == 1 else 'fouten'} en {good} {'goede actie' if good == 1 else 'goede acties'}."
        )
    return (
        f"The coach picked {n} {'moment' if n == 1 else 'moments'}: "
        f"{bad} {'mistake' if bad == 1 else 'mistakes'} and {good} {'good play' if good == 1 else 'good plays'}."
    )


def _top(moments: list[SelectedMoment], findings: list[Finding], kind: str) -> Finding | None:
    picked = [f for f in leads(moments, findings) if f.kind == kind]
    return max(picked, key=lambda f: f.severity, default=None)


def _lower_first(text: str) -> str:
    """"Won the duel" -> "won the duel", but a name such as "P5" or "AWP" stays."""
    return text[:1].lower() + text[1:] if text[:2].istitle() and text[:2].isalpha() else text


WRAPUP_LABELS = {
    "en": ("Went well: ", "Fix first: "),
    "pl": ("Dobrze: ", "Najpierw popraw: "),
    "nl": ("Ging goed: ", "Eerst verbeteren: "),
}

NO_MOMENTS = {
    "en": "The coach found no moments to review in this match.",
    "pl": "Coach nie znalazł w tym meczu momentów do omówienia.",
    "nl": "De coach vond in deze wedstrijd geen momenten om te bespreken.",
}


def fallback_summary(moments: list[SelectedMoment], findings: list[Finding], lang: str) -> str:
    if not moments:
        return NO_MOMENTS[lang]
    top = [f for f in (_top(moments, findings, "mistake"), _top(moments, findings, "good")) if f]
    return " ".join([_counts_sentence(moments, lang), fallback_text(top, lang, limit=2)])


def fallback_wrapup(moments: list[SelectedMoment], findings: list[Finding], lang: str) -> str:
    if not moments:
        return NO_MOMENTS[lang]
    well, fix = WRAPUP_LABELS[lang]
    parts = []
    good = _top(moments, findings, "good")
    if good:
        parts.append(well + _lower_first(fallback_text([good], lang)))
    bad = _top(moments, findings, "mistake")
    if bad:
        parts.append(fix + _lower_first(fallback_text([bad], lang)))
    return " ".join(parts) or fallback_summary(moments, findings, lang)
