"""ParsedDemo -> ``analysis.json`` (per-round events for the detectors).

Kept separate from the round replay blobs so the Radar payload does not grow
(plan §4.1). Positions at 8 Hz are not copied here; ``build_match_data`` reads
them from the replay blobs.
"""

from __future__ import annotations

import math
from typing import Any

import pandas as pd

from app.processing.parse_demo import DENSE_WINDOW_SECONDS, ParsedDemo
from app.processing.time_utils import tick_to_seconds

ANALYSIS_VERSION = 1

GRENADE_TYPES = {
    "flashes": "flash",
    "smokes": "smoke",
    "hes": "he",
}

# Columns kept per tick in the full-rate window before each kill
WINDOW_COLUMNS = {
    "X": "x",
    "Y": "y",
    "velocity_X": "vx",
    "velocity_Y": "vy",
    "yaw": "yaw",
    "pitch": "pitch",
}


def extract_analysis(
    match_id: str,
    parsed: ParsedDemo,
    rounds_meta: list[dict[str, Any]],
    roster: list[dict[str, Any]],
) -> dict[str, Any]:
    tick_rate = parsed.tick_rate
    sides_by_round = _sides_by_round(parsed, rounds_meta)
    economy_by_round = _economy_by_round(parsed, rounds_meta)

    rounds: list[dict[str, Any]] = []
    prev_end = 0
    for meta in rounds_meta:
        start, end = int(meta["startTick"]), int(meta["endTick"])

        def in_round(tick: int, *, from_prev_end: bool = False) -> bool:
            lo = prev_end if from_prev_end else start
            return lo <= tick <= end

        def t_of(tick: int) -> float:
            return round(tick_to_seconds(tick, start, tick_rate), 3)

        kills = [
            {
                "tick": int(row["tick"]),
                "t": t_of(int(row["tick"])),
                "attacker": steam_id(row.get("attacker_steamid")),
                "victim": steam_id(row.get("user_steamid")),
                "weapon": _str(row.get("weapon")),
                "headshot": _bool(row.get("headshot")),
                "assister": steam_id(row.get("assister_steamid")),
                "flashAssist": _bool(row.get("assistedflash")),
                "attackerPos": _xyz(row, "attacker_"),
                "victimPos": _xyz(row, "user_"),
            }
            for _, row in _rows(parsed.deaths)
            if in_round(int(row["tick"])) and steam_id(row.get("user_steamid"))
        ]
        shots = [
            {
                "tick": int(row["tick"]),
                "t": t_of(int(row["tick"])),
                "player": steam_id(row.get("user_steamid")),
                "weapon": _str(row.get("weapon")),
                "speed": _speed(row.get("user_velocity_X"), row.get("user_velocity_Y")),
                "pos": _xyz(row, "user_"),
            }
            for _, row in _rows(parsed.weapon_fires)
            if in_round(int(row["tick"])) and steam_id(row.get("user_steamid"))
        ]
        hurts = [
            {
                "tick": int(row["tick"]),
                "t": t_of(int(row["tick"])),
                "attacker": steam_id(row.get("attacker_steamid")),
                "victim": steam_id(row.get("user_steamid")),
                "damage": int(_num(row.get("dmg_health")) or 0),
                "weapon": _str(row.get("weapon")),
            }
            for _, row in _rows(parsed.hurts)
            if in_round(int(row["tick"])) and steam_id(row.get("user_steamid"))
        ]
        blinds = [
            {
                "tick": int(row["tick"]),
                "t": t_of(int(row["tick"])),
                "attacker": steam_id(row.get("attacker_steamid")),
                "victim": steam_id(row.get("user_steamid")),
                "duration": round(float(_num(row.get("blind_duration")) or 0.0), 2),
            }
            for _, row in _rows(parsed.blinds)
            if in_round(int(row["tick"])) and steam_id(row.get("user_steamid"))
        ]
        grenades: list[dict[str, Any]] = []
        for attr, gtype in GRENADE_TYPES.items():
            for _, row in _rows(getattr(parsed, attr)):
                tick = int(row["tick"])
                if in_round(tick):
                    grenades.append(
                        {
                            "tick": tick,
                            "t": t_of(tick),
                            "type": gtype,
                            "thrower": steam_id(row.get("user_steamid")),
                            "pos": _event_xyz(row),
                        }
                    )
        for _, row in _rows(parsed.infernos):
            tick = int(row["tick"])
            if in_round(tick):
                grenades.append(
                    {
                        "tick": tick,
                        "t": t_of(tick),
                        "type": "molotov",
                        "thrower": steam_id(row.get("user_steamid")),
                        "pos": _event_xyz(row),
                    }
                )
        grenades.sort(key=lambda g: g["tick"])
        purchases = [
            {
                "tick": int(row["tick"]),
                "t": t_of(int(row["tick"])),
                "player": steam_id(row.get("user_steamid")),
                "item": _str(row.get("weapon") or row.get("item")),
            }
            for _, row in _rows(parsed.purchases)
            if in_round(int(row["tick"]), from_prev_end=True) and steam_id(row.get("user_steamid"))
        ]
        bomb: list[dict[str, Any]] = []
        for df, btype in (
            (parsed.plant_begins, "plant_begin"),
            (parsed.bomb_planted, "plant"),
            (parsed.defuse_begins, "defuse_begin"),
            (parsed.bomb_defused, "defuse"),
        ):
            for _, row in _rows(df):
                tick = int(row["tick"])
                if in_round(tick):
                    bomb.append(
                        {
                            "tick": tick,
                            "t": t_of(tick),
                            "type": btype,
                            "player": steam_id(row.get("user_steamid")),
                            "pos": _xyz(row, "user_"),
                        }
                    )
        bomb.sort(key=lambda b: b["tick"])

        rounds.append(
            {
                "number": int(meta["number"]),
                "startTick": start,
                "endTick": end,
                "durationSec": meta.get("durationSec"),
                "winner": meta.get("winner"),
                "reason": meta.get("reason"),
                "sides": sides_by_round.get(int(meta["number"]), {}),
                "economy": economy_by_round.get(int(meta["number"]), {}),
                "kills": kills,
                "shots": shots,
                "hurts": hurts,
                "blinds": blinds,
                "grenades": grenades,
                "purchases": purchases,
                "bomb": bomb,
                "killWindows": _kill_windows(parsed, kills),
            }
        )
        prev_end = end

    return {
        "version": ANALYSIS_VERSION,
        "matchId": match_id,
        "map": str(parsed.header.get("map_name") or "unknown"),
        "tickRate": tick_rate,
        "players": [{"id": p["id"], "name": p["name"]} for p in roster],
        "rounds": rounds,
    }


