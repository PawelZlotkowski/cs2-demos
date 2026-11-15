from __future__ import annotations

import pandas as pd

from app.processing.normalize import normalize_parsed
from tests.analysis import synthetic_demo as sd


def test_match_score_follows_team_identity_through_halftime_and_overtime():
    parsed = sd.build()
    freeze_ticks = [1000, 9000, 17000, 25000, 33000, 41000]
    end_ticks = [7000, 15000, 23000, 31000, 39000, 47000]
    # Outcomes by stable team: CT-starting team, T-starting team, T, CT, CT, T.
    winners = ["CT", "T", "CT", "T", "T", "CT"]
    parsed.freeze_ends = pd.DataFrame({"tick": freeze_ticks})
    parsed.round_ends = pd.DataFrame(
        {"tick": end_ticks, "winner": winners, "reason": ["team"] * 6, "round": range(1, 7)}
    )

    tick_rows = []
    for round_index, start in enumerate(freeze_ticks):
        # First two rounds use initial sides; rounds 3–4 switch at halftime.
        # Round 5 returns to the initial orientation, then round 6 switches
        # again to exercise an overtime side change.
        swapped = round_index in (2, 3, 5)
        for tick in range(start, end_ticks[round_index] + 1, 8):
            for player in sd.T_IDS + sd.CT_IDS:
                initially_t = player in sd.T_IDS
                is_t = initially_t != swapped
                tick_rows.append(
                    {
                        "tick": tick,
                        "steamid": player,
                        "X": 0.0,
                        "Y": 0.0,
                        "Z": 0.0,
                        "yaw": 0.0,
                        "health": 100,
                        "team_num": 2 if is_t else 3,
                        "is_alive": True,
                        "name": str(player),
                    }
                )
    parsed.ticks = pd.DataFrame(tick_rows)

    out = normalize_parsed("match-score", parsed)

    # Current-side winners map to stable teams as CT, T, T, CT, T, T.
    # In particular, round 5's T winner is the team that started on T.
    assert out["match"]["score"] == "2–4"
    assert out["match"]["won"] == [1, 0, 0, 1, 0, 0]


def test_match_score_does_not_infer_team_identity_without_roster_sides():
    parsed = sd.build()
    parsed.ticks["team_num"] = 0

    out = normalize_parsed("match-unknown-sides", parsed)

    assert out["match"]["score"] == "–"
    assert out["match"]["won"] == [None, None]
