# 18 Current state

Related: [15 Implementation](./15-IMPLEMENTATION-ARCHITECTURE.md), [17 Testing](./17-TESTING-QA.md), [19 Decisions](./19-DECISIONS.md)

As of 25 September 2026 (post handoff continuation). The scope is [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html) plus what project history says about the main repository.

## Implemented (in the prototype, with sample data)

- Studio layout:
  - stage-first, with the transport directly under the stage and spare height given to the lanes
  - a hideable panel on desktop, a drawer on tablet and a bottom sheet on mobile
- Moment rail, moment switching (Flip indicator, panel crossfade, radar camera pan), and "seen" tracking within the session
- **Data-driven moment counts** on Home, the rail heading, processing stages and the "last moment" note (no hard-coded "6")
- **Empty-moments state:** Studio shows a calm empty message; Home adapts; `window.__RR__.setMoments([])` is used by tests
- Gameplay and Radar on one clock, with a Flip swap through the PiP
- Paused-timeline overlay sequencing driven by clip time; anchored annotations with auto-flip, rings, line of sight, zones, arrows and smoke
- Radar framing, trails, planned route, view cone, deaths, enemies once spotted, sightlines, zones, links, timing marks, legend
- Timeline: match strip, interval bracket, labelled Coach lane, hidden empty lanes, clusters, tooltips, live/now/selected/hover. Keyboard slider, previous and next event
- Analysis panel: key finding, why, next time, evidence, last 7 matches, related
- Coach UI: context line, suggested questions, Q&A thread, clickable finding/timestamp/moment refs
- Home: latest match, work on next, recent matches, patterns, history question (copy from `MATCH` / `MOMENTS` / `HOME`)
- Keyboard shortcuts, focus return, reduced motion
- Hover gated with `(hover: hover) and (pointer: fine)`; touch markers 24px under `(pointer: coarse)`
- Mobile sheet tap threshold 14px; Analysis drawer button stays short ("Analysis")
- Tablist wires `aria-controls` / `role="tabpanel"` for Analysis and Ask
- Automated overlay sync + smoke scripts under `tools/qa/`

## Partially implemented

- **Fullscreen:** the stage only, with no transport inside it.
- **Dark theme:** tokens exist but it has not been checked visually.
- **The one-primary-annotation rule:** one primary label at a time in sample data; not enforced by code.
- **Linked live state:** matched by label string rather than ID.
- **Accessibility:** see [13](./13-ACCESSIBILITY.md#partial-or-unresolved).
- **Portrait tablet dead space:** lane max raised to 56px; residual gap can remain on very tall viewports.

## Mocked

- **All data:** `MATCH`, `SAMPLE_MOMENTS` / `MOMENTS`, `LAST7` and `HOME`. None of it comes from a real demo.
- **Gameplay clip:** a canvas scene, not a rendered video.
- **Radar map:** simplified rectangles, not the real Mirage radar or coordinates.
- **Upload:** validates the extension only and never reads or sends the file.
- **Processing:** timers.
- **Coach answers:** scripted, with a fallback and simulated streaming.
- **Personalisation and history:** sample dot strips and pattern counts.

## Planned (not built in this UI)

- Backend: FastAPI with SSE, and the `cs2coach` engine integration
- Clip rendering with the CS Demo Manager CLI worker
- Real radar images and projecting positions into gameplay space
- Coach agent and verifier
- History storage and pattern classification
- React port
- Processing error states and the no-clip fallback
- Accessible text alternative for the stage
- Fullscreen controls
- A full history view

## Unknown

- Exact paths and contents of the main repository, the `cs2coach` finding schema and the report format.
- Whether win-probability curves, the skill scorecard and pro comparisons remain in scope.
- How to project world positions onto rendered clip frames.
- Real clip length and camera behaviour.
- Whether Steam login works on the Azure VM for rendering.

## Contradictions

1. **Design direction.** Main repo `docs/DESIGN.md` (olive-dark / chartreuse) vs this package (Analysis Studio light chrome). **Owner must choose.**
2. **Stack versus prototype.** Planned stack omits GSAP; motion depends on it. shadcn defaults conflict with [04](./04-ANTI-AI-DESIGN-RULES.md).
3. **Scope.** Earlier scope had win-probability, skill scorecard, pro comparisons; Studio has none.
4. **Earlier Cursor skills.** Update `cs2-ui-design` or point it here.

## Technical debt

- Stage/map colours are JS literals, not tokens.
- No spacing tokens.
- Single ~1,600-line file, no modules or types.
- Linked live state by string.
- `fitStage()` measures on every resize.
- Overlay/radar geometry hand-authored in 160×90 and 100×100.
- Legacy `line` overlay type and mock-only `cam` field.
- Some CSS names still say "insight" where the UI says "Coach".

## Design debt

- Portrait tablet can still leave spare height under the timeline.
- Timeline glyph meanings only via tooltips; no legend.
- Sound glyph reads poorly.
- Previous-match Coach refs are plain text, not links.

## Known bugs

- Detector false positives on labels above SVG, closed `<details>`, and the detector's own highlight as "glow".

## Known accessibility issues

See [13](./13-ACCESSIBILITY.md#partial-or-unresolved): arrow-key tabs, streaming live-region fragments, no stage text alternative, no screen-reader/zoom/forced-colours testing.

## Known responsive issues

- Portrait tablet spare space can remain after lane growth.
- Fullscreen on mobile and phone landscape rotation untested.

## Performance concerns

- Per-frame SVG attribute writes, `getBoundingClientRect`, canvas redraw during playback.
- Word streaming rewrites answer HTML every 28ms.
