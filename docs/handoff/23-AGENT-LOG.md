# Agent working log

Concise log for the next engineer or agent. British spelling.

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
