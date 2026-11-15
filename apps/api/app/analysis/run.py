"""Run every detector for one player and build the player's analysis."""

from __future__ import annotations

from app.analysis.detectors import DETECTORS, FindingDraft
from app.analysis.policy import LOCAL_V1_DETECTORS
from app.core.config import settings
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
        names = LOCAL_V1_DETECTORS if settings.analysis_profile == "local-v1" else DETECTORS
        for name in names:
            drafts.extend(DETECTORS[name](match, rd.number, player_id))
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


def matches_focus(finding: Finding, focus: str) -> bool:
    if focus == "overall":
        return True
    detectors = {
        "shooting": {"shot_while_moving", "opening_duel"},
        "utility": {"unused_utility", "team_flash"},
        "teamwork": {"untraded_death", "team_flash"},
    }
    good_plays = {
        "shooting": {"entry_kill", "multi_kill", "clutch"},
        "utility": {"flash_assist", "utility_damage"},
        "teamwork": {"trade_kill", "flash_assist"},
    }
    return finding.detector in detectors[focus] or (
        finding.detector == "good_plays" and finding.template.removeprefix("good_plays.") in good_plays[focus]
    )


def analyse_player(match: MatchData, player_id: str, *, focus: str = "overall") -> PlayerAnalysis:
    findings = detect_findings(match, player_id)
    findings = [f for f in findings if matches_focus(f, focus)]
    return PlayerAnalysis(
        match_id=match.match_id,
        player_id=player_id,
        findings=findings,
        round_stats=match_round_stats(match, player_id),
        moments=rank_moments(findings),
    )
