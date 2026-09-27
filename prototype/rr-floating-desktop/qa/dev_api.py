"""Run the real API with a synthetic demo parser, to try the desktop end to end without a CS2 demo.

Every upload whose bytes start with the demo magic (``PBDEMS2``) goes through the real pipeline
(decompress, normalise, player pick, detectors, moment selection, clips, explanations); only
demoparser2 is replaced by a scripted 8-round Mirage match. Use it where no real demo is to hand,
such as a cloud sandbox. With a real demo, run uvicorn as usual instead.

    cd apps/api
    RR_LAB_ENABLED=1 RR_CSDM_ENABLED=1 RR_CSDM_MODE=stub .venv/bin/python ../../prototype/rr-floating-desktop/qa/dev_api.py
    printf 'PBDEMS2\\0' > /tmp/fake.dem   # then upload /tmp/fake.dem in Add match
"""

from __future__ import annotations

import os
import sys
from pathlib import Path

API = Path(__file__).resolve().parents[3] / "apps" / "api"
sys.path.insert(0, str(API))
os.chdir(API)
# Synthetic matches go to their own data folder, not the one real demos use
os.environ.setdefault("RR_DATA_DIR", str(Path(os.environ.get("TMPDIR", "/tmp")) / "rr-dev-data"))

import pandas as pd  # noqa: E402
import uvicorn  # noqa: E402

from app.maps.metadata import get_map_meta  # noqa: E402
from app.processing import pipeline as pipe_mod  # noqa: E402
from app.processing.parse_demo import ParsedDemo  # noqa: E402

TICK = 64
ROUNDS = 8
ROUND_TICKS = 64 * 70
FREEZE = 64 * 5
META = get_map_meta("de_mirage")
assert META is not None

# Radar pixels on de_mirage (docs/coach/zones/de_mirage.png)
SPOT = {
    "T spawn": (900, 360),
    "Top mid": (680, 470),
    "Mid": (500, 430),
    "Connector": (470, 560),
    "Jungle": (440, 620),
    "A ramp": (780, 640),
    "Palace": (760, 770),
    "A site": (550, 740),
    "CT spawn": (300, 710),
    "Market": (250, 440),
    "B site": (230, 300),
    "Short": (380, 420),
}

T_NAMES = ["kestrel", "halvard", "mirek_", "oso", "tamsin"]
CT_NAMES = ["vantablk", "jorvik", "deltaseven", "rumbo", "kiwi_ow"]
T_IDS = [76561198000000101 + i for i in range(5)]
CT_IDS = [76561198000000201 + i for i in range(5)]
T_ROUTES = [
    ["T spawn", "Top mid", "Mid", "Connector", "Jungle"],
    ["T spawn", "A ramp", "A site"],
    ["T spawn", "Palace", "A site"],
    ["T spawn", "Top mid", "Mid", "Short"],
    ["T spawn", "A ramp", "A site"],
]
CT_ROUTES = [
    ["CT spawn", "Jungle", "Connector"],
    ["CT spawn", "A site"],
    ["CT spawn", "A site", "Palace"],
    ["CT spawn", "Market", "Short"],
    ["CT spawn", "Market", "B site"],
]

# Per round: (killer index, victim index, second of the round, killer side); index into T or CT by side
SCRIPT: list[list[tuple[int, int, float, str]]] = [
    [(0, 0, 22, "CT"), (1, 0, 24, "T"), (1, 1, 31, "T"), (2, 2, 40, "T")],  # kestrel dies alone early, traded
    [(0, 1, 18, "T"), (0, 2, 26, "T"), (3, 3, 35, "CT"), (4, 3, 44, "T")],  # kestrel entry and a second kill
    [(0, 0, 28, "CT"), (2, 1, 45, "CT"), (3, 4, 50, "CT")],  # kestrel dies in Connector, not traded
    [(1, 0, 20, "T"), (0, 1, 33, "T"), (2, 2, 38, "CT")],
    [(0, 0, 30, "CT"), (0, 3, 34, "CT"), (1, 1, 47, "T")],  # the same spot again
    [(0, 4, 25, "T"), (0, 0, 29, "T"), (0, 3, 41, "T")],  # multi-kill
    [(2, 0, 19, "CT"), (4, 1, 39, "T"), (1, 2, 52, "CT")],
    [(0, 1, 24, "T"), (3, 0, 36, "CT"), (0, 2, 55, "T")],
]
WINNERS = ["T", "T", "CT", "T", "CT", "T", "CT", "T"]