def _sides_by_round(parsed: ParsedDemo, rounds_meta: list[dict[str, Any]]) -> dict[int, dict[str, str]]:
    """Side per player per round from the first 8 Hz tick after freeze end."""
    out: dict[int, dict[str, str]] = {}
    ticks = parsed.ticks
    if not len(ticks) or "team_num" not in ticks:
        return out
    tick_values = sorted(set(int(t) for t in ticks["tick"].unique()))
    for meta in rounds_meta:
        start = int(meta["startTick"])
        idx = next((t for t in tick_values if t >= start), None)
        if idx is None:
            continue
        rows = ticks[ticks["tick"] == idx]
        sides: dict[str, str] = {}
        for row in _records(rows):
            sid = steam_id(row.get("steamid"))
            tn = _num(row.get("team_num"))
            if sid and tn in (2, 3):
                sides[sid] = "T" if int(tn) == 2 else "CT"
        out[int(meta["number"])] = sides
    return out


def _economy_by_round(
    parsed: ParsedDemo, rounds_meta: list[dict[str, Any]]
) -> dict[int, dict[str, dict[str, Any]]]:
    out: dict[int, dict[str, dict[str, Any]]] = {}
    eco = parsed.economy
    if not len(eco) or "tick" not in eco:
        return out
    for meta in rounds_meta:
        start, end = int(meta["startTick"]), int(meta["endTick"])
        rows = eco[(eco["tick"] >= start) & (eco["tick"] <= end)]
        if rows.empty:
            continue
        first = int(rows["tick"].min())
        per: dict[str, dict[str, Any]] = {}
        for row in _records(rows[rows["tick"] == first]):
            sid = steam_id(row.get("steamid"))
            if not sid:
                continue
            per[sid] = {
                "balance": int(_num(row.get("balance")) or 0),
                "equipValue": int(_num(row.get("current_equip_value")) or 0),
                "armor": int(_num(row.get("armor_value")) or 0),
                "helmet": _bool(row.get("has_helmet")),
            }
        out[int(meta["number"])] = per
    return out


