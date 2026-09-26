# Radar overview images

Real CS2 radar overviews used by the Analysis Studio Radar stage.

| File | Map | Size |
|------|-----|------|
| `de_anubis_radar.png` | de_anubis | 1024×1024 |
| `de_mirage_radar.png` | de_mirage | 1024×1024 |

## Source

Downloaded from [MurkyYT/cs2-map-icons](https://github.com/MurkyYT/cs2-map-icons) (`images/radars/<map>_radar_psd.png`), which scrapes official Valve depot overview textures whenever CS2 updates.

Upstream overview values (same as game `resource/overviews/*.txt`) live in that repo under `data/radar_info/`. Our transforms in `apps/web/src/lib/replay/maps.ts` and `apps/api/app/maps/metadata.py` must stay aligned with those files so world → radar pixels sit on the image.

## Licence

Map icons, radars, thumbnails and overview data are property of **Valve Corporation**. MurkyYT’s repository redistributes them for tooling access; we keep only the Active Duty overviews we need for Studio. Do not treat these as freely licensed art — they remain Valve IP for fair use / community tooling context.
