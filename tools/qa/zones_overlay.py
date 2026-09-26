"""Draw map callout zones over the radar image for a visual check (task T11).

Usage (from the repo root, with the API venv active and Pillow installed):

    python tools/qa/zones_overlay.py de_mirage docs/coach/zones/de_mirage.png
"""

from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "apps" / "api"))

from PIL import Image, ImageDraw  # noqa: E402

from app.maps.zones import load_zones  # noqa: E402

PALETTE = [
    (230, 97, 0),
    (0, 114, 178),
    (0, 158, 115),
    (204, 121, 167),
    (213, 94, 0),
    (86, 180, 233),
    (240, 228, 66),
]


def render(map_name: str, out: Path) -> None:
    radar = Image.open(ROOT / "apps" / "web" / "public" / "maps" / f"{map_name}_radar.png").convert("RGBA")
    base = Image.new("RGBA", radar.size, (255, 255, 255, 255))
    base.alpha_composite(radar)
    layer = Image.new("RGBA", radar.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(layer)
    labels = []
    for i, zone in enumerate(load_zones(map_name)):
        colour = PALETTE[i % len(PALETTE)]
        for poly in zone.polygons:
            draw.polygon(poly, fill=colour + (70,), outline=colour + (255,), width=2)
        first = zone.polygons[0]
        cx = sum(p[0] for p in first) / len(first)
        cy = sum(p[1] for p in first) / len(first)
        labels.append((cx, cy, zone.name))
    base.alpha_composite(layer)
    text = ImageDraw.Draw(base)
    for cx, cy, name in labels:
        w = text.textlength(name)
        text.rectangle([cx - w / 2 - 3, cy - 7, cx + w / 2 + 3, cy + 7], fill=(255, 255, 255, 230))
        text.text((cx - w / 2, cy - 6), name, fill=(0, 0, 0, 255))
    out.parent.mkdir(parents=True, exist_ok=True)
    base.convert("RGB").save(out)


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit(__doc__)
    render(sys.argv[1], Path(sys.argv[2]))