def _kill_windows(parsed: ParsedDemo, kills: list[dict[str, Any]]) -> list[dict[str, Any]]:
    dense = parsed.dense_ticks
    if not len(dense) or "tick" not in dense or "steamid" not in dense:
        return []
    span = int(DENSE_WINDOW_SECONDS * parsed.tick_rate)
    out: list[dict[str, Any]] = []
    for k in kills:
        kt = int(k["tick"])
        tick0 = max(0, kt - span)
        window = dense[(dense["tick"] >= tick0) & (dense["tick"] <= kt)]
        if window.empty:
            continue
        sids = window["steamid"].map(steam_id)
        tracks: dict[str, dict[str, list[float]]] = {}
        for pid in {k["victim"], k.get("attacker")} - {None}:
            rows = window[sids == pid].sort_values("tick")
            if rows.empty:
                continue
            tracks[pid] = {
                short: [round(float(v), 1) if _num(v) is not None else 0.0 for v in rows[col].tolist()]
                for col, short in WINDOW_COLUMNS.items()
                if col in rows
            }
        at_kill: dict[str, dict[str, Any]] = {}
        # Last tick before the kill: the victim's inventory is emptied on death.
        last = window[window["tick"] < kt]
        if not last.empty:
            last = last[last["tick"] == last["tick"].max()]
        for row in _records(last):
            sid = steam_id(row.get("steamid"))
            if not sid:
                continue
            inv = row.get("inventory")
            at_kill[sid] = {
                "weapon": _str(row.get("active_weapon_name")),
                "inventory": _str_list(inv),
                "flash": round(float(_num(row.get("flash_duration")) or 0.0), 2),
                "hp": int(_num(row.get("health")) or 0),
            }
        out.append({"killTick": kt, "tick0": tick0, "tracks": tracks, "atKill": at_kill})
    return out


# --- helpers ---


def _records(df: pd.DataFrame) -> list[dict[str, Any]]:
    """Rows as dicts. Unlike iterrows this keeps each column's type, so a
    uint64 SteamID is not upcast to float next to float columns."""
    if df is None or not len(df):
        return []
    return df.to_dict("records")


def _rows(df: pd.DataFrame):
    if df is None or not len(df) or "tick" not in df:
        return iter(())
    return enumerate(_records(df))


def _num(val: Any) -> float | None:
    if val is None:
        return None
    try:
        f = float(val)
    except (TypeError, ValueError):
        return None
    return None if math.isnan(f) else f


def steam_id(val: Any) -> str | None:
    """SteamID64 as a string. Ints and digit strings stay exact; a float has
    already lost precision above 2**53, so it is only a last resort."""
    if val is None or isinstance(val, bool):
        return None
    if isinstance(val, str):
        s = val.strip()
        return s if s.isdigit() and s != "0" else None
    if isinstance(val, float):
        return None if math.isnan(val) or val <= 0 else str(int(val))
    try:
        i = int(val)  # int and numpy integer types
    except (TypeError, ValueError):
        return None
    return str(i) if i > 0 else None


def _str(val: Any) -> str:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return ""
    return str(val)


def _bool(val: Any) -> bool:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return False
    return bool(val)


def _str_list(val: Any) -> list[str]:
    if val is None or isinstance(val, (str, float, int)):
        return []
    try:
        return [str(i) for i in val]
    except TypeError:
        return []


def _speed(vx: Any, vy: Any) -> float | None:
    x, y = _num(vx), _num(vy)
    if x is None or y is None:
        return None
    return round(math.hypot(x, y), 1)


def _xyz(row: Any, prefix: str) -> list[float] | None:
    x, y, z = _num(row.get(f"{prefix}X")), _num(row.get(f"{prefix}Y")), _num(row.get(f"{prefix}Z"))
    if x is None or y is None:
        return None
    return [round(x, 1), round(y, 1), round(z or 0.0, 1)]


def _event_xyz(row: Any) -> list[float] | None:
    x, y, z = _num(row.get("x")), _num(row.get("y")), _num(row.get("z"))
    if x is None or y is None:
        return _xyz(row, "user_")
    return [round(x, 1), round(y, 1), round(z or 0.0, 1)]
