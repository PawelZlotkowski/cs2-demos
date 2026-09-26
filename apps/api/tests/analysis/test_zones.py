import json

import pytest

from app.maps.zones import ZONES_DIR, load_zones, point_in_polygon, zone_at, zone_at_radar

MAPS = ("de_mirage", "de_anubis")


def test_spawns_from_real_matches_map_to_spawn_zones():
    # World positions measured in real demos (see tests/test_replay.py)
    assert zone_at("de_mirage", -1656.0, -1656.0) == "CT spawn"
    assert zone_at("de_anubis", -476.0, 2216.0) == "CT spawn"
    assert zone_at("de_anubis", -328.0, -1528.0) == "T spawn"


@pytest.mark.parametrize(
    "map_name,rx,ry,expected",
    [
        ("de_mirage", 555, 780, "A site"),  # bomb target box
        ("de_mirage", 230, 290, "B site"),  # bomb target box
        ("de_mirage", 900, 370, "T spawn"),
        ("de_mirage", 760, 770, "Palace"),
        ("de_anubis", 765, 270, "A site"),
        ("de_anubis", 335, 505, "B site"),
        ("de_anubis", 480, 930, "T spawn"),
        ("de_anubis", 560, 600, "Canal"),
    ],
)
def test_known_spots(map_name, rx, ry, expected):
    assert zone_at_radar(map_name, rx, ry) == expected


def test_outside_and_unknown_map():
    assert zone_at_radar("de_mirage", 5, 5) is None
    assert zone_at("de_dust2", 0.0, 0.0) is None


def test_point_in_polygon_square():
    sq = ((0, 0), (10, 0), (10, 10), (0, 10))
    assert point_in_polygon(5, 5, sq)
    assert not point_in_polygon(15, 5, sq)


@pytest.mark.parametrize("map_name", MAPS)
def test_zone_files_are_well_formed(map_name):
    doc = json.loads((ZONES_DIR / f"{map_name}.json").read_text(encoding="utf-8"))
    assert doc["coords"] == "radar"
    names = [z["name"] for z in doc["zones"]]
    assert len(names) == len(set(names)), "zone names must be unique; use several polygons instead"
    for zone in load_zones(map_name):
        for poly in zone.polygons:
            assert len(poly) >= 3
            assert all(0 <= x <= 1024 and 0 <= y <= 1024 for x, y in poly)
