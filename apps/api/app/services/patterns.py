"""Pattern / personalisation helpers from fixture data."""

from __future__ import annotations

from typing import Any

from app.models.contracts import MomentKind, Pattern, PatternClass, PatternsResponse


def patterns_from_record(record: dict[str, Any]) -> PatternsResponse:
    last7: list[str] = record.get("last7") or []
    moments: list[dict] = record.get("moments") or []
    patterns: list[Pattern] = []

    # Build patterns from moment.pattern snippets (deterministic mock)
    seen: set[str] = set()
    for m in moments:
        key = m.get("cat", m["id"]).lower().replace(" ", "-")
        if key in seen:
            continue
        seen.add(key)
        pat = m.get("pattern") or {}
        occ = pat.get("last7") or [0, 0, 0, 0, 0, 0, 0]
        freq = sum(occ) / max(len(occ), 1)
        kind = MomentKind(m["kind"])
        if kind == MomentKind.strength:
            cls = PatternClass.strength
            direction = "flat"
        elif freq >= 0.4:
            cls = PatternClass.recurring
            direction = "up"
        elif "improving" in (pat.get("text") or "").lower():
            cls = PatternClass.improving
            direction = "down"
        else:
            cls = PatternClass.one_off
            direction = "flat"

        patterns.append(
            Pattern(
                key=key,
                label=pat.get("text") or m["title"],
                kind=kind,
                occurrences=occ,
                class_=cls,
                direction=direction,
                frequency=freq,
            )
        )

    return PatternsResponse(last7=last7, patterns=patterns[:6])
