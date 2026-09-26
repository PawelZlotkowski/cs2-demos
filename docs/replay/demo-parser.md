# Demo parser research (Phase 0)

British spelling. Written before implementation of the Demo Replay milestone.

## Game / version assumptions

| Assumption | Evidence from repo demos |
|---|---|
| Game | Counter-Strike 2 |
| Demo format | Source 2 `PBDEMS2` (not CS:GO `HL2DEMO`) |
| Compression | Facebook Zstandard (`28 B5 2F FD` magic) on `.dem.zst` |
| Typical origin | FACEIT SourceTV (server name `FACEIT.com register to play here`, client `SourceTV Demo`) |
| Maps seen in header | `de_mirage` (test file `1-5696bfd6-…-1-1.dem.zst`) |
| Patch / demo version | Header `patch_version` `14178`, `demo_version_name` `valve_demo_2` |

### Byte-level checks (mandatory)

On `1-5696bfd6-477d-422f-ab84-6914e9fc6d2e-1-1.dem.zst` (≈113 MB compressed):

1. **Compressed header:** `28 B5 2F FD` → valid zstd frame.
2. **Decompressed first bytes:** `PBDEMS2\0` → CS2 demo file stamp.
3. **Early strings:** `de_mirage`, `FACEIT.com…`, `SourceTV Demo`, `valve_demo_2`.

Decompressed size for that file: ≈158 MB (wall ≈0.2 s on a local SSD).

## Decompressed payload format

After zstd:

- Binary CS2 demo stream starting with `PBDEMS2`.
- Contains networked game events, entity snapshots and fullpackets.
- Not a parquet/JSON export; a dedicated demo parser is required.

## Parser selected

**Primary: [demoparser2](https://pypi.org/project/demoparser2/) (Python, Rust core), v0.42.x**

| Criterion | Notes |
|---|---|
| Why | Maintained CS2 `PBDEMS2` support; fast tick/event extraction; used in the planned stack (`docs/handoff/15`) |
| Licence | Check PyPI / GitHub at install time (commonly MIT for this project lineage) — treat as third-party; pin version |
| API used | `parse_header`, `parse_player_info`, `parse_event` / `parse_events`, `parse_ticks`, `list_game_events` |
| Output | Pandas DataFrames (we normalise immediately; do not leak DataFrames past the processing layer) |
| Verified fields | `map_name`, player `steamid`/`name`/`team_number`, `X`/`Y`/`Z`/`yaw`/`health`/`is_alive`/`team_num` per tick, `player_death`, `round_start` / `round_end` / `round_freeze_end`, bomb and grenade detonations |

### Alternatives considered

| Tool | Verdict |
|---|---|
| **awpy** | Strong CS analytics stack (often wraps / complements parsers). Heavier dependency surface for this milestone; keep as future option for analysis. |
| **demoinfocs-golang / node ports** | Excellent, but wrong language for our FastAPI pipeline. |
| **Hand-rolled PBDEMS2** | Rejected — protocol is large and version-sensitive. |

## Limitations

- demoparser2 must track Valve demo/protocol changes; pin and re-verify on new `patch_version` values.
- Warmup / knife / odd `round` indexing needs normalisation (raw `round_end` may include a junk row at tick 1).
- Tick rate is assumed **64** for CS2 official/FACEIT unless a future header field proves otherwise.
- Voice, skins and item drops are out of scope for replay MVP.
- Does not produce coaching findings — by design for this milestone.

## Supported / unsupported (parser layer)

**Supported for MVP**

- `.dem.zst` (zstd) and `.dem`
- CS2 `PBDEMS2` FACEIT/SourceTV demos
- Map name from header
- Per-player positions and yaw at sampled ticks
- Kills/deaths, bomb plant/defuse, common utility detonations
- Round boundaries via freeze-end → round-end

**Unsupported / deferred**

- CS:GO `HL2DEMO`
- Analysis detectors, rankings, LLM text
- Perfect visibility / spotted-state reconstruction
- Gameplay video rendering
- All CS2 maps aligned (MVP targets **de_mirage** first)

## Smoke result (research machine)

On the Mirage test demo after decompress:

- Header parse: &lt;10 ms
- Full event + 8 Hz tick sample through match (~82k ticks): ≈1.0 s
- Players: 10; deaths: 120; bomb plants: 6
