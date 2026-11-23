# Agent working log

## 20 November 2026 — Own-demo labeller handoff

Confirmed recipient workflow: import their own demo, choose a player, record candidates,
assess moment selection and explain improvements. Added separate selection usefulness,
per-signal verdicts and explicit footage-quality feedback; blocked stale detector reviews
and kept unusable footage out of training exports. Updated Git/start/reset guidance and
Polish friend instructions; the owner then authorised publication. Published the isolated
update as `6882f6f` on `codex/labeller-recording`; the Studio working branch remains unchanged.
Full suite 479 passed / 3 skipped / 3 subtests; extracted Linux kit 191 passed / 1 skipped /
3 subtests; four JS suites and Windows launcher passed. Fresh Ancient/Anubis imports
covered 47 rounds; two native captures and note export/import succeeded. Updated the
local labeller, retaining all 85 ready clips and byte-identical 7 round/10 clip revisions.
[Verification and publication state](../coach/LABELLER-HANDOFF-2026-11-20.md).

## 20 November 2026 — Corpus, application and showcase audit

Used only the owner's `Documents/cs_replays` corpus; excluded private grenade-practice recordings. Checked 102 training files, identified two unselectable first fragments, and fully parsed four fresh Ancient/Anubis matches (93 rounds, 86 findings, 64 non-overlapping groups). All five existing labeller snapshots retained; all 7 round and 10 clip-label revisions unchanged. All 85 current clips are ready, fully decoded and exported; inspected before/after frames from 28 additional clips.

Corrected stale Ask evidence/knowledge versions, stale saves, cache invalidation/equivalent snapshot retention, long-chain overlap, historical footage in the current picker, wrong-player whole-round reuse, incomplete media metadata and validation, and native capture's incorrect startup watchdog. Default API profile is local-v1. Real native CS capture recovered the remaining 14 Anubis clips; the worker now falls back once after two HLAE startup failures. Restored the existing recorder supervisor. No fabricated human labels, hosted model, commit or push.

Combined suite: 464 passed, 3 skipped, 3 subtests; final recorder follow-up: 19 passed / 3 subtests. Web typecheck/build and four JavaScript checks passed; isolated PostgreSQL labeller integration: 28 passed, temporary container removed. Browser radar/POV, current Ask response/history and the deduplicated footage picker checked. A real local Qwen EN/PL smoke exposed unsupported technique inference and Polish kill terminology; added versioned prompts and targeted verifier guards. Rerun: 9.66/11.07 s with valid citations; Polish grammar still needs review. Stopped the temporary model server. Mac/Tailscale/cloud storage and broad semantic quality remain rehearsal/evaluation gates. [Audit and repeatable tools](../coach/SHOWCASE-READINESS-AUDIT-2026-11-20.md).

Concise log for the next engineer or agent. British spelling.

## 20 November 2026 — Recalculated saved reviews and checked gameplay clips

Applied the owner's requested follow-up to five Studio reviews and five prepared labeller player profiles, preserving selected players/focus/language. The live labeller now serves `local-v1.1`, with 57 ready grouped clips for the owner's Ancient and two Anubis demos (35 reused, 22 newly captured). Four additional Ancient audit captures succeeded. All existing 7 round-review and 10 clip-label revisions were retained exactly; old snapshots and Studio seen/rating state were archived before IDs changed. Two historical non-owner queues remain paused; roster-only imports were not assigned a player.

Visual frame inspection covered 20 observations from 18 files. Successful trade, no trade despite an attempt, interrupted windows and another teammate's trade were checked against POV/kill feed and telemetry. Moving fire remains context, including smoke and pistol examples; no precision/recall or universal timing claim. Two old end-of-round clips have insufficient aftermath. Across five new batches: zero overlapping windows/repeated evidence; the three old batches had 76 overlapping pairs. See [the audit](../coach/DETECTION-QUALITY-CLIP-AUDIT-2026-11-20.md) for counts and private evidence paths.

Fixed float subtraction misclassifying a full five-second trade window. Added safe snapshot archival/current-review scoping and retained compatibility with imported notes. Affected regression suite: **109 passed**; focused check: **17 passed**. Live API streamed all 57 ready files, returned new snapshot IDs/policy and passed database integrity/history checks. No LLM, human-label fabrication, commit or push.

