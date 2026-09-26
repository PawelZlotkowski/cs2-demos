"""Run every detector for one player and build the player's analysis."""

from __future__ import annotations

from app.analysis.detectors import DETECTORS, FindingDraft
from app.analysis.match_data import MatchData
from app.analysis.ranker import rank_moments
from app.analysis.stats import match_round_stats
from app.coach.templates import render
from app.models.contracts import Finding, PlayerAnalysis


def detect_findings(match: MatchData, player_id: str) -> list[Finding]:
    drafts: list[FindingDraft] = []
    for rd in match.playable_rounds():
        if player_id not in rd.sides:
            continue
        for detect in DETECTORS.values():
            drafts.extend(detect(match, rd.number, player_id))
    drafts.sort(key=lambda d: (d.round, d.t, list(DETECTORS).index(d.detector)))
    return [to_finding(d, f"F{i}") for i, d in enumerate(drafts, start=1)]


def to_finding(d: FindingDraft, finding_id: str) -> Finding:
    return Finding(
        id=finding_id,
        detector=d.detector,
        kind=d.kind,  # type: ignore[arg-type]
        round=d.round,
        t=round(d.t, 3),
        tick=d.tick,
        player_id=d.player_id,
        other_ids=list(dict.fromkeys(o for o in d.other_ids if o)),
        zone=d.zone,
        severity=d.severity,
        evidence=d.evidence,
        summary=render(d.template, "en", {**d.evidence, "zone": d.zone, "round": d.round}),
        template=d.template,
    )


def analyse_player(match: MatchData, player_id: str) -> PlayerAnalysis:
    findings = detect_findings(match, player_id)
    return PlayerAnalysis(
        match_id=match.match_id,
        player_id=player_id,
        findings=findings,
        round_stats=match_round_stats(match, player_id),
        moments=rank_moments(findings),
    )
