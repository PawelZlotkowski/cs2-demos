# CS Demo Manager gameplay video

Round Reviewer records per-round first-person clips with [CS Demo Manager](https://cs-demo-manager.com/) so Studio can show **Gameplay** alongside **Radar** on one clock.

## Spike status (local machine)

Checked on the implementation machine (Sep 2026):

| Check | Result |
|---|---|
| `csdm` on PATH | **Not found** |
| Default install dir `%LOCALAPPDATA%\Programs\CS Demo Manager` | **Not present** |
| `ffmpeg` on PATH | **Not found** |

Automated tests therefore use **`RR_CSDM_MODE=stub`**, which writes a tiny placeholder MP4 into the clips folder so API/UI sync can be verified without CS2. Real recording requires installing CS:DM + CS2 on a Windows host and setting `RR_CSDM_ENABLED=1` / `RR_CSDM_MODE=csdm`.

### Manual spike when CS:DM is installed

1. Decompress a match demo to `.dem` (API already does this under `data/work/{matchId}.dem`).
2. Analyse once:

```bash
csdm analyze "C:\path\to\match.dem"
```

3. Record one round (ticks from `rounds` in `match.json`):

```bash
csdm video "C:\path\to\match.dem" START_TICK END_TICK ^
  --recording-system HLAE --encoder-software FFmpeg ^
  --framerate 30 --width 1280 --height 720 ^
  --ffmpeg-video-container mp4 ^
  --focus-player STEAMID64 ^
  --output "C:\path\to\data\matches\{matchId}\clips"
```

4. Rename/move output to `r{N}.mp4` and update `clips.json`, or let the worker do this.
5. Open Studio → Gameplay and confirm seek/play stays locked to Radar.

Expect recording to take longer than wall-clock (CS2 exclusive, HLAE). Measure and note timings here after the first real run.

## Architecture

1. Upload / parse / normalise completes → **Radar ready** (`status=complete`).
2. If video is enabled, the API enqueues a **Windows CS:DM worker** (concurrency 1).
3. Worker: `csdm analyze` once per match → `csdm video` per round → `data/matches/{id}/clips/rN.mp4` + `clips.json`.
4. Studio polls clip metadata; Gameplay enables when `status=ready`.
5. Shared playback clock: Gameplay mode uses the `<video>` element as time master; Radar mode uses RAF and keeps video scrubbed if mounted.

Docker Linux **cannot** run CS:DM. Run the API (or a host worker) on Windows with a bind-mounted `data/matches` directory, or keep `RR_CSDM_ENABLED=0` and use Radar-only.

## Environment

| Variable | Default | Meaning |
|---|---|---|
| `RR_CSDM_ENABLED` | `false` | Master switch to enqueue recording after parse |
| `RR_CSDM_MODE` | `stub` | `stub` = placeholder MP4; `csdm` = real CLI |
| `RR_CSDM_BIN` | `csdm` | CLI executable |
| `RR_CSDM_FOCUS_STEAMID` | empty | Override POV; else first CT then first player |
| `RR_CSDM_WIDTH` / `HEIGHT` / `FPS` | 1280 / 720 / 30 | Encode settings |
| `RR_CSDM_RECORDING_SYSTEM` | `HLAE` | `HLAE` or `CS` |
| `RR_CSDM_MAX_ROUNDS` | `0` | If >0, only first N rounds (faster iteration) |
| `RR_CSDM_TIMEOUT_SECONDS` | `600` | Per-round subprocess timeout |

## Storage layout

```text
data/matches/{matchId}/
  match.json
  rounds/r1.json
  clips.json          # ClipManifest
  clips/r1.mp4
  work dem may live in data/work/{matchId}.dem
```

## Failure messages (user-facing)

- CS:DM not installed / not on PATH
- Steam / CS2 not available
- Analyse failed
- Recording timed out
- Feature disabled (Radar-only)

## Out of scope (this milestone)

- Projecting world positions onto video frames
- Moment-ranked clips
- Full-match single file
- Azure GPU worker