## 20 November 2026 — Detection precision safeguards and gameplay research

Owner requested nearby trades from the selected player's perspective (5 m), fewer unsupported moving-shot judgements, no repeated selected actions, and web research for better detection and RAG. Work is mapped to existing RR11–RR13/RR16; these delivery tasks are not marked complete. See [research and implementation report](../coach/DETECTION-QUALITY-RESEARCH-2026-11-20.md) and [source manifest](../../data/knowledge/research-sources-2026-11-20.json).

### Changed

- Shared nearby-trade event logic: selected player alive, fresh position, 3D distance at most 5 m, existing 5 s response window. Successful personal trades use the same rule in D10 and stats and count each revenge kill once. D1 now describes nearby teammate deaths; no trade, teammate retaliation and interrupted windows are context, with opportunity/visibility explicitly unknown.
- Moving shots require at least two moving rifle shots and adjacent firearm combat involving the selected player. Pistols, SMGs, shotguns and scoped weapons abstain pending calibration. Retained speed thresholds are labelled as legacy proxies. Outputs are context and cannot independently lead mistake clips.
- Ranker and selection verifier reject reused finding IDs and overlapping selected windows; ranker limits chained groups and respects small target counts. Recording padding may still repeat surrounding context at the edges.
- Policy versions `local-v1.1` / `legacy-all-v1.1`; selection prompt v2, explanation/Ask v4, updated EN/PL/NL templates. Prompts forbid turning uncertain observations or retrieved principles into unsupported match-specific causal claims.
- Sixteen checked sources cover mechanics, geometry, telemetry, tutorials and external datasets. Eight original conditional notes enter the existing RAG; overconfident fundamentals were corrected. No external dataset/video was bulk imported. Ingest excludes source catalogues and explicitly places personal notes last. All 150 existing curated passage IDs retain their file/title identity; persistent citation snapshots are still required for general corpus changes.

### Verified

- Full API suite: **335 passed, 3 skipped in 118.80 s** with isolated data, authentication disabled only in the test process, broad analysis profile, model and recording off. Focused regression run: **119 passed**. Commands and limitations are in the report. No frontend changes were made by this task.
- EN/PL trade/movement/crouch retrieval smoke passed against 158 passages; source manifest IDs and report links checked. `git diff --check` passed. Ruff was unavailable in the API virtual environment.
- Read-only cached telemetry smoke deduplicated five stored reviews into two inputs (Ancient/Anubis, 21 playable rounds each). Across all players, 156 moving-shot mistakes became 24 contextual observations. This measures output behaviour, not precision/recall. Aggregate hashes/counts are in [the smoke record](../coach/DETECTION-QUALITY-SMOKE-2026-11-20.json).

### Remaining evidence and limits

No new parser fields, raw demo reparse, clip adjudication or validated weapon model. `data/labels/` has no adjudicated fixture rounds, so new boundary tests are synthetic. The local model health request on port 8080 timed out; no real llama.cpp end-to-end quality or latency result is claimed. The repository's existing broader drafts and ordinal citation scheme still need the planned review/versioning work. Fresh analysis is required; saved reviews, labels and recordings were not rewritten. Existing owner work was preserved, with no commit or push.

## 26 September 2026 — Knowledge search, clip queue and the coach in the Studio (T30–T32, T40, T43, T45), same branch

Owner asked to finish the MCP tools and the rest of the coach UI. The coordinator moved the Ask tab, the Analysis explanation and the language setting to this thread.

### Done

- `search_knowledge` and `request_clip` tools, so the MCP server now serves all ten tools of plan §5.
- RAG v1 in `app/rag/`: `data/knowledge/*.md` split by `##` into `K..` passages, FTS5 plus optional dense vectors (`RR_EMBED_URL`), RRF. Starter notes for fundamentals, Mirage and Anubis. `GET /knowledge/{id}`.
- Clip queue table and `GET …/clips`; an on-demand round explanation queues a clip around the round's top finding.
- Verifier accepts numbers from cited `K..` passages that a tool actually returned in the run.
- Web: TS mirror of the coach contracts; `CoachExplanation` in the Analysis tab (moment on open, round on request); `CoachPanel` asks over SSE, shows the coach's lookups, labels template answers; `CoachText` renders `[F]` `[t:]` `[m]` `[K]` tokens; language setting (`rr.coachLanguage`) on the processing page and in the Analysis tab.

