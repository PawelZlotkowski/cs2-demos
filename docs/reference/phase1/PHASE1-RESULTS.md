# Phase 1 implementation and validation

Implemented 13 October 2026 in the current working tree. This supersedes the original audit's behavior descriptions; `APP-REVIEW.md`, `VALIDATION.md` and `reproduce_findings.py` remain historical records of the original snapshot. No commits or deployment were made.

## Changes

| Boundary | Result |
| --- | --- |
| Personal access | Default mode checks the actual loopback peer, Host and browser Origin. Forwarded headers do not grant access. Local Docker trusts only the explicit compose network/hostname and publishes on loopback. |
| Private testing access | Authenticated mode requires distinct per-owner tokens of at least 32 characters. Match, replay, clip, retry, player and Ask paths share ownership checks. `/access` creates an HTTPS Secure/HttpOnly/SameSite Strict session cookie; browser fetch/upload/media can use it without storing a bearer token in localStorage. The bundled sample is shared and analysis mutation rejects it. |
| MCP | Standalone HTTP accepts only loopback bind addresses/localhost and is disabled in authenticated mode until scoped MCP authentication exists. Stdio remains a trusted local-operator interface. |
| Upload admission | Counts actual multipart bytes before spooling, caps concurrent ingress, streams accepted files to generated paths, rejects empty/oversized files, reserves disk for source/work/replay, and removes rejected files/records/reservations. Queue overload returns a retryable response. |
| Native parsing | Parsing and normalization run in an owned subprocess with a wall deadline, aggregate RSS monitoring, bounded diagnostic output and bounded JSON IPC. Timeout/RSS failure kills the worker and its known descendants. No pickle IPC. Plain demo copying streams; zstd history/output are bounded. |
| Work queues | CPU analysis/parsing and serial recording have active-plus-queued admission caps. Concurrent player selections atomically claim one analysis stage. Recorder admission failure releases in-memory claims and leaves durable jobs available for retry. |
| Persistence | Uploads, owners, source paths, errors and stage state survive restart in SQLite. Interrupted parsing resumes from the source; interrupted downstream work returns to player selection rather than appearing complete. JSON publication is atomic. Metadata snapshots do not expose live nested state or copy every replay. Replay reads reject Windows path traversal. |
| Numerical replay | Score follows initial lineups through side switches, halftime and overtime rather than treating current CT/T as permanent teams. Unknown round outcomes stay unknown. Studio uses the selected player's win/loss results when available and labels the initial-lineup score otherwise. HP/life state remain discrete; kill events place deaths at their exact event time, including reverse seek. |
| Model use | Numerical moment selection remains enabled by `RR_LLM_ENABLED`; one repair and ranker fallback remain. Jobs have shared inference admission, wall/time/token/tool/output budgets and real-round window checks. Sync selection returns promptly after an inference deadline rather than waiting for executor shutdown. |
| Coaching truth | Free-form explanations/Ask/review require `RR_COACH_FREEFORM_ENABLED=true`; templates are the default. Old cached generated explanations are rebuilt when opt-in is off. Citation validation is explicitly limited; generated text is not labeled factually verified. One narrow contradictory duel-outcome case is rejected, but there is no general semantic verifier. History queries exclude other owners' matches even for the same SteamID. |
| Recording | Numerical/model selection still feeds the external Windows CS Demo Manager/HLAE path. Each attempt uses a fresh directory, accepts exactly one new MP4, validates its video stream/duration/FPS/dimensions through ffprobe and publishes atomically. No stale-directory/newest-file fallback. Clip windows/ticks stay within the round. Synthetic stubs are skipped without playable URLs. Legacy ready media without capture provenance is invalidated with a re-record message. |
| Dependencies/runtime | Next and matching lint packages are patched in both apps; runtime/dev Python dependencies have universal hash-checked locks. Containers use non-root users, web runtime dependencies exclude development tooling, compose database passwords come from configuration rather than a default credential. |

## Default limits

Defaults are configurable via `RR_` environment variables. The reservations are deliberately conservative: existing files plus worst-case outstanding work may reject an upload earlier than its compressed size would suggest.

| Setting | Default |
| --- | --- |
| `RR_MAX_UPLOAD_BYTES` | 300 MiB |
| `RR_MAX_MULTIPART_OVERHEAD_BYTES` | 64 KiB |
| `RR_MAX_CONCURRENT_UPLOADS` | 2 |
| `RR_MAX_DECOMPRESS_BYTES` | 2 GiB |
| `RR_PARSER_MEMORY_BYTES` | 4 GiB aggregate RSS |
| `RR_PARSE_TIMEOUT_SECONDS` | 120 seconds |
| `RR_MAX_REPLAY_BYTES` | 256 MiB worker JSON |
| `RR_MAX_PENDING_JOBS` | 8 active/queued per executor |
| `RR_MAX_STORAGE_BYTES` | 20 GiB local demo/work/replay quota |
| `RR_MIN_FREE_DISK_BYTES` | 2 GiB reserve |
| `RR_COACH_MAX_CONCURRENCY` | 1 model job |
| `RR_COACH_JOB_TIMEOUT_SECONDS` | 120 seconds |
| `RR_COACH_MAX_OUTPUT_TOKENS` | 4,096 across attempts |
| `RR_COACH_MAX_TOOL_CALLS` | 12 across attempts |
| `RR_COACH_MAX_TOOL_BYTES` | 256 KiB across attempts |
| `RR_FFPROBE_TIMEOUT_SECONDS` | 15 seconds |
| `RR_CLIP_DURATION_TOLERANCE_SECONDS` | 1 second |

