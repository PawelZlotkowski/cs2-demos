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

## Coach moment clips (T40)

After the player is picked and the coach has chosen its moments, the API records one clip per moment from **that player's** first-person view, in the `recording` stage (`selecting → recording → explaining → complete`). The analysis opens only after every clip is recorded or has failed with a reason:

1. Window: the moment's `t0`..`t1` (round clock seconds) that the coach picked, plus `RR_CSDM_MOMENT_PAD_BEFORE` / `_AFTER` (1 s / 3 s) so the play is not cut at the edges; clamped to the round and 60 s. The Studio trusts the recorded file's real length and, in the Gameplay view, pauses at the clip's end.
2. Ticks: `round.startTick + t × tickRate`, so the clip lines up with the Radar clock.
3. `csdm analyze` once, then `csdm video … --focus-player {playerSteamId}` per clip, into its own temp folder, moved to `data/matches/{matchId}/clips/moments/c{N}.mp4`.
4. Jobs live in the `clip_jobs` table (`queued → recording → ready | failed`). The processing page shows the stage with a done/total count. An on-demand round explanation and the agent's `request_clip` tool add jobs to the same queue and record in the background. The recorder shares the one-at-a-time worker with whole-round clips.
5. Studio: `GET /matches/{id}/players/{playerId}/clips` lists them; the clip is docked on the Radar stage and follows the shared clock at `t - t0` (plays natively, re-seeks only past 0.25 s of drift, holds its edge frame outside the window). A failed clip shows why and has **Retry** (`POST …/clips/{clipId}/retry`).

While `RR_CSDM_ENABLED` is off, jobs stay queued and read as skipped with a reason; turning it on and reopening the Studio records them.

Tests mock the CLI (`tests/coach/test_moment_clips.py`); CS:DM and CS2 only run on the Windows host.

## Architecture

1. Upload / parse / normalise completes → **Radar ready** (`status=complete`).
2. If video and whole-round clips are enabled (`RR_CSDM_ROUND_CLIPS`), the API enqueues a **Windows CS:DM worker** (concurrency 1).
3. Worker: `csdm analyze` once per match → `csdm video` per round → `data/matches/{id}/clips/rN.mp4` + `clips.json`.
4. Studio polls clip metadata; Gameplay enables when `status=ready`.
5. Shared playback clock: Gameplay mode uses the `<video>` element as time master; Radar mode uses RAF and keeps video scrubbed if mounted.

Docker Linux **cannot** run CS:DM. Run the API (or a host worker) on Windows with a bind-mounted `data/matches` directory, or keep `RR_CSDM_ENABLED=0` and use Radar-only.

## CS Demo Manager PostgreSQL (Docker)

CS:DM needs Postgres **17+** and a host-side `psql` on `PATH` (Docker alone is not enough — see [installation docs](https://cs-demo-manager.com/docs/installation)).

```powershell
# From repo root — starts only the DB (profile csdm)
docker compose --profile csdm up -d csdm-db
```

Connect in CS:DM with:

| Field | Value |
|---|---|
| Hostname | `127.0.0.1` |
| Port | `5432` |
| Name | `csdm` |
| Username | `postgres` |
| Password | `postgres` |

If you also installed PostgreSQL via the Windows installer, stop its service so it does not fight Docker for port 5432: `Stop-Service postgresql-x64-17`.

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
| `RR_CSDM_TIMEOUT_SECONDS` | `600` | Per-clip subprocess timeout |
| `RR_CSDM_ROUND_CLIPS` | `false` | Also record every whole round after parsing (slow; the coach's moment clips do not need it) |
| `RR_CSDM_MOMENT_PAD_BEFORE` / `_AFTER` | `1` / `3` | Seconds added around each coach moment |

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
- Full-match single file
- Azure GPU worker
