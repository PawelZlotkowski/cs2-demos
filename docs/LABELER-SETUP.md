# Set up a recording and labelling PC

Each person gets a local browser labeller, Docker storage, a PostgreSQL database for CS Demo Manager, and a Windows recording worker. The everyday workflow is to open a clip, write an observation and press **Save note and next clip**.

## Get the correct source from GitHub

Use the **`codex/labeller-recording`** branch, not the older `main` application.
This is the local Windows workflow for **your own demos**, with your choice of player.
Git contains the program; demos, MP4s, database credentials and personal annotations stay on your PC.

```powershell
git clone --branch codex/labeller-recording --single-branch https://github.com/PawelZlotkowski/cs2-demos.git RoundReviewer
cd RoundReviewer
powershell -NoProfile -ExecutionPolicy Bypass -File .\labeler.ps1 update
```

Install the recording prerequisites below before choosing **Record queued clips**.
The Git checkout is a source kit, so the first Docker build needs internet access.
You do not need a GPU model, an API key, a hosted account or the Studio frontend to label.
Check `http://127.0.0.1:8765/api/config`: this revision reports `reviewSchemaVersion: 3`
and detector policy `local-v1.1`. If those fields are absent, rebuild the updated source.
The 20 November update is delivered on this branch. Keep the branch selected when updating an existing installation.

## Start a new annotation pass safely

For an independent new pass, use a new handle, for example `alex_v2`. That handle
starts with no completed reviews; older notes remain available under the old handle.
For a completely empty installation, before starting copy `labeler.env.example`
to `labeler.env` in a new folder and set `LABELER_PROJECT=round-labeler-alex-v2`.
Use a different `LABELER_PORT` if the old installation is still running. Stop the
old recorder before starting the new one. Do not remove Docker volumes to reset labels.

When updating an existing installation, export your notes and back up the workspace
first. Stop the recorder after its current session, `git pull --ff-only`, run
`labeler.ps1 update`, refresh the browser, and **Prepare player** again for existing
demos. Older detector snapshots cannot be reviewed until refreshed. Start the recorder
again so it loads the new recording code; a running Python process cannot update itself.

## First installation on Windows

