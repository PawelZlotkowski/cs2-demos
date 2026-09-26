"""Normalise ParsedDemo → match metadata + round replay JSON blobs."""

from __future__ import annotations

import math
from typing import Any

import pandas as pd

from app.analysis.extract import extract_analysis, steam_id
from app.maps.metadata import display_map_name, get_map_meta, world_to_radar
from app.processing.parse_demo import ParsedDemo
from app.processing.time_utils import tick_to_seconds


def team_side(team_num: int) -> str:
    # CS2: 2 = T, 3 = CT
    if team_num == 2:
        return "T"
    if team_num == 3:
        return "CT"
    return "T"


def normalize_parsed(match_id: str, parsed: ParsedDemo) -> dict[str, Any]:
    map_raw = str(parsed.header.get("map_name") or "unknown")
    meta = get_map_meta(map_raw)
    tick_rate = parsed.tick_rate

    # Prefer freeze_end ticks as round starts; pair with round_end rows that have a winner
    ends = parsed.round_ends.copy()
    if len(ends):
        ends = ends[ends["winner"].notna() | ((ends["round"] > 0) & (ends["tick"] > 1))].copy()
        ends = ends[ends["tick"] > 1].reset_index(drop=True)

    freeze = parsed.freeze_ends.copy() if len(parsed.freeze_ends) else pd.DataFrame(columns=["tick"])
    freeze_ticks = sorted(int(t) for t in freeze["tick"].tolist()) if len(freeze) else []

    rounds_meta: list[dict[str, Any]] = []
    round_replays: dict[str, dict[str, Any]] = []
    round_replays = {}

    # Build player roster with best-known team from tick mid-match
    roster = _build_roster(parsed)

    for idx, end_row in ends.iterrows():
        end_tick = int(end_row["tick"])
        winner_raw = end_row.get("winner")
        winner = _normalize_winner(winner_raw)
        reason = end_row.get("reason")
        reason_s = str(reason) if pd.notna(reason) else None

        # Start: last freeze_end before this end_tick, else previous end
        start_tick = 0
        for ft in freeze_ticks:
            if ft < end_tick:
                start_tick = ft
            else:
                break
        if start_tick <= 0 and rounds_meta:
            start_tick = rounds_meta[-1]["endTick"]
        if start_tick <= 0:
            start_tick = max(0, end_tick - tick_rate * 90)

        round_number = len(rounds_meta) + 1
        round_id = f"r{round_number}"
        duration = tick_to_seconds(end_tick, start_tick, tick_rate)

        samples = _build_samples(parsed, start_tick, end_tick, tick_rate, meta)
        events = _build_events(parsed, start_tick, end_tick, tick_rate, round_number)

        replay = {
            "matchId": match_id,
            "roundId": round_id,
            "roundNumber": round_number,
            "map": map_raw,
            "tickRate": tick_rate,
            "startTick": start_tick,
            "endTick": end_tick,
            "durationSec": round(duration, 3),
            "players": roster,
            "samples": samples,
            "events": events,
        }
        round_replays[round_id] = replay
        rounds_meta.append(
            {
                "id": round_id,
                "number": round_number,
                "winner": winner,
                "reason": reason_s,
                "startTick": start_tick,
                "endTick": end_tick,
                "durationSec": round(duration, 3),
            }
        )

    ct_score = sum(1 for r in rounds_meta if r["winner"] == "CT")
    t_score = sum(1 for r in rounds_meta if r["winner"] == "T")
    # won[] relative to CT for display; UI can flip with focus later
    won = [1 if r["winner"] == "CT" else 0 for r in rounds_meta]

    match = {
        "id": match_id,
        "map": display_map_name(map_raw),
        "mapName": map_raw,
        "score": f"{ct_score}–{t_score}",
        "when": "just now",
        "rounds": len(rounds_meta),
        "won": won,
        "status": "complete",
        "clipDuration": rounds_meta[0]["durationSec"] if rounds_meta else 0.0,
        "tickRate": tick_rate,
        "players": roster,
        "error": None,
    }

    return {
        "match": match,
        "rounds": rounds_meta,
        "analysis": extract_analysis(match_id, parsed, rounds_meta, roster),
        "round_replays": round_replays,
        "events": _flatten_events(round_replays),
        "perf": {
            "roundCount": len(rounds_meta),
            "sampleFrames": sum(len(r["samples"]) for r in round_replays.values()),
            "eventCount": sum(len(r["events"]) for r in round_replays.values()),
        },
    }


def _normalize_winner(raw: Any) -> str | None:
    if raw is None or (isinstance(raw, float) and math.isnan(raw)):
        return None
    s = str(raw).strip().upper()
    if s in ("CT", "COUNTER-TERRORIST", "COUNTERTERRORIST"):
        return "CT"
    if s in ("T", "TERRORIST"):
        return "T"
    return s if s else None


def _build_roster(parsed: ParsedDemo) -> list[dict[str, Any]]:
    # Prefer mid-demo team_num from ticks
    team_by_id: dict[str, int] = {}
    name_by_id: dict[str, str] = {p["id"]: p["name"] for p in parsed.players}
    if len(parsed.ticks):
        mid = int(parsed.ticks["tick"].median())
        mid_rows = parsed.ticks[parsed.ticks["tick"] == mid]
        if mid_rows.empty:
            mid_rows = parsed.ticks.groupby("steamid").tail(1)
        for _, row in mid_rows.iterrows():
            sid = str(int(row["steamid"])) if pd.notna(row["steamid"]) else None
            if not sid:
                continue
            team_by_id[sid] = int(row["team_num"]) if pd.notna(row["team_num"]) else 0
            if pd.notna(row.get("name")):
                name_by_id[sid] = str(row["name"])

    roster: list[dict[str, Any]] = []
    for p in parsed.players:
        pid = p["id"]
        tn = team_by_id.get(pid, p.get("team_number") or 0)
        roster.append(
            {
                "id": pid,
                "name": name_by_id.get(pid, p["name"]),
                "team": team_side(int(tn)),
            }
        )
    return roster


