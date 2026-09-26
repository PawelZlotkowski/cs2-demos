# 18 Current state

Related: [15 Implementation](./15-IMPLEMENTATION-ARCHITECTURE.md), [17 Testing](./17-TESTING-QA.md), [19 Decisions](./19-DECISIONS.md), [24 MVP Architecture](./24-MVP-ARCHITECTURE.md), [replay architecture](../replay-architecture.md), [demo parser](../demo-parser.md)

As of 26 September 2026 (AI Coach phase 1 on branch `claude/coach-phase-1-hrt6pm`, in review; Demo Replay milestone verified 25 Sep). Runnable monorepo: `apps/web`, `apps/api`, `packages/shared`. UI reference remains [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html) — do not treat it as the live app.

## Implemented (Demo Replay — monorepo)

- **Upload → process → Radar:** `.dem` / `.dem.zst` upload, zstd decompress, **demoparser2** parse, normalise to round replay JSON on disk.
- **Processing states:** `uploaded` → `decompressing` → `decompressed` → `parsing` → `normalizing` → `awaiting_player` → `detecting` → `complete` | `failed`. Radar loads from `awaiting_player`. `selecting`, `recording`, `explaining` exist in the enum but are not used yet.
- **Replay APIs:** match metadata, `/rounds`, `/rounds/{id}/replay`, `/events`; Pydantic contracts mirrored in TypeScript.
- **Web studio:** stage-first Radar, shared playback clock, position + yaw interpolation, timeline seek, speeds 0.5/1/2/4×; Mirage + Anubis world→radar transforms.
- **Persistence:** SQLite match rows + filesystem uploads/work/replay blobs (`data/…`).
- **Tests:** API `pytest` (incl. real `1-5696bfd6-….dem.zst` E2E when present); web typecheck/build green.
- **Docs:** [demo-parser](../demo-parser.md), [replay-architecture](../replay-architecture.md), [replay-performance](../replay-performance.md).

## Implemented (AI Coach phase 1 — deterministic analysis, in review)

Tasks T10–T17 in [TASKS](../coach/TASKS.md). No LLM yet.

- **Extended parse (T10):** `weapon_fire` (with shooter velocity), `player_hurt`, `player_blind`, `item_purchase`, bomb begin plant/defuse, `inferno_startburn`, `smokegrenade_expired`; economy props at the end of buy time; full-rate ticks for 3 s before every kill (victim and killer kept). Written to `data/matches/<id>/analysis.json`; replay blobs unchanged. `perf.analysisBytes` / `perf.replayBytes` record the sizes.
- **Map zones (T11):** first-draft callout polygons for Mirage and Anubis in `apps/api/app/maps/zones/` (radar pixel space), `zone_at(map, x, y)`, overlay images in `docs/coach/zones/`.
- **Contracts + storage (T12):** `Finding`, `RoundStats`, `SelectedMoment`, `PlayerSelectRequest` (Pydantic + TS); SQLite tables `match_players`, `findings`, `round_stats`, `moments`; routes `GET /matches/{id}/players/{pid}/findings|round-stats|moments`.
- **Player selection (T13):** `POST /matches/{id}/player` runs the detectors; failure returns to `awaiting_player` with an error and keeps the Radar.
- **Detectors D1–D10 (T14, T15)** in `apps/api/app/analysis/detectors/`, round stats and the code ranker (T16), finding summary templates in en/pl/nl (`apps/api/app/coach/templates/`).
- **Player picker and Studio coach UI (T41, T42, T44, most of T43):** at `awaiting_player` the processing page lists the ten players with K/D (arrow keys and Enter work), starts the analysis and opens the Studio when it completes. The Studio rail lists the code ranker's moments first and all rounds below; the timeline has a Coach lane (orange ▲ mistake, blue ● good play; findings at one spot share a marker); the Analysis tab shows the lead finding, the pick reason with finding citations that seek, the moment's findings, the player's round stats and all findings in the round. Screenshots from the synthetic demo: `docs/coach/screenshots/`.
- **Labelling (T17):** `python -m eval.label_tool label|agreement|score`, format in `data/labels/README.md`. No labels yet.

## Implemented (prototype only — sample data)

Still in `prototype/analysis-studio.html` (reference): moment rail, Coach panel, gameplay PiP, annotation overlays, Home patterns UI. Not the primary product path for this milestone.

## Partially implemented

- **Radar visuals:** Real Valve overview PNGs for Mirage and Anubis (`apps/web/public/maps/`); SVG silhouettes removed.
- **Map coverage:** `de_mirage` + `de_anubis` overview metadata + radar images; other Active Duty maps still lack verified transforms.
- **Fullscreen / dark theme / a11y polish:** prototype notes still apply where not re-done in Next.js.
- **Upload/processing UI shells:** work against real status API.

## Mocked / stubbed

- **Sample fixture match:** moments/coach/home patterns from `packages/shared` — **no** real round replay blobs (`is_sample`; pipeline skips it).
- **Coach answers & moment ranking:** stub routes only; unused by Radar replay MVP.
- **Gameplay video / clip rendering:** not built.
- **LLM moment selection / explanations / Ask:** not started (phase 2). The code ranker's moments stand in.

## Planned next (AI Coach milestone, kicked off 26 Sep 2026)

Plan: [docs/coach/AI-COACH-PLAN.md](../coach/AI-COACH-PLAN.md). Tasks and status: [docs/coach/TASKS.md](../coach/TASKS.md).

1. Merge the CS:DM clips branch (`cursor/csdm-gameplay-video`).
2. Phase 1 follow-ups: run the real-demo tests, correct zone names on the overlays, label rounds and tune thresholds.
3. Tools + `cs2-demo` MCP server, self-hosted Qwen3-14B agent (llama.cpp), verifier, LLM moment selection, explanations, Ask.
4. RAG (map knowledge + player memory), per-moment clips, LLM text in the Analysis tab and the Ask tab, en/pl/nl.
5. Fine-tuning (QLoRA), larger model on RTX Pro 6000, evaluation.

## Unknown / open product

- ~~Exact `cs2coach` finding schema~~ superseded: the `Finding` contract is defined in the coach plan §4.4.
- Whether win-probability, skill scorecard and pro comparisons remain in scope.
- How (or whether) to project world positions onto rendered clip frames.

## Contradictions

1. **Design direction.** Older `docs/DESIGN.md` (olive-dark) vs Analysis Studio light chrome — **owner must choose**; Studio tokens are the working direction.
2. **Architecture note vs code:** [replay-architecture](../replay-architecture.md) mentions Zustand; web uses a React playback hook (`usePlaybackClock`) — same single-clock intent.
3. **Scope.** Earlier scope had win-probability / scorecard; Studio has none.

## Technical debt (monorepo)

- In-memory record cache alongside SQLite (fine for MVP; revisit multi-worker).
- Tick rate assumed 64 Hz; round indexing from freeze/end events needs ongoing FACEIT edge-case care.
- Prototype remains a large single HTML file if still used for Coach UX reference.

## Known issues

- **Phase 1 not checked on a real demo in the cloud session:** no demo is committed, so the demoparser2 field names for the new events (`blind_duration`, `assister_steamid`, `user_velocity_X`, …) and the analysis blob size are unverified until `tests/analysis/test_real_demo.py` runs locally.
- **Zones are a first draft** drawn from the overview images; names and borders need a pass by someone who knows the callouts. No height (z) separation yet, so stacked areas take the first matching zone.

- Mirage radar is silhouette, not official radar art.
- Sample match cannot drive Radar replay (empty `round_replays`).
- Detector/QA scripts under `tools/qa/` still target prototype overlays more than Next.js studio.