1. Install and open Docker Desktop using Linux containers. Allow approximately 8 GB RAM for Docker and sufficient free disk space for game files, images, demos and recordings. Windows must meet Docker Desktop's current WSL 2 requirements. [Docker installation](https://docs.docker.com/desktop/setup/install/windows-install/)
2. Install Python 3.11 or newer, Steam, CS2 and CS Demo Manager. Sign into Steam. CS Demo Manager's Windows installer installs its CLI. Reopen the launcher after installation so it receives the updated executable paths. The recorder uses Python's standard library. [CS Demo Manager installation](https://cs-demo-manager.com/docs/installation), [CLI installation](https://cs-demo-manager.com/docs/cli#installation)
3. Extract the entire shared ZIP into a writable folder, such as `C:\RoundReviewer`. Double-click **Open labeller.cmd**.
4. Choose **1 — Start labeller and open browser**. The prebuilt kit loads its bundled images automatically and opens the local labeller. A source-only kit builds the image on its first start and requires internet access.
5. Choose **D — Set up recording database**. The launcher creates PostgreSQL 17 with a generated password saved in `labeler.env`. It displays the host, port, user and database name. Open that file locally to copy `CSDM_DB_PASSWORD`.
6. In CS Demo Manager, open **Settings → Database**, disconnect if necessary, select **External**, enter the displayed connection values and press **Connect**. The normal values are host `127.0.0.1`, port `5432`, user `postgres`, database `csdm`. CS Demo Manager initialises its schema on connection. Its external server requirement is PostgreSQL 17 or later. [External database setup](https://cs-demo-manager.com/docs/installation#using-an-external-postgresql-server)
7. In CS Demo Manager's video settings, install/update HLAE and FFmpeg using their download buttons. Confirm the CS2 installation path and try a short video in CS Demo Manager. [Video setup](https://cs-demo-manager.com/docs/guides/video#installingupdating-required-software)
8. Choose **2 — Record queued clips** in the launcher. The worker runs in the background and the browser shows its connection state.

If this PC already has a reachable database configured in CS Demo Manager, the launcher reuses it. If port 5432 belongs to another service, set `CSDM_DB_PORT=5433` in `labeler.env`, repeat database setup and enter that port in CS Demo Manager. Keep the generated password with the local installation. Changing the environment value after database initialisation requires changing the PostgreSQL role's password too.

## Parser and footage correction — 20 November 2026

This correction removes restart rows from played rounds, includes the supporting
events in aggregate good-play clips, and checks actual video-stream coverage and
decoded frames before accepting new footage. The Windows recorder, capture method,
launcher and CS2/HLAE configuration are unchanged.

For an existing installation, back up the workspace first. Old reviews remain
historical records; do not treat old clips as having the corrected context.
Prepare the selected player again after rebuilding. If the app reports
"New parser output differs from reviewed telemetry", use a separate empty
workspace: set a new `LABELER_PROJECT`, for example `round-labeler-fixed`, in
`labeler.env` before starting. Use a different `LABELER_PORT` when running both
instances. Import the demo there and prepare fresh batches. Keep the previous
project and its volumes to retain its reviews; restoring the old cache into the
new workspace does not migrate its round numbers.

Parsing success does not establish game-playback compatibility. Before sending a
large queue, play the intended demo and record a short clip in CS Demo Manager on
the recipient's PC. A CS2 "demo incompatible with this game version" message
requires a compatible game build for that demo. Follow CS Demo Manager's
[playback compatibility guide](https://cs-demo-manager.com/docs/guides/playback).
The reported `AfxHookSource2/ViewModel.cpp:75` warning is a separate HLAE/game-hook
compatibility issue; these application fixes do not repair that external hook.
The current combination has not been certified for unattended recording after
the recent game update. Check the selected POV, event timing and context in the
first result before continuing.

Verification for this correction is recorded in the kit's
`docs/coach/LABELLER-HANDOFF-2026-11-20.md`.

## Label your first demo

1. Enter a unique labeller handle, such as `alex`. Use that handle consistently on this PC.
2. Import an Ancient or Anubis `.dem` or `.dem.zst` file.
3. Select the player, keep **Automatically record detected moments** enabled, and press **Prepare player**.
4. Leave Steam signed in and Windows awake while recordings run. The launcher uses sessions of up to eight clips so results arrive in smaller groups.
5. Open a ready clip and complete **Footage check**. Check the player, event timing and enough context. If the POV is wrong, the event is off, or the clip is unusable, choose that issue and describe it. The issue is exported for repair and excluded from training examples.
6. Answer **Was this moment worth selecting for coaching?** A correct factual signal can still be an unhelpful moment. Explain what should change in **What did you notice?**; Polish or English notes are supported. Set the matching note language.
7. In **Optional review details**, judge each detector signal separately and then the player's decision. A factual detection does not prove a mistake. Choose **Unsure** when visibility, communication or context is missing.
8. Press **Save note and next clip**. Drafts autosave; a completed save preserves the source player, round, detector version and all signal IDs. Use **Review full round** to record important moments that the detector missed; candidate-exposed reviews are marked accordingly.

### What is being evaluated

This labeller proposes moments with the deterministic `local-v1.1` detectors.
It does not run a language model to select clips. The exported feedback can improve
the detectors and subsequent model selection separately; it is not a model-quality score.

| Signal | What to check | What it cannot establish alone |
|---|---|---|
| Nearby trade | Selected player alive and within 5 m at teammate death; correct killer and outcome in the following 5 s | Whether a safe, visible trade opportunity existed |
| Rifle movement | At least two moving rifle shots, at least half of the burst, linked to actual combat; check weapon and timing | That moving caused a miss or was a bad decision; pistols/SMGs are not automatic mistakes |
| Unused utility | Grenades in inventory at death | That the player had a safe earlier chance to use them |
| Team/self flash | Actual friendly blind longer than the configured threshold | Intention, comms or whether enemy blindness justified the flash |
| Opening duel | Correct first kill/death and player | Whether taking the duel was strategically right |
| Good-play candidates | Actual kills, trade or other stated event | That the outcome proves good aim, movement or positioning |

All six enabled detector families produce candidates for human judgement. More
speculative visibility/rotation/economy detectors remain outside this delivery profile.
An empty set of clips is a valid result, not proof that the round had no useful lesson.

For subsequent sessions, open **Open labeller.cmd**, choose **1**, then **2** when you want new recordings. Completed clips remain available for review. The **Stop labeller** action stops the browser service. The background recorder waits for it to return. Pause the recording queue in the browser and allow the current session to finish before shutting down Windows.

## Send your notes back

Choose **6 — Export my notes**, enter an output file such as `C:\Users\Alex\Desktop\alex-notes.json`, then enter your handle. Send that JSON file to the project owner through your usual file-sharing method. It includes your latest clip and round reviews, source identity, evidence and dataset permissions. Draft revisions are included so corrections can withdraw a previously completed example.

On the owner's PC, choose **7 — Import notes** and select that file. Repeated imports are safe. Newer source revisions replace the earlier imported revision in the current view. Independent local edits under the same handle produce a conflict for review, and an import commits as one transaction. Keep each handle associated with one person's working copy.

Imported notes can become Qwen examples immediately when the source is permitted and assigned to the training split. Current-match evidence still supplies the facts for each coaching answer. Source media can be imported separately to enable playback on the receiving PC. The JSON contains source-player identifiers and free text, so share it with the intended project collaborators.

Agree source-match identities and train/validation/test allocations before sharing. Existing local source permissions remain authoritative, and an incoming permission revocation disables examples for that source. To enable an unassigned imported source later, import its demo and update its dataset settings in the browser. Details of the existing Studio connection are in [the labeller guide](LABEL-TOOL.md#use-saved-notes-in-qwen).

## Back up or move your labeller workspace

Choose **8 — Back up workspace** and give a new `.zip` destination. The launcher briefly stops the service, saves the annotation database, revision history, source demos, parsed data and MP4 footage, then restores its previous running state. The archive contains file checksums and is private project data.

To recover on a fresh installation, choose **9 — Restore workspace** before the first start. Restoration requires an empty data volume and validates all files and database integrity before activation. If you already started a fresh instance, use a new `LABELER_PROJECT`, such as `round-labeler-recovered`, in `labeler.env`, then restore and start. Keep a different `LABELER_PORT` for each concurrently running instance.

The PostgreSQL database uses its own persistent `csdm-db` volume. CS Demo Manager manages its schema, analysed-match cache and database exports. The labeller ZIP backup covers the labeller's `/data` volume. Preserve CS Demo Manager settings and any database exports separately when moving custom CS:DM data. Recording can analyse the source demos into a fresh CS:DM database.

## What runs where

| Component | Location | Purpose |
|---|---|---|
| Browser labeller | `http://127.0.0.1:8765` | Import, review, notes, queue |
| Labeller container | Docker Linux engine | Parser, detectors, SQLite, MP4 storage, local dictation |
| PostgreSQL 17 | Docker, recording profile | CS Demo Manager database, normally `127.0.0.1:5432` |
| Recorder | Windows background process | Claims jobs, runs CS:DM/CS2, uploads MP4s |
| Steam, CS2, CS Demo Manager, HLAE | Windows desktop | Game playback and capture |

Both published ports are bound to this PC's loopback interface. Each collaborator runs their own installation and exchanges note files. Keep Docker named volumes when updating or stopping the stack. `docker compose down --volumes` removes stored work.

## Commands for operators

```powershell
# Menu, or start directly
.\labeler.ps1
.\labeler.ps1 start
.\labeler.ps1 database
.\labeler.ps1 record
.\labeler.ps1 status

# Exchange notes
.\labeler.ps1 export-notes -File C:\Transfers\alex.json -Labeller alex
.\labeler.ps1 import-notes -File C:\Transfers\alex.json

# Preserve or recover work
.\labeler.ps1 backup -File C:\Transfers\labeller-backup.zip
.\labeler.ps1 restore -File C:\Transfers\labeller-backup.zip

# Export recorded clips for the web labeller (menu W lists batches by map, demo and player)
.\labeler.ps1 export-clips -File "C:\Transfers\web export" -Batch 9ca7f8919b9f0c6523e0fc12a0d1dc15
```

**Export clips for web** (menu **W**, or `bash labeler.sh` option W / `list-clips` and `export-clips --file DIR --batch ID`) writes `manifest.json` (format `round-reviewer-clips-v1`) and `clips/<footageId>.mp4` to a folder you choose. Each MP4 is revalidated with ffprobe and copied while its SHA-256 is recomputed against the hash recorded when it arrived; clips recorded without a detector finding are skipped. A retry into the same folder reuses verified files. The workspace volume is read in a one-off container and only the destination folder is mounted. After updating this folder, choose **5 Update labeller** once so the image includes the exporter. Upload the folder in the hosted labeller's admin panel; see [LABELLER-CLOUD.md](LABELLER-CLOUD.md).

The double-click launcher supplies a process-scoped PowerShell execution-policy setting. It leaves machine-wide policy intact. On macOS/Linux use `bash labeler.sh` for the menu and file transfers. The supported automated game-recording launcher is Windows. macOS/Linux labelling has equivalent container code, with host-specific verification still required.

For explicit paths, `labeler.ps1 record` accepts `-PythonPath`, `-CsdmPath` and `-FfmpegPath`. Diagnostics are in `.local/portable-recorder.stdout.log` and `.local/portable-recorder.stderr.log`. The worker retains source capture files in `.local/label-recordings` for diagnosis.

## Configuration and image size

`labeler.env.example` documents the settings. Copy it to `labeler.env` when using a source kit. The prebuilt kit already includes a clean configuration. Environment variables override file values. Keep `LABELER_PROJECT` stable to retain the same named volumes across folder moves and updates.

The default `runtime` image includes English/Polish CPU dictation. A smaller `core` target supports typed notes, parsing, recording queues, playback and transfers. To build that variant from source, set `LABELER_BUILD_TARGET=core` and `LABELER_IMAGE=round-labeler-core`, then choose **Update labeller from this folder**. Use a source kit for changing image variants. The prebuilt kit verifies its supplied image identity on startup.

Dependency layers are cached independently of application files. One parser runs at a time, with bounded worker memory, two container CPUs and capped Docker logs. The recorder merges overlapping windows and reuses encoded clips where possible. Keep the default limits for the first demo, then adjust `LABELER_WORKER_MB` or `LABELER_PARSE_TIMEOUT` in `labeler.env` if an observed resource failure requires it.

The images built on 17 November measured 2.99 GB for `runtime` and 1.53 GB for `core` in Docker's image metadata, a reduction of about 49%. The full prebuilt ZIP, including PostgreSQL, is approximately 1.10 GB. These figures describe image storage, with additional space needed for your working data.

## Verification on 17 November 2026

- The final Docker suite passed 74 tests, covering annotation, video, recording queues, dictation and transfers.
- PowerShell 5 and Bash launcher regression checks passed, including paths with spaces, failed-backup recovery, image checksums and repeat database setup.
- An extracted source kit started on fresh Docker volumes. PostgreSQL accepted an authenticated query and retained its test row after restart.
- A completed synthetic clip note transferred into a clean instance, survived a repeated import, and appeared through the coach-example endpoint for a different demo identity.
- A stopped-service backup restored into another empty Docker volume. The restored note was retrievable and the restored MP4 passed FFprobe.
- The bundled-image installation loaded both images from the archive and started on a fresh volume. Local dictation dependencies were available and an isolated Windows recorder connected.
- The existing local installation was updated and its recorder reconnected. It retained five demos, 101 ready clips, 32 queued clips in paused batches and ten clip-label revisions.

These checks used Windows Docker Desktop on the development PC. A second physical PC still needs its first real CS2 capture and a manual check of the selected POV and event alignment after installation. CS Demo Manager 3.21.0 was installed on the checked host.

## Run from a GitHub checkout

Clone the complete repository, open its root folder and run **Open labeller.cmd**.
The same first-install instructions above apply: Docker Desktop with Linux
containers runs the parser and labeller; Windows Python 3.11+, Steam/CS2 and
configured CS Demo Manager, PostgreSQL, HLAE and FFmpeg provide recording.
Git alone does not install those desktop recording dependencies. The first source
build needs internet access for the pinned dependencies and local voice model.

For a later source update, pause queued recordings and let the active session
finish. Close the recorder (or restart Windows), pull the changes, then rebuild:

```powershell
git pull --ff-only
.\labeler.ps1 update
.\labeler.ps1 record
```

An already running Python recorder keeps its loaded code until restarted. Keep
the Docker volumes and `labeler.env`; they contain the installation's saved work
and local configuration. A plain `git pull` does not rebuild the running container.

Before the owner commits a release, run `python tools/package_labeler.py --check-git`.
It lists required source-kit files that are still untracked. Include those files
in the eventual commit, together with the web labeller changes and
`.github/workflows/labeler.yml`. The check does not stage, commit or push anything.
On GitHub the workflow tests an extracted source kit in Linux, the recorder and
launcher in Windows, and the web contracts against disposable PostgreSQL.
Actual CS2 rendering still requires a Windows capture smoke check.

## One player and one clip per play

Choose the exact roster player after importing each demo. Analysis runs detectors
only for that player; other players supply event context. Each recording session
contains one demo and one selected Steam ID. The recorder verifies that Steam ID
in CS Demo Manager's analysed roster and reapplies the camera before every window.
If the roster cannot be verified, recording fails instead of choosing another player.

Overlapping requested contexts in the same round now become one review clip.
For example, four signals around one death produce one MP4 containing all four
findings and one note. Write several observations on separate lines in that note.
Each signal has its own optional detection verdict. Selection usefulness and the
player's decision are separate fields. Older shared ratings remain historical and
are never expanded into invented individual ratings. Exports retain all finding IDs,
evidence, footage issues and the selected player's identity.

Separate rounds and non-overlapping plays remain separate. A chain of overlaps
is kept together even when longer than 60 seconds, so a boundary does not repeat
the same action in two clips. Existing individual clips and notes are
retained. Prepare/record the moments again to create the new grouped batch;
unstarted work in its previous batch is paused.

Supported demo scope remains CS2 Ancient and Anubis. A valid new demo should work
without editing code, but malformed files, missing telemetry and later game/parser
changes cannot be guaranteed by a finite regression suite. Failed imports or
unresolved recording players must remain visible failures. Confirm the POV and
timing in a real clip on each newly configured recording PC.

To repeat the parser smoke check with a specific new demo, start a separate empty
labeller instance and run the script with its URL and the exact roster name or
Steam ID. It writes a clearly marked technical draft, never a completed training label:

```powershell
python tools/check_labeler.py "C:\Demos\match.dem.zst" --player 76561198176358539 --url http://127.0.0.1:18765
```

The script requires `httpx` (included in the development API environment). A
missing or ambiguous player is an error; it never substitutes the first name.

## Verification on 18 November 2026

- An extracted source-only kit built successfully and passed **107 Linux tests**
  plus three subtests. Its one skipped test is Windows process ownership; that
  test passed on Windows. Native follow-up checks passed 26 tests plus three subtests.
- All **28 web labeller tests** passed against disposable PostgreSQL 17. Type
  checking and the production web build passed. PowerShell and Bash launcher
  checks and JavaScript review/navigation checks passed.
- Fresh uploads into an empty labeller analysed the explicitly selected zock9
  on `borracheiros-vs-red-canids-academy-m2-ancient` (21 rounds, 23 findings →
  15 clips) and pawcio_ on Anubis (24 rounds, 46 findings → 26 clips).
- The real Windows recorder captured and uploaded three Ancient groups and one
  Anubis group with zero failures. The Ancient session took 63.8 seconds and
  Anubis 33.4 seconds on this PC. Sampled frames matched the selected player's
  parsed weapon, health and balance. The browser showed two findings in one
  zock9 clip with one note field.
- The running local labeller was rebuilt and its recorder reconnected. The five
  existing demos remained unchanged. Test captures and technical drafts used a
  separate workspace, with no completed training labels created.

This verifies the tested demos and installation on this Windows PC. Hosted GitHub
Actions and a second physical PC have not been run in this change. The source
release check currently identifies required untracked files; include them in the
eventual commit before sharing a GitHub revision.

## Build a distributable kit

From a development checkout, build and test the image before packaging it. The package tool creates a source-only ZIP by default. With `--image`, it also includes that image and PostgreSQL 17, plus SHA-256 and image identity metadata for the launcher. The images are transported with Docker's save/load format. [Docker image archives](https://docs.docker.com/reference/cli/docker/image/save/)

```powershell
docker build -f docker/Dockerfile.labeler --target test -t round-labeler-tests .
docker run --rm round-labeler-tests
docker build -f docker/Dockerfile.labeler --target runtime -t round-labeler:portable .
docker pull postgres:17
python tools/package_labeler.py --image round-labeler:portable --output .local/releases/round-labeler-portable.zip
```

The package tool selects application source files and clean configuration explicitly. Personal demos and notes travel through the separate transfer or backup actions.
