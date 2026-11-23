# Round Reviewer — full project audit, 22 November 2026

Written for Paweł before the internal presentation on **Wednesday 25 November** and the final submission on **6 December**. It compares the submitted proposal with the repository today, audits the software and the AI work, and answers one question: continue, or start again?

Everything below was checked against the code, the git history and fresh test runs on 22 November. Older status documents are cited only for results that could not be rerun today, such as GPU model runs and recorded clips.

**Update, later on 22 November:**

- **Fixed and checked:** findings 1 (the Studio upload), 7 (tests reading `.env`), 8 (the playback jump) and 16 (template grammar). A live run with Qwen3-14B on the RTX 5080 also worked end to end.
- **Next steps:** what to do on Wednesday is in the [run sheet](planning/WEDNESDAY-RUN-SHEET-2026-11-25.md), and the dated plan to 6 December is in the [improvement plan](planning/IMPROVEMENT-PLAN-2026-11-22.md).
- **Codex work:** the PC survey found exactly one commit not yet in this folder, `d46f91b` on `codex/labeller-recording` (the round-pairing fix). It is task I1 in the improvement plan.

## 1 The answer first

**Continue. Do not start again.**

- **The product half of the proposal is largely built and it runs.** It covers upload, parsing, choosing a player, 2D radar replay, ten detectors, findings with IDs, round stats and a ranker. The agent reaches its tools through your own MCP server, a verifier with repair and template fallback checks its answers, keyword retrieval feeds it map notes, and the Ask tab works. POV clips are recorded through CS Demo Manager, and a labelling tool exists. 460 automated tests pass.
- **The research half is mostly missing, and it is what the course grades as AI engineering.** The repository has no human labels, no evaluation runner, no question set, no moment picks, no retrieval evaluation, no fine-tuning run and no user study.
- **Starting again would rebuild the half that works and would not touch the half that is missing.** Fourteen days remain before the deadline, so a restart would end with less than you have now.
- **The problem is focus, not code.** Since the proposal the project has grown accounts, an admin panel, a Lab, two labelling tools, a hosted labeller, cloud plans, several design directions and about 95 planning documents (11,700 lines). Meanwhile the evaluation that answers the research question has not started.

**What to do:**

1. Before Wednesday: back up the uncommitted work, make the small fixes in section 7 (about an hour), and rehearse the offline demo.
2. On Wednesday: show the working pipeline honestly and ask the teachers to approve a smaller evaluation.
3. After Wednesday: freeze features. Spend every remaining hour producing evidence (labels, one evaluation command, a baseline-versus-model table, a grounding audit) in the order given in section 6.

## 2 Where it started and where it is now

| When | What happened (from git and the plans) |
|---|---|
| 26 Sep | First commit: the Demo Replay MVP (upload → demoparser2 → radar), 163 files and 32,000 lines. The AI Coach plan and task board were written the same day. |
| 26–27 Sep | **102 commits in two days**, 75 of them authored by Claude agents. They built detectors D1–D10, findings, the player picker, tools, the `cs2-demo` MCP server, the LLM client, the agent loop, the verifier, the templates, RAG v1, Ask over SSE, accounts, roles, the admin panel, the Lab, and light and dark themes. |
| 27 Sep | First RTX 5080 pilot on 2 matches (Mirage and Anubis; EN/PL/NL). The checker passed Qwen3-14B on 66 of 72 explanations and Gemma 4 12B on 71 of 72. Moment selection took 24–38 s with Qwen and 108–131 s with Gemma. |
| Oct | Work moved between four folders (`cs2-demos`, `cs2-demos-accounts`, `cs2-demos-phase1-source`, this one). On 19–20 Oct a 37-task delivery plan (RR01–RR37) was written and the folders were consolidated here. A hardened "Phase 1" fork was kept only as five unapplied patch files in `integration/phase1/`. |
| 25 Oct | Scope changed to **Ancient and Anubis** and to **English and Polish**. Local V1 added choosing the player, focus and language *before* the full parse. |
| 15–16 Nov | 7 commits brought the October work in. The Porcelain design was chosen. |
| 16–22 Nov | Nothing committed. Uncommitted work: detection-quality fixes, the labeller and its hosted variant (Vercel, Supabase, R2), the Porcelain UI, a corpus audit (148 demo files in 146 match groups, split by match with no leakage) and 85 recorded clips. In total **121 changed files (+5,981/−3,411 lines) and 122 new files (about 13,000 lines)**. |

