# Local V1 — Ancient and Anubis

Updated 25 October 2026. This is the first local integration checkpoint, not the final university release. Design remains paused. The main delivery backlog is [FINAL-DELIVERY-PLAN](planning/FINAL-DELIVERY-PLAN.md); the steps below expand its immediate work.

## Start on Pawel's PC

The required Python environment and web dependencies are already installed in this workspace. Docker is not needed for this launcher.

```powershell
cd C:\Users\pawel\Documents\cs2-demos-studio
.\start-local.ps1 -Check
.\start-local.ps1
```

Open **http://127.0.0.1:3003**. API documentation: **http://127.0.0.1:8003/docs**. Keep the terminal open; Ctrl+C stops the app processes started by this launcher. Saved matches persist in `.local/data`; logs are in `.local/logs/api.log` and `web.log`. Both locations are ignored by Git. Original demos stay in `demos/`.

The launcher preserves existing `.env` files. It supplies explicit local settings, skips saved admin overrides on startup, disables account sign-in and binds both servers to loopback. This launch mode is for this PC, not the shared cloud deployment. If a port is already occupied, stop the previous launcher or choose `-ApiPort 8013 -WebPort 3013`.

For another clean checkout, create `apps/api/.venv`, install `apps/api` with its `[dev]` dependencies, and run `npm ci` in `apps/web`. Use Python 3.11+ and a Node version supported by the checked-in Next.js release. This machine was tested with Python 3.13.5 and Node 24.19.

## First review

1. Add match → upload `.dem` or `.dem.zst` from `demos/`. Zstandard files are decompressed by the backend automatically. A WinRAR icon does not make a `.dem.zst` file a RAR archive. Actual `.zip`/`.rar` uploads are not accepted; extract their `.dem` first.
2. After decompression, the backend reads only the header/player information. The **Set up your review** screen lists the players before event/tick extraction starts. Choose exactly one player, **Overall / Shooting / Utility / Teamwork**, and English or Polish. Press **Start review** to begin full parsing and analysis. Teamwork means the selected player's trades/support, not a team-wide assistant. No kills/deaths are invented for this early player picker. Technical smoke checks selected the first parsed player, which may be an opponent; do not treat that review as Pawel's review.
3. Open the radar, play/seek a round, inspect the selected moments and evidence. The local launcher uses `local-v1` rules and a deterministic ranker. It runs without an LLM.
4. Check a suggested mistake against the replay. Mark correct, wrong or uncertain and explain the context. An untraded death or unused grenade is a candidate for review, not proof of bad play.

Ancient now has a real radar image and matching overview transform. Its named callout polygons and reviewed map-specific knowledge still need work; unnamed areas are deliberately not assigned invented callouts. Existing Mirage assets/tests remain for compatibility, but delivery scope is **Ancient and Anubis**, with **English and Polish**.

## Where processing happens

`Browser upload → FastAPI → decompression → header/player-list inspection → wait for player + focus + language confirmation → full demoparser2 extraction → normalised replay/events → focused Python findings → deterministic ranker → review`

The early inspection is still a small parser pass over the demo; it is not possible to list its players without reading the file. Full event and position extraction waits at `awaiting_setup`. This pending screen survives an API restart. Confirmed choices are stored in the match's `review-options.json`, exposed as `reviewFocus` on the match, and supplied to the optional coach. New uploads never silently select an account's linked player. Old already-parsed uploads keep their legacy entry path.

Overall uses the enabled detector set. Shooting keeps moving-fire/opening-duel findings and relevant successful fights; Utility keeps held grenades, team flashes, flash assists and utility damage; Teamwork keeps untraded deaths, team flashes, trade kills and flash assists. Selection happens after filtering, so the focus affects actual stored findings and moments, not just a UI label. The complete radar and round statistics remain available as context. Fewer than six relevant moments is valid. A review rerun preserves the chosen focus.

All these stages run on this PC in V1. The browser renders replay and sends requests; it does not parse demos. Optional inference uses the configured local model endpoint. Optional recording uses CS Demo Manager on Windows and returns an MP4 through the existing FastAPI clip endpoint. Studio polls clip status and makes gameplay available when the file is ready; it does not wait for every recording before opening the review.

