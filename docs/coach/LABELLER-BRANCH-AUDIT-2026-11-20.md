# Published labeller branch audit — 20 November 2026

## Verdict and scope

**Not ready for an unrestricted handoff with a claim that parsing and selected moments are all correct.** Existing footage and the basic review workflow work, but this audit reproduced data and context errors which the passing tests do not catch. Recording compatibility is a separate environmental problem; it does not justify replacing the recording system.

Audited remote `codex/labeller-recording` at **6882f6f0c16ddd2d7ba2948f2ed874a8c4a66710**, verified with `git ls-remote`. The clean checkout was `C:/Users/pawel/Documents/cs2-demos-studio/.local/labeler-handoff-20261120/git-ready`. The older worktree at `8094754` is not the published version audited here. The canonical Porcelain workspace has pre-existing changes and was not substituted for the published source.

**No application or recording code was changed, committed or pushed in this audit.** The owner explicitly requested that the recording implementation remain untouched. Tests used an isolated container on port 18766 and an isolated recording cache. A native capture comparison was diagnostic only; it did not change the normal recorder or CS:DM's saved HLAE setting. That test was stopped. The existing labeller on port 8765 and its recorder were left running.

Applied the repository's detector and evaluation skills and the reference parser/recording skill guidance: inspect real demo telemetry, independently compare parsed results, verify footage, retain uncertainty, and do not equate automated checks with human coaching-quality evaluation. Only the 102 training-partition demos were opened for the corpus scan; no sealed validation/test files were opened. No hosted LLM was used.

## The two reported errors and the smallest fixes

### HLAE: `AfxHookSource2/ViewModel.cpp:75`

Installed versions inspected locally:

| Component | Observed version |
|---|---|
| CS2 | Patch `1.42.0.0`, client `2000948`, source revision `11259529`; build date 19 November 2026 |
| CS Demo Manager | `3.21.0` |
| HLAE | `2.192.5.0`, commit `ab1516907a9af5821e47dd48ae5083b9c106b73f` |
| AfxHookSource2 | `0.41.5`; bundled changelog says adjusted to CS2 `1.41.8.5` |

The exact source for installed HLAE calls the line-75 error when its viewmodel function signature cannot be found in `client.dll`. A read-only signature scan found **zero** matches for that signature in the installed game DLL, while the neighbouring hand-function signature had one match. This identifies a concrete hook incompatibility, rather than an app parser exception or a missing `C:\_dev` folder. The path in the popup is the HLAE developer's source path.

