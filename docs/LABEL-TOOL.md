# Local round labelling tool

Import CS2 `.dem` or `.dem.zst` files, select a player, label rounds and resume saved work in a browser. This annotation mode reuses Round Reviewer's Python parser, normaliser and detectors. Supported maps are Ancient and Anubis. There is no Node, GPU, model or Steam dependency for the tool itself.

## Clip workflow audit, 17 November 2026

| Area checked | Finding and outcome |
|---|---|
| Getting started | Previously a reviewer needed to find the correct demo, player and batch even when recordings were ready. **Open a ready clip** now finds unfinished footage for the entered handle. The operator can still choose a particular demo or use independent round review. |
| Playback | Replaying the selected MP4 previously reloaded it and could fail before its metadata arrived. Slightly short recordings could also be rejected by the player despite passing media validation. Replay now reuses the selected video and respects its playable bounds. |
| Saving and recovery | A note previously required two manual ratings to complete. The new submit records the note and the reviewer’s confirmation together. Drafts, stale-tab conflicts, duplicate submissions, edits during saves, interrupted uploads and bookmark recovery were checked. Optional unanswered ratings remain empty in the export. |
| Keyboard and navigation | Polling could replace focused controls or race with a change of demo. Updates now preserve stable controls and serialise status polling. Unchanged queues retain their buttons. Hidden round-marking shortcuts are inactive during clip review. |
| Browser check | In Chrome, the keyboard shortcut opened an unfinished clip. A 3.8-second H.264 recording played twice inside a requested four-second window. A note saved without ratings, advanced to the next clip and was restored after reload. The form fit a 390-pixel viewport without horizontal scrolling. These checks used disposable footage. |
| Coach connection | Qwen previously had no path to clip notes. A live Qwen3-14B run on the RTX 5080 received a completed note from a disposable labeller and returned a verified answer citing a finding from a different synthetic match. This checks delivery and attribution. Measuring coaching quality requires independent human ratings. |
| Live installation | The updated Docker service passed its health check and the recorder reconnected. The same volume contained 101 ready clips, 32 clips in paused batches and 10 saved clip-label revisions before and after the update. Across five imported demos, permission was unassigned at the time of the audit. |
| Import history | Seven recorded failures concerned maps outside Ancient/Anubis, two reported malformed demo messages and one reported a zstd decoder window error. The updated form can be used with the saved clips immediately. The audit did not retry these private imports or start a new CS2 capture. |

## Portable setup for other labellers

For the Windows launcher, PostgreSQL setup, recording prerequisites, note import/export and verified backups, follow [Set up a recording and labelling PC](LABELER-SETUP.md).

## Run with Docker

Install Docker Desktop on Windows/macOS, or Docker Engine with the Compose plugin on Linux. Windows Docker Desktop must use Linux containers. Start Docker before running the commands. Allow approximately 8 GB RAM for Docker, two CPU cores and enough disk space for the image, decompressed demos and parsed caches. Initial startup downloads the image and pinned Python packages; later runs use the local image.

Extract the shared ZIP into a folder. Open a terminal in that folder and run:

```sh
docker compose -f compose.labeler.yaml up -d --build --wait
```

Open **http://127.0.0.1:8765**. The published port accepts connections only from your computer. The container runs as a non-root user, with one parser subprocess at a time. It does not modify the original files you select.

The image targets `linux/amd64`, with a pinned Python base image and package versions. It was tested on Windows Docker Desktop's Linux engine. Intel/AMD Linux and macOS Docker installations use the same image; Apple Silicon requires Docker's amd64 emulation and may parse more slowly. Those host combinations were not directly tested. Docker reduces environment differences but cannot remove RAM/CPU requirements or repair an unsupported/corrupt demo.

Stop and restart without losing labels:

```sh
docker compose -f compose.labeler.yaml stop
docker compose -f compose.labeler.yaml start
```

Ordinary `docker compose -f compose.labeler.yaml down` also preserves the named data volume. **Do not add `--volumes` or `-v` when stopping/removing the stack:** that deletes its stored work. Do not run Docker volume pruning against this workspace.

If port 8765 is occupied, set `LABELER_PORT=8775` in `labeler.env` and start through the launcher. For direct Compose commands, include `--env-file labeler.env`.