**No milestone in the delivery plan was met on its date.** The cloud API (24 Oct), the labelled pilot (6 Nov), the defence build (13 Nov), the first defence (17 Nov), the QLoRA pilot (20 Nov) and the user study (24 Nov) are all still open. The plan was too large for two people. It also made a cloud deployment for invited users a P0 requirement, although the proposal never asked for one (the proposal says "Everything is started with Docker Compose").

**Rough judgement:** the product side is about 75–80% of what the proposal describes, and in places goes beyond it. The evaluation and fine-tuning side is about 10–15%, and has not moved since the September pilot.

## 3 Proposal against the repository

Status words: **Done** = in the code and covered by tests. **Mock only** = works with the scripted test model and was tried on the GPU once or twice. **Partial** = some of it exists. **Missing** = no code or results.

### What the product does (proposal section 2)

| Promise | Status | Notes |
|---|---|---|
| Upload `.dem` / `.dem.zst` | Done, with a bug | Direct-to-API upload works. Through the Studio, any demo over 10 MB fails today (section 4, finding 1). |
| Parse with demoparser2 | Done | 100 of the 102 training demos parse. Two first fragments have no selectable players. |
| Pick a player; radar while the rest runs | Done, improved | The player, focus and language are now chosen before the full parse. |
| Detectors → findings with IDs, round stats | Done | All 10 detectors exist, with unit tests on synthetic data. The default `local-v1` profile enables 6 (untraded death, shooting while moving, unused utility, team flash, opening duel, good plays). |
| LLM picks 5–6 moments | Mock only | Selection is one JSON-schema call, not the tool loop. The default local launcher runs the deterministic ranker with no model. |
| CS Demo Manager clips from the player's view | Done on Windows | 85 grouped clips are ready and were checked by decoding every frame. The HLAE hook breaks after CS2 updates, so a native-capture fallback was added. |
| Explanations that cite findings, checked by a verifier | Done, verifier weak | It checks that citations exist, numbers, language, one repair and the template fallback. It does not check meaning (section 5). |
| Studio: clip + radar + explanation; Ask tab | Done | Checked in the browser today on a saved Anubis review. |
| English, Polish, Dutch | EN/PL | Dutch was dropped from scope, but the UI still offers it (`apps/web/src/lib/coach/language.ts:11`). |

### The AI techniques (proposal section 3)

| Technique | Status | Notes |
|---|---|---|
| Self-hosted LLM via llama.cpp, no hosted API | Done | No hosted API anywhere. The `.env` currently points at Gemma 4 12B Q6_K, while the proposal and config default name Qwen3-14B. Decide and record which one is the main model. |
| Agent with tool calling, bounded, traced | Done (mock) | At most 6 steps, malformed tool calls are handled, and 13 tools are exposed. Traces miss the seed, sampling settings, detector policy version and commit. Only 9 model-backed traces exist on disk, all Gemma from 29 Sep. |
| Own MCP server `cs2-demo` | Done | It is the default path, not decoration. A test checks MCP and in-process give the same results, and there are stdio and HTTP transports with a token gate. Match and player IDs are pinned by the client, not by the server. |
| RAG, hybrid BM25 + bge-m3 + RRF | Partial | BM25 (SQLite FTS5) works. Dense search is written but off, because `RR_EMBED_URL` is set nowhere. The corpus has 158 passages: Mirage 66, Anubis 50, general 42, **Ancient 0**. |
| Player history in retrieval | Done | `get_player_history`. |
| QLoRA fine-tuning | Missing | There is a dataset exporter and nothing else: no training script, config, adapter or loss curve. |
| Verifier, repair, template fallback | Done | See section 5 for what it cannot catch. |

### Data and evaluation (proposal sections 4 and 6)

