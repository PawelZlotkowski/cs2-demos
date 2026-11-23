"""Ancient callout zones (de_ancient.json): known spots resolve and the API serves them."""

import json

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.maps.zones import ZONES_DIR, load_zones, zone_at, zone_at_radar


def test_world_positions_from_a_real_match():
    # match-130742d9e808 round 5: a T at the round start, and a kill at (185.7, -698.4) in round 1
    assert zone_at("de_ancient", -391.5, -2222.8) == "T spawn"
    assert zone_at("de_ancient", 185.7, -698.4) is not None


@pytest.mark.parametrize(
    "rx,ry,expected",
    [
        (520, 94, "CT spawn"),
        (499, 880, "T spawn"),
        (300, 265, "A site"),  # bomb target box
        (760, 420, "B site"),  # bomb target box
        (191, 460, "A main"),
        (285, 450, "Donut"),
        (469, 532, "Mid"),
        (488, 414, "Top mid"),
        (680, 430, "Cave"),
        (380, 150, "Temple"),
        (360, 620, "Elbow"),
        (791, 671, "Ruins"),
        (841, 553, "Ramp"),
    ],
)
def test_known_spots(rx, ry, expected):
    assert zone_at_radar("de_ancient", rx, ry) == expected


def test_off_map_is_unnamed():
    assert zone_at_radar("de_ancient", 600, 680) is None  # the closed block between Mid and the tunnel
    assert zone_at_radar("de_ancient", 5, 5) is None


def test_zone_file_is_well_formed():
    doc = json.loads((ZONES_DIR / "de_ancient.json").read_text(encoding="utf-8"))
    assert doc["map"] == "de_ancient" and doc["coords"] == "radar"
    names = [z["name"] for z in doc["zones"]]
    assert len(names) == len(set(names))
    for zone in load_zones("de_ancient"):
        for poly in zone.polygons:
            assert len(poly) >= 3
            assert all(0 <= x <= 1024 and 0 <= y <= 1024 for x, y in poly)


def test_zones_endpoint_serves_ancient():
    res = TestClient(app).get("/maps/ancient/zones")
    assert res.status_code == 200
    names = {z["name"] for z in res.json()}
    assert {"A site", "B site", "Mid", "Donut", "Cave", "CT spawn", "T spawn"} <= names
    assert all(z["polygons"] for z in res.json())