## Automatically record and label detected moments

If footage is already saved, enter your labeller name and click **Open a ready clip**. This opens a ready, unfinished recording for your handle from the existing selected batches.

1. Enter your labeller handle, import a demo and explicitly select a player.
2. Leave **Automatically record detected moments** checked, set the before/after context (defaults: 10 and 5 seconds), then click **Prepare player**. Once parsing finishes, the server queues every finding in that player's saved detector snapshot, even if you close the browser. For an already prepared player, **Record all detected moments** does the same thing.
3. Run the host recorder described below. It claims pending clips for one player/batch together, merges overlapping windows within each round, and captures those windows in one CS2 launch. It then cuts the original padded clips and uploads them to Docker. Windows must remain awake with Steam signed in and CS:DM's database running. Clips become ready after the session finishes capture and starts uploading; previously completed clips remain reviewable throughout.
4. Click **Review next clip**. Check the player and event and write a sentence under **What did you notice?** You can describe a mistake, a good play or the context you would need to judge it. Drafts save locally as you type.
5. Click **Save note and next clip**. This confirms the footage and submits the note to the local labeller in one action. The next ready clip opens. **Optional review details** retains the detector and decision ratings and the English/Polish language selector. You can still submit both ratings without prose. **Skip for now** leaves a draft.

Recording progress shows ready, recording, queued and failed counts. Repeating the same player/snapshot/context request reuses its batch, including completed footage. **Pause recordings** stops pending jobs; the entire recording session already in progress finishes. Use `--session-size 8` for shorter sessions if you need more frequent pause points or earlier uploads; the default is up to 128 clips per session. **Resume recordings** continues it. **Retry failed** retries failures without recording ready clips again. Changing the padding creates a new batch and pauses pending jobs from the previous one; existing footage and labels remain saved. Padding is clamped to round boundaries, so an edge clip can be shorter than requested.

These are **candidate-first** labels, exported separately using the clip-label export buttons. They do not claim an independent full-round review, and they cannot measure missed events by themselves. Opening the detected queue marks its rounds as candidate-exposed for that handle; subsequent round reviews preserve that fact. Existing independent passes remain intact. A completed clip label has confirmed footage and either a written note or both structured judgements. Empty ratings mean unrated. Training export also applies the match split and permission gates. A new draft supersedes a completed label until completed again.

The queue, videos and labels survive container restarts. The running host recorder reconnects when Docker comes back. Active sessions renew their leases every 15 seconds. If the recorder crashes, the lease expires 30 minutes after its last successful renewal, making unfinished clips retryable. Keep the recorder running while you want automatic capture; the browser alone cannot start Steam/CS2.

### Use saved notes in Qwen

In **Choose a player**, enable **Allow training and local coach examples for this demo** once for each permitted source match. This assigns an unassigned match to the training split. Validation and test matches are reserved for evaluation. You can revoke permission at any time. Existing completed notes on eligible training matches are available immediately.

Start Studio on the same PC with `./start-local.ps1 -Llm` once the local model server is running. Open a moment in a different Ancient or Anubis demo, then ask a fresh question about that moment or request a new explanation. Studio automatically looks up at most two notes from other source matches on the same map with a matching detector. It prefers the relevant finding, matching evidence terms and the requested language. The notes are examples. Coach claims still need evidence from the current player. Existing saved answers keep their original text.

The local launcher connects to `http://127.0.0.1:8765`. If the labeller uses a custom port, or you start FastAPI directly, set `RR_LABELER_URL` to the labeller address in the Studio API environment. On a separate presentation machine, forward the Windows labeller over your private connection and point Studio at the forwarded loopback port. Set the variable to an empty value to disable example retrieval. It operates in single-user Studio; the authenticated multi-user deployment has no per-owner labeller mapping.

Only the latest completed, aligned, non-empty note from an eligible source can be retrieved. Edits still in draft, revoked permissions, the current decompressed demo, and duplicate recordings linked under the same source match ID are excluded. Keep names and personal information out of free-text notes. Studio uses the existing decompressed demo file to identify the current recording. If the file or labeller is unavailable, coaching continues with the ordinary findings. In a fresh coach trace, `clipExampleRevisions` records the label revisions supplied and `clipExamplesUnavailable` identifies a failed lookup. A saved note does not retrain Qwen.