def _build_samples(
    parsed: ParsedDemo,
    start_tick: int,
    end_tick: int,
    tick_rate: int,
    map_meta: Any,
) -> list[dict[str, Any]]:
    ticks = parsed.ticks
    window = ticks[(ticks["tick"] >= start_tick) & (ticks["tick"] <= end_tick)]
    if window.empty:
        return []

    samples: list[dict[str, Any]] = []
    for tick, group in window.groupby("tick", sort=True):
        tick_i = int(tick)
        players: list[dict[str, Any]] = []
        for _, row in group.iterrows():
            sid = str(int(row["steamid"])) if pd.notna(row["steamid"]) else None
            if not sid:
                continue
            x = float(row["X"]) if pd.notna(row["X"]) else 0.0
            y = float(row["Y"]) if pd.notna(row["Y"]) else 0.0
            z = float(row["Z"]) if pd.notna(row["Z"]) else 0.0
            yaw = float(row["yaw"]) if pd.notna(row["yaw"]) else 0.0
            health = int(row["health"]) if pd.notna(row["health"]) else 0
            alive = bool(row["is_alive"]) if pd.notna(row["is_alive"]) else health > 0
            entry: dict[str, Any] = {
                "id": sid,
                "x": x,
                "y": y,
                "z": z,
                "yaw": yaw,
                "health": health,
                "alive": alive,
            }
            if map_meta is not None:
                rx, ry = world_to_radar(x, y, map_meta)
                entry["rx"] = round(rx, 2)
                entry["ry"] = round(ry, 2)
            players.append(entry)
        samples.append(
            {
                "tick": tick_i,
                "t": round(tick_to_seconds(tick_i, start_tick, tick_rate), 3),
                "players": players,
            }
        )
    return samples


def _build_events(
    parsed: ParsedDemo,
    start_tick: int,
    end_tick: int,
    tick_rate: int,
    round_number: int,
) -> list[dict[str, Any]]:
    events: list[dict[str, Any]] = []
    seq = 0

    def add(
        etype: str,
        tick: int,
        label: str,
        *,
        actor: str | None = None,
        victim: str | None = None,
        x: float | None = None,
        y: float | None = None,
        z: float | None = None,
    ) -> None:
        nonlocal seq
        if tick < start_tick or tick > end_tick:
            return
        seq += 1
        ev: dict[str, Any] = {
            "id": f"{etype}-{tick}-{seq}",
            "type": etype,
            "tick": tick,
            "t": round(tick_to_seconds(tick, start_tick, tick_rate), 3),
            "label": label,
        }
        if actor:
            ev["actorId"] = actor
        if victim:
            ev["victimId"] = victim
        if x is not None and y is not None:
            ev["pos"] = {"x": x, "y": y, "z": z}
        events.append(ev)

    add("round_start", start_tick, f"Round {round_number} start")

    deaths = parsed.deaths
    if len(deaths):
        for _, row in deaths.iterrows():
            tick = int(row["tick"])
            attacker = _sid(row.get("attacker_steamid"))
            victim = _sid(row.get("user_steamid") or row.get("attacker_steamid"))
            # demoparser2: victim is usually user_steamid
            victim = _sid(row.get("user_steamid"))
            an = row.get("attacker_name")
            vn = row.get("user_name")
            weapon = row.get("weapon")
            label = f"{an or 'Unknown'} killed {vn or 'Unknown'}"
            if pd.notna(weapon):
                label += f" ({weapon})"
            add(
                "kill",
                tick,
                label,
                actor=attacker,
                victim=victim,
                x=_f(row.get("user_X") or row.get("attacker_X")),
                y=_f(row.get("user_Y") or row.get("attacker_Y")),
                z=_f(row.get("user_Z") or row.get("attacker_Z")),
            )

    for df, etype, label in (
        (parsed.bomb_planted, "plant", "Bomb planted"),
        (parsed.bomb_defused, "defuse", "Bomb defused"),
        (parsed.flashes, "flash", "Flashbang"),
        (parsed.smokes, "smoke", "Smoke"),
        (parsed.hes, "he", "HE grenade"),
    ):
        if not len(df):
            continue
        for _, row in df.iterrows():
            tick = int(row["tick"])
            actor = _sid(row.get("user_steamid") or row.get("attacker_steamid"))
            add(
                etype,
                tick,
                label,
                actor=actor,
                x=_f(row.get("x") or row.get("user_X")),
                y=_f(row.get("y") or row.get("user_Y")),
                z=_f(row.get("z") or row.get("user_Z")),
            )

    add("round_end", end_tick, f"Round {round_number} end")
    events.sort(key=lambda e: (e["tick"], e["id"]))
    return events


def _flatten_events(round_replays: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    out: list[dict[str, Any]] = []
    for rid, replay in round_replays.items():
        for ev in replay["events"]:
            item = dict(ev)
            item["roundId"] = rid
            out.append(item)
    out.sort(key=lambda e: (e["tick"], e["id"]))
    return out


def _sid(val: Any) -> str | None:
    # Keep SteamID64 exact; float conversion loses digits above 2**53
    return steam_id(val)


def _f(val: Any) -> float | None:
    if val is None or (isinstance(val, float) and math.isnan(val)):
        return None
    try:
        return float(val)
    except (TypeError, ValueError):
        return None
