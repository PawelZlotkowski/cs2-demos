"""Valve overview transforms — world → radar pixel space."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class MapMeta:
    map_name: str
    display_name: str
    pos_x: float
    pos_y: float
    scale: float
    rotate: int = 0
    radar_size: int = 1024
    # Path under apps/web/public — kept for contract docs / future API exposure
    radar_image: str | None = None


# CS2 overview values (resource/overviews/*.txt). Mirage from Valve overview
# (MurkyYT radar_info pos_x=-3230); Anubis from SteamDatabase / MurkyYT
# de_anubis.txt, verified against match-d03751f42266 spawn clusters.
MAPS: dict[str, MapMeta] = {
    "de_mirage": MapMeta(
        map_name="de_mirage",
        display_name="Mirage",
        pos_x=-3230.0,
        pos_y=1713.0,
        scale=5.0,
        radar_image="/maps/de_mirage_radar.png",
    ),
    "de_anubis": MapMeta(
        map_name="de_anubis",
        display_name="Anubis",
        pos_x=-2796.0,
        pos_y=3328.0,
        scale=5.22,
        radar_image="/maps/de_anubis_radar.png",
    ),
}


def get_map_meta(map_name: str) -> MapMeta | None:
    key = map_name.strip().lower()
    return MAPS.get(key)


def world_to_radar(x: float, y: float, meta: MapMeta) -> tuple[float, float]:
    """Return radar coordinates in overview pixel space (0…radar_size-ish)."""
    rx = (x - meta.pos_x) / meta.scale
    ry = (meta.pos_y - y) / meta.scale
    return rx, ry


def display_map_name(map_name: str) -> str:
    meta = get_map_meta(map_name)
    return meta.display_name if meta else map_name
