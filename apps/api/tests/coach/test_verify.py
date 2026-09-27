"""T24: verifier on good and bad answers, moment picks and the template fallback."""

from __future__ import annotations

import pytest

from app.coach.verify import (
    VerifyContext,
    autocite,
    citations_in,
    detect_language,
    fallback_text,
    verify_moments,
    verify_text,
)
from app.models.contracts import Finding, RoundStats


def finding(fid: str, **kw) -> Finding:
    base = {
        "id": fid, "detector": "untraded_death", "kind": "mistake", "round": 7, "t": 34.5, "tick": 1000, "player_id": "p",
        "zone": "Palace", "severity": 0.7, "template": "untraded_death",
        "evidence": {"tradeWindowS": 5.0, "teammatesAlive": 2, "killerName": "ropz", "nearestTeammateM": 24.6},
        "summary": "Died to ropz in Palace and was not traded within 5 s; the nearest of 2 living teammates was 24.6 m away.",
    }
    base.update(kw)
    return Finding(**base)


F12 = finding("F12")
F13 = finding(
    "F13", detector="good_plays", kind="good", round=9, t=20.0, zone="A site", severity=0.5,
    template="good_plays.entry_kill", evidence={"play": "entry_kill", "victimName": "karrigan", "weapon": "ak47"},
    summary="Opened the round by killing karrigan in A site with the ak47.",
)
CTX = VerifyContext.build(
    [F12, F13],
    [RoundStats(round=7, player_id="p", kills=0, deaths=1, damage=87)],
    round_durations={7: 95.0, 9: 80.0},
)


def check(text: str, lang: str = "en", **kw):
    return verify_text(text, CTX, lang, **kw)


def test_good_answer_passes():
    r = check(
        "You died in Palace with 2 teammates alive, the nearest 24.6 m away [F12]. "
        "Nobody could trade you within 5 s, so hold a spot where a teammate can see your killer [F12][t:34.5]."
    )
    assert r.ok, r.errors
    assert r.finding_ids == ["F12"] and "t:34.5" in r.citations


def test_round_stats_numbers_and_rounding_are_allowed():
    assert check("You dealt 87 damage in round 7 before dying alone, 25 m from help [F12].").ok


def test_unknown_citation_fails():
    r = check("You died alone in Palace [F99].")
    assert not r.ok and any("F99" in e for e in r.errors)


def test_invented_number_fails():
    r = check("You died alone in Palace, 40 m from your team [F12].")
    assert not r.ok and any("40" in e for e in r.errors)


def test_fact_without_citation_fails():
    r = check("You died in Palace [F12]. Your nearest teammate was 24.6 m away.")
    assert not r.ok and any("without a citation" in e for e in r.errors)


def test_knowledge_ids_must_come_from_a_tool():
    assert not check("Palace is a common spot to be isolated [F12][K7].").ok


def test_numbers_from_a_cited_passage_are_allowed():
    ctx = VerifyContext.build([F12])
    ctx.knowledge["K7"] = "A trade has to land within 2 seconds to count."
    ok = verify_text("You were not traded [F12]. Trades land within 2 seconds, so stay close [K7].", ctx, "en")
    assert ok.ok, ok.errors
    bad = verify_text("You were not traded [F12]. Trades land within 3 seconds [K7].", ctx, "en")
    assert not bad.ok


def test_time_after_round_end_fails():
    assert not check("You died in Palace [F12][t:140].").ok


def test_clock_time_must_match():
    assert check("You died at 0:34 in Palace [F12][t:34.5].").ok
    assert not check("You died at 1:10 in Palace [F12].").ok


def test_sentence_limit():
    text = "You died in Palace [F12]. You were alone [F12]. Nobody traded [F12]. Hold a spot [F12]."
    assert not check(text, max_sentences=3).ok


def test_citation_required_for_explanations_only():
    assert not check("Hold a spot a teammate can see.").ok
    assert check("The data cannot tell where your crosshair was.", require_citation=False).ok


def test_language_mismatch_fails():
    r = check("You died in Palace and nobody was close enough to trade you [F12].", lang="pl")
    assert not r.ok and any("Polish" in e for e in r.errors)


def test_polish_answer_with_decimal_comma_passes():
    r = check(
        "Zginąłeś na Palace, a najbliższy z 2 żywych członków drużyny był 24,6 m dalej [F12]. "
        "Nikt nie mógł cię wymienić w ciągu 5 s [F12].",
        lang="pl",
    )
    assert r.ok, r.errors


def test_dutch_answer_passes():
    r = check("Je ging dood op Palace en de dichtstbijzijnde van 2 teamgenoten was 24.6 m van je af [F12].", lang="nl")
    assert r.ok, r.errors


def test_weapon_names_are_not_numbers():
    assert check("You opened round 9 with the ak47 on A site [F13].").ok


@pytest.mark.parametrize(
    "text,lang",
    [
        ("You died alone and nobody on your team could trade the kill.", "en"),
        ("Zginąłeś sam i nikt z drużyny nie mógł wymienić tego zabójstwa.", "pl"),
        ("Je ging alleen dood en niemand van je team kon de kill ruilen.", "nl"),
    ],
)
def test_detect_language(text, lang):
    assert detect_language(text) == lang


def test_citation_lists():
    assert citations_in("See [F1, F2] and [t:3.5] then [F1].") == ["F1", "F2", "t:3.5"]


@pytest.mark.parametrize("lang", ["en", "pl", "nl"])
def test_fallback_text_passes_the_verifier(lang):
    text = fallback_text([F12, F13], lang)
    assert "[F12]" in text and "[F13]" in text
    r = verify_text(text, CTX, lang, max_sentences=4)
    assert r.ok, (text, r.errors)