| Promise | Status | Notes |
|---|---|---|
| About 100 matches, split by match | **Done, strong** | 148 files in 146 match groups: 100 train, 26 validation, 20 test. Sealed, with no leakage found. |
| Callout zones per map | Partial | Anubis and Mirage only. **Ancient has no zones**, so its findings have no callout names. |
| Map notes, ~130 sections | Partial | 158 passages, but none for Ancient. |
| 150 labelled rounds, Cohen's kappa on 30 | Missing | 0 labels in `data/labels/`. The local labeller database holds 7 round reviews and 10 clip labels. The kappa and precision/recall tooling exists (`eval/label_tool.py`). |
| Both students' top-6 picks for 20 matches | Missing | The scoring tool exists, but its NDCG ranks by time (section 5). |
| 150 test questions with expected tools | Missing | `eval/compare_models.py` asks 3 fixed questions per language. |
| Retrieval Hit@k / MRR | Missing | — |
| Blind 1–5 ratings | Partial | The Lab does blind pairwise A/B, on model outputs only. |
| Template baseline as a results row | Missing | Templates exist as the fallback but were never evaluated as a system. |
| Main table (baseline / base / fine-tuned / bigger) | Partial | Only the September Qwen vs Gemma pilot. `eval/results/` does not exist, so it cannot be reproduced. |
| One command reproduces every table | Missing | `eval/run.py`, named in the project's own `rr-eval` skill, does not exist. |
| User study, 5–10 players | Missing | — |
| Unit tests and CI with a mock model | Partial | The tests use a mock model and need no GPU. CI exists only for the labeller, is untracked, and has never run. |

## 4 Software engineering audit

**What this repo does:** players upload a Counter-Strike 2 demo to a FastAPI backend, which parses it, runs rule-based detectors for one chosen player and stores findings. A Next.js Studio shows a 2D radar replay, recorded clips and coach text. A local LLM, reached through an MCP tool server, picks moments and writes explanations, which a code verifier checks. **Load assumed:** one person locally today; by 6 December, two students and 5–10 invited players, each uploading 100–300 MB demos.

**Test and build results (run today):**

| Check | Result |
|---|---|
| API tests (`apps/api/tests`) | 346 passed, 3 skipped. The first run showed 49 failures, all caused by the developer `.env` (finding 3). |
| Labelling tool tests (`eval/tests`) | 114 passed |
| AI-side subset (agent, verifier, MCP, RAG) | 60 passed |
| Web typecheck / production build | Pass / pass (Studio route 172 kB first load) |
| Lint | Passes, but checks nothing (finding 9) |
| Live Studio smoke on a copy of the saved reviews | Matches page, Studio radar and coach panel work. An upload through the Studio fails (finding 1). |

Code size: about 17,600 lines of Python in `apps/api/app` and 4,700 in its tests (41 files). The web app has 17,100 lines of TypeScript and 6,100 of CSS. The API has 132 routes, and the separate labelling server has 43 more. The biggest single file is the Studio page, at 2,003 lines.

Findings 1, 3, 7 and 8 were reproduced or checked against the code myself. The rest come from the read-only reviews and were checked against the cited lines. "Hosted" means the shared cloud deployment the plan describes. Several findings only matter there, which is one more reason to cut it (section 6).

### Must fix

1. **Uploading a demo through the Studio fails** (`apps/web/src/middleware.ts:31-33`)
   - **What this is:** new, uncommitted middleware that routes between Studio mode and labeller mode. It matches every path.
   - **Problem:** when middleware runs, Next 15.5 copies the request body and keeps only the first 10 MB. The upload route then forwards a cut-off demo. Reproduced today: a 118 MB demo through the Studio returned "502 The API is not reachable", while the same file sent straight to the API returned 200. The web log shows Next's "Request body exceeded 10MB" warning.
   - **Fix:** add `api/matches/upload` to the matcher's negative lookahead. One line.
   - **If we skip it:** every new upload fails, including the "upload the same file again" step in the teacher plan.

2. **Six days of work exist only on one disk** (121 changed files and 122 new ones since 16 Nov)
   - **What this is:** the whole showcase build: the Porcelain UI, the detection fixes, the labeller, the middleware, the CI and the tests.
   - **Problem:** a disk fault or a stray `git checkout -- .` loses all of it. Tracked files also import untracked ones (`api/routes.py` → `coach/evidence.py`, the detectors → `analysis/trades.py`). Committing only the modified files would leave an app that fails at startup.
   - **Fix:** a local WIP commit of everything, or `git diff --binary HEAD` plus an archive of the untracked files copied off the machine. Your no-commit rule means this is your call.
   - **If we skip it:** one accident three days before the presentation.

3. **The parse timeout does not stop the parse, and parsing runs inside the API process** (`apps/api/app/processing/pipeline.py:147-152`)
   - **What this is:** demoparser2 runs in a thread with a 180 s timeout.
   - **Problem:** leaving the `with ThreadPoolExecutor` block waits for the thread to finish, so "Parsing timed out" only appears after the parse ends anyway. The roster read has no timeout at all. A demo that runs out of memory or crashes the parser takes the API down. After the restart it comes back as `ready_to_parse` and is queued again, which repeats the crash.
   - **Fix:** run the roster read and the parse in a child process with time and memory limits, the way `apps/api/app/annotation/jobs.py:130-161` already does, and record the failure in `match.json`.
   - **If we skip it:** one bad demo can block or crash the server for everyone, again and again.

