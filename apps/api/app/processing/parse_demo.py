"""Parse CS2 demos with demoparser2 into intermediate tables."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import pandas as pd
from demoparser2 import DemoParser

from app.processing.time_utils import DEFAULT_TICK_RATE, SAMPLE_HZ, tick_stride

logger = logging.getLogger(__name__)


class ParseError(Exception):
    """User-facing parse failure."""


@dataclass
class ParsedDemo:
    header: dict[str, Any]
    players: list[dict[str, Any]]
    round_starts: pd.DataFrame
    round_ends: pd.DataFrame
    freeze_ends: pd.DataFrame
    deaths: pd.DataFrame
    bomb_planted: pd.DataFrame
    bomb_defused: pd.DataFrame
    flashes: pd.DataFrame
    smokes: pd.DataFrame
    hes: pd.DataFrame
    ticks: pd.DataFrame
    tick_rate: int = DEFAULT_TICK_RATE
    sample_hz: int = SAMPLE_HZ
    extras: dict[str, Any] = field(default_factory=dict)


def parse_demo_file(dem_path: str, *, tick_rate: int = DEFAULT_TICK_RATE) -> ParsedDemo:
    try:
        parser = DemoParser(dem_path)
        header = dict(parser.parse_header())
        players_df = parser.parse_player_info()
        players = [
            {
                "id": str(row["steamid"]),
                "name": str(row["name"]),
                "team_number": int(row["team_number"]) if pd.notna(row["team_number"]) else 0,
            }
            for _, row in players_df.iterrows()
        ]

        round_starts = parser.parse_event("round_start")
        round_ends = parser.parse_event("round_end")
        try:
            freeze_ends = parser.parse_event("round_freeze_end")
        except Exception:
            freeze_ends = pd.DataFrame(columns=["tick"])

        deaths = parser.parse_event(
            "player_death",
            player=["X", "Y", "Z"],
        )
        bomb_planted = _safe_event(parser, "bomb_planted")
        bomb_defused = _safe_event(parser, "bomb_defused")
        flashes = _safe_event(parser, "flashbang_detonate")
        smokes = _safe_event(parser, "smokegrenade_detonate")
        hes = _safe_event(parser, "hegrenade_detonate")

        max_tick = 0
        if len(round_ends):
            max_tick = max(max_tick, int(round_ends["tick"].max()))
        if len(deaths):
            max_tick = max(max_tick, int(deaths["tick"].max()))
        if max_tick <= 0:
            raise ParseError("Demo contained no usable round or death ticks.")

        stride = tick_stride(tick_rate, SAMPLE_HZ)
        wanted = list(range(0, max_tick + 1, stride))
        ticks = parser.parse_ticks(
            ["X", "Y", "Z", "yaw", "health", "team_num", "is_alive", "name"],
            ticks=wanted,
        )
        if ticks is None or len(ticks) == 0:
            raise ParseError("Could not read player positions from the demo.")

        return ParsedDemo(
            header=header,
            players=players,
            round_starts=round_starts,
            round_ends=round_ends,
            freeze_ends=freeze_ends,
            deaths=deaths,
            bomb_planted=bomb_planted,
            bomb_defused=bomb_defused,
            flashes=flashes,
            smokes=smokes,
            hes=hes,
            ticks=ticks,
            tick_rate=tick_rate,
            sample_hz=SAMPLE_HZ,
        )
    except ParseError:
        raise
    except Exception as exc:
        logger.exception("demoparser2 failed for %s", dem_path)
        raise ParseError("Could not parse that CS2 demo.") from exc


def _safe_event(parser: DemoParser, name: str) -> pd.DataFrame:
    try:
        return parser.parse_event(name)
    except Exception:
        return pd.DataFrame()
