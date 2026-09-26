# 18 Current state

Related: [15 Implementation](./15-IMPLEMENTATION-ARCHITECTURE.md), [17 Testing](./17-TESTING-QA.md), [19 Decisions](./19-DECISIONS.md), [24 MVP Architecture](./24-MVP-ARCHITECTURE.md), [replay architecture](../replay-architecture.md), [demo parser](../demo-parser.md)

As of 25 September 2026 (Demo Replay milestone verified). Runnable monorepo: `apps/web`, `apps/api`, `packages/shared`. UI reference remains [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html) — do not treat it as the live app.

## Implemented (Demo Replay — monorepo)

- **Upload → process → Radar:** `.dem` / `.dem.zst` upload, zstd decompress, **demoparser2** parse, normalise to round replay JSON on disk.
- **Processing states:** `uploaded` → `decompressing` → `decompressed` → `parsing` → `normalizing` → `complete` | `failed`.
- **Replay APIs:** match metadata, `/rounds`, `/rounds/{id}/replay`, `/events`; Pydantic contracts mirrored in TypeScript.
- **Web studio:** stage-first Radar, shared playback clock, position + yaw interpolation, timeline seek, speeds 0.5/1/2/4×; Mirage + Anubis world→radar transforms.
- **Persistence:** SQLite match rows + filesystem uploads/work/replay blobs (`data/…`).
- **Tests:** API `pytest` (incl. real `1-5696bfd6-….dem.zst` E2E when present); web typecheck/build green.
- **Docs:** [demo-parser](../demo-parser.md), [replay-architecture](../replay-architecture.md), [replay-performance](../replay-performance.md).

## Implemented (prototype only — sample data)

Still in `prototype/analysis-studio.html` (reference): moment rail, Coach panel, gameplay PiP, annotation overlays, Home patterns UI. Not the primary product path for this milestone.

## Partially implemented

- **Radar visuals:** Real Valve overview PNGs for Mirage and Anubis (`apps/web/public/maps/`); SVG silhouettes removed.
- **Map coverage:** `de_mirage` + `de_anubis` overview metadata + radar images; other Active Duty maps still lack verified transforms.
- **Fullscreen / dark theme / a11y polish:** prototype notes still apply where not re-done in Next.js.
- **Upload/processing UI shells:** work against real status API; Coach/moments UX not wired to detectors.

## Mocked / stubbed

- **Sample fixture match:** moments/coach/home patterns from `packages/shared` — **no** real round replay blobs (`is_sample`; pipeline skips it).
- **Coach answers & moment ranking:** stub routes only; unused by Radar replay MVP.
- **Gameplay video / clip rendering:** not built.
- **Analysis detectors / findings / LLM:** not started (next milestone).

## Planned next (do not start here without a new milestone)

1. Analysis: detectors → findings → moments on the existing replay clock.
2. Bundle real Mirage radar image; verify pixel alignment.
3. Optional SSE for processing progress.
4. Coach agent, clip rendering, history/patterns (later).

## Unknown / open product

- Exact `cs2coach` finding schema alignment when analysis lands.
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

- Mirage radar is silhouette, not official radar art.
- Sample match cannot drive Radar replay (empty `round_replays`).
- Detector/QA scripts under `tools/qa/` still target prototype overlays more than Next.js studio.