## Recording progress

The expanded **Clip queue · live progress** lists every queued clip immediately, before you open a review. The progress bar counts finished videos; each row shows its round, context window and current state. Recorder presence is checked by heartbeat: after 20 seconds without contact, the page shows **Recorder offline** with the command to start it. Keep that host process running; the Docker container cannot launch the host's Steam session.

The queue shows how many clips are in the current session and reports preparing, analysing, starting CS2, capturing window N of M, preparing individual videos, or uploading. The window counter observes actual capture directories on the host; it is a started-window counter, not a completed-frame percentage. Analysing can take time before a game window appears. These are actual processing stages, not estimated capture percentages. Failure details appear in the queue. **Record all detected moments** resumes an existing paused batch without duplicating clips; **Prepare player** still respects a deliberately paused batch. Pause stops new claims and lets the current session finish.

## Voice annotations

Choose English or Polish in the annotation language selector. Click **Dictate** beside clip notes, round notes or an individual observation field, then allow microphone access in your browser. Speak while watching the clip; headphones help keep gameplay audio out of the microphone. Click **Stop & transcribe**, correct the transcript if needed, then **Insert into note**. It appends to existing text and follows the normal draft autosave. You still choose detection/decision labels yourself; dictation does not infer labels or complete a review.

The microphone indicator and elapsed timer remain visible in the voice panel. Recording stops automatically at 175 seconds. **Discard voice note** releases the microphone and discards the pending text. If transcription fails, the audio stays in that tab for **Retry transcription**. Insert or discard before changing reviews; closing the tab loses uninserted audio/text. Server audio files are temporary and removed after processing. Audio is not included in label exports or retained as evidence.

