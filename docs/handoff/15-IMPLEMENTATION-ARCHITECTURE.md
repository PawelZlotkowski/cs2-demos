# 15 Implementation architecture

Related: [16 Data contracts](./16-DATA-CONTRACTS.md), [18 Current state](./18-CURRENT-STATE.md), [20 Agent instructions](./20-AGENT-INSTRUCTIONS.md)

## What was inspected

Only [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html), about 1,470 lines, was inspected. It is the entire UI prototype.

- **Framework:** none. It is vanilla ES2020 in an IIFE, published as a claude.ai artifact.
- **Libraries:** GSAP 3.12.5 and the Flip plugin, loaded from cdnjs.
- **Fonts:** Google Fonts (Hanken Grotesk, Newsreader).

## What was not inspected (known from project history only)

These are believed to be in the main project repository. Their exact paths and contents are **unknown**.

| Item | Contents |
|---|---|
| `cs2coach` Python package | Decompression, parsing to Parquet (kills, death_states, blinds, rounds), rule-based detectors producing findings with IDs, report JSON and Markdown, radar plots, feasibility checks. Tests run on a fake parser |
| `docs/PROJECT_SCOPE.md`, `docs/TECH_STACK.md`, `docs/DESIGN.md` | Scope, stack and the **older** design direction |
| `.cursor/skills/` | Ten Cursor skills: project scope, demo data, MCP tools, coach agent and verifier, knowledge/RAG, win-probability model, web app, evaluation, UI design, dev workflow |

**Planned stack** (from `TECH_STACK.md` per history, not verified):

| Layer | Choice |
|---|---|
| Frontend | React 19, Tailwind v4, shadcn/ui, TanStack Query and Router, Zustand, Recharts, Canvas 2D |
| Backend | FastAPI with SSE |
| Data | demoparser2, Polars, Parquet, DuckDB |
| RAG | LanceDB |
| ML | CatBoost, PyTorch Geometric GNN |
| Tooling | uv, Ruff, Pyright, Docker Compose |

GSAP is **not** listed in that stack. It must be added when the prototype is ported.

## Structure of the prototype

The file is organised as follows. Line numbers are approximate for this version.

| Section | Contents |
|---|---|
| `<style>` | Tokens, components, and the 1180 and 720 breakpoints. [03](./03-DESIGN-SYSTEM.md) |
| Markup | `#view-home`, `#view-upload`, `#view-studio`: rail, stage (`#sGame` canvas + `#gameOv` SVG + `#gameHtml`; `#sRadar` SVG), transport, `#tl` timeline, `#ctx` panel |
| Data, from line ~599 | `MATCH`, `LAST7`, `MOMENTS` (6 sample moments), `DUR`, `LANES`, `HOME` |
| State and loop | `S` (view, current moment, mode, time, playback, camera `vb`). The `gsap.ticker` loop advances `S.t` and calls `render()` when marked dirty |
| Scene | `buildScene()` builds the overlays and players, and the paused `sceneTl`. `focusBox()`, `aspectBox()` and `setCamera()` frame the radar |
| Render | `render()` → `renderRadar()`, `renderGame()`, `renderTimeline()`, the linked states, and `updateKnows()` |
| Timeline | `buildRounds()`, `buildLanes()`, `layoutClusters()`, `bindScrub()`, `showTip()`, `linkEv()` |
| Panel and Coach | `fillInsight()`, `renderSugg()`, `openCoach()`, `ask()`, `stream()`, `cites()` |
| Moments and view | `buildRail()`, `markSeen()`, `applyMoment()`, `selectMoment()`, `setMode()` |
| Layout | `fitStage()`, `setPanel()`, `setDrawer()`, `snapSheet()`, `calcSnaps()` |
| Views | `go()`, `buildHome()`, `homeAsk()`, `startProcessing()`, `acceptFile()` |

## Data flow

1. Selecting a moment: `applyMoment()` rebuilds the scene, timeline and panel, seeks to 5s before the key time and sets the camera.
2. The `gsap.ticker` advances `S.t` while playing. It pauses at `M.key` if "Stop at the decision" is on.
3. `render()` sets `sceneTl.time(S.t)`, then positions players, links, rings, lines of sight and annotations for `S.t`. It then updates the playhead, the clock, the "now" label and the linked states.
4. User input only ever changes state (`seek()`, `setPlaying()`, `setMode()`, `selectMoment()`). The render loop reflects it.

There is **no routing** (views are toggled with `hidden`), **no persistence** and **no network** apart from the CDN and fonts.

## Mapping to the planned React app (suggested, not decided)

- **State (Zustand):** `{matchId, momentId, t, playing, rate, mode, panelOpen, whole}`. `t` comes from `video.currentTime` on `requestVideoFrameCallback` or `timeupdate`.
- **Components:** `<Stage>` containing `<GameplayView video + OverlayLayer>` and `<RadarView svg>`, plus `<Transport>`, `<Timeline>`, `<MomentRail>`, `<AnalysisPanel>` and `<Coach>`.
- **Overlay timeline:** create it in `useGSAP`, keep it paused, and call `tl.time(t)` from the store subscription.
- **Server state:** TanStack Query for the match, moments and history. SSE for processing progress and Coach streaming.
- **shadcn/ui:** use its primitives only if they are restyled to [03](./03-DESIGN-SYSTEM.md). Default shadcn styling violates [04](./04-ANTI-AI-DESIGN-RULES.md).
