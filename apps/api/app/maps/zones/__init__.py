"""Callout zones per map (plan §4.2).

Polygons live in ``<map>.json`` in radar pixel space (the 1024 x 1024 overview,
the same space as ``rx``/``ry`` in round replays), which makes them easy to draw
and check over the radar image. ``zone_at`` takes world coordinates and converts
them with the map's overview transform.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from app.maps.metadata import get_map_meta, world_to_radar

ZONES_DIR = Path(__file__).resolve().parent

Point = tuple[float, float]


@dataclass(frozen=True)
class Zone:
    name: str
    polygons: tuple[tuple[Point, ...], ...]


@lru_cache(maxsize=None)
def load_zones(map_name: str) -> tuple[Zone, ...]:
    path = ZONES_DIR / f"{map_name.strip().lower()}.json"
    if not path.exists():
        return ()
    doc = json.loads(path.read_text(encoding="utf-8"))
    return tuple(
        Zone(
            name=z["name"],
            polygons=tuple(tuple((float(x), float(y)) for x, y in poly) for poly in z["polygons"]),
        )
        for z in doc.get("zones") or []
    )


def zone_at(map_name: str, x: float, y: float) -> str | None:
    """Callout name for a world position, or None outside every zone."""
    meta = get_map_meta(map_name)
    if meta is None:
        return None
    rx, ry = world_to_radar(x, y, meta)
    return zone_at_radar(map_name, rx, ry)


def zone_at_radar(map_name: str, rx: float, ry: float) -> str | None:
    for zone in load_zones(map_name):
        if any(point_in_polygon(rx, ry, poly) for poly in zone.polygons):
            return zone.name
    return None


def point_in_polygon(x: float, y: float, poly: tuple[Point, ...]) -> bool:
    """Even-odd ray casting; points on an edge may fall either way."""
    inside = False
    n = len(poly)
    j = n - 1
    for i in range(n):
        xi, yi = poly[i]
        xj, yj = poly[j]
        if (yi > y) != (yj > y):
            x_cross = xi + (y - yi) * (xj - xi) / (yj - yi)
            if x < x_cross:
                inside = not inside
        j = i
    return inside