Speech recognition uses the multilingual Whisper small model locally on CPU through [faster-whisper](https://github.com/SYSTRAN/faster-whisper). The Docker build downloads a pinned model revision; runtime transcription works without internet, a GPU or any cloud transcription API. Allow additional build time and disk space for speech packages and model weights. One voice note is processed at a time, with a four-minute transcription timeout. Three minutes / 20 MB are the server limits. Review names, callouts and Polish inflections; recognition quality depends on microphone clarity.

Microphone capture requires browser permission and localhost (or HTTPS). Use a normal Chrome, Edge or Firefox tab if an embedded browser cannot access your microphone. For native Python, install the updated lockfile and FFmpeg, download `Systran/faster-whisper-small` revision `536b0662742c02347bc0e980a01041f333bce120` with `huggingface_hub.snapshot_download`, and set `RR_ANNOTATION_VOICE_MODEL` to its local folder. Docker includes this setup automatically.

## Independent full-round review

For an independent annotation pass, turn off automatic recording and review the full round before opening detected clips or revealing suggestions.

1. Enter a labeller handle such as `pawel` or `aleksander` and click **Use name**. Use the same handle when resuming. Handles distinguish annotations, but are not account passwords or access controls.
2. Choose one or more files, or choose a folder. Folder selection imports supported demo files individually. Actual ZIP/RAR archives must first be extracted to `.dem`; `.dem.zst` is handled automatically. Uploads go to your local container, not a cloud service.
3. Expand **Import and parsing history** to inspect progress or errors. Roster inspection runs first. Choose the imported demo, explicitly choose one player, then click **Prepare player**. Full event/tick parsing starts only after that selection. Existing parsed artifacts and player snapshots are reused.
4. Select a round and watch its built-in radar. Play/pause, scrub, slow down to 0.25×, step samples/frames and click event timestamps. The selected player is white, teammates blue and opponents red, using the side for this round. Radar exposes all recorded players: it does not prove what the player could see or hear. Select saved footage and switch the clock to Video for actual player-view playback.
5. Add zero or more moments. Record facts, information available to the player, unknowns, decision assessment and a feasible alternative. Use uncertain when evidence is insufficient. Event references attach the exact saved event IDs. Text can be English or Polish; choose its language.
6. Confirm you reviewed the full round, then save the independent pass and reveal candidates. The original independent observations remain preserved. Judge each detector signal correct/wrong/unsure. After revealing candidates, a moment can also identify an event missed by an enabled detector.
7. Choose **Complete** and click **Save review** when finished. Otherwise keep Draft, or give a reason and choose Blocked/Excluded. Knife rounds are identified in the round heading and should normally be excluded from the research sample.

Edits autosave as drafts after a short pause. Wait for the saved indicator before closing. Reloading restores the last demo, player and round on that browser, and loads its durable saved revision. On another browser, enter the same handle and choose the same demo/player. Conflicting changes from another tab return an error rather than overwriting the newer revision; copy any unsaved text before reloading.

## Radar, context windows and footage

The radar runs entirely in the browser from parsed positions, with Ancient and Anubis overview images bundled in the Docker image. No external map fetch, CS2 process or Studio tab is needed. Expand replay opens the radar, footage and controls in full screen; Escape returns to the form. It shows facing direction, a short selected-player trail, health, deaths and recent events. Positions are sampled at 8 Hz and interpolated; health and death state remain discrete. This is telemetry replay, not rendered player vision. The saved overview version may differ from an old demo's map revision; check landmarks and use footage for visibility judgements.

**Watch context** uses 10 seconds before and 5 seconds after the decision by default; each can be changed to 0–60 seconds. Windows stop at the current round boundaries. Use Mark start/end for a custom observation interval, seek to the decision, then Add moment from marked window. M marks a moment at the current time. Space plays/pauses and arrow keys seek one second when not typing. Frame buttons step one encoded frame in Video mode or one 8 Hz sample in Radar mode.

After the independent pass, each detector candidate has **Watch context**, **Record context** and **Label this decision**. A wrong detector signal and a bad player decision are different labels: record correct/wrong/unsure on the candidate and mistake/good/neutral/uncertain on the moment. Watching does not automatically claim the full round was reviewed.

### Actual footage from an existing MP4

Expand **Record or import actual footage**, select an H.264 MP4, set the round elapsed time at its first frame, then **Upload and save footage**. For a full-match recording, this is usually a negative offset: minus the video's timestamp at this round's freeze end. For a context clip starting at round time 12 seconds, enter 12. The app checks the video stream, duration and browser-compatible pixel format. Docker includes FFmpeg/ffprobe; native Python users need ffprobe on PATH or `RR_FFPROBE_BIN` (the Windows CS:DM bundled path is also recognised).

Choose the saved footage, switch Clock to Video, and match a visible event against radar and event timestamps. Confirm **I verified the player and event timing** only after checking both. Attach selected footage to a moment to preserve its ID, SHA-256, original clock mapping and media metadata in the saved revision/export. The video must cover the entire labelled moment. Uploaded offsets are immutable: if an offset is wrong, upload with the corrected offset and select that version. Footage persists across reloads and container rebuilds. JSONL contains references/metadata, not MP4 bytes; the full workspace backup includes the videos.

The shared clock pauses at the end of footage. Outside its coverage the video holds its edge frame with an explicit notice; radar can still cover the full round. Context looping only repeats available video when that footage covers the selected interval. No synthetic gameplay is used as a substitute for missing footage.

### Record player POV directly from the demo

**Windows automatic startup (30 October):** run `./start-labeler.ps1 -InstallStartup` once from PowerShell in the project folder. This installs a per-user Startup shortcut and starts a hidden supervisor. At Windows sign-in it waits for Docker Desktop, starts the existing labeler and `csdm-postgres` containers, opens the installed Steam client if necessary, and starts/restarts the host recorder. Steam must already have a signed-in account; any Steam login/Guard prompt still needs you. The recording uses that local Steam session; no credentials are sent to Docker. `./start-labeler.ps1` starts the supervisor without installing the shortcut. Logs are in `.local/label-supervisor.log`. Remove **Round Reviewer recorder** from your Windows Startup folder to disable automatic startup. Python must be installed in `apps/api/.venv` or `.venv` as described below. Docker Desktop must start separately; its own Windows startup option can handle that.

An idle worker now polls every half-second and drains pending sessions immediately. It retains one game launch per batch, overlapping-window merging, 720p/30 fps, audio and exact cut boundaries. Identical windows reuse the same encoded file but each clip keeps its own upload/identity. H.264 uses the `fast` preset at CRF 20. This reduces redundant work; it is not a benchmark claim of the fastest possible encoder or capture speed.

**Local verification, 30 October 2026:** the active 46-clip batch completed and all 46 server records were `ready`. A 15-second test clip took 37.3 seconds including startup/upload; the subsequent 27-clip and 18-clip sessions took 240.5 and 188.9 seconds with zero failed clips. The sample was H.264/AAC, 1280×720 at 30 fps, duration 14.967 seconds, and its image was inspected. Nine host-recorder checks and 28 media/queue API tests passed. The initially stalled game launch recovered after a clean restart; a game/plugin incompatibility was suspected but not established. The separate older 32-clip batch was left paused. These are local observations, not a general speed guarantee or a manual alignment confirmation for every clip.

**Selected-player recording fix, 18 November 2026:** reproduced the wrong POV on the reported Ancient SourceTV demo for the explicitly selected player. CS:DM could not detect this SourceTV demo's source, reported failed analysis with a zero exit status, and generated capture actions without any player selection. The worker now rejects those failures. For an unrecognised source only, it tries CS:DM's Valve parser to populate the recording roster; this does not change the labeller's parser, round windows, findings or research provenance. It exports and verifies the selected Steam ID in that roster before opening CS2, and selects the player half a second before each capture. Missing/ambiguous players stop recording. An account-lock-only experiment did not fix an absent roster and is not the implemented solution.

The worker also recognises CS:DM 3.21's per-video output subfolder, matching each exact sequence number and tick range. A real run of the patched worker produced four 15-second selected-player clips across different rounds and both sides in **72.7 seconds**, with no failed clips. Sampled frames were compared with parsed weapon/health/money data; all four matched the selected player. Delivery used a local audit sink, not a production batch. Evidence, videos and game-action logs are in ignored `.local/recording-pov-audit/final-worker/`. **30 recorder/media tests passed, plus 3 subtests.** Existing recordings are not automatically corrected: an already-ready wrong clip must be regenerated. Rebuilding the Docker image alone does not update the host recorder; restart it after updating `tools/record_label_clips.py`.

If CS2 produces no first capture window within 90 seconds, the worker stops its capture process tree and retries once in a fresh attempt directory. A second stall becomes a retryable compatibility/setup error. Windows Job Objects also clean up CS2 when the HLAE launcher has already exited. `capture.log` is written while CS:DM runs. A playing demo is not proof of recording: CS:DM's control plugin must execute its actions and create media. Check [official playback compatibility](https://cs-demo-manager.com/docs/guides/playback#cs2-plugin-compatibility) after game updates.

**Record context** saves a durable request containing the selected SteamID, exact demo ticks, decision anchor and before/after padding. Requests are processed serially by an optional host recorder and the completed MP4 appears in this page. Start the recorder from the extracted project folder with Python 3.13 (no additional Python packages needed):

```sh
python tools/record_label_clips.py --check
python tools/record_label_clips.py
```

For this existing checkout, use `apps/api/.venv/Scripts/python.exe` instead of `python` if required. `--once` processes at most one session; `--session-size 1` restores one clip per game launch; Ctrl+C stops waiting. `--url http://127.0.0.1:8775` selects another labeler port. `--csdm PATH`, `--ffmpeg PATH` and `--cache PATH` override local defaults. The recorder downloads a hash-verified decompressed demo from Docker, runs `csdm analyze`, uses its own control port so an open CS:DM desktop app cannot intercept the capture, records the selected player with x-ray disabled and the full HUD/audio requested, records browser-compatible H.264/AAC and uploads the real result. Exact windows are remuxed without re-encoding; cuts within a merged window are decoded and re-encoded for accurate boundaries. Analysis runs once per session. It checks duration against the requested interval; you must still verify POV and event alignment. Failed jobs show their reason with Retry; a crashed recorder's lease expires after 30 minutes and becomes retryable. The local recorder cache retains original captures for diagnosis.

The host needs Steam signed in, CS2 installed, and CS Demo Manager already configured (including its PostgreSQL database and capture dependencies). Windows defaults to HLAE; Linux can use `--recording-system CS` but that capture route is not validated here. Follow CS:DM's installation and video setup instructions. Check that CS:DM’s configured PostgreSQL service is running before recording. CLI presence alone does not prove the graphics session, database or game build is compatible with the demo.

**Docker portability applies to parsing, radar, footage playback and label storage.** A normal headless Linux container cannot supply an installed CS2 graphics session. Actual capture runs on the configured host and may open CS2; review and labelling stay inside this page. A collaborator without a capture host can use the full radar workflow and upload previously recorded MP4s. macOS does not become a CS2 capture host merely by running this container.

## Storage and collaboration

The Compose project is named `round-labeler`; its named volume is normally `round-labeler_labels`. It holds the SQLite annotation database, immutable save revisions, source demo copies, parser caches, saved MP4 footage and recording job history. Container recreation and image rebuilding preserve this volume. A second server cannot concurrently claim the same workspace; browser tabs communicate with the one server and use revision checks.

Send `round-labeler.zip` to your collaborator. It contains application source, pinned dependencies, Docker configuration, tests and these instructions. It does not contain your demos, SteamIDs, labels, database, credentials or Python environment. Each person runs their own local copy and imports the same source demos when reviewing overlap rounds. The SHA-256 of decompressed demo bytes provides a shared identity across compressed/plain copies.

Use distinct handles and exchange notes through the launcher's Export my notes and Import notes actions. Research JSONL exports remain available in the browser. Keep the original independent files when discussing disagreements; do not combine them as if each annotator reviewed different rounds. Different recordings of the same match can have different hashes: set a consistent provider-qualified **Source match ID**, such as `faceit:<match-id>`, and keep them in the same partition.

This is a local, single-computer tool. It is not an authenticated multi-user hosting service; do not publish its port to your LAN or the internet. Multiple collaborators use their own containers and exchange files. The existing Studio's authenticated deployment remains a separate mode.

## Research exports

Under Source and dataset split, record source, source match identity, train/validation/test partition and permitted training use. You can label before assigning a split. Once an assigned match has a saved review, its split and source match identity are frozen to prevent accidental reassignment. The tool rejects conflicting splits for a source match identity already present in that workspace. Cross-machine corpus allocation still needs a shared manifest agreed by both people.

Download completed JSONL to export the latest completed review per round for your handle, optionally filtered by partition. Drafts, blocked/excluded reviews and other handles are excluded. An edited completed review becomes a draft until explicitly completed again. The permitted-training export additionally requires a train assignment and the training-permission flag. These are annotation records, not ready-made SFT conversations. They retain player IDs and free-text notes; review and pseudonymise them before any wider sharing or training pipeline.

The v2 schema separates detector signal correctness from human decision assessment. Legacy `score`/`agreement` commands consume the old format and must not be pointed at v2 exports. A corrected cross-snapshot matching/evaluation runner, adjudication UI and conversation exporter remain later research work. No precision/recall or coaching-quality results are claimed by this tool.

## Back up the whole workspace

JSONL exports are useful for exchanging completed labels; they do not include drafts, source demos or revision history. To back up everything consistently, stop the container before copying `/data`:

```sh
docker compose -f compose.labeler.yaml stop
docker compose -f compose.labeler.yaml cp labeler:/data ./labeler-backup
docker compose -f compose.labeler.yaml start
```

Use a new backup directory each time and keep it private. To inspect/resume a copied workspace with native Python, pass the directory containing `annotations.sqlite3` as `--data-dir`. Do not manually copy a live SQLite database without its WAL or use a partially copied cache.

## Run directly with Python

From the extracted folder, using Python 3.13:

```sh
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\python.exe -m pip install -r docker/requirements-labeler.lock
.\.venv\Scripts\python.exe -m eval.label_tool serve
```

Linux/macOS:

```sh
.venv/bin/python -m pip install -r docker/requirements-labeler.lock
.venv/bin/python -m eval.label_tool serve
```

Use Docker for the supported portable environment. Native installations also depend on availability of parser wheels for the host CPU/OS. In the existing Studio checkout, the installed `apps/api/.venv/Scripts/python.exe` can run the same command after installing the annotation lockfile. Default native data location is `.local/annotation`; use `--data-dir PATH` and `--port NUMBER` to override it. Stop with Ctrl+C.

## Troubleshooting and checks

Expand job history to see the actual error; Retry restarts failed or cancelled jobs. Cancel terminates only that job's parser subprocess. Interrupted running jobs are marked failed on server restart and can be retried; queued jobs remain queued. Existing labels remain accessible while new imports run.

The original downloaded Anubis demo starting `1-07a052a0-` fails in the current parser with `MalformedMessage` after successful decompression. The newer `1-ffb87d5d-` Anubis recording works. This is a recording/parser compatibility failure, not evidence that every Zstandard file is unsupported. Unsupported maps are rejected explicitly.

Default limits are 2 GiB uploaded/decompressed size, 4 GiB parser RSS and 15 minutes per job. Docker additionally limits the whole container to 6 GiB RAM and two CPUs. Settings are in `compose.labeler.yaml`; increase limits deliberately if the machine can support them. Large batches require space for both raw demos and replay caches.

Run automated checks inside Docker:

```sh
docker build --target test -f docker/Dockerfile.labeler -t round-labeler-tests .
docker run --rm round-labeler-tests
```

Tests cover transactional resume, concurrent save conflicts, independent-pass preservation, validation, split/permission gates, corrupt-demo isolation, normal Zstandard frame windows, duplicate compressed/plain identity, request protections interrupted-job recovery, padded tick windows, recording leases, verified footage evidence, invalid uploads, real H.264 decoding metadata, MP4 byte ranges and video persistence. `node tools/test_label_replay.cjs` additionally checks interpolation, exact death timing, rewind and boundary clamping (Node is optional for development tests). The test container uses temporary synthetic data and does not mount your label volume.

## Clip labelling usability, 28 October 2026

Clip mode puts the video beside a numbered label form on wide screens and stacks them on smaller screens. Radar is expandable; full-round editing controls and setup are tucked away while labelling. Use **Change demo / player** to reopen setup or **More options → Return to round review** for a full-round pass. Recording controls are separate from **Review next clip**; finished clips can be labelled without a recorder running.

The former combined completion error is replaced with specific missing steps, including when only the player/timing checkbox is missing. The active clip's confirmation updates immediately, failed confirmations remain unchecked, and attempted completion does not stop draft autosaving. Save-and-next prevents duplicate clicks and opens the next ready unfinished clip. Opening an existing batch also loads its round list if Prepare/resume has not been used in that tab.

Validation: 64 Docker API/storage tests passed. `node tools/test_label_batches.cjs` checks exact-clip confirmation, missing-step messages, failed verification, preserved notes and autosaved drafts, successful next-clip navigation and duplicate-click protection. Voice and replay checks also pass. An isolated Docker browser test completed the first of two synthetic clips, advanced to the second, and restored the saved first label when navigating back. Test judgements were not written to the real annotation volume.

The voice-panel overlap regression is fixed: sticky playback is bounded by the playback/form container, and dictation follows outside that container. Browser checks against the rebuilt Docker app found no overlap or horizontal overflow at 1280px and 800px widths, including expanded replay. These layout checks opened the microphone-permission state without recording speech. Clip, voice and replay JavaScript checks passed again. All 51 real clips remained ready.

## Recording efficiency, 28 October 2026

Capture uses CS:DM's multi-sequence configuration, keeping one selected SteamID across all windows. Windows are sorted by demo tick; overlapping/touching windows merge only within the same round. Every detector moment retains its own clip ID, label, anchor and original before/after interval. Existing ready footage is never claimed again. One atomic session lease prevents competing recorders from launching simultaneous captures. Partial capture failures retain successfully generated sequences and report missing ones as failures.

The output remains 1280×720 at 30 fps with normal gameplay timing. No hardcoded 4× demo playback setting is applied. Frame capture throughput, seeking and startup time are different from the finished video's playback speed. Recording the whole match would include unrelated gameplay; selected merged windows avoid that extra work. CS2 still needs to open on the host once per session; Docker continues to provide the queue, progress, validation, storage and labelling UI.

For the real 51-moment Anubis batch, 743.78 seconds of individually requested footage reduce to 24 merged windows totalling 388.78 seconds (about 48% less gameplay to capture, before startup/seek/encoding overhead). A real four-clip test used three windows in a single launch and finished in 63 seconds including startup and uploads. All four outputs were accepted by Docker's duration/codec checks; the first output was independently probed as 15 seconds of H.264/AAC at 30 fps, and its pawcio_ POV and event frame were visually inspected. This is a session benchmark, not a guaranteed 4× capture-speed claim. The remaining 33 real clips then completed in one 17-window session in 279.3 seconds (4 minutes 39 seconds), including capture, cuts and uploads, with zero failures. All 51 clips were ready afterward; their largest duration deviation from the requested windows was under 0.04 seconds. A distinct overlapping round-14 cut was visually checked before and at the death anchor, retaining pawcio_ and the expected game-clock timing. The browser verified the live window counter and final queue state; rebuilding Docker preserved all completed footage.

The updated Docker suite passed 63 tests. Four host tests cover one-launch configuration, merged windows, exact cut offsets, round boundaries, selected POV, isolated control port, remuxing, per-clip upload failure isolation and surfaced database errors. API checks cover atomic/scoped claims, lease renewal/expiry, per-window progress, pause behaviour, limits and preserving completed footage.

## Voice validation, 28 October 2026

The updated Docker suite passed 61 tests. Four voice API tests cover language validation, size limits, concurrent requests, missing setup, request protection and temporary-file cleanup. The JavaScript check covers appending without overwriting, duplicate insertion, wrong-review protection and cancelling a pending microphone permission request. An 8.45-second synthetic English speech sample was encoded as Opus/WebM, sent through the real endpoint and transcribed successfully with Docker networking disabled. Invalid audio was rejected and temporary files removed. Browser checks confirmed Dictate controls and the microphone permission flow; an actual human microphone recording and Polish recognition accuracy were not verified in this run.

## Batch recording validation, 27 October 2026

Windows Python: 59 API/storage/legacy tests passed. Linux Docker: 55 tests passed, including ten new batch tests for exact selected-player findings, bounded context, concurrent idempotent creation, pause/resume, retry without duplicate footage, automatic queuing after parsing, separate clip-label exports, exposure provenance and revision conflicts. The browser queued 34 real Ancient findings, and the host recorder produced two 1280×720, 30 fps clips with 10 seconds before and 5 seconds after their anchors (14.97 seconds of encoded footage each). Save-and-next advanced from clip 1 to clip 2; both QA labels were left as drafts, outside completed exports. Pending QA recordings were paused. A Docker rebuild preserved the batch and drafts, and the host recorder logged disconnection and automatic reconnection.

## Earlier replay validation, 27 October 2026

Windows Python: 49 API/storage tests passed, plus two host-recorder regression checks. Linux Docker: 45 tests passed, including decoding metadata and byte-range delivery of H.264 test media; the shareable ZIP independently built and passed the same suite. Browser checks covered real Ancient radar playback, half-speed, context seeking, marked-moment save/resume across a container rebuild, and real 1280×720, 30 fps player-view MP4 playback. Two real CS:DM recordings through the host bridge each produced exactly 15 seconds for ticks 5551–6511, round time 5–20 seconds around the 15-second decision. Earlier capture failures exposed a stopped database and a control-port collision with the open CS:DM GUI; the bridge now isolates its port. The second capture explicitly retained the full HUD and requested audio. Its Meercenaire POV and 1:40 game timer at the 15-second anchor were checked beside the radar; metadata records that alignment confirmation. Test-pattern videos are used only in isolated automated tests, never as fallback gameplay. QA annotation drafts are explicitly marked as technical checks, not human coaching labels.
## Grouped plays and source-install checks, 18 November 2026

Batch creation now combines overlapping padded contexts for the selected player
within a round. One play has one recording, one review and a `footage.findings`
array containing every original detector finding. `footage.reviewKey` identifies
the sorted finding set; the singular `finding` remains its real lead finding for
older readers. Local notes, clip manifests, cloud exports and note imports retain
the group. Group-level verdicts are not reused as individual detector verdicts.

The earlier recorder merged capture windows for efficiency but cut them back into
one clip per finding. Grouping now happens before those recording jobs exist.
Batch identities include a grouping version, so existing clips/reviews are not
silently replaced. Preparing a new grouped batch pauses its predecessor's queued
work. Groups are bounded to 60 seconds, while preserving a manually requested
longer context, and never cross round or player boundaries.

See [GitHub setup and update instructions](LABELER-SETUP.md#run-from-a-github-checkout).
`tools/package_labeler.py --check-git` detects omitted required source files;
the GitHub workflow builds an extracted source kit and runs the labeller suites.