The cloud target is unchanged: one shared API/parser and private storage, with authenticated outbound Windows/inference workers. Do not expose this local development launcher publicly. Durable remote jobs, worker leases, object upload and cloud delivery are still implementation tasks; a second public recorder API is not required. See [hosting](planning/HOSTING-AND-GPU-PLAN.md) and [artifact delivery](planning/RECORDING-AND-TRAINING-PLAN.md#21-both-visual-feedback-paths--research-and-proposed-integration-20-october).

## What the parser collects and selects

The parser collects round boundaries, kills, damage, shots, flashes, grenades, bomb events and available economy/inventory data. Replay positions, facing direction, team, health and alive state are sampled at 8 Hz. Shots carry velocity at the event tick; short full-rate windows around kills supply extra evidence. Missing optional fields must not be interpreted as confirmed absence of an action.

The versioned profile is exposed at `GET /analysis-policy` (`http://127.0.0.1:3003/api/analysis-policy`). Its initial detector set is:

| Candidate | Initial signal | Interpretation limit |
|---|---|---|
| Untraded death | Killer not traded within 5 seconds; teammate context retained | Distance and timing alone do not prove that a trade was possible |
| Shot while moving | Rifle/pistol/sniper burst with at least half its shots above the configured movement threshold; initial threshold 34% of weapon maximum speed | Heuristic to calibrate, not an exact spread or aim-quality measurement |
| Unused utility | Available inventory evidence shows grenades held at death | Saving or lacking a safe throw can be correct |
| Team flash | Own flash blinds a teammate for more than 1 second | May have been an agreed play; evaluate enemies affected and timing |
| Opening duel | First kill/death context | Context for a decision, not automatically a mistake |
| Good plays | Trades, entries, multi-kills, clutch wins, flash assists and utility damage | Outcome supports review; quality still needs context |

Dry-peek, late-rotation, economy-mismatch and repeated-death-zone detectors are excluded from this profile pending better evidence/calibration. They remain available in the legacy research profile; the launcher explicitly selects `local-v1`.

The ranker groups related evidence, spreads selections across rounds and detector types, and selects **at most six** moments. It balances good plays and potential mistakes when the available evidence permits; it does not invent findings to fill a quota. The existing ranker adds approximately 5 seconds before and 3 after an event group. Recording adds the configured 1 second before and 3 after that selected window, clamps to round boundaries, and caps a clip at 60 seconds. These are cumulative margins. The LLM, when explicitly enabled, can select/explain grounded evidence; it must not invent timestamps or commands.

## Test recordings separately first

CS Demo Manager 3.20.1, its CLI and ffprobe were found. Its configured database port is reachable. This is a prerequisite check, not proof of database authentication or working CS2/HLAE capture. No Steam session or game was launched during this integration check.

1. **Pawel:** sign in to Steam yourself and open CS Demo Manager. Confirm it can analyse the Ancient demo, and manually export one short POV clip with the intended player. Check that CS2, HLAE and FFmpeg work together before involving app jobs.
2. Stop the ordinary launcher, then run:

   ```powershell
   .\start-local.ps1 -Recording
   ```

3. Open a saved review or upload/select a player. **This enables real capture of queued selected moments** and may launch/control CS2 through CS Demo Manager. Do not play a live match while testing. Whole-round automatic recording remains off.
4. Check the gameplay view and compare the recorded event against the radar. Verify player identity, start/end ticks, context margins, map version and audio. ffprobe validation only proves a video stream with positive duration and dimensions; it cannot prove the POV or event is correct. X-ray is explicitly disabled in the generated recording command.
5. If capture fails, keep reviewing radar and inspect the clip's error/log. Retry after fixing the recorder. Stop the launcher to stop its owned app/recorder process tree; it does not intentionally close an independently running Steam session. Interrupting a game-launch tool still needs manual checking.

To test the LLM separately, start your self-hosted server yourself, configure `RR_LLM_BASE_URL` and `RR_LLM_MODEL` in `apps/api/.env`, then run `./start-local.ps1 -Llm`. The launcher checks that a loopback model endpoint responds; it does not download or start a model. First validate recording and inference in separate sessions. A loaded model can retain VRAM while idle, and capture/Ask do not yet have complete shared GPU lifecycle control. Combining both flags is not a validated GPU configuration.

## Verification on 25 October

| Check | Result |
|---|---|
| Ancient `.dem` through browser-facing upload API | 22 parsed rounds, 10 players, 34 findings, 6 moments; upload/parse about 15 seconds on this PC |
| New Anubis `.dem.zst` through the same flow | Automatic decompression succeeded; 22 parsed rounds, 10 players, 36 findings, 6 moments; upload/parse about 12 seconds |
| Recording windows | All queued windows stayed within their round and the 60-second cap; capture disabled during these checks |
| Original Anubis file `1-07a052a0-…` | demoparser2 0.42.0 rejects it with `MalformedMessage`, including direct parsing after successful decompression. New Anubis file works; underlying cause of the old file is not established |
| API regression suite | 294 passed, 4 skipped; run with isolated data, authentication/model/capture off, and local sockets available |
| Final parser-error and recording-stage follow-up | 25 targeted tests passed after the clearer malformed-demo error and stage-order update |
| Personal setup follow-up | Full API suite: 299 passed, 4 skipped; final targeted setup/coach/accounts/roadmap checks: 61 passed. Real Anubis Utility review: 12 relevant findings and 6 moments. Ancient browser flow waited for player/focus selection and the Start review action before parsing. Pending Anubis setup restored successfully after a server restart. |
| Web TypeScript check | Passed |
| Actual recorded clip / live LLM answer / cloud deployment | Not verified in this checkpoint |

Timings are two local smoke observations, not a benchmark. Private machine-readable reports are in ignored `qa-out/local-v1-demo-check.json` and `qa-out/local-v1-anubis-check.json`. Reproduce a check while Studio is running using `apps/api/.venv/Scripts/python.exe tools/check_local_demos.py <demo-path>`. It creates a saved match and selects the first parsed player for a technical check. The installed parser version matched the current [PyPI release](https://pypi.org/project/demoparser2/) at investigation time; an upgrade was not assumed to fix the old recording.

## Immediate tasks and acceptance

| Priority / target | Owner | Task and completion evidence |
|---|---|---|
| P0, next session (RR07/RR10/RR19) | Pawel | Select your real player on Ancient and Anubis; verify three kills, a flash and a bomb event on each map; record one short POV clip manually, then repeat through the app. Save tick/window and output validation evidence. |
| P0, next session (RR02/RR07/RR23) | Aleksander | Review 20 candidate moments across both maps using correct/wrong/uncertain, context and useful alternative. Include good plays and missed events. Propose threshold changes using training/pilot examples only. |
| P0, before shared hosting (RR05/RR08/RR09) | Pawel | Integrate bounded parser processes, memory/disk limits and durable recovery. Review side-switch scoring and round numbering, including knife rounds. Reconcile relevant Phase 1 safeguards individually, with accounts tests. Current native parsing uses threads and its timeout is not a hard process kill. |
| P0, 26–29 Oct target (RR08/RR37) | Pawel | Measure peak parser memory/disk, select a CPU cloud host, deploy authenticated HTTPS API/parser and verify concurrent isolated sessions for both students. Record hosting cost separately from the $30 GPU experiment. |
| P0, 26–29 Oct target (RR12–RR16) | Aleksander | Start one local model, verify its actual identifier/configuration, then compare templates against grounded EN/PL explanations. Save latency, VRAM, tool calls, unsupported claims and failures. Do not fine-tune before freezing this baseline. |
| P0, by 3–4 Nov (RR10/RR11/RR19–RR22) | Pawel / Aleksander | Pawel validates Ancient landmarks, callouts, replay timing and recording delivery. Aleksander reviews Ancient/Anubis knowledge and clip usefulness. Require repeatable capture or clearly report the gap. |
| P0, before 17 Nov defence | Both | Demonstrate upload → real replay → evidence → review → one validated recording and model trace. Rehearse failure/offline behaviour. Show measured results and remaining gaps. |
| P0, by 6 Dec | Both | Finish invited-user cloud release, research evaluation and university submission against the main backlog. Public registration stays deferred. |

The existing 2D radar is the working fallback. The proposed Three.js map with player locators remains a separate feasibility task after this local data/recording gate. It does not require reconstructing a player's POV. Fine-tuning follows the labelled-data and held-out evaluation protocol in the main plan; automatic detector outputs are not human coaching truth.
