"""Hand-built rounds for detector tests (no demo needed).

Players "t1".."t5" play T and "ct1".."ct5" play CT unless a test says
otherwise. Positions are given in radar pixels of the map and converted to
world units, so tests can say "stand in A site" by pointing at the overlay.
"""

from __future__ import annotations

from app.analysis.match_data import (
    Blind,
    Economy,
    Frame,
    Grenade,
    Hurt,
    Kill,
    KillWindow,
    MatchData,
    RoundData,
    Shot,
    BombEvent,
)
from app.maps.metadata import get_map_meta

T = [f"t{i}" for i in range(1, 6)]
CT = [f"ct{i}" for i in range(1, 6)]
MAP = "de_mirage"

# Radar pixel spots on de_mirage (see docs/coach/zones/de_mirage.png)
SPOTS = {
    "A site": (550, 740),
    "A ramp": (780, 640),
    "Palace": (760, 770),
    "Jungle": (440, 620),
    "CT spawn": (300, 710),
    "Mid": (500, 430),
    "B site": (230, 300),
    "Market": (250, 440),
    "T spawn": (900, 360),
    "Top mid": (680, 470),
}


def w(spot: str | tuple[float, float], dz: float = 0.0) -> tuple[float, float, float]:
    """Radar pixel (or spot name) -> world (x, y, z)."""
    rx, ry = SPOTS[spot] if isinstance(spot, str) else spot
    meta = get_map_meta(MAP)
    assert meta is not None
    return (rx * meta.scale + meta.pos_x, meta.pos_y - ry * meta.scale, dz)


def offset(pos: tuple[float, float, float], dx_m: float, dy_m: float = 0.0) -> tuple[float, float, float]:
    return (pos[0] + dx_m / 0.0254, pos[1] + dy_m / 0.0254, pos[2])


def sides(t_side: list[str] | None = None, ct_side: list[str] | None = None) -> dict[str, str]:
    out = {p: "T" for p in (t_side or T)}
    out.update({p: "CT" for p in (ct_side or CT)})
    return out


def frames(positions: dict[str, tuple[float, float, float]], *, until: float = 60.0, moves: dict | None = None) -> list[Frame]:
    """8 Hz frames. ``moves`` maps pid -> list of (t, position) waypoints."""
    out: list[Frame] = []
    n = int(until * 8)
    for i in range(n + 1):
        t = i / 8
        players = {}
        for pid, pos in positions.items():
            cur = pos
            for wt, wpos in sorted((moves or {}).get(pid, [])):
                if t >= wt:
                    cur = wpos
            players[pid] = (cur[0], cur[1], cur[2], 100, True)
        out.append(Frame(tick=i * 8, t=t, players=players))
    return out


def kill(t: float, attacker: str | None, victim: str, *, weapon: str = "ak47", apos=None, vpos=None, **kw) -> Kill:
    return Kill(tick=int(t * 64), t=t, attacker=attacker, victim=victim, weapon=weapon, attacker_pos=apos, victim_pos=vpos, **kw)


def shot(t: float, player: str, speed: float, *, weapon: str = "weapon_ak47", pos=None) -> Shot:
    return Shot(tick=int(t * 64), t=t, player=player, weapon=weapon, speed=speed, pos=pos)


def hurt(t: float, attacker: str, victim: str, damage: int, weapon: str = "ak47") -> Hurt:
    return Hurt(tick=int(t * 64), t=t, attacker=attacker, victim=victim, damage=damage, weapon=weapon)


def blind(t: float, attacker: str, victim: str, duration: float) -> Blind:
    return Blind(tick=int(t * 64), t=t, attacker=attacker, victim=victim, duration=duration)


def grenade(t: float, gtype: str, thrower: str, pos) -> Grenade:
    return Grenade(tick=int(t * 64), t=t, type=gtype, thrower=thrower, pos=pos)  # type: ignore[arg-type]


def bomb(t: float, btype: str, player: str, pos) -> BombEvent:
    return BombEvent(tick=int(t * 64), t=t, type=btype, player=player, pos=pos)  # type: ignore[arg-type]


def window(k: Kill, at_kill: dict[str, dict]) -> KillWindow:
    return KillWindow(kill_tick=k.tick, tick0=k.tick - 192, tracks={}, at_kill=at_kill)


def eco(balance: int, equip: int) -> Economy:
    return Economy(balance=balance, equip_value=equip, armor=100 if equip >= 1000 else 0, helmet=equip >= 3500)


def round_(number: int = 2, *, winner: str | None = "CT", side_map: dict[str, str] | None = None, **kw) -> RoundData:
    return RoundData(
        number=number,
        start_tick=0,
        end_tick=int(90 * 64),
        winner=winner,  # type: ignore[arg-type]
        sides=side_map or sides(),
        duration=90.0,
        **kw,
    )


def match(*rounds: RoundData) -> MatchData:
    names = {p: p.upper() for p in T + CT}
    return MatchData(match_id="match-test", map_name=MAP, tick_rate=64, players=names, rounds=list(rounds))