4. **Hosted only: uploads are fully received before the sign-in and size checks** (`apps/api/app/api/routes.py:89-113`)
   - **What this is:** the upload endpoint takes the file as a multipart form field.
   - **Problem:** FastAPI reads the whole form into the temp folder before running the route's `guard`, and Starlette has no size cap for file parts. An anonymous client can send 50 GB, fill the disk, and only then gets a 401. The docstring's claim that the upload "stops at the size limit" is untrue.
   - **Fix:** in the existing middleware in `main.py`, reject the upload and restore paths early when there is no user or when `Content-Length` is missing or too big. Or stream the body the way `annotation/server.py:92-110` does.
   - **If we skip it:** anyone who finds the cloud URL can fill its disk.

5. **Hosted only: a player can read another player's clips and replays on Windows** (`apps/api/app/processing/video_clips.py:94-95`, `apps/api/app/repositories/matches.py:325`)
   - **What this is:** `round_id` from the URL is placed straight into a file path.
   - **Problem:** `%5C` decodes to `\`, which Windows treats as a folder separator. So `/matches/<own>/clips/..%5C..%5C<victim>%5C…mp4` escapes the owner's folder. The API must run on Windows for recording.
   - **Fix:** return 404 unless `re.fullmatch(r"r\d{1,3}", round_id)`, in both helpers.
   - **If we skip it:** invited users can see each other's footage.

### Should fix

6. **With accounts off, any website can change your local data** (`apps/api/app/main.py:57`)
   - **What this is:** the Origin check runs only when a session cookie exists. The local launcher turns accounts off and makes you admin.
   - **Problem:** any web page open in your browser can send a plain cross-site POST to `127.0.0.1:8003/admin/restore` and replace `matches.db`, the labels and the notes. The browser sends no preflight for that kind of request.
   - **Fix:** check Origin on every write request, and add `TrustedHostMiddleware` as `annotation/server.py:44` already does.
   - **If we skip it:** unlikely to hit you, but you cannot claim the local setup is safe.

7. **The test suite reads your personal `.env`** (`apps/api/app/core/config.py:11`)
   - **What this is:** `Settings` loads `apps/api/.env`, and the tests do not override it.
   - **Problem:** your `.env` turns accounts on, so 49 tests fail with 401 on your machine. They all pass with `RR_AUTH_ENABLED=false RR_LLM_ENABLED=false`. Anyone reproducing your results hits the same thing.
   - **Fix:** in `apps/api/tests/conftest.py`, set those two variables before the app is imported.
   - **If we skip it:** "our tests pass" cannot be shown live, and a reproduction from a clean clone looks broken.

8. **Playback jumps after switching away from the browser tab** (`apps/web/src/components/replay/usePlaybackClock.ts:176-192`)
   - **What this is:** the shared playback clock advances by the time since the last animation frame.
   - **Problem:** browsers pause frames in background tabs. Come back after 20 s of slides, and the round jumps 20 s ahead or to its end. The clock also lives in the 2,003-line Studio page, so the whole page re-renders every frame.
   - **Fix:** `const dt = Math.min((ts - last) / 1000, 0.1)`. One line.
   - **If we skip it:** it happens on the projector.

9. **Deleting a match while it is processing brings it back later** (`apps/api/app/api/account.py:50-55`, `apps/api/app/admin/routes.py:206`)
   - **What this is:** delete does not check the match status.
   - **Problem:** the running parse writes the files back after the delete. After a restart the match reappears, owned by the first admin. On Windows, deleting during decompression fails halfway, leaving ownership rows behind.
   - **Fix:** return 409 while the status is one of the processing states (`admin/services.py:237` already lists them).
   - **If we skip it:** deleted demos come back, which is a privacy problem in a user study.

10. **Match records live only in memory** (`apps/api/app/repositories/matches.py:164-193`; nothing reads the SQLite `matches` table)
    - **What this is:** `match.json` is written only after decompression.
    - **Problem:** a restart during an upload makes the match return 404, and its upload stays in `data/uploads` for good. Separately, every round replay of a newly parsed match stays cached in memory until restart (`matches.py:310`), about 12 MB of JSON per match and several times that as Python objects.
    - **Fix:** write `match.json` at upload time. Cache `{}` and read replays from disk, which `get_round_replay` already does as a fallback.
    - **If we skip it:** lost uploads, and memory grows with every match in a long session.

11. **Model work skips the GPU queue and shares the parse pool** (`apps/api/app/api/routes.py:319,344,354,365`; `apps/api/app/processing/pipeline.py:169,249`)
    - **What this is:** on-demand explain and Ask calls run the model directly. The selection and explanation stages use the same 2-thread pool as parsing.
    - **Problem:** one user clicking "explain" on 10 rounds starts 10 parallel model calls. Two matches in `explaining` block a third user's upload from even reading its player list.
    - **Fix:** wrap each call in the existing `gpu.slot(...)`, and give the model stages their own single-thread executor.
    - **If we skip it:** with more than one user the app stalls.

12. **The recording timeout does not fire on Windows** (`apps/api/app/processing/video_clips.py:388-405`)
    - **What this is:** `subprocess.run(..., timeout=)` around the CS Demo Manager command line.
    - **Problem:** on timeout it kills only `cmd.exe`, then waits forever on the pipe still held by csdm and CS2. A hung recording freezes the only recorder thread until someone closes CS2 by hand.
    - **Fix:** start it with `Popen` and kill the whole process tree on timeout (`taskkill /T /F`, or psutil, which the labeller already uses).
    - **If we skip it:** all later clips stay "recording".

13. **Hosted only: the first stranger to register becomes admin, and one invite can create two accounts** (`apps/api/app/auth/routes.py:74-126`, `apps/api/app/auth/store.py:415-431`)
    - **What this is:** account creation checks first and writes later.
    - **Problem:** on a fresh cloud volume, the first registration or Steam sign-in gets the admin role. Two simultaneous submits of one invite both pass `check_invite`.
    - **Fix:** require a setup code for the first account. Claim the invite with `UPDATE … WHERE used_by IS NULL` and check the row count.
    - **If we skip it:** a stranger can own your deployment.

14. **CI has never run, and lint checks nothing** (`.github/workflows/labeler.yml` is untracked; `apps/web/eslint.config.mjs` contains only `ignores`)
    - **What this is:** the only workflow tests the labeller, and it calls scripts that are also untracked. It has no `pytest` for the API and no web build.
    - **Problem:** no automated evidence for the examiners, and nothing caught finding 1.
    - **Fix:** commit it with its scripts, and add `pip install -e .[dev] && pytest` and `npm run build`. Load `next/core-web-vitals` in the ESLint config.
    - **If we skip it:** regressions reach the presentation unnoticed.

15. **The documents contradict each other**
    - **What this is:** about 95 planning documents (11,700 lines).
    - **Problem:**
      - `README.md:12,38` says design is paused, while `AGENTS.md:7` says Porcelain resumed.
      - `plan/` is an older copy of `docs/planning/`; its `FINAL-DELIVERY-PLAN.md` still lists Mirage, Anubis and Dust II.
      - `docs/university/README.md` lists Mirage, Anubis and Dust II.
      - 49 tracked documents still mention Mirage and 34 mention Dutch.
    - **Fix:** delete `plan/` (link the two unique files from `docs/planning/` if you want them). Correct the README and university README lines. Keep `FINAL-DELIVERY-PLAN.md` plus this audit as the only status sources.
    - **If we skip it:** a teacher reading the repo cannot tell what your actual scope is.

### Nice to have

16. **Template grammar on the projector** (`apps/api/app/coach/templates/findings.en.json:21`, and the other templates with counts)
    - **What this is:** finding sentences built from templates with fixed plural words.
    - **Problem:** they read "against 1 enemies, with 1 kills", seen today in the coach panel.
    - **Fix:** use separate singular and plural keys, or reword the sentence ("enemies left: 1").
    - **If we skip it:** it looks careless in front of the teachers.

17. **Every request opens one database connection per match** (`apps/api/app/auth/deps.py:122` → `apps/api/app/auth/scope.py:28`)
    - **What this is:** the ownership check behind `guard`.
    - **Problem:** it checks each match's owner separately. With 200 matches, every status poll opens 200–400 SQLite connections.
    - **Fix:** one `SELECT match_id FROM match_owners WHERE owner_id=?`.
    - **If we skip it:** slow polling once the library grows.

18. **The public repository could leak player data**
    - **What this is:** `.gitignore` and one pushed test file.
    - **Problem:** `.gitignore` covers `*.dem` but not the `demos/` folder, so a `git add -A` would publish any CSV or JSON placed there. `tools/test_record_label_clips.py:134` contains a SteamID that may be real, and it is already pushed.
    - **Fix:** add `demos/` to `.gitignore`, and replace the ID with a synthetic one.
    - **If we skip it:** the proposal promises that no player data goes into the repository.

19. **API dependencies are not pinned** (`apps/api/pyproject.toml`)
    - **What this is:** the dependency list, which has floor versions only and no lockfile.
    - **Problem:** a rebuild can pull a newer demoparser2 that changes the parse output, which breaks reproducibility. `psutil` is used by the labeller but not listed. Pydantic's floor of 2.7 is below the 2.11 the code needs.
    - **Fix:** pin exact versions (`pip freeze` into a constraints file), add `psutil`, and raise Pydantic to `>=2.11`.
    - **If we skip it:** "reproduce from a clean clone" may silently give different numbers.

20. **Dead and duplicate code**
    - **What this is:** code that nothing uses, or that exists twice.
    - **Problem:** unused: `ALLOWED_EXTENSIONS` (`core/validation.py:1`), `require_role` and `require_admin` (`auth/deps.py:140-149`), and `mock_stage_seconds` (`config.py:24`). Duplicated: `_match` (in both `account.py:33` and `roadmap.py:58`) and lines `video_clips.py:177-178`. A stale area: `apps/tracker/`, last touched 26 Sep and referenced by nothing.
    - **Fix:** delete them.
    - **If we skip it:** more code to explain to an examiner, for no gain.

Left out: 4 smaller findings (polling with no backoff, MCP over HTTP allowed on any host when accounts are off, login hashing with no limit per IP, two nullable contract fields).

**Verdict:** for Wednesday, fix 1, 2, 7, 8 and 16 (about an hour). Before anyone but you uses the app, fix 3, 6, 9 and 12. Findings 4, 5, 11 and 13 matter only if you host it, so cutting the cloud deployment removes them.

**Lean:** −3,000 lines now (`plan/`, `apps/tracker/`, dead code). Another −17,000 once the unapplied `integration/phase1/` patches are either ported or dropped. No dependencies to remove; one (`psutil`) is missing from the list.

**Strengths an examiner should see:**

- **One `guard` on every router**, backed by a route-walking ownership test.
- **Passwords:** Argon2id with constant-time handling of unknown usernames. **Secrets** are stored only as hashes.
- **Steam OpenID:** state, nonce and `check_authentication` are all checked.
- **Uploads:** streamed zstd decompression with an output cap, plus magic-byte checks on uploads.
- **Restore:** blocks zip-slip.
- **Coach data:** per-user scoping reaches all the way into the MCP tools.
- **Contracts:** Pydantic and TypeScript match across 105 models.
- **Accessibility basics** in the Studio: skip link, a real slider role on the timeline, and a labelled radar image.
- **Compose:** ports bound to loopback.

## 5 AI engineering audit

### What is genuinely strong

- **The architecture rule is enforced in code, not just written down.** Detectors produce findings with IDs. The model reaches data only through tools that never show it the match or player IDs. Every coach output ends either as verified text or as a labelled template (`apps/api/app/coach/jobs.py:646-701`).
- **MCP is real.** It is the default path, a test proves MCP and in-process calls give identical results, and the HTTP transport has a token gate (`apps/api/app/coach/backends.py:98-153`).
- **The verifier is practical and CS-aware.** It checks citations, tolerates numbers to their written precision, handles the Polish decimal comma and thousands separators, and accepts `[K..]` citations only if they were retrieved in that run. Guards were added after real failures (Cyrillic output, overclaiming technique).
- **The traces are rich**, the prompts are versioned, sampling is set per model family, and the whole suite runs without a GPU.
- **The data work is solid.** 146 match groups are split by match with a sealed test set, and 85 POV clips were checked by decoding every frame.
- **The self-reports are honest** about their limits. Keep that tone on Wednesday.

### Risks, each with a concrete failure

1. **"Passed the verifier" does not mean "grounded".** I reran this today. The verifier accepts all 8 of these unsupported claims:
   - a flipped meaning: "a teammate traded your death [F12]", where F12 is an *untraded* death;
   - a wrong zone;
   - a unit swap: 5 seconds reported as "5 m";
   - damage reported as "87 HP left";
   - numbers written as words;
   - an invented cause: "because you peeked without a flash";
   - a short Polish answer in an English job;
   - an Ask answer with no citation.

   The September 66/72 and 71/72 figures are **verifier pass rates, not accuracy**, and must be presented that way.
2. **Ask answers need no citation** (`jobs.py:521,569`), and numbers from the question count as evidence. "Did I die 5 times?" → "You died 5 times [F3]" passes.
3. **The moment "pick reason" skips the verifier.** It is only checked for containing a citation (`verify.py:381-383`), yet it is shown to the user and fed into the explanation prompt.
4. **Ancient, a delivery map, is not supported for coaching.** It has no zones and no notes. All model results so far are from Mirage and Anubis.
5. **The detectors are unmeasured.** Thresholds are hand-set and there are 0 committed labels. "Code decides what happened" is the premise of the whole project, and it has no precision number yet.
6. **Results cannot be reproduced exactly.** No seed is sent to the model. Temperature is 0.7 for Qwen and 1.0 for Gemma, runs repeat once by default, and traces do not record sampling settings or the commit.
7. **The training split can leak.** `split_of` hashes the upload ID 80/10/10 (`apps/api/app/services/dataset.py:47-50`). Re-importing a demo gives it a new ID, so the same match can end up in both train and test. The split ignores your sealed `manifest.csv`. The exporter also drops the tool schemas, so a model trained on it would see different input from what it sees at inference.
8. **NDCG@6 measures time order, not importance.** Moments are renumbered by time before scoring (`verify.py:417-418`).
9. **Prompt-injection surface.** Player names from the uploaded demo go into the prompts unsanitised. The damage is limited: IDs are bound, write tools are off for explanations, and numbers are checked. Praise or blame with no numbers in it would still pass.

## 6 What still has to be done, in order

### Stop doing (cut now)

- **Cloud HTTPS deployment for invited users.** The proposal does not require it. It is days of work, and it brings four security and load problems with it (findings 4, 5, 11 and 13). Run the user study on your machine, in person or over Tailscale.
- Hosted-labeller polish (Vercel, Supabase, R2), unless Aleksander needs to label from his own machine.
- Porcelain beyond the screens you will show; admin and Lab polish; 3D replay; RTX Pro 6000 rental; the Dutch option (hide it).
- Any new detector or feature. Freeze the detectors (`local-v1.1`), the prompts (v5) and one main model today.

### Ask the teachers to approve on Wednesday

The proposal's evaluation (150 rounds, 150 questions, 20 matches of picks, 300 fine-tuning examples, 5–10 players) does not fit in 14 days on top of everything else. Propose real, smaller denominators and report them honestly:

| Measure | Proposal | Proposed now |
|---|---|---|
| Labelled rounds | 150 (30 double-labelled) | about 60 (20 double-labelled), all on the 6 enabled detectors |
| Moment picks | 20 test matches | 10 test matches, both students |
| Test questions | 150 (50 per language) | 40 (20 EN, 20 PL) |
| Fine-tuning | QLoRA + comparison | one small QLoRA pilot if time allows, otherwise a documented descope with the dataset pipeline shown |
| User study | 5–10 players | 5 players |
| Maps | Ancient + Anubis | Anubis fully; Ancient either gets zones and about 30 notes, or is declared replay-only |

### Evidence sprint, 26 November – 6 December (ordered by value per hour)

| # | Work | Owner (proposal split) | Size |
|---|---|---|---|
| 1 | Commit or back up the work. Fix the split to use `manifest.csv`. Send a fixed seed to the model and record the seed, sampling settings, prompt and policy versions and the commit SHA in every result | Paweł | 3 h |
| 2 | **One evaluation command** (`python -m eval.run --config …`) writing CSV tables, with the **template baseline as a row**, built from the existing `compare_models.py` and `label_tool.py` | Paweł | 1 day |
| 3 | **Grounding audit by hand.** Mark each claim in about 100 verifier-passed outputs on 3–4 held-out matches as supported or not. Report the unsupported-claim rate and how often the verifier wrongly passed one. Turn the 8 probes from section 5 into tests marked as known limits | Aleksander | 1 day |
| 4 | **Labels** with the existing labeller → precision for each of the 6 enabled detectors, plus kappa on the double-labelled rounds | both | 1.5 days |
| 5 | **Main table:** template vs Qwen3-14B vs Gemma 4 12B on held-out matches, EN and PL, 3 repeats; fallback rate, latency, VRAM, blind 1–5 ratings by both students | Aleksander | 1 day |
| 6 | Moment overlap@6 against both students' picks, with student-vs-student agreement as the ceiling. Rank by severity or drop NDCG | both | 0.5 day |
| 7 | Retrieval Hit@k/MRR, BM25 vs hybrid. Serve bge-m3 with `llama-server --embedding` | Aleksander | 0.5 day |
| 8 | Tool-choice accuracy on the 40 questions, scored from the traces | Aleksander | 0.5 day |
| 9 | 5-player study, 20 minutes each, on their own match | both | 1 day |
| 10 | QLoRA pilot (Qwen3-8B or 14B) on verifier-passed and reviewed traces, **only if 1–8 are done**. Otherwise write up why it was descoped | Aleksander | 1–2 days |
| 11 | Report, plus a reproduction from a clean clone | both | 1.5 days |

That adds up to roughly 10–11 working days for two people. It fits only if feature work stops now and both students work on it.

## 7 Wednesday 25 November

### Fix before you rehearse (about 1 hour in total, all small)

Items 1, 3, 4 and 5 were fixed and checked on 22 November. Item 2 is your call: you have decided to keep the work local.

1. **The Studio upload fails for any real demo.** The new `apps/web/src/middleware.ts` matches every path, and Next 15.5 then cuts request bodies at 10 MB. I reproduced it: a 118 MB demo through the Studio gives "502 The API is not reachable", while the same file sent straight to the API is accepted. Fix: exclude `api/matches/upload` in the matcher at `middleware.ts:31-33`. Or upload the demo before class and don't upload live.
2. **Back up the six days of uncommitted work** (a local WIP commit or a patch file copied off the machine). It holds the whole showcase build.
3. **Playback jumps after switching tabs.** If you switch to your slides for 20 s and come back, the round has jumped ahead. Clamp the frame step in `apps/web/src/components/replay/usePlaybackClock.ts` (around line 180): `Math.min(dt, 0.1)`.
4. **Grammar on the projector.** The coach panel reads "against 1 enemies, with 1 kills" (`apps/api/app/coach/templates/findings.en.json:21`). Teachers will notice.
5. **The tests read your personal `.env`**, so 49 of them fail on your machine (finding 7). Fix it before showing a test run, or run with `RR_AUTH_ENABLED=false RR_LLM_ENABLED=false`.
6. Keep `/admin` and the Lab out of the demo: they still use the old style.

### What to show

- One decision traced end to end: demo → selected player → finding → radar seek → explanation → citation click. This works today.
- The rule "code decides what happened, the model decides what matters", and the MCP boundary that enforces it.
- The verifier and the template fallback. The UI honestly labels text "Written from the finding templates". **Also show one claim it wrongly accepts.** Examiners respect a team that knows the limits of its own checker.
- The data: 146 match groups split by match with a sealed test set; 85 POV clips checked by decoding every frame.
- The model numbers, labelled with their date and scope: the September pilot (verifier pass rates on 2 matches) and the 20 November rerun (EN 9.7 s and PL 11.1 s per Ask, on 20 GPU layers and an 8k context).
- The scope changes (maps, languages, split), and the smaller evaluation you want approved.

### What not to claim

That passing the verifier means the advice is correct. That anything is fine-tuned. That Ancient is supported for coaching. That a cloud deployment exists. Do not run a live LLM call unless it passed the 30-second budget twice in rehearsal, and do not record with CS2 live.

### The team question

The git history has commits only from Paweł's account and from AI agents (83 Claude, 5 Cursor). Nothing in the repository records Aleksander's work, although the plan gives him about half of it (model serving, verifier, RAG, questions, ratings, fine-tuning). In a two-person project the examiners will ask who did what, and the proposal promised that you could both defend everything. If Aleksander has work elsewhere, bring it in before Wednesday. Either way, he should present the AI half and be able to explain the verifier and the traces with the code open. The same applies to you: most of the code was written by agents in two days, so walk through the main path (upload → parse → detectors → agent → verifier) yourself before Wednesday.

## 8 What this audit did and did not check

**Did:**

- Read the proposal, the delivery plan, the teacher-prototype plan and the 20 November audits.
- Read the git history.
- Ran the API, labeller and web checks.
- Ran a live Studio and API on a scratch copy of the saved reviews, with a real upload.
- Ran the verifier probe.
- Had three independent read-only reviews (backend, AI, web/infra), and confirmed the key findings myself.

**Did not:**

- Run any model on the GPU.
- Record with CS2.
- Open the sealed validation and test demos, or check the hosted labeller's Supabase/R2 data.
- Take visual or contrast screenshots of every Porcelain screen.
- Check the Mac and Tailscale route from the teacher plan.
- Scan the full git history for player data.
