"""Parse CS2 demos with demoparser2 into intermediate tables."""

from __future__ import annotations

import logging
from dataclasses import dataclass, field
from typing import Any

import pandas as pd
from demoparser2 import DemoParser

from app.processing.time_utils import DEFAULT_TICK_RATE, SAMPLE_HZ, tick_stride

logger = logging.getLogger(__name__)

# Props at the end of buy time (money and kit the player went into the round with)
ECONOMY_PROPS = ["balance", "current_equip_value", "armor_value", "has_helmet", "team_num"]
# Full tick rate props near kills: movement, aim, weapon, utility, flash state
DENSE_PROPS = [
    "X",
    "Y",
    "Z",
    "velocity_X",
    "velocity_Y",
    "yaw",
    "pitch",
    "health",
    "team_num",
    "is_alive",
    "active_weapon_name",
    "inventory",
    "flash_duration",
]
# Seconds of full-rate ticks kept before each kill (plan §4.1: about 3 s)
DENSE_WINDOW_SECONDS = 3.0
# CS2 buy time after freeze end (mp_buytime default 20 s)
BUY_TIME_SECONDS = 20.0


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
    # Coach analysis inputs (plan §4.1). Empty frames when the demo lacks them.
    weapon_fires: pd.DataFrame = field(default_factory=pd.DataFrame)
    hurts: pd.DataFrame = field(default_factory=pd.DataFrame)
    blinds: pd.DataFrame = field(default_factory=pd.DataFrame)
    purchases: pd.DataFrame = field(default_factory=pd.DataFrame)
    plant_begins: pd.DataFrame = field(default_factory=pd.DataFrame)
    defuse_begins: pd.DataFrame = field(default_factory=pd.DataFrame)
    infernos: pd.DataFrame = field(default_factory=pd.DataFrame)
    smokes_expired: pd.DataFrame = field(default_factory=pd.DataFrame)
    # Economy props at the end of buy time, one tick per round
    economy: pd.DataFrame = field(default_factory=pd.DataFrame)
    # Full-rate ticks in a window before each kill (see DENSE_WINDOW_SECONDS)
    dense_ticks: pd.DataFrame = field(default_factory=pd.DataFrame)
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
            player=["X", "Y", "Z", "team_num"],
        )
        bomb_planted = _safe_event(parser, "bomb_planted", player=["X", "Y", "Z"])
        bomb_defused = _safe_event(parser, "bomb_defused")
        flashes = _safe_event(parser, "flashbang_detonate")
        smokes = _safe_event(parser, "smokegrenade_detonate")
        hes = _safe_event(parser, "hegrenade_detonate")

        # Shots carry the shooter's position and velocity at the shot tick, so
        # "shot while moving" does not need full-rate ticks everywhere.
        weapon_fires = _safe_event(
            parser, "weapon_fire", player=["X", "Y", "Z", "velocity_X", "velocity_Y", "team_num"]
        )
        hurts = _safe_event(parser, "player_hurt", player=["X", "Y", "Z", "team_num"])
        blinds = _safe_event(parser, "player_blind", player=["team_num"])
        purchases = _safe_event(parser, "item_purchase")
        plant_begins = _safe_event(parser, "bomb_beginplant", player=["X", "Y", "Z"])
        defuse_begins = _safe_event(parser, "bomb_begindefuse", player=["X", "Y", "Z"])
        infernos = _safe_event(parser, "inferno_startburn")
        smokes_expired = _safe_event(parser, "smokegrenade_expired")

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

        economy = _safe_ticks(parser, ECONOMY_PROPS, _buy_end_ticks(freeze_ends, round_ends, tick_rate))
        dense_ticks = _safe_ticks(
            parser, DENSE_PROPS, _dense_ticks_before(deaths, tick_rate, DENSE_WINDOW_SECONDS)
        )

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
            weapon_fires=weapon_fires,
            hurts=hurts,
            blinds=blinds,
            purchases=purchases,
            plant_begins=plant_begins,
            defuse_begins=defuse_begins,
            infernos=infernos,
            smokes_expired=smokes_expired,
            economy=economy,
            dense_ticks=dense_ticks,
            tick_rate=tick_rate,
            sample_hz=SAMPLE_HZ,
        )
    except ParseError:
        raise
    except Exception as exc:
        logger.exception("demoparser2 failed for %s", dem_path)
        raise ParseError("Could not parse that CS2 demo.") from exc


def _safe_event(
    parser: DemoParser, name: str, *, player: list[str] | None = None
) -> pd.DataFrame:
    try:
        if player:
            return parser.parse_event(name, player=player)
        return parser.parse_event(name)
    except Exception:
        logger.info("Event %s not available in this demo", name)
        return pd.DataFrame()


def _safe_ticks(parser: DemoParser, props: list[str], ticks: list[int]) -> pd.DataFrame:
    if not ticks:
        return pd.DataFrame()
    try:
        df = parser.parse_ticks(props, ticks=ticks)
    except Exception:
        logger.info("Tick props %s not available in this demo", props)
        return pd.DataFrame()
    return df if df is not None else pd.DataFrame()


def _buy_end_ticks(freeze_ends: pd.DataFrame, round_ends: pd.DataFrame, tick_rate: int) -> list[int]:
    """One tick per round: freeze end + buy time, clamped before that round's end."""
    if not len(freeze_ends) or "tick" not in freeze_ends:
        return []
    end_ticks = sorted(int(t) for t in round_ends["tick"].tolist()) if len(round_ends) else []
    out: list[int] = []
    for ft in sorted(int(t) for t in freeze_ends["tick"].tolist()):
        tick = ft + int(BUY_TIME_SECONDS * tick_rate)
        next_end = next((e for e in end_ticks if e > ft), None)
        if next_end is not None:
            tick = min(tick, next_end - 1)
        out.append(max(ft, tick))
    return sorted(set(out))


def _dense_ticks_before(deaths: pd.DataFrame, tick_rate: int, seconds: float) -> list[int]:
    """Every tick in [kill - seconds, kill] for all kills, merged."""
    if not len(deaths) or "tick" not in deaths:
        return []
    span = int(seconds * tick_rate)
    wanted: set[int] = set()
    for t in deaths["tick"].tolist():
        t = int(t)
        wanted.update(range(max(0, t - span), t + 1))
    return sorted(wanted)
