"""Verifier findings from the 23 Nov 2026 code audit (5a, 5b, 6, 13) and its known limits."""

from __future__ import annotations

from collections import Counter

import pytest

from app.analysis.ranker import moment_type, rank_moments
from app.coach.verify import VerifyContext, autocite, verify_moments, verify_text
from app.models.contracts import RoundStats
from tests.coach.test_verify import CTX, F12, check, finding

# --- 5a: a cited time backs clock times and seconds, not any number ---


def test_cited_time_does_not_allow_the_same_number_elsewhere():
    r = check("You dealt 64 damage and were 64 m from help [F12][t:64].")
    assert not r.ok and any("64" in e for e in r.errors), r.errors


def test_cited_time_still_backs_a_clock_time_and_its_seconds():
    assert check("A flash went off at 0:21 near you [F12][t:21.3].").ok
    r = check("A flash went off 21.3 s into the round [F12][t:21.3].")
    assert r.ok, r.errors


def test_time_citation_without_round_durations_fails():
    across = VerifyContext.build([F12.model_copy(update={"id": "M1:F12"})])
    for text in ("You average 4321 damage per match [t:4321].", "You died in Palace [M1:F12][t:17]."):
        r = verify_text(text, across, "en", require_citation=False)
        assert not r.ok and any("t:" in e for e in r.errors), (text, r.errors)


# --- 5b: glued numbers are each checked ---


@pytest.mark.parametrize(
    "text",
    [
        "It was a 1v9 in Palace [F12].",
        "You lost a 2x9 fight in Palace [F12].",
        "It went 7:9 in Palace [F12].",
        "The round went 7-9 in Palace [F12].",
        "At t:99.9 you died in Palace [F12].",
    ],
)
def test_glued_numbers_are_each_checked(text):
    r = check(text)
    assert not r.ok and any("9" in e for e in r.errors), r.errors


def test_glued_numbers_from_the_evidence_pass():
    ctx = VerifyContext.build([finding("F1", evidence={"clutch": "1v3"})])
    assert verify_text("You won a 1v3 clutch in Palace [F1].", ctx, "en").ok
    assert not verify_text("You won a 1v5 clutch in Palace [F1].", ctx, "en").ok


WEAPONS = [
    "AK-47", "M4A1", "UMP-45", "MP9", "P2000", "R8", "SG 553", "SSG 08", "Desert Eagle", "R8 Revolver",
    "Five-SeveN", "CZ75-Auto", "MAC-10", "MP5-SD", "XM1014", "M249", "G3SG1", "SCAR-20", "P250", "USP-S",
    "Glock-18", "AUG", "FAMAS", "Galil AR", "Nova", "MAG-7", "Sawed-Off", "Negev", "AWP", "Tec-9",
    "Dual Berettas", "PP-Bizon", "P90", "MP7",
]


@pytest.mark.parametrize("name", WEAPONS)
def test_weapon_names_stay_safe(name):
    r = check(f"You opened round 9 with the {name} on A site [F13].")
    assert r.ok, r.errors


def test_numbers_next_to_a_weapon_name_are_still_checked():
    r = check("You dealt 553 damage with the SG 553 on A site [F13].")
    assert not r.ok and any("553" in e for e in r.errors), r.errors


# --- a moment id is not a number ---


def test_moment_citation_does_not_allow_its_number():
    from app.models.contracts import SelectedMoment

    m3 = SelectedMoment(id="m3", round=7, t0=30.0, t1=38.0, finding_ids=["F12"], kind="mistake",
                        picked_because="[F12] reason", score=0.7, source="ranker")
    ctx = VerifyContext.build([F12], moments=[m3], round_durations={7: 95.0})
    r = verify_text("You died 3 m from help in Palace [F12][m3].", ctx, "en")
    assert not r.ok and any("number 3 " in e for e in r.errors), r.errors
    # The moment backs the evidence of the findings it covers
    r = verify_text("Your nearest teammate was 24.6 m away [m3].", ctx, "en", require_citation=False)
    assert r.ok, r.errors


def test_finding_tokens_outside_brackets_stay_safe():
    r = check("Compare M2:F12 with this death in Palace [F12].")
    assert r.ok, r.errors


# --- 6: autocite uses the finding's evidence only ---


def test_autocite_ignores_the_findings_time_round_and_stats():
    f3 = finding("F3", round=7, t=15.5, evidence={"tradeWindowS": 5.0})
    ctx = VerifyContext.build([f3], [RoundStats(round=7, player_id="p", kills=0, deaths=1, damage=87)])
    for invented in ("15", "7", "87"):
        text = f"You died in Palace [F3]. Your nearest teammate was {invented} m away."
        assert autocite(text, ctx, ["F3"]) == text, invented
        assert not verify_text(autocite(text, ctx, ["F3"]), ctx, "en").ok
    # The evidence value is still repaired
    assert autocite("You died [F3]. Nobody traded within 5 s.", ctx, ["F3"]).endswith("5 s [F3].")


# --- 13: the verifier accepts the ranker's own picks ---


def test_ranker_picks_pass_when_a_third_of_one_type_is_unavoidable():
    """F3 (dry_peek) is 8 s from F1 in round 1, so the ranker cannot use it and takes a third untraded death."""
    fs = [
        finding("F1", round=1, t=10.0),
        finding("F3", round=1, t=18.0, detector="dry_peek", template="dry_peek", severity=0.5),
        finding("F2", round=2, t=20.0, severity=0.6),
        finding("F6", round=6, t=50.0, severity=0.4),
        finding("F4", round=4, t=15.0, kind="good", detector="good_plays", template="good_plays.entry_kill"),
        finding("F5", round=5, t=40.0, kind="good", detector="good_plays", template="good_plays.entry_kill"),
    ]
    by_id = {f.id: f for f in fs}
    picks = rank_moments(fs)
    assert Counter(moment_type(by_id[m.finding_ids[0]]) for m in picks)["untraded_death"] == 3
    r = verify_moments([m.model_dump() for m in picks], fs)
    assert r.ok, r.errors


# --- known limits: these pass the verifier today ---

LIMIT = pytest.mark.xfail(strict=False, reason="known limit: the verifier checks citations and numbers, not meaning")


@LIMIT
@pytest.mark.parametrize(
    "text",
    [
        "A teammate traded your death in Palace [F12].",  # flipped meaning: F12 is an untraded death
        "You died in A site [F12].",  # wrong zone: F12 is in Palace
        "Your nearest teammate was 5 m away [F12].",  # 5 s trade window reported as metres
        "Your killer had 87 HP left [F12].",  # round damage reported as HP left
        "You died in Palace with forty teammates nearby [F12].",  # a number written as a word
        "You died in Palace because you peeked without a flash [F12].",  # an invented cause
    ],
)
def test_known_limits(text):
    assert not check(text).ok
