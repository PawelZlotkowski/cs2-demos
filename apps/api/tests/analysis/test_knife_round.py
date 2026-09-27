"""Knife rounds for sides are parsed as round 1 but are not analysed."""

from app.analysis.detectors.economy_mismatch import is_pistol_round
from app.analysis.extract import is_knife_round
from app.analysis.run import analyse_player
from app.analysis.stats import match_round_stats
from tests.analysis.builders import kill, match, round_, shot, sides


def test_knife_round_rule():
    knife_kills = [{"weapon": "knife_t"}, {"weapon": "bayonet"}]
    assert is_knife_round(knife_kills, [{"weapon": "weapon_knife"}])
    assert not is_knife_round(knife_kills, [{"weapon": "weapon_glock"}])
    assert not is_knife_round([{"weapon": "ak47"}], [])
    assert not is_knife_round([], [])  # nobody died: cannot tell


def test_knife_round_is_skipped_by_detectors_and_stats():
    swapped = sides(t_side=[f"ct{i}" for i in range(1, 6)], ct_side=[f"t{i}" for i in range(1, 6)])
    r1 = round_(1, side_map=swapped, kills=[kill(10.0, "t2", "t1", weapon="knife_t")], shots=[shot(9.5, "t1", 250, weapon="weapon_knife")])
    r1.is_knife = True
    r2 = round_(2, kills=[kill(12.0, "ct1", "t1")])
    m = match(r1, r2)
    result = analyse_player(m, "t1")
    assert result.findings and all(f.round == 2 for f in result.findings)
    assert [s.round for s in match_round_stats(m, "t1")] == [2]
    assert is_pistol_round(m, 2)  # first gun round after the knife round