def test_fallback_without_findings():
    assert "No mistakes" in fallback_text([], "en")


# --- moment picks ---

FINDINGS = [
    finding("F1", round=1, t=10.0),
    finding("F2", round=2, t=20.0, severity=0.6),
    finding("F3", round=3, t=30.0, detector="dry_peek", template="dry_peek", severity=0.8),
    finding("F4", round=4, t=15.0, kind="good", detector="good_plays", template="good_plays.entry_kill"),
    finding("F5", round=5, t=40.0, kind="good", detector="good_plays", template="good_plays.entry_kill"),
    finding("F6", round=6, t=50.0, severity=0.4),
    finding("F7", round=6, t=52.0, kind="context", detector="opening_duel", template="opening_duel.lost"),
]


def pick(fid: str, kind: str = "mistake", **kw):
    f = next(x for x in FINDINGS if x.id == fid)
    return {"round": f.round, "t0": max(0, f.t - 5), "t1": f.t + 3, "findingIds": [fid], "kind": kind,
            "pickedBecause": f"[{fid}] reason", **kw}


def test_valid_picks():
    picks = [pick("F1"), pick("F3"), pick("F4", "good"), pick("F5", "good"), pick("F6", findingIds=["F6", "F7"])]
    r = verify_moments(picks, FINDINGS)
    assert r.ok, r.errors
    assert [m.id for m in r.moments] == ["m1", "m2", "m3", "m4", "m5"]
    assert all(m.source == "agent" for m in r.moments)


def test_picks_need_count_and_mix():
    r = verify_moments([pick("F1"), pick("F2"), pick("F3"), pick("F6"), pick("F4", "good")], FINDINGS)
    assert not r.ok and any("good plays" in e for e in r.errors)
    r = verify_moments([pick("F1"), pick("F4", "good")], FINDINGS)
    assert not r.ok and any("Pick 5-6" in e for e in r.errors)


def test_pick_errors():
    base = [pick("F3"), pick("F4", "good"), pick("F5", "good"), pick("F6")]
    cases = {
        "unknown findings": pick("F1", findingIds=["F42"]),
        "outside": pick("F1", t0=20.0, t1=30.0),
        "at most 30 s": pick("F1", t0=0.0, t1=45.0),
        "must cite": pick("F1", pickedBecause="no citation"),
        "needs at least one good": pick("F1", "good"),
        "from round": pick("F1", findingIds=["F1", "F2"]),
    }
    for needle, bad in cases.items():
        r = verify_moments([bad, *base], FINDINGS)
        assert any(needle in e for e in r.errors), (needle, r.errors)


def test_picks_too_close_in_one_round():
    close = [finding("F8", round=1, t=14.0, detector="dry_peek", template="dry_peek")]
    second = {**pick("F1"), "findingIds": ["F8"], "pickedBecause": "[F8] reason", "t0": 9.0, "t1": 17.0}
    r = verify_moments([pick("F1"), second], FINDINGS + close)
    assert any("too close" in e for e in r.errors)


def test_scarce_findings_lower_the_bar():
    few = FINDINGS[:1] + [FINDINGS[3]]
    assert verify_moments([pick("F1"), pick("F4", "good")], few).ok


def test_summary_numbers_pass_without_a_finding_citation():
    ctx = VerifyContext.build([finding("F1")])
    text = "You threw no utility before dying in 4 of your last 3 matches."
    # Ask answers need no finding citation; the history counts are the only facts here
    assert not verify_text(text, ctx, "en", require_citation=False).ok
    ctx.summary_numbers.update({4.0, 3.0})
    check = verify_text(text, ctx, "en", require_citation=False)
    assert check.ok, check.errors


def test_cyrillic_and_em_dashes_are_rejected():
    ctx = VerifyContext.build([finding("F1")])
    assert any("Cyrillic" in e for e in verify_text("Zginąłeś bez wsparcia, nieużyтыmi granatami [F1].", ctx, "pl").errors)
    assert any("em dash" in e for e in verify_text("You died alone \u2014 nobody could trade you [F1].", ctx, "en").errors)


def test_autocite_adds_the_finding_that_holds_the_number():
    ctx = VerifyContext.build([finding("F1"), finding("F2", evidence={"reactionS": 0.16})])
    text = "You died alone in Palace [F1]. Nobody could trade you within 5.0 s."
    fixed = autocite(text, ctx, ["F2"])
    assert fixed == "You died alone in Palace [F1]. Nobody could trade you within 5.0 s [F1]."
    assert verify_text(fixed, ctx, "en").ok
    # A number no candidate holds stays uncited, so the verifier still rejects it
    assert autocite("You waited 9.9 s.", ctx, ["F1", "F2"]) == "You waited 9.9 s."


@pytest.mark.parametrize(
    "text",
    [
        # The leaked wrap-up seen on 27 Sep 2026
        'You were not traded in Palace [F12]. search_knowledge "practice drill dry peek"',
        'You were not traded in Palace [F12]. <tool_call>{"name": "search_knowledge", "arguments": {"query": "trade"}}</tool_call>',
        'You were not traded in Palace [F12]. Call get_player_history to see more.',
    ],
)
def test_tool_calls_written_as_text_fail(text):
    check = verify_text(text, CTX, "en")
    assert not check.ok
    assert any("tool calls as text" in e for e in check.errors)


def test_words_close_to_tool_names_pass():
    assert verify_text("You were not traded in Palace [F12], so search for knowledge of trades.", CTX, "en").ok
