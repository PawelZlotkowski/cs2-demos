from app.analysis.detectors import team_flash
from tests.analysis.builders import blind, grenade, kill, match, round_, w


def test_flash_blinding_teammates():
    rd = round_(
        grenades=[grenade(15.0, "flash", "t1", w("Top mid"))],
        blinds=[blind(15.0, "t1", "t2", 2.5), blind(15.0, "t1", "t3", 1.2), blind(15.0, "t1", "ct1", 0.5)],
    )
    out = team_flash.detect(match(rd), 2, "t1")
    assert len(out) == 1
    f = out[0]
    assert f.evidence["teammatesBlinded"] == 2
    assert f.evidence["enemiesBlinded"] == 0  # 0.5 s is below the threshold
    assert f.zone == "Top mid"
    assert f.other_ids == ["t2", "t3"]


def test_self_flash_uses_self_template():
    rd = round_(blinds=[blind(15.0, "t1", "t1", 3.0)])
    out = team_flash.detect(match(rd), 2, "t1")
    assert out[0].template == "team_flash.self"


def test_short_blinds_and_enemy_only_flash_are_ignored():
    rd = round_(blinds=[blind(15.0, "t1", "t2", 0.8), blind(20.0, "t1", "ct1", 3.0)])
    assert team_flash.detect(match(rd), 2, "t1") == []


def test_teammate_flashing_the_player_is_not_their_finding():
    rd = round_(blinds=[blind(15.0, "t2", "t1", 3.0)])
    assert team_flash.detect(match(rd), 2, "t1") == []


def test_dead_players_are_not_counted_and_longest_is_the_teammates_blind():
    rd = round_(
        kills=[kill(5.0, "ct1", "t3"), kill(6.0, "t2", "ct2")],
        blinds=[blind(15.0, "t1", "t2", 1.2), blind(15.0, "t1", "t1", 4.5),
                blind(15.0, "t1", "t3", 3.0), blind(15.0, "t1", "ct2", 3.0)],
    )
    f = team_flash.detect(match(rd), 2, "t1")[0]
    assert f.evidence["teammatesBlinded"] == 1 and f.other_ids == ["t2"]
    assert f.evidence["enemiesBlinded"] == 0
    assert f.evidence["longestBlindS"] == 1.2
    assert f.severity == 0.53  # 0.3 + 0.15 + 0.2 * 1.2 / 3
    # Only a dead teammate blinded: no finding
    rd = round_(kills=[kill(5.0, "ct1", "t2")], blinds=[blind(15.0, "t1", "t2", 3.0)])
    assert team_flash.detect(match(rd), 2, "t1") == []
