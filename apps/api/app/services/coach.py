"""Deterministic Coach mock — only answers from structured moment context."""

from __future__ import annotations

import re
from typing import Any

from app.models.contracts import CoachRequest, CoachResponse


CITATION_RE = re.compile(r"\[(F\d+|t:[\d.]+|m\d+)\]")


def _findings_from_moment(moment: dict[str, Any]) -> set[str]:
    ids: set[str] = set()
    for row in moment.get("ev") or []:
        if len(row) >= 3 and isinstance(row[2], str):
            ids.add(row[2])
    for ev in moment.get("events") or []:
        if len(ev) >= 5 and isinstance(ev[4], str):
            ids.add(ev[4])
    return ids


class CoachService:
    def answer(self, match_record: dict[str, Any], body: CoachRequest) -> CoachResponse:
        moments: list[dict] = match_record.get("moments") or []
        moment = next((m for m in moments if m["id"] == body.moment_id), None)
        if not moment:
            return CoachResponse(
                answer="That moment isn't in this match.",
                citations=[],
                momentId=body.moment_id,
                mocked=True,
            )

        q = body.question.strip().lower()
        qa_pairs: list[list[str]] = moment.get("qa") or []

        # Exact / fuzzy match against scripted Q&A
        for question, answer in qa_pairs:
            if q == question.lower() or q in question.lower() or question.lower() in q:
                citations = CITATION_RE.findall(answer)
                return CoachResponse(
                    answer=answer,
                    citations=citations,
                    momentId=moment["id"],
                    mocked=True,
                )

        # Keyword routing into scripted answers without inventing facts
        for question, answer in qa_pairs:
            keys = set(re.findall(r"[a-z0-9]+", question.lower()))
            hit = sum(1 for k in keys if k in q and len(k) > 3)
            if hit >= 2:
                citations = CITATION_RE.findall(answer)
                return CoachResponse(
                    answer=answer,
                    citations=citations,
                    momentId=moment["id"],
                    mocked=True,
                )

        # Fallback: only restate ENGINE / DERIVED fields already on the moment
        finding_ids = sorted(_findings_from_moment(moment))
        cite = f" [{finding_ids[0]}]" if finding_ids else ""
        answer = (
            f"{moment['finding']}{cite} "
            f"Picked because: {moment['pick']}. "
            f"Next time: {moment['instead']}"
        )
        citations = CITATION_RE.findall(answer) or finding_ids[:1]
        return CoachResponse(
            answer=answer,
            citations=citations,
            momentId=moment["id"],
            mocked=True,
        )


coach_service = CoachService()