## Local setup and preserved workflow

Use one API process for Phase 1; queue admission and recording ownership are process-local. The API locks are the reproducible dependency source. The isolated root `.venv` created for validation is ignored and available for local testing; runtime/test artifacts are under ignored `qa-out/`.

From the repository root in PowerShell:

```powershell
.venv/Scripts/python.exe -m pip install --require-hashes -r apps/api/requirements-dev.lock
.venv/Scripts/python.exe -m pip install --no-deps -e apps/api
Set-Location apps/api
# Set these only when the existing local model/recorder setup is available:
$env:RR_LLM_ENABLED = 'true'
$env:RR_CSDM_ENABLED = 'true'
$env:RR_CSDM_MODE = 'csdm'
# RR_CSDM_BIN and RR_FFPROBE_BIN may be absolute installed executable paths.
../../.venv/Scripts/python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```

Keep `RR_COACH_FREEFORM_ENABLED` unset for template explanations; this does not disable model moment selection. The configured model/server name remains your existing configuration. The recorder still requires the actual Windows CS:DM/Steam/CS2/HLAE/FFmpeg setup. A successful mocked clip test does not validate that setup. See `docker/README.md` for the local compose alternative; its API container disables the Windows recording path.

For token-based private testing, configure `RR_ACCESS_MODE=authenticated` and `RR_API_TOKENS` as a JSON map from owner ID to a securely generated token. Configure the exact HTTPS frontend Origin and use same-site web/API domains or a same-origin proxy; Secure cookies intentionally do not provide an insecure HTTP hosted-login mode. Use `/access` to establish the session. Never put real token values in committed examples. These tokens are a bridge for invited testing, not a public account-management system.

## Validation

Final API integration suite: **271 passed, 4 skipped in 177.47 seconds**. Focused regressions also prove: remote/XFF denial; Host/Origin denial; token/session ownership; chunked and concurrent ingress limits; queue/quota cleanup; interrupted upload/legacy-stage recovery; atomic analysis claims; native timeout/RSS/descendant termination; scoped history and cached-prose policy; round-bounded clips; legacy-media denial; fresh capture/validation/publication; queue saturation; score perspective and event timing. After actual round-duration limits were added to the candidate prompt, the selection/job suite passed again: **19 passed in 35.41 seconds**.

Commands use a separate data path so validation does not consume real demos:

```powershell
# From apps/api
$env:RR_DATA_DIR = Join-Path (Resolve-Path ../..).Path 'qa-out/phase1-final-data'
../../.venv/Scripts/python.exe -m pytest --basetemp=../../qa-out/pytest-phase1-final -q
# From apps/mcp
../../.venv/Scripts/python.exe -m pytest -q tests/test_access.py
# From apps/web, with Node on PATH
node scripts/run-replay-checks.cjs
npm run typecheck
npm run lint
npm run build
```

Web replay assertions, typecheck, lint and production build passed. Tracker typecheck/build passed; lint has one existing external-font warning. MCP entrypoint access tests passed (18). Docker compose configuration validation passed with a temporary process-environment password; no Docker image build was run. Production npm audit found zero known vulnerabilities for the patched lockfile. The complete npm audit retains five high development-only `braces` findings with no available patched release; this is not an all-dependencies-clean claim. See `PYTHON-DEPENDENCY-AUDIT.md` for the separate Python advisory check.

## Remaining limits and next work

- No real `.dem`, live model selection, actual CS2/HLAE capture, real ffprobe output or calibrated 3D asset was exercised. Those end-to-end checks are required before treating Phase 1 as operationally proven.
- Parser RSS polling and subprocess termination are resource containment, not an OS security sandbox against a native-parser compromise. Public untrusted uploads need a separate restricted worker/container or VM, OS-enforced resource limits and failure/load testing.
- Owned parser descendants are stopped. The recorder still uses a direct subprocess timeout and can attach to existing CS2/Steam sessions; safe owned Windows job/session cancellation remains Phase 4. Arbitrary Steam/CS2 processes are not killed.
- Canceling a sync model request lets the app fall back promptly, but an already-running thread/server request can finish in the background. Provider-side cancellation, inference-server admission and durable cross-process leases remain follow-up work.
- Quotas are global and queues/locks are per process. Proper per-user fairness, retention/deletion, full accounts, durable job leases, signed/private cloud artifacts, backups and multi-worker behavior remain public-beta gates.
- Existing output that lacks capture provenance requires re-recording; it is intentionally not upgraded by a successful media probe. Timing validation verifies media plausibility, not correct player POV or exact event alignment.
- Three.js is researched and planned, not implemented in this phase. It can produce a tactical reconstruction from telemetry; current data/assets do not reproduce CS2 POV lighting, smoke, animation, sound or visibility. Preserve the Windows video route for game-faithful clips.

The next work is split into lower-cost, narrowly owned tasks with prompts and acceptance criteria in `AGENTIC-IMPLEMENTATION-PLAN.md`. The detailed primary-source renderer research is `THREEJS-RESEARCH.md`. Existing pre-task deletions of root documentation, `docs/` and `.cursor/` were left untouched. No context or memory feature was added.