### Tested

- API `pytest`: 179 passed, 4 skipped (live model and real demo tests).
- Web `typecheck`, `lint`, `build` clean.
- Browser check on the synthetic analysed match with the model off: explanation in English and Polish, Ask answer in Polish with the template note, citations seek.

### Uncertain / limitations

- Nothing has run on llama.cpp yet, so the agent path in the UI (tool steps, `[K..]` passages) is covered by tests only.
- Knowledge base is a starter set, far below T30's 40 sections per map; no Liquipedia excerpts yet.
- Clips are queued but never recorded.

## 26 September 2026 — AI Coach phase 2 (T20–T27), branch `claude/coach-phase-2-r2gzvt`

Owner asked for phase two (tools, MCP, agent). Built on the phase 1 branch, one draft PR for the phase. `apps/web` was not changed: the phase 1 thread owns the UI work.

### Done

- T20 tools in `app/coach/tools.py`; T21 `cs2-demo` MCP server (`app/coach/mcp_server.py`, entry point and README in `apps/mcp/`). The server factory lives in the API package so the agent can run it in-process over MCP without a second install; `apps/mcp` holds no logic.
- T22 `LLMClient` + `MockLLMClient`; T23 agent loop + JSONL traces; T24 verifier + template fallback; T25–T27 jobs, pipeline states `selecting` and `explaining`, routes for moment/round explanations and Ask over SSE.
- Defaults taken: the model is off by default (`RR_LLM_ENABLED=false`) so the app still runs without a GPU; Ask sends one verified answer after `step` events instead of streaming tokens, so the user never sees a claim the verifier later removes; moment selection is one JSON-schema call (no tool loop) that stores its picks through the `select_moments` tool; the language check is a stopword score, not lingua/fastText (no extra dependency yet).
- The `mcp` SDK is 2.x (`MCPServer`, `mcp.Client`); `FastMCP` examples from older docs do not apply.

### Tested

- `cd apps/api && pytest` — 167 passed, 4 skipped (3 real-demo tests, 1 live llama.cpp test). The new tests use a synthetic match and a scripted model: every tool, MCP in-process and over stdio (`python -m cs2_demo_mcp` subprocess), same results as in-process, agent loop, repair and fallback paths, pipeline states, routes, SSE.
- `ruff check --select F,E9` on the new Python — clean.

### Not done / not verified

- Nothing ran against llama.cpp: tool-call formatting of Qwen3-14B, grammar-constrained JSON together with thinking mode, latency and VRAM. Run `RR_LLM_LIVE=1 pytest tests/coach/test_llm_client.py -k live` on the 5080 first (T02), then one real match with `RR_LLM_ENABLED=true`.
- T25's "5–6 valid moments on 5 matches" and T26's "< 20 s per round on the 5080" need real demos and the GPU.
- Prompts are v1 and untuned; Polish and Dutch output needs a native speaker's check.
- The TypeScript mirror of the new contracts and the UI that calls the new routes (explanation text in the Analysis tab, the Ask tab, the language setting) are the rest of T43 and T45.

## 26 September 2026 — Player picker and Studio coach UI (T41, T42, T44, part of T43), same branch

### Done

- Processing page stops at `awaiting_player` and shows a player picker: two teams, name and K/D from the kill events, arrow keys and Enter, the last picked player focused first. Picking calls `POST /matches/{id}/player`, shows the detecting stage and opens the Studio when the analysis completes. "Watch the replay without analysis" skips it.
- Studio loads the selected player's moments, findings and round stats. The rail lists the moments first (glyph, label, round clock, pick reason on the current one) and all rounds below; picking a moment loads its round and seeks to its start.
- Timeline: a Coach lane on top with labelled markers (orange ▲ mistake, blue ● good play); findings at one spot share a marker led by the moment's lead finding. The match strip marks rounds that hold a moment.
- Analysis tab: lead finding, kind and rank with finding citations that seek, the moment's findings, the player's round stats, and all findings in the round. The Ask tab is unchanged until the coach model exists.
- Home page text no longer says analysis is out of scope.

