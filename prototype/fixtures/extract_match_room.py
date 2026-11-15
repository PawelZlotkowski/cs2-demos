"""Extract one parsed match into the compact fixture the Match room prototype reads.

Usage (from the repo root, with the API venv):
    apps/api/.venv/Scripts/python.exe prototype/fixtures/extract_match_room.py match-cd1d9c4263cb

Reads apps/api/data/matches/<id>/{match,analysis}.json and rounds/r*.json, converts world
coordinates to radar pixels (same transform as apps/web/src/lib/replay/maps.ts) and writes
prototype/fixtures/match-room.json. Steam ids are replaced with short ids; names are kept.
Only facts from the parse are written. The impact score is computed in the prototype so its
formula stays visible next to the numbers it explains.
"""
from __future__ import annotations

import json
import sys
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MATCHES = ROOT / "apps" / "api" / "data" / "matches"
OUT = ROOT / "prototype" / "fixtures" / "match-room.json"

# Must match apps/web/src/lib/replay/maps.ts
MAPS = {
    "de_anubis": {"display": "Anubis", "posX": -2796, "posY": 3328, "scale": 5.22},
    "de_mirage": {"display": "Mirage", "posX": -3230, "posY": 1713, "scale": 5.0},
    "de_ancient": {"display": "Ancient", "posX": -2953, "posY": 2164, "scale": 5.0},
}
TRADE_WINDOW_S = 5.0
POSITION_STEP_S = 1.0


def radar(meta: dict, x: float, y: float) -> list[float]:
    return [round((x - meta["posX"]) / meta["scale"], 1), round((meta["posY"] - y) / meta["scale"], 1)]


def positions(replay: dict, meta: dict, ids: dict[str, str]) -> dict:
    """Player positions once per second, null once dead (the full replay samples ~8 Hz)."""
    samples = replay["samples"]
    end = samples[-1]["t"] if samples else 0.0
    out: dict[str, list] = {ids[p["id"]]: [] for p in replay["players"] if p["id"] in ids}
    i = 0
    t = 0.0
    while t <= end + 1e-6:
        while i + 1 < len(samples) and samples[i + 1]["t"] <= t:
            i += 1
        seen = set()
        for p in samples[i]["players"]:
            pid = ids.get(p["id"])
            if pid is None:
                continue
            seen.add(pid)
            out[pid].append(radar(meta, p["x"], p["y"]) if p["alive"] else None)
        for pid in out:
            if pid not in seen:
                out[pid].append(None)
        t += POSITION_STEP_S
    return {"dt": POSITION_STEP_S, "p": out}


def main(match_id: str) -> None:
    d = MATCHES / match_id
    match = json.loads((d / "match.json").read_text(encoding="utf-8"))["match"]
    analysis = json.loads((d / "analysis.json").read_text(encoding="utf-8"))
    meta = MAPS[analysis["map"]]

    ids = {p["id"]: f"p{i + 1}" for i, p in enumerate(match["players"])}
    players = [{"id": ids[p["id"]], "name": p["name"], "startSide": p["team"]} for p in match["players"]]

    rounds = []
    reasons: dict[str, int] = defaultdict(int)
    for rd in analysis["rounds"]:
        if rd.get("knifeRound"):
            continue
        sides = {ids[k]: v for k, v in rd["sides"].items() if k in ids}
        reasons[rd["reason"]] += 1

        kills = []
        for k in sorted(rd["kills"], key=lambda k: k["t"]):
            if k["attacker"] not in ids or k["victim"] not in ids:
                # World / bomb / fall deaths: keep the death, no attacker.
                kills.append({
                    "t": round(k["t"], 2), "a": ids.get(k["attacker"]), "v": ids.get(k["victim"]),
                    "w": k["weapon"], "hs": False, "as": None, "fa": False,
                    "ap": None, "vp": radar(meta, *k["victimPos"][:2]) if k.get("victimPos") else None,
                })
                continue
            kills.append({
                "t": round(k["t"], 2),
                "a": ids[k["attacker"]],
                "v": ids[k["victim"]],
                "w": k["weapon"],
                "hs": bool(k["headshot"]),
                "as": ids.get(k["assister"]) if k.get("assister") else None,
                "fa": bool(k.get("flashAssist")),
                "ap": radar(meta, *k["attackerPos"][:2]) if k.get("attackerPos") else None,
                "vp": radar(meta, *k["victimPos"][:2]) if k.get("victimPos") else None,
            })

        # Opening, trade kill (the victim had just killed the attacker's teammate) and traded death.
        for i, k in enumerate(kills):
            k["open"] = i == 0 and k["a"] is not None and sides.get(k["a"]) != sides.get(k["v"])
            k["trade"] = False
            k["traded"] = False
        for i, k in enumerate(kills):
            if k["a"] is None or sides.get(k["a"]) == sides.get(k["v"]):
                continue
            for prev in kills[:i]:
                if k["t"] - prev["t"] > TRADE_WINDOW_S or prev["a"] != k["v"]:
                    continue
                if sides.get(prev["v"]) == sides.get(k["a"]):
                    k["trade"] = True
                    prev["traded"] = True

        # Enemy damage per attacker, capped at 100 per victim so overkill does not count.
        pair: dict[tuple[str, str], int] = defaultdict(int)
        for h in rd["hurts"]:
            a, v = ids.get(h["attacker"]), ids.get(h["victim"])
            if a is None or v is None or a == v or sides.get(a) == sides.get(v):
                continue
            pair[(a, v)] = min(100, pair[(a, v)] + int(h["damage"]))
        dmg: dict[str, int] = defaultdict(int)
        for (a, _), n in pair.items():
            dmg[a] += n

        nades = [
            {"t": round(g["t"], 2), "type": g["type"], "by": ids.get(g["thrower"]), "p": radar(meta, *g["pos"][:2])}
            for g in rd["grenades"]
            if g.get("pos")
        ]
        blinds = [
            {"t": round(b["t"], 2), "by": ids.get(b["attacker"]), "v": ids.get(b["victim"]), "s": round(b["duration"], 2)}
            for b in rd["blinds"]
            if b["attacker"] != b["victim"]
        ]
        bomb = [
            {"t": round(b["t"], 2), "type": b["type"], "by": ids.get(b["player"]), "p": radar(meta, *b["pos"][:2])}
            for b in rd["bomb"]
            if b["type"] in ("plant", "defuse") and b.get("pos")
        ]
        equip = {ids[k]: v.get("equipValue") or 0 for k, v in rd["economy"].items() if k in ids}

        replay = json.loads((d / "rounds" / f"r{rd['number']}.json").read_text(encoding="utf-8"))
        rounds.append({
            "n": rd["number"],
            "winner": rd["winner"],
            "reason": rd["reason"],
            "dur": round(rd["durationSec"], 2),
            "sides": sides,
            "equip": equip,
            "kills": kills,
            "dmg": dict(dmg),
            "nades": nades,
            "blinds": blinds,
            "bomb": bomb,
            "pos": positions(replay, meta, ids),
        })

    fixture = {
        "matchId": match_id,
        "source": "Parsed demo via apps/api; extracted by prototype/fixtures/extract_match_room.py",
        "map": {"name": analysis["map"], "display": meta["display"], "radarSize": 1024},
        "tickRate": analysis["tickRate"],
        "players": players,
        "rounds": rounds,
    }
    OUT.write_text(json.dumps(fixture, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size // 1024} KB, {len(rounds)} rounds)")
    print("win reasons:", dict(reasons))


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else "match-cd1d9c4263cb")
