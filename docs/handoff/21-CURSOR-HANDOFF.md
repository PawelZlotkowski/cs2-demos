# 21 Cursor handoff

Read this first. Then read [19 Decisions](./19-DECISIONS.md) and [18 Current state](./18-CURRENT-STATE.md) before editing anything.

## Goal

Round Reviewer turns a CS2 demo (`.dem.zst` or `.dem`) into 5 or 6 coached moments. Each moment is reviewed on a replay stage (rendered gameplay or tactical radar, on one clock) with an event timeline, a short evidence-backed explanation and a context-aware Coach.

The central question: *What can this player learn from this match?*

## Status

The Analysis Studio UI is a working single-file prototype with sample data: [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html).

- **Scripted:** the clip, the radar map, upload, processing, Coach answers and history.
- **Elsewhere:** the Python engine `cs2coach`, the older docs and the Cursor skills are in the main repository and were not inspected here.
- **Planned:** a React 19 port with a FastAPI + SSE backend.

## Architecture in one breath

- One state object `S` and a `gsap.ticker` loop that advances `S.t` and calls `render()`.
- Overlays live on a paused GSAP timeline set by `sceneTl.time(S.t)`.
- Radar and gameplay positions are interpolated from tracks at `S.t`.
- Moments are data (`MOMENTS`) with engine, derived and LLM fields ([16](./16-DATA-CONTRACTS.md)).

## Important paths

| Path | What it is |
|---|---|
| `prototype/analysis-studio.html` | The UI |
| `docs/handoff/` | These docs |
| `prototype/qa/screenshots.py` | Screenshots at six sizes plus a page-error check |

## Design principles

- **Stage first.** Collapse secondary UI before shrinking the replay.
- **Colour:** orange means mistake, blue means good play, ink means everything else. Shapes carry meaning too.
- **Type:** Hanken Grotesk for UI and data, Newsreader for the Coach's voice. Only sizes 11, 12, 13, 14, 16, 20 and 26 (22 for the Home headline on mobile).
- **Shape:** 4 to 6px radius, no shadows on static content, no cards, no pills, no decorative icons.
- **Overlays:** one primary annotation, anchored with a leader line, sharing the moment's label with the timeline and the panel.
- **Motion:** GSAP for time, space and continuity only; instant keyboard actions; reduced motion respected.

## Skills to load

These are used as references; don't vendor them.

| Source | Skills |
|---|---|
| emilkowalski/skills | `emil-design-eng`, `review-animations` |
| greensock/gsap-skills | `gsap-timeline`, `gsap-plugins` (Flip), `gsap-react`, `gsap-performance` |
| jakubkrehel/skills | `better-accessibility`, `better-layout` |
| pbakaus/impeccable | Detector, for audits |

The adopted rules are summarised in [12](./12-SKILLS-AND-REFERENCES.md).

## Current milestone

AI Coach (26 Sep 2026): see [docs/coach/AI-COACH-PLAN.md](../coach/AI-COACH-PLAN.md) and the task board [docs/coach/TASKS.md](../coach/TASKS.md). The list below is the older prototype backlog.

## Work on first

1. With the owner, settle the design-direction contradiction ([18](./18-CURRENT-STATE.md#contradictions)): Analysis Studio versus the older `DESIGN.md`.
2. Make the UI data-driven. Remove the hard-coded "6 moments" and the fixed Home copy, and handle 0 or fewer moments with empty states.
3. Add automated overlay synchronisation tests ([17](./17-TESTING-QA.md#overlay-synchronisation-tests-highest-priority)).
4. Define the `Finding` and `Moment` contract with the engine, and replace the sample data with one real match.
5. Port to React following [15](./15-IMPLEMENTATION-ARCHITECTURE.md#mapping-to-the-planned-react-app-suggested-not-decided).

## Testing

```bash
pip install playwright && python -m playwright install chromium
python prototype/qa/screenshots.py prototype/analysis-studio.html qa-out/
```

## Don't change

- Video time as the authoritative clock
- The paused-timeline overlays
- One primary overlay
- The shared label and live state
- Semantic colour
- The panel content order
- No chatbot styling
- Honest processing
- The keyboard map

## Deeper docs

[00 README](./00-README.md), [05 Studio](./05-ANALYSIS-STUDIO.md), [06 Overlays](./06-VIDEO-OVERLAY-SYSTEM.md), [07 Radar](./07-RADAR-SYSTEM.md), [08 Timeline](./08-TIMELINE-SYSTEM.md), [09 Coach](./09-AI-COACH.md), [13 Accessibility](./13-ACCESSIBILITY.md), [14 Responsive](./14-RESPONSIVE-BEHAVIOR.md), [20 Agent instructions](./20-AGENT-INSTRUCTIONS.md)