### Tested

- `npm run typecheck`, `npm run lint`, `npm run build`, API `pytest` (92 passed, 3 skipped).
- Playwright on the synthetic two-round demo at 1440, 1920, 1024, 834, 390 and 430 px: keyboard pick through to the Studio, and a moment jump across rounds landing on the moment's start. Screenshots in `docs/coach/screenshots/`.

### Not done / not verified

- Not checked on a real demo in the cloud session; needs a run on the owner's PC.
- Labels on the Coach lane drop to glyphs when markers are closer than 120 px; the tooltip carries them.

## 26 September 2026 — AI Coach phase 1 (T10–T17), branch `claude/coach-phase-1-hrt6pm`

Owner asked for phase one of the plan. One branch and one draft PR for all of phase 1 instead of one per task (owner's request covered the whole phase); commits are split by task.

### Done

- T10 extended parse → `analysis.json` (events, buy-time economy, 3 s full-rate windows before kills). SteamIDs kept exact (the old `_sid` went through `float`, which loses digits of a SteamID64).
- T11 first-draft zones for Mirage and Anubis + overlays in `docs/coach/zones/`.
- T12 `Finding` / `RoundStats` / `SelectedMoment` contracts (Pydantic + TS), SQLite storage, findings routes; migration note in [16](./16-DATA-CONTRACTS.md).
- T13 `awaiting_player` → `POST /matches/{id}/player` → `detecting` → `complete`; web processing page and Studio treat `awaiting_player` as replay-ready.
- T14–T15 detectors D1–D10, T16 round stats + code ranker, finding templates en/pl/nl.
- Knife rounds for sides (all kills and shots with knives, first round only) are flagged `knifeRound` in `analysis.json` and skipped by detectors, stats and the ranker. Found by running phase 1 on the sample demo locally (11 real-demo tests passed there).
- T17 label format (`data/labels/README.md`) and `eval/label_tool.py` (label, Cohen's κ, precision/recall).

### Tested

- `cd apps/api && pytest` — 90 passed, 3 skipped (real-demo tests; no demo in the cloud session).
- `ruff check --select F,E9` on the new Python — clean.
- `cd apps/web && npm run typecheck && npm run build` — pass.
- Zone overlays inspected visually; the Mirage CT spawn and Anubis CT/T spawn world positions from real demos land in the right zones.

### Not done / not verified

- Nothing ran on a real demo: demoparser2 field names for the new events and the `analysisBytes` size are unchecked. Run `pytest tests/analysis/test_real_demo.py tests/test_replay.py` with the sample demo in the repo root.
- Zone names and borders need a pass by someone who knows the callouts.
- T17's 150 labelled rounds and the κ on 30 shared rounds need both students; only the tool exists.
- Detector thresholds are guesses documented per module; tune them on labelled rounds (train/val matches only).
- Polish and Dutch templates need a native speaker's review.

## 26 September 2026 — AI Coach milestone planned

### Done

- Owner answered the planning questions; decisions recorded in [19](./19-DECISIONS.md) #16–#20.
- Added [docs/coach/AI-COACH-PLAN.md](../coach/AI-COACH-PLAN.md), [TASKS.md](../coach/TASKS.md) (unassigned task board) and [PROPOSAL.md](../coach/PROPOSAL.md) (school proposal draft, due 4 Oct).
- Updated AGENTS.md, CLAUDE.md (new, imports AGENTS.md), 00, 09, 12, 16, 18, 20, 21; project skills `rr-detector`, `rr-coach-agent`, `rr-eval` in `.cursor/skills/`.

### Not done / not verified

- Docs only; no code changed, nothing run. Hardware figures (VRAM, Unsloth fitting 14B QLoRA in 16 GB) are from published numbers and must be checked in T02/T52.
- Root `18-CURRENT-STATE.md` is an older copy of the handoff file and was left as is.
## 26 September 2026 — CS Demo Manager gameplay video

### Shipped

- Contracts: `ClipStatus`, `RoundClip`, `ClipManifest`; attached on rounds/replay/status.
- Storage: `data/matches/{id}/clips/rN.mp4` + `clips.json`; stream with Range (`GET …/clips/{roundId}.mp4`).
- Worker: `app/processing/video_clips.py` — analyze once, video per round, concurrency 1; `RR_CSDM_MODE=stub|csdm`.
- Pipeline enqueues clips after Radar `complete`; Docker keeps `RR_CSDM_ENABLED=0`.
- Studio: Gameplay|Radar seg control, `usePlaybackClock` video master, disabled Gameplay with reason, clip progress poll.
- Docs: [csdm-video.md](../replay/csdm-video.md), replay-architecture, 18, AGENTS.

### Verified

- `pytest` — **24 passed** (incl. stub clips + Range).
- `npm run typecheck` / `npm run build` — pass.
- Real `csdm` not on PATH here — spike documented; stub covers API/UI path.

### Next

1. On a Windows host with CS2 + CS:DM: `RR_CSDM_ENABLED=1` `RR_CSDM_MODE=csdm` `RR_CSDM_MAX_ROUNDS=1` and record one round.
2. Analysis milestone when kicked off.

## 25 September 2026 — Lead verification (Demo Replay follow-up)

### Verified

- `cd apps/api && pytest` — **17 passed** (~11 s), including real `1-5696bfd6-….dem.zst` E2E.
- `docs/demo-parser.md`, `docs/replay-architecture.md`, `docs/replay-performance.md` present; routes/pipeline match (upload → zstd → demoparser2 → normalise → round JSON).
- Spot-check: `app/processing/parse_demo.py` imports `demoparser2.DemoParser`; `pipeline.py` is not fixture-only for non-sample uploads.
- `apps/web`: `npm run typecheck` and `npm run build` — **pass** (Node must be on `PATH`; on this machine via `C:\Program Files\nodejs`).

### Doc updates

- Rewrote [18-CURRENT-STATE](./18-CURRENT-STATE.md) for real replay vs stubs.
- This log entry; [AGENTS.md](../../AGENTS.md) notes replay MVP landed / next = analysis.

### Discrepancies vs milestone report

- Report accurate on tests and demoparser2 path. Minor: architecture doc still says Zustand; implementation uses `usePlaybackClock`. Sample fixture still has no replay blobs (already noted in prior log).

### Ready for analysis?

**Yes** — real round clock and replay APIs are in place; detectors/moments can sit on top without inventing positions.

### Next

1. Analysis milestone only when kicked off (detectors → findings → moments).
2. Do not start Coach/LLM in the same breath.

---

## 25 September 2026 — Demo Replay milestone

### Changed

- Real pipeline: zstd decompress → demoparser2 → normalise → round replay JSON on disk.
- Replay APIs: `/rounds`, `/rounds/{id}/replay`, `/events`; processing states `uploaded→…→normalizing→complete|failed`.
- Next.js Radar studio: shared playback clock, interpolation (pos + yaw), timeline seek, speeds 0.5/1/2/4×; Mirage overview transform.
- Docs: `docs/demo-parser.md`, `docs/replay-architecture.md`, `docs/replay-performance.md`; `AGENTS.md` ownership for this milestone.
- Moments/coach remain unused stubs for later analysis work.

### Tested

- `pytest` apps/api — 17 passed (includes real `1-5696bfd6-….dem.zst` E2E)
- `npm run typecheck` / `npm run build` apps/web — pass

### Known issues

- Mirage radar uses overview-aligned SVG silhouette (not a full radar PNG yet).
- Tick rate assumed 64 Hz; round indexing normalised from FACEIT freeze/end events.
- Sample fixture match has moments but no real round replay blobs.

### Next

1. Analysis milestone: detectors → findings → moments on top of this replay clock.
2. Bundle real Mirage radar image; verify pixel alignment with callouts.
3. Optional SSE for processing progress.

---

## 25 September 2026 — Agent 0 foundation

### Changed

- Added monorepo scaffolding: `apps/web`, `apps/api`, `packages/shared`, `tests/e2e`, `docker/`, root `AGENTS.md`.
- Defined shared contracts (Pydantic + TypeScript) aligned with [16-DATA-CONTRACTS](./16-DATA-CONTRACTS.md) and prototype `SAMPLE_MOMENTS`.
- FastAPI stubs: upload validation, status polling, moments, coach mock, patterns; SQLite + filesystem uploads; mock pipeline.
- Next.js shells: `/`, `/upload`, `/processing/[id]`, `/studio/[matchId]` with design tokens and typed API client.
- Fixture extract: `packages/shared/fixtures/sample-match.json`.
- Doc: [24-MVP-ARCHITECTURE](./24-MVP-ARCHITECTURE.md).

### Why

Unblock parallel Agents A–F with one contract surface and runnable api/web starters. No product redesign.

### Tested

- `pytest` in `apps/api` (health, upload reject, sample match/moments, coach, patterns)
- `npm run typecheck` / `npm run build` in `apps/web` (run as part of this change)

### Uncertain / limitations

- Processing statuses use the expanded Agent-0 enum; UI still maps to six honest labels.
- Coach and moments for new uploads reuse the sample fixture until Agent D wires the engine.
- Design-direction contradiction (Studio vs older DESIGN.md) still needs an owner decision.

### Next priorities

1. Agent A/B: Home + Studio UI on contracts (GSAP clock, overlays).
2. Agent C: SSE processing + real persistence.
3. Agent D: replace mock pipeline with parse/detect/rank.
4. Agent E: e2e + overlay sync against the web app.

---

## 25 September 2026 — handoff continuation

### Changed

- Made Home, rail, processing and end-of-rail copy data-driven from `MOMENTS.length` / `MATCH`.
- Added Studio empty state when there are no moments; fixed init crash on empty data.
- Exposed `window.__RR__` and added `tools/qa/overlay_sync.py` + `tools/qa/smoke.py`.
- Accessibility/responsive: hover + `pointer: fine`, 24px coarse markers, sheet tap 14px, short Analysis button, mobile `--lane-h` growth, tablet lane max 56px.
- Fixed Coach free-text fallback (`M.head` → `M.finding`).
- Tab panels wired with `aria-controls`.

### Why

Highest-value items from [21-CURSOR-HANDOFF](./21-CURSOR-HANDOFF.md): broken empty state, hard-coded counts, overlay sync tests, known a11y/responsive gaps. Did not resolve the design-direction contradiction (owner decision).

### Tested

- `python tools/qa/overlay_sync.py prototype/analysis-studio.html` — pass
- `python tools/qa/smoke.py` — pass
- `python tools/qa/screenshots.py … qa-out/baseline` and `qa-out/after` — no page errors
- Visual check of after screenshots at desktop, tablet-portrait, mobile

### Uncertain / limitations

- Portrait tablet can still show spare space under the timeline.
- No real demo wiring; sample data only.
- Screen readers, 200% zoom, forced colours, dark theme, real touch devices not verified.
- Streaming Coach live-region still announces fragments.

### Next priorities

1. Owner: pick Analysis Studio vs older `DESIGN.md` direction.
2. Wire one real match / `Finding` contract from the engine.
3. Continue a11y (streaming announce-once, stage text alternative, arrow-key tabs).
4. React port only after data contract is stable.

## 2026-09-26 — AI Coach phase 3: knowledge base (T30)

**Branch:** `claude/coach-phase-3-6tsf72` (on `claude/coach-phase-2-r2gzvt`)

### Done

- `data/knowledge/`: Mirage (callouts, T side, CT side, utility, rotations; 58 sections), Anubis (same topics; 49 sections), `general/fundamentals.md` (25 sections, every detector covered), `README.md`, `SOURCES.md`.
- `data/knowledge/fetch_liquipedia.py`: downloads Liquipedia map pages with CC BY-SA attribution frontmatter, split by heading, respecting the API rate limit.
- `apps/api/tests/knowledge/test_knowledge_base.py`: frontmatter, section size, zone and detector names, ≥ 40 sections per map, parser attribution.

### Why

T31 and T32 (index and `search_knowledge`) were already being built in the phase 2 thread, so phase 3 here is the content they index.

### Tested

- `pytest tests/knowledge` — 16 passed; full `pytest` — 183 passed, 4 skipped.

### Uncertain / limitations

- Notes are a first draft from general CS2 knowledge; Anubis sub-callouts and the Mirage Stairs zone polygon need an in-game check.
- Liquipedia was not fetched (liquipedia.net is blocked from the cloud session); the parser is only tested on sample HTML.
- Notes are English only; Polish and Dutch questions rely on the multilingual embedding model.
