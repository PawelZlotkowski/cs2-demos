# Replay architecture (Phase 1)

British spelling. Agreed before parallel implementation. **Single time model** — do not invent competing clocks.

This milestone pivots primary product path from coaching/moments to **real demo replay**. Coaching schemas in `docs/handoff/16-DATA-CONTRACTS.md` remain for a later milestone; they are not the source of truth for Radar playback.

## Authoritative time model

| Layer | Unit | Role |
|---|---|---|
| Internal storage | **tick** (int) | Source of truth from the parser |
| API / UI clock | **seconds** (float) | `t_sec = (tick - round_start_tick) / tick_rate` |
| Match-level | optional absolute seconds from demo tick 0 | Debug only |

- **Tick rate:** `64` for CS2 MVP (documented assumption; override if header provides a reliable value later).
- **Conversion utils:** shared `tick_to_seconds(tick, origin_tick, tick_rate)` and inverse on both API (Python) and web (TypeScript). Same formulae.
- Radar, timeline and event inspector all subscribe to **one playback clock** (`t` in seconds within the active round). Seeking updates that clock only.

## Identifiers

| Entity | ID form | Notes |
|---|---|---|
| Match | `match-{12 hex}` | Generated at upload; never from filename |
| Round | `r{n}` where `n` is 1-based normalised round index | Stable within a match |
| Player | SteamID64 string | From `parse_player_info` / tick rows |
| Event | `{type}-{tick}-{seq}` | `seq` disambiguates same tick |

Focal player for “you” styling: optional `focus_steamid` (query or first team-3 player for MVP). Default: first player on team_number 3 if present, else first listed.

## Positional sampling

**Not every tick.** CS2 at 64 Hz × 10 players × full match is wasteful for Radar.

| Setting | Value | Why |
|---|---|---|
| Sample rate | **8 Hz** | Smooth enough for Radar interpolation; ≈8× smaller than full tick stream |
| Tick stride | `tick_rate / 8` → **8** at 64 Hz | Integer stride |
| Fields per sample | `tick`, `player_id`, `x`, `y`, `z`, `yaw`, `health`, `alive`, `team` | Enough for Radar + inspector |
| Interpolation (client) | Linear on `x,y,z`; **yaw unwrap** then lerp | Never discrete teleport between samples |

Dead players keep last position with `alive=false` until round end (no trail extension required for MVP).

## Map coordinates

- Parser emits **world** coordinates (Source units).
- Map metadata config per map: `{ map, pos_x, pos_y, scale, rotate, radar_image }`.
- Transform:  
  `radar_x = (world_x - pos_x) / scale`  
  `radar_y = (pos_y - world_y) / scale`  
  (standard Valve overview convention; `rotate` reserved).
