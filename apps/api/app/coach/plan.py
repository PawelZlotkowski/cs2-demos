"""Coach page practice plan (doc 29 §2.1 Plan, R09).

Code picks what to practise: the mistake detectors that fired in the most of
the player's matches, with a recent-vs-before rate once there are enough
matches, one example finding and one drill from
``data/knowledge/general/practice.md``. The coach job only writes the short
note on top, through the verifier; the template below stands in when the
model is off or fails.
"""

from __future__ import annotations

from app.coach.review import _body, _names_detector
from app.coach.tools import cross_match_findings
from app.core.config import settings
from app.models.contracts import PlanItem
from app.rag.ingest import load_passages

MAX_ITEMS = 3
RECENT = 3  # matches in the "recent" window of the rate comparison

LABELS = {
    "untraded_death": ("Untraded deaths", "Śmierci bez wymiany", "Dood zonder trade"),
    "shot_while_moving": ("Shooting while moving", "Strzelanie w ruchu", "Schieten tijdens het lopen"),
    "unused_utility": ("Dying with unused utility", "Śmierć z niewykorzystanymi granatami", "Doodgaan met ongebruikte utility"),
    "dry_peek": ("Dry peeks", "Wychylenia bez wsparcia", "Peeks zonder utility"),
    "team_flash": ("Flashing your team", "Oślepianie własnej drużyny", "Je team flashen"),
    "economy_mismatch": ("Buys that do not match the team", "Zakupy niezgodne z drużyną", "Aankopen die niet bij het team passen"),
    "late_rotation": ("Late rotations", "Spóźnione rotacje", "Late rotaties"),
    "repeated_death_zone": ("Dying in the same spot", "Śmierć w tym samym miejscu", "Op dezelfde plek doodgaan"),
    "opening_duel": ("Lost opening duels", "Przegrane pierwsze pojedynki", "Verloren openingsduels"),
}
LANG_INDEX = {"en": 0, "pl": 1, "nl": 2}


def label(detector: str, lang: str = "en") -> str:
    names = LABELS.get(detector)
    return names[LANG_INDEX[lang]] if names else detector.replace("_", " ").capitalize()


def _per10(counts: list[int], rounds: list[int]) -> float | None:
    total = sum(rounds)
    return round(10 * sum(counts) / total, 1) if total else None


def plan_items(player_id: str, ticks: dict[str, str] | None = None) -> list[PlanItem]:
    """Up to three mistake types to practise, most widespread first."""
    from app.repositories.matches import repo

    ticks = ticks or {}
    history = repo.analysis.player_history(player_id)  # oldest first, same order as the M refs
    if not history:
        return []
    mistakes = cross_match_findings(player_id, kind="mistake")
    detectors = sorted({f.detector.split(".")[0] for _r, _rec, f in mistakes})
    passages = [p for p in load_passages(settings.knowledge_dir) if p.topic == "practice"]
    rows = []
    for d in detectors:
        counts = [sum(n for k, n in h["counts"].items() if k.split(".")[0] == d) for h in history]
        with_it = sum(1 for c in counts if c)
        rounds = [h["rounds"] for h in history]
        recent = before = None
        if len(history) > RECENT:
            recent = _per10(counts[-RECENT:], rounds[-RECENT:])
            before = _per10(counts[:-RECENT], rounds[:-RECENT])
        # The newest match's most severe case is the example to watch
        example = next(
            (f for _ref, _rec, f in sorted(mistakes, key=lambda x: (x[0] != f"M{len(history)}", -x[2].severity))
             if f.detector.split(".")[0] == d),
            None,
        )
        drill = next((p for p in passages if _names_detector(p, d)), None)
        rows.append(
            (
                (with_it, sum(counts)),
                PlanItem(
                    detector=d,
                    label=label(d),
                    matches_with=with_it,
                    matches_total=len(history),
                    per10_recent=recent,
                    per10_before=before,
                    example=example.id if example else None,
                    drill_id=drill.id if drill else None,
                    drill_title=drill.title if drill else None,
                    drill_text=_body(drill) if drill else None,
                    done=d in ticks,
                    done_at=ticks.get(d),
                ),
            )
        )
    rows.sort(key=lambda r: r[0], reverse=True)
    return [item for _key, item in rows[:MAX_ITEMS]]


def plan_numbers(items: list[PlanItem]) -> set[float]:
    out: set[float] = set()
    for i in items:
        out.update({float(i.matches_with), float(i.matches_total)})
        out.update(float(v) for v in (i.per10_recent, i.per10_before) if v is not None)
    return out


SENTENCES = {
    "en": ("{label}: in {n} of your last {m} matches{ex}.", " Drill: {title} [{k}]."),
    "pl": ("{label}: w {n} z ostatnich {m} meczów{ex}.", " Ćwiczenie: {title} [{k}]."),
    "nl": ("{label}: in {n} van je laatste {m} wedstrijden{ex}.", " Oefening: {title} [{k}]."),
}
EMPTY = {
    "en": "No repeated mistakes yet. Review another match and the plan fills in.",
    "pl": "Na razie brak powtarzających się błędów. Przeanalizuj kolejny mecz, a plan się uzupełni.",
    "nl": "Nog geen terugkerende fouten. Bekijk nog een wedstrijd en het plan vult zich.",
}


def fallback_plan_text(items: list[PlanItem], lang: str) -> str:
    if not items:
        return EMPTY[lang]
    first, drill = SENTENCES[lang]
    parts = []
    for i in items:
        s = first.format(label=label(i.detector, lang), n=i.matches_with, m=i.matches_total, ex=f" [{i.example}]" if i.example else "")
        if i.drill_id:
            s += drill.format(title=i.drill_title, k=i.drill_id)
        parts.append(s)
    return " ".join(parts)