def world(spot: str, jitter: float = 0.0) -> tuple[float, float]:
    rx, ry = SPOT[spot]
    return ((rx + jitter) * META.scale + META.pos_x, META.pos_y - (ry - jitter) * META.scale)


def path_at(route: list[str], t: float, speed: float, jitter: float) -> tuple[float, float]:
    """Walk the route's callouts at ``speed`` world units per second from t=0 (freeze end)."""
    pts = [world(s, jitter) for s in route]
    left = max(0.0, t) * speed
    for a, b in zip(pts, pts[1:]):
        d = ((b[0] - a[0]) ** 2 + (b[1] - a[1]) ** 2) ** 0.5
        if left <= d:
            k = left / d if d else 1.0
            return (a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k)
        left -= d
    return pts[-1]


def build() -> ParsedDemo:
    players = [{"id": str(p), "name": n, "team_number": 2} for p, n in zip(T_IDS, T_NAMES)]
    players += [{"id": str(p), "name": n, "team_number": 3} for p, n in zip(CT_IDS, CT_NAMES)]
    ticks, deaths, hurts, fires, flashes, smokes, blinds, econ, dense, purchases, planted = ([] for _ in range(11))
    starts, ends, freezes = [], [], []

    for r in range(ROUNDS):
        start = r * ROUND_TICKS
        freeze_end = start + FREEZE
        end = start + ROUND_TICKS - 64
        starts.append(start)
        freezes.append(freeze_end)
        ends.append(end)
        dead_at: dict[int, int] = {}
        kills = []
        for ki, vi, sec, side in SCRIPT[r]:
            killer = (T_IDS if side == "T" else CT_IDS)[ki]
            victim = (CT_IDS if side == "T" else T_IDS)[vi]
            if victim in dead_at or killer in dead_at:
                continue
            tick = freeze_end + int(sec * TICK)
            dead_at[victim] = tick
            kills.append((tick, killer, victim))

        def pos(pid: int, tick: int) -> tuple[float, float]:
            t = (min(tick, dead_at.get(pid, tick)) - freeze_end) / TICK
            i = (T_IDS + CT_IDS).index(pid)
            is_t = pid in T_IDS
            route = (T_ROUTES if is_t else CT_ROUTES)[(i + r) % 5]
            return path_at(route, t, 170.0 if is_t else 150.0, (i % 5) * 6.0 - 12.0)

        for tick in range(start, end + 1, 8):
            for pid in T_IDS + CT_IDS:
                x, y = pos(pid, tick)
                alive = pid not in dead_at or tick < dead_at[pid]
                ticks.append({"tick": tick, "steamid": pid, "X": x, "Y": y, "Z": 0.0, "yaw": 0.0, "health": 100 if alive else 0,
                              "team_num": 2 if pid in T_IDS else 3, "is_alive": alive,
                              "name": (T_NAMES + CT_NAMES)[(T_IDS + CT_IDS).index(pid)]})
        for tick, killer, victim in kills:
            kx, ky = pos(killer, tick)
            vx, vy = pos(victim, tick)
            name = dict(zip(T_IDS + CT_IDS, T_NAMES + CT_NAMES))
            weapon = "ak47" if killer in T_IDS else "m4a1"
            deaths.append({"tick": tick, "attacker_steamid": killer, "user_steamid": victim, "assister_steamid": None,
                           "attacker_name": name[killer], "user_name": name[victim], "weapon": weapon, "headshot": tick % 3 == 0,
                           "assistedflash": False, "user_X": vx, "user_Y": vy, "user_Z": 0.0, "attacker_X": kx, "attacker_Y": ky, "attacker_Z": 0.0})
            hurts.append({"tick": tick - 6, "attacker_steamid": killer, "user_steamid": victim, "dmg_health": 100, "weapon": weapon})
            moving = r % 3 == 1 and killer == T_IDS[0]
            fires.append({"tick": tick - 8, "user_steamid": killer, "weapon": f"weapon_{weapon}", "user_X": kx, "user_Y": ky, "user_Z": 0.0,
                          "user_velocity_X": 190.0 if moving else 0.0, "user_velocity_Y": 60.0 if moving else 0.0})
            for tk in range(tick - 128, tick + 1):
                for pid in (killer, victim):
                    x, y = pos(pid, tk)
                    dense.append({"tick": tk, "steamid": pid, "X": x, "Y": y, "Z": 0.0, "velocity_X": 190.0 if moving and pid == killer else 0.0,
                                  "velocity_Y": 0.0, "yaw": 0.0, "pitch": 0.0, "health": 100, "team_num": 2 if pid in T_IDS else 3,
                                  "is_alive": True, "active_weapon_name": "AK-47" if pid in T_IDS else "M4A1-S",
                                  "inventory": ["AK-47", "Flashbang", "Smoke Grenade"] if pid in T_IDS else ["M4A1-S", "Flashbang"],
                                  "flash_duration": 0.0})
        # Utility: a smoke from T spawn each round, and a flash that blinds a teammate in round 5
        sx, sy = world("Top mid")
        smokes.append({"tick": freeze_end + 64 * 8, "user_steamid": T_IDS[2], "x": sx, "y": sy, "z": 0.0})
        fx, fy = world("Connector")
        flashes.append({"tick": freeze_end + 64 * 12, "user_steamid": T_IDS[0 if r == 4 else 1], "x": fx, "y": fy, "z": 0.0})
        if r == 4:
            blinds.append({"tick": freeze_end + 64 * 12 + 4, "attacker_steamid": T_IDS[0], "user_steamid": T_IDS[1], "blind_duration": 2.6})
        if WINNERS[r] == "T" and r % 2 == 1:
            ax, ay = world("A site")
            planted.append({"tick": freeze_end + 64 * 48, "user_steamid": T_IDS[1], "site": 1, "user_X": ax, "user_Y": ay, "user_Z": 0.0})
        for pid in T_IDS + CT_IDS:
            balance = 800 if r == 0 else (2300 if r == 3 else 4600)
            econ.append({"tick": freeze_end + 1280, "steamid": pid, "balance": balance, "current_equip_value": 850 if r == 0 else 4700,
                         "armor_value": 100, "has_helmet": r > 0, "team_num": 2 if pid in T_IDS else 3})
            purchases.append({"tick": start + 200, "user_steamid": pid, "weapon": "weapon_ak47" if pid in T_IDS else "weapon_m4a1"})

    return ParsedDemo(
        header={"map_name": "de_mirage"},
        players=players,
        round_starts=pd.DataFrame({"tick": starts}),
        round_ends=pd.DataFrame({"tick": ends, "winner": WINNERS, "reason": ["ct_killed" if w == "T" else "t_killed" for w in WINNERS],
                                 "round": list(range(1, ROUNDS + 1))}),
        freeze_ends=pd.DataFrame({"tick": freezes}),
        deaths=pd.DataFrame(deaths),
        bomb_planted=pd.DataFrame(planted),
        bomb_defused=pd.DataFrame(),
        flashes=pd.DataFrame(flashes),
        smokes=pd.DataFrame(smokes),
        hes=pd.DataFrame(),
        ticks=pd.DataFrame(ticks),
        weapon_fires=pd.DataFrame(fires),
        hurts=pd.DataFrame(hurts),
        blinds=pd.DataFrame(blinds),
        purchases=pd.DataFrame(purchases),
        economy=pd.DataFrame(econ),
        dense_ticks=pd.DataFrame(dense),
    )


def fake_parse(dem_path: str, **_kw) -> ParsedDemo:
    return build()


if __name__ == "__main__":
    pipe_mod.parse_demo_file = fake_parse
    uvicorn.run("app.main:app", host="127.0.0.1", port=int(os.environ.get("PORT", "8000")))