- Supported maps (shared config in `apps/api/app/maps/metadata.py` ↔ `apps/web/src/lib/replay/maps.ts`):
  - **de_mirage** — Valve overview (`pos_x=-3230`, `pos_y=1713`, `scale=5.0`) from game `resource/overviews/de_mirage.txt` (via [MurkyYT/cs2-map-icons `radar_info`](https://github.com/MurkyYT/cs2-map-icons)).
  - **de_anubis** — Valve overview (`pos_x=-2796`, `pos_y=3328`, `scale=5.22`) from [SteamDatabase GameTracking-CS2 `de_anubis.txt`](https://github.com/SteamDatabase/GameTracking-CS2/blob/master/game/csgo/pak01_dir/resource/overviews/de_anubis.txt); verified against `match-d03751f42266` spawn clusters (CT/T `ry` aligns with Valve `CTSpawn_y` / `TSpawn_y`).
- **Radar images:** real 1024×1024 Valve overview textures under [`apps/web/public/maps/`](../apps/web/public/maps/) (`de_mirage_radar.png`, `de_anubis_radar.png`), sourced from [MurkyYT/cs2-map-icons](https://github.com/MurkyYT/cs2-map-icons) depot scrapes. Licence note: Valve IP — see [`apps/web/public/maps/README.md`](../apps/web/public/maps/README.md). Studio renders the PNG in SVG `viewBox` space so markers use the same transform as the texture.
- Other maps: show “coords unavailable” until overview metadata (and optionally a radar PNG) is added (do not invent transforms).
- Screen transform: map radar space → SVG/canvas via viewBox; one shared util `worldToRadar` / `radarToScreen`.

## Replay payload format

Prefer **round-scoped** endpoints (keeps payloads small).

```ts
// GET /matches/{id}/rounds/{round_id}/replay
type RoundReplay = {
  matchId: string;
  roundId: string;
  roundNumber: number;
  map: string;
  tickRate: number;
  startTick: number;
  endTick: number;
  durationSec: number;
  players: { id: string; name: string; team: "CT" | "T"; }[];
  samples: {
    // Parallel arrays or list of frames — frames preferred for clarity
    tick: number;
    t: number; // seconds from round start
    players: { id: string; x: number; y: number; z: number; yaw: number; health: number; alive: boolean; }[];
  }[];
  events: ReplayEvent[];
};

type ReplayEvent = {
  id: string;
  type: "kill" | "death" | "plant" | "defuse" | "flash" | "smoke" | "he" | "round_start" | "round_end" | "other";
  tick: number;
  t: number;
  label: string;
  actorId?: string;
  victimId?: string;
  pos?: { x: number; y: number; z?: number }; // world
};
```

Match metadata omits sample blobs. Events may also be queried match-wide with tick/time range pagination.

## API schema (MVP)

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/matches/upload` | Accept `.dem` / `.dem.zst`; return id + `uploaded` |
| `GET` | `/matches/{id}/status` | Processing stages + error |
| `GET` | `/matches/{id}` | Match metadata (map, score, rounds, players) |
| `GET` | `/matches/{id}/rounds` | Round list (numbers, winners, start/end ticks, duration) |
| `GET` | `/matches/{id}/rounds/{round_id}` | Round detail |
| `GET` | `/matches/{id}/rounds/{round_id}/replay` | Samples + events for Radar (+ optional `clip`) |
| `GET` | `/matches/{id}/clips` | ClipManifest (per-round gameplay status) |
| `GET` | `/matches/{id}/clips/{round_id}` | RoundClip metadata |
| `GET` | `/matches/{id}/clips/{round_id}.mp4` | Stream / Range-seek MP4 |
| `GET` | `/matches/{id}/events` | Paginated/ranged events (`fromTick`/`toTick` or `fromT`/`toT`) |

Legacy coaching routes (`/moments`, `/coach`) may remain stubbed but must not be the main replay path.

## Gameplay clips (CS Demo Manager)

After `complete`, Radar is usable immediately. A **Windows host worker** (not Linux Docker) may record per-round POV MP4s:

1. `csdm analyze` once per match
2. `csdm video START_TICK END_TICK` per round (concurrency 1)
3. Store under `data/matches/{id}/clips/rN.mp4` + `clips.json`

See [csdm-video.md](./csdm-video.md). Env: `RR_CSDM_ENABLED`, `RR_CSDM_MODE=stub|csdm`, …

Studio: **Gameplay | Radar** share one clock. Gameplay mode uses `<video>` as time master (`round_t ≈ video.currentTime` when the clip starts at round start). Missing clips keep Radar primary and disable Gameplay with a reason.

## Processing states

```
uploaded → decompressing → decompressed → parsing → normalizing → complete
                                                              ↘ failed
```

User-facing labels stay honest (no fake percentages). Detail strings may include round counts once known.

## Persistence

| Data | Store |
|---|---|
| Match metadata, status, errors | SQLite (`matches` table) + in-memory cache for active process |
| Upload bytes | `data/uploads/{match_id}.dem.zst` (or `.dem`) |
| Decompressed demo | `data/work/{match_id}.dem` (deletable after normalise; keep for debug flag) |
| Normalised match JSON | `data/matches/{match_id}/match.json` |
| Round replay blobs | `data/matches/{match_id}/rounds/{round_id}.json` (efficient enough for MVP; parquet later) |
| Gameplay clips | `data/matches/{match_id}/clips/rN.mp4` + `clips.json` manifest |

No Kafka/Celery. Background work: `asyncio.create_task` / thread pool for CPU-bound parse.

## Upload safety

- Generated match IDs only
- Extension allow-list: `.dem`, `.dem.zst`
- Max upload size (default **300 MB**)
- zstd magic validation before decompress
- Decompression bomb limit (default **2 GB** written)
- Parse timeout (default **120 s**)
- User-facing errors only; stack traces in server logs

## Frontend clock / UI

- Upload → poll `/status` through real stages → open match
- Round navigator; play/pause/scrub; speeds **0.5 / 1 / 2 / 4×**
- Shared playback clock (`usePlaybackClock`): RAF master in Radar mode; video master in Gameplay mode
- Radar interpolates from round replay samples
- Optional Gameplay HTML5 video when clip `status=ready`
- Timeline markers from `events`; click seeks `t`
- Restrained event inspector; optional `?debug=1`

Design: handoff Analysis Studio tokens (light chrome, dark stage), anti-AI rules. No moments rail as primary UX for this milestone.

## Performance budget (document per test demo)

Record in `docs/replay-performance.md` (or agent log): upload size, decompress time, parse time, normalised size, typical round replay JSON size.
