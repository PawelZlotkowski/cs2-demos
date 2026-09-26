"""Detector registry (AI Coach plan §4.3).

Each detector is a pure function ``detect(match, round_no, player_id)`` that
returns ``FindingDraft``s. Order here is the order of D1–D10 in the plan.
"""

from __future__ import annotations

from collections.abc import Callable

from app.analysis.detectors import (
    dry_peek,
    economy_mismatch,
    good_plays,
    late_rotation,
    opening_duel,
    repeated_death_zone,
    shot_while_moving,
    team_flash,
    unused_utility,
    untraded_death,
)
from app.analysis.detectors.common import FindingDraft
from app.analysis.match_data import MatchData

Detector = Callable[[MatchData, int, str], list[FindingDraft]]

DETECTORS: dict[str, Detector] = {
    "untraded_death": untraded_death.detect,  # D1
    "shot_while_moving": shot_while_moving.detect,  # D2
    "unused_utility": unused_utility.detect,  # D3
    "dry_peek": dry_peek.detect,  # D4
    "team_flash": team_flash.detect,  # D5
    "opening_duel": opening_duel.detect,  # D6
    "economy_mismatch": economy_mismatch.detect,  # D7
    "late_rotation": late_rotation.detect,  # D8
    "repeated_death_zone": repeated_death_zone.detect,  # D9
    "good_plays": good_plays.detect,  # D10
}

__all__ = ["DETECTORS", "Detector", "FindingDraft"]