The latest published HLAE at inspection time was [2.193.0](https://github.com/advancedfx/advancedfx/releases/tag/v2.193.0), released 7 November with AfxHookSource2 0.42.0. Both that release and current upstream main use the same failing viewmodel signature. Updating to that release is therefore **not an established fix for this popup**. [Upstream viewmodel implementation](https://raw.githubusercontent.com/advancedfx/advancedfx/v2.193.0/AfxHookSource2/ViewModel.cpp).

This failure is not proof that every HLAE capture is impossible. The existing session `b7b865526f8a457d97de9b5837890dac` has `recordingSystem: HLAE` and a successful capture log for **14 Ancient sequences**, completed at approximately 02:34 local time. The installed client DLL's write time was 02:25. The hook-error path returns from this optional hook; it does not itself terminate the whole process. A modal error can nevertheless stall unattended capture until dealt with. The audit did not establish whether someone dismissed that popup during the earlier successful session.

**Fix path:** retain CS:DM/HLAE and the current recording code. For unattended use, use a matching known-working game/HLAE combination, or wait for an upstream HLAE release that fixes the changed signature. A pre-update CS2 `1.41.9.9` installation is a concrete rollback candidate, not a combination validated in this audit. Do not silently upgrade HLAE and claim success; the latest release also changes FFmpeg option escaping.

For a separate pre-update game installation, the tracked 1.41.9.9 depot manifests are main `2347770 / 9806423311119977` and Windows `2347771 / 2106079474080930915`. These were read from [the recorded pre-update game files](https://github.com/SteamDatabase/GameTracking-CS2/tree/f5cf1f4b7e0b613977f9d666d1ad848eb8a76c85). They were **not downloaded or installed**. Main depot size is about 68 GB unpacked. A separate installation avoids changing the normal playing installation; confirm the exact game/plugin/HLAE combination with one known-good demo before a batch.

### CS2: “The demo file is incompatible with this version of the game”

The second screenshot coincided with the isolated `anb-056__saw-vs-b8-anubis.dem.zst` capture. Its uncompressed hash matched the corpus manifest, and both demoparser2 and CS:DM could analyse it. It was not demonstrated to be corrupt.

| Demo | Header patch | Observed result on installed game |
|---|---|---|
| `anc-069`, Legacy–Nemiga, Ancient | `14191` = `1.41.9.1` | Played; two native comparison clips completed |
| `anb-056`, SAW–B8, Anubis | `14074` = `1.40.7.4` | Parsed successfully; game rejected playback |

This explains why some demos work while others do not. Parsing a demo successfully is not a guarantee that today's game can replay it. Changing recording engines cannot make the game accept an incompatible demo.

For this older Anubis demo, the documented compatibility family is **CS2 `1.40.8.8` plus CS:DM plugin `14088`**. CS:DM's [version selector source](https://github.com/akiver/cs-demo-manager/blob/v3.21.0/src/ui/settings/playback/cs2-plugin-select.tsx) explicitly names that Steam beta branch; its [version definitions](https://raw.githubusercontent.com/akiver/cs-demo-manager/v3.21.0/src/common/types/cs2-plugin-version.ts) cover the period before the July 2025 Animation update. A matching older HLAE is also needed for HLAE recording; [2.185.3 / AfxHookSource2 0.35.3](https://github.com/advancedfx/advancedfx/releases/tag/v2.185.3) is the last published pre-Animation release identified, but this full combination was not installed or tested here.

Use CS:DM Settings → Playback to select the compatible game location and plugin, and Settings → Video to select the corresponding HLAE. CS:DM documents both Steam betas and a separate historical game installation in its [playback guide](https://cs-demo-manager.com/docs/guides/playback). A single current game build should not be assumed to play every historical demo in this mixed-age corpus. If older installations are not wanted, use already-recorded clips and demos verified to play on the current setup.

No Steam beta, CS:DM preference, HLAE installation or recording implementation was changed to apply these suggestions. The compatibility diagnosis is verified; the proposed historical configurations still require a real capture acceptance test.

## Reproduced application findings

### P1 — Round normalisation duplicates event ranges and findings

Location: `apps/api/app/processing/normalize.py:34–64` in the audited checkout.

The round-end filter retains non-initial rows with a missing winner. Start selection then uses the last freeze-end before each end, without requiring that it occur after the previous round end. Restart/aborted-round rows or missing freeze-end telemetry can reuse a previous round's start.

Real `anc-069` produces **51 normalised rounds versus 48 from CS:DM's independent decoder**, with these overlapping intervals:

| Normalised rounds | Intervals in ticks |
|---|---|
| 29 and 30 | `[212104, 218518]`, `[212104, 238028]` |
| 38 and 39 | `[300925, 305546]`, `[300925, 314474]` |
| 41 and 42 | `[321419, 324090]`, `[321419, 328542]` |

The resulting analysis contains **20 duplicated kill events** and two duplicate selected findings: F26/F27 at tick 216342 and F36/F37 at tick 324090. This distorts round numbering, event counts and the labelling queue even though the parse completes.

All 102 train demos decompressed and passed their uncompressed SHA-256 checks. Applying the current boundary-selection logic to their real round events found overlaps in **7 demos**: `anb-026-p1`, `anb-041`, `anc-042`, `anc-051`, `anc-059`, `anc-069`, `anc-072`. This scan tested round boundaries, not every detector on all 102 demos. A synthetic missing-second-freeze-end case independently reproduced duplicated kills in the next round.

Required correction: distinguish playable rounds from restart/aborted events, bound start/end pairing and enforce non-overlapping intervals. Re-run these seven cases against an independent decoder. Existing immutable snapshots and saved labels need a deliberate migration; do not silently assign old notes to renumbered rounds.

Evidence: `corpus-rounds.json`, `raw-rounds.log`, `evidence-audit.json`, `adversarial-results.json` in the audit folder below.

### P1 — Aggregate “good play” clips omit the evidence needed to judge them

Locations: `apps/api/app/annotation/batches.py:106–111`; `apps/api/app/analysis/detectors/good_plays.py:85–128`.

Batch preparation pads only each finding's anchor by ten seconds before/five after. Some findings describe an entire sequence: a multi-kill, a won clutch or utility damage accumulated across a round. Their supporting events can be far outside that anchor window. Grouping nearby padded windows does not recover disconnected evidence.

Real examples from `anc-069`, after actual grouping:

| Finding | Requested clip, round seconds | Supporting kills missing from clip |
|---|---|---|
| F9, round 8, three kills | 61.547–76.547 | 36.406 and 38.609 |
| F18, round 22, three kills | 22.234–39.797 | 17.625 |
| F41, round 48, three kills | 49.266–59.266 | 20.969 |

A synthetic clutch starting at 20 s generated a 10–25 s window while its five kills occurred at 40–80 s. A utility finding anchored at 2 s included damage at 60 s in its numeric evidence but generated a 0–7 s window. These are candidate-window errors, not evidence that the recording backend captured the wrong requested ticks.

Required correction: derive the review interval from the supporting event span, or explicitly narrow the claim to what the proposed clip shows. Test completeness of evidence after grouping and round-boundary clamping. This does not require replacing the recorder.

### P1 — Validation accepts audio duration as proof of video coverage

Locations: `apps/api/app/annotation/media.py:66–88` and recording upload validation at approximately 375–382.

A generated negative fixture contained **one second of H.264 video (30 frames) and 15 seconds of AAC audio**. `probe_video` returned the container duration of 15 s; full frame decoding succeeded; `validate_recording_duration` accepted a requested 0–15 s clip with an event at 10 s. There is no video of that event. This exercised the same validation functions used by upload, not an actual corrupt game capture and not an HTTP upload of the fixture.

Required correction: validate the actual video stream's timeline/decoded frame coverage, including stream start times, against the requested interval and anchors. Retain full decoding and add a video-shorter-than-audio regression. No validator was changed during this audit.

### P2 — Native fallback can remain at an incompatible-demo dialog for minutes

Location: `tools/record_label_clips.py:358–364`.

The existing native path disables the HLAE-directory startup watchdog and uses an overall timeout of at least 900 seconds. With `anb-056`, CS:DM logged “Recording 2 sequences” while the game displayed the incompatible-demo dialog. The audit stopped its own capture after **457.2 seconds**, after the owner requested no further alternate recording work. Both jobs became failed; no unusable file became ready. The 900-second timeout is a code observation, not a timeout awaited to completion in this run.

The HLAE path also retries startup before its existing native fallback. Repeating a deterministic version mismatch does not fix it. Record this as an operational limitation; the owner's instruction is to leave recording code unchanged. Correct the external compatibility combination first.

### P2 — Docker test target behaves differently for a checkout and the packaged kit

Location: `docker/Dockerfile.labeler:22–28`.

Building `test-core` from the complete published checkout succeeds, but running it fails during collection. Analysis tests pulled from that checkout import the production app: one requires `argon2`, absent from the core image, and another attempts to create the production data directory as the non-root test user and receives `PermissionError`.

The same target built from the generated source kit passes because that kit contains a selected test subset. This does not demonstrate a runtime labeller failure; it is a reproducibility/coverage gap between the branch and its packaged CI test surface. Make the intended test inventory explicit or satisfy the full target's dependencies and writable data path.

## Verification results

| Check | Result and scope |
|---|---|
| Published-source tracking check | `tools/package_labeler.py --check-git` passed |
| Windows API/evaluation/recorder tests | **478 passed, 4 skipped, 3 subtests passed**; full run completed in 140.60 s |
| Packaged source-kit Docker core tests | **191 passed, 1 skipped, 3 subtests passed** |
| Full-checkout Docker core tests | Collection failed as described above |
| JavaScript batch/navigation/replay/voice checks | All four scripts passed |
| PowerShell launcher checks | Passed |
| Fresh real demo pipeline | Ancient and Anubis imports, roster selection, extraction, findings and idempotent batches completed; Ancient boundaries were semantically wrong despite successful completion |
| Input failures | ZIP, empty file and path traversal returned 400; missing request header 403; unknown player 422; invalid demo job failed with an actionable message |
| Existing real workspace | Five prepared snapshots/batches, **85 ready videos**; all passed hash/identity/window checks and full decode; zero audit errors |
| Fresh native diagnostic footage | Two Ancient clips succeeded in 91.3 s; selected player HUD, weapons, health/money and first death anchor were visually compared with parsed ticks; not a guarantee of every frame or every future clip |
| Fresh HLAE diagnostic | Anubis test encountered the reported popup and could not establish successful capture; that demo also failed native game playback |
| Browser review | Blank submission blocked; playback worked; draft autosaved and restored after reload; completion advanced to the second clip and showed one labelled clip |
| Export | The technical QA note exported as complete; training export was empty because provenance remained unassigned and training permission false |

The 85 existing videos' technical checks **do not establish human POV confirmation or coaching correctness**. The audit reported 85 `pov_not_human_confirmed` warnings. Existing human labels were not rewritten. The one browser-created note was explicitly technical QA in the disposable workspace and excluded from training.

Not established here: a clean second person's Windows installation; a historical game/HLAE compatibility setup; real microphone transcription/model installation; coaching precision/recall; full playback of every corpus demo; frame-by-frame identity/timing for all 85 existing videos. The full voice runtime image was not rebuilt. Do not infer these results from the core image or JavaScript checks.

## Evidence and handoff conditions

Local evidence root: `C:/Users/pawel/Documents/cs2-demos-studio/.local/full-label-audit-20261120`.

Key files: `windows-tests.log`, `overtime-smoke.json`, `live-checks.json`, `corpus-rounds.json`, `raw-rounds.log`, `evidence-audit.json`, `adversarial-results.json`, `existing-workspace.json`, `footage-evidence.json`, `compatibility-probe.json`, `review-export.jsonl`, the two `capture-*.log` files and session capture logs. `compatibility/` contains upstream source and version evidence, the failed demo's CS:DM log, and pre-update manifest metadata. Raw demos remain local and are not added to Git.

Before calling the branch ready for a new labeller: correct and independently verify round boundaries; make candidate clips contain their supporting evidence; close the video-stream coverage gap; provide a tested game/plugin/HLAE combination and a clear supported-demo range. Preserve current labels through any extraction change. The existing recorder can remain the backend throughout this work.

This report is a reproducible audit of the identified commit and machine state, not a claim that every possible future failure has been ruled out.
