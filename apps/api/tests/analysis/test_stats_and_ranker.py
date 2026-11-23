from app.analysis.ranker import MIN_GAP_S, rank_moments
from app.analysis.stats import round_stats
from app.models.contracts import Finding
from tests.analysis.builders import frames, blind, eco, grenade, hurt, kill, match, round_, w


def test_round_stats_numbers():
    rd = round_(
        winner="T",
        kills=[kill(10.0, "t1", "ct1", headshot=True), kill(15.0, "ct2", "t2"), kill(17.0, "t1", "ct2"), kill(50.0, "ct3", "t1")],
        hurts=[hurt(10.0, "t1", "ct1", 100), hurt(16.5, "t1", "ct2", 100), hurt(20.0, "t1", "ct3", 40, "hegrenade"), hurt(21.0, "t1", "t3", 10)],
        grenades=[grenade(20.0, "he", "t1", w("A site")), grenade(9.0, "flash", "t1", w("A ramp"))],
        blinds=[blind(9.0, "t1", "ct1", 2.0), blind(9.0, "t1", "t3", 1.5), blind(9.0, "t1", "ct2", 0.3)],
        economy={"t1": eco(1200, 4700)},
    )
    rd.frames = frames({"t1": w("A site"), "t2": w("A site")})
    s = round_stats(match(rd), rd, "t1")
    assert (s.side, s.won, s.kills, s.deaths, s.headshot_kills) == ("T", True, 2, 1, 1)
    assert s.damage == 240 and s.utility_damage == 40
    assert s.utility_thrown == 2 and s.enemies_flashed == 1 and s.teammates_flashed == 1
    assert s.money_start == 5900 and s.equip_value == 4700
    assert s.opening_kill and not s.opening_death
    assert s.trade_kills == 1
    assert s.death_traded is False and s.survived is False and s.time_alive_s == 50.0


def _f(i, rnd, t, kind, detector, severity):
    return Finding(
        id=f"F{i}", detector=detector, kind=kind, round=rnd, t=t, tick=int(t * 64), player_id="t1",
        severity=severity, summary=f"{detector} in round {rnd}", template=detector,
    )


def test_ranker_mixes_kinds_spreads_detectors_and_respects_gaps():
    findings = [
        _f(1, 1, 20, "mistake", "untraded_death", 0.9),
        _f(2, 2, 20, "mistake", "untraded_death", 0.85),
        _f(3, 3, 20, "mistake", "untraded_death", 0.84),
        _f(4, 4, 20, "mistake", "dry_peek", 0.7),
        _f(5, 5, 20, "mistake", "shot_while_moving", 0.6),
        _f(6, 5, 24, "context", "opening_duel", 0.6),  # joins F5's moment
        _f(7, 6, 30, "good", "good_plays", 0.45),
        _f(8, 7, 30, "good", "good_plays", 0.5),
        _f(9, 7, 35, "good", "good_plays", 0.9),  # within 10 s of F8 -> same moment
        _f(10, 8, 12, "mistake", "team_flash", 0.2),
    ]
    moments = rank_moments(findings)
    assert len(moments) == 6
    kinds = [m.kind for m in moments]
    assert kinds.count("good") >= 2 and kinds.count("mistake") >= 2
    assert [m.id for m in moments] == [f"m{i}" for i in range(1, 7)]
    detectors = [next(f for f in findings if f.id == m.finding_ids[0]).detector for m in moments]
    assert detectors.count("untraded_death") <= 2  # diversity penalty let others in
    for a in moments:
        for b in moments:
            if a is not b and a.round == b.round:
                assert abs(a.t0 - b.t0) >= MIN_GAP_S - 1e-6
    m5 = next(m for m in moments if m.round == 5)
    assert m5.finding_ids == ["F5", "F6"]
    assert m5.picked_because.startswith("[F5] ")
    assert all(m.source == "ranker" for m in moments)


def test_ranker_picks_three_mistakes_and_three_good_plays_when_both_exist():
    """Even when mistakes all score higher, the review is half good plays (owner request, 22 Nov)."""
    findings = [_f(i, i, 20, "mistake", ["untraded_death", "dry_peek", "shot_while_moving", "team_flash"][i % 4], 0.9)
                for i in range(1, 9)]
    findings += [_f(10 + i, 10 + i, 20, "good", "good_plays", 0.3) for i in range(1, 5)]
    kinds = [m.kind for m in rank_moments(findings)]
    assert kinds.count("mistake") == 3 and kinds.count("good") == 3
    only_two_good = [f for f in findings if not (f.kind == "good" and f.round > 12)]
    kinds = [m.kind for m in rank_moments(only_two_good)]
    assert kinds.count("good") == 2 and kinds.count("mistake") == 4  # fills up from the other kind


def test_ranker_uses_at_most_two_moments_of_one_type_while_others_exist():
    """Owner, 22 Nov: a review was five unused-utility deaths; other findings must get a turn."""
    findings = [_f(i, i, 20, "mistake", "unused_utility", 0.9) for i in range(1, 6)]
    findings += [_f(10, 10, 20, "mistake", "untraded_death", 0.4), _f(11, 11, 20, "mistake", "shot_while_moving", 0.3)]
    findings += [_f(20 + i, 20 + i, 20, "good", "good_plays", 0.5) for i in range(1, 4)]
    leads = [next(f for f in findings if f.id == m.finding_ids[0]).detector for m in rank_moments(findings)]
    assert leads.count("unused_utility") == 2  # the third mistake slot goes to another type
    assert "untraded_death" in leads and leads.count("good_plays") == 3


def test_ranker_reports_each_score_at_pick_time():
    """The diversity penalty applies to the later pick only (audit 23 Nov)."""
    moments = rank_moments([_f(1, 3, 40, "mistake", "unused_utility", 0.65), _f(2, 5, 40, "mistake", "unused_utility", 0.65)])
    assert [(m.round, m.score) for m in moments] == [(3, 0.65), (5, 0.455)]


def test_ranker_with_few_findings():
    assert rank_moments([]) == []
    one = rank_moments([_f(1, 1, 3, "good", "good_plays", 0.5)])
    assert len(one) == 1 and one[0].t0 == 0.0


def test_mixed_kind_chain_is_one_clip_not_two_copies():
    fs = [_f(1, 1, 10, "mistake", "team_flash", 0.7),
          _f(2, 1, 16, "context", "opening_duel", 0.5),
          _f(3, 1, 22, "good", "good_plays", 0.8)]
    moments = rank_moments(fs)
    assert len(moments) == 1
    assert set(moments[0].finding_ids) == {"F1", "F2", "F3"}


def test_long_chains_never_create_long_or_overlapping_clips():
    fs = [_f(i, 1, 5 + i * 6, "mistake", "team_flash", 0.5) for i in range(1, 12)]
    moments = rank_moments(fs)
    assert all(m.t1 - m.t0 <= 30 for m in moments)
    assert all(a.t1 <= b.t0 for a, b in zip(moments, moments[1:]))
    assert len(rank_moments(fs, target=1)) == 1
    assert rank_moments(fs, target=0) == []
