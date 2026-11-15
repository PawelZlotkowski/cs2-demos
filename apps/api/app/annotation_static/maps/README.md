# Radar overview images

Real CS2 radar overviews used by the Analysis Studio Radar stage.

| File | Map | Size |
|------|-----|------|
| `de_ancient_radar.png` | de_ancient | 1024×1024 |
| `de_anubis_radar.png` | de_anubis | 1024×1024 |
| `de_mirage_radar.png` | de_mirage | 1024×1024 |

## Source

Downloaded from [MurkyYT/cs2-map-icons](https://github.com/MurkyYT/cs2-map-icons) (`images/radars/<map>_radar_psd.png`), which scrapes official Valve depot overview textures whenever CS2 updates.

Upstream overview values (same as game `resource/overviews/*.txt`) live in that repo under `data/radar_info/`. Our transforms in `apps/web/src/lib/replay/maps.ts` and `apps/api/app/maps/metadata.py` must stay aligned with those files so world → radar pixels sit on the image.

## Licence

Ancient was added on 25 October 2026 from `images/radars/de_ancient_radar_psd.png`; overview `data/radar_info/de_ancient.txt`: origin (-2953, 2164), scale 5, rotation 0. SHA-256 of the downloaded image: `88fe108f7cc54d89b9c6179155cc39f419aa02f79df1a3f36031049577fd1952`. This pins the local image, not the upstream map revision; landmark/event calibration remains a release check.

Map icons, radars, thumbnails and overview data are property of **Valve Corporation**. MurkyYT’s repository redistributes them for tooling access; we keep only the Active Duty overviews we need for Studio. Do not treat these as freely licensed art — they remain Valve IP for fair use / community tooling context.
