# 22 Design changelog

Related: [19 Decisions](./19-DECISIONS.md), [04 Anti-AI rules](./04-ANTI-AI-DESIGN-RULES.md), [12 Skills](./12-SKILLS-AND-REFERENCES.md)

These entries record why things look the way they do, so future changes don't undo them unknowingly. Screenshot sheets are in [`screenshots/`](./screenshots/).

## 0. The earlier direction (before 25 September 2026)

A dashboard-style design with:

- an olive-dark palette, a chartreuse highlighter, Big Shoulders and IBM Plex
- win-probability curves, a skill scorecard, and round views with a radar replay

It was audited once against Hallmark. It still lives in the main repository's `docs/DESIGN.md` (per history). See [18 contradictions](./18-CURRENT-STATE.md#contradictions).

## 1. Analysis Studio concept

The design was rethought as a replay workstation instead of a dashboard. Research on Mobbin covered editors, review tools, meeting recorders and contextual AI.

Two directions were compared:

- **Studio:** video first.
- **Coaching Workspace:** a guided lesson.

Studio was chosen because the product is time-based. Its layered panel was borrowed from the Workspace direction.

This version introduced:

- light chrome with a dark stage
- orange and blue semantics
- Hanken Grotesk and Newsreader
- the moment rail, event lanes and context panel
- the Flip swap between Gameplay and Radar
- the paused-timeline overlays driven by media time

## 2. First anti-AI audit ([screenshots/audit-1-before-after.png](./screenshots/audit-1-before-after.png))

The audit used the impeccable detector plus better-* and Emil reviews. Changes, with reasons:

- **Pill chips and chip rows became text questions and one context sentence.** They were a chat-kit tell.
- **Hint boxes with a left accent bar became anchored annotations with leader lines.** The side-tab is the most recognisable AI tell, and the boxes separated the text from the thing it described.
- **Radius dropped to 4 or 6px, and decorative icons were removed** (brand mark, upload and send icons). App-store look.
- **The stage header was removed; the view toggle and fullscreen moved into the transport.** Duplicate titles competed with the footage.
- **Blue is now only for good plays; ink is used for links, focus and citations.** One colour, one meaning.
- **`--text-3` was darkened to 4.5:1, and no text is below 11px.** Contrast.
- **The radar is framed on the moment, with only relevant labels, a planned route, a legend and a whole-map toggle.** It had read as a static labelled map.
- **Timeline: labelled Coach lane, interval bracket, empty lanes hidden, keyboard slider.** Unlabelled markers were a row of coloured tags.
- **"Picked because" added.** Users couldn't see why a moment was chosen.
- **Home was rebuilt around what to review next, with glyph strips in the match table.** The greeting was generic SaaS.
- **Page fades, stage blur and camera sway were removed.** No purpose.

## 3. Refinement pass ([screenshots/audit-2-previous-vs-refined.png](./screenshots/audit-2-previous-vs-refined.png))

- **Gap between the stage and the transport removed; spare height goes to the timeline lanes; columns narrowed; panel can be hidden.** Stage dominance.
- **Rail reason shown only for the current moment.** Less competition.
- **Panel reordered:** key finding, why (two lines), next time, then collapsed evidence, last 7 matches and related. What happened, why and what to do stay above the fold.
- **Shared moment label with the outlined "live" chip in the stage, Coach lane and panel header.** One instrument.
- **Secondary timeline events dimmed until they happen; clicked marker marked as selected.** The story over the log.
- **Radar relationship links and timing marks; gameplay line of sight.** Spatial explanation over prose.
- **Coach header merged into the panel's Analysis and Ask tabs; references to timestamps and moments added.** Less chrome, and answers link to evidence.
- **Previous and next event controls.** Taken from session-replay review.
- **Processing shows only real counts.** Don't invent numbers.
- **Home: latest match and "Work on next" in one row; three patterns.** Answer "what next" at a glance.
- **Mobile sheet:**
  - 72vh, with the key finding visible when collapsed
  - the header and summary line also work as drag handles
  - a tap toggles it, a tap on the stage collapses it
  - multi-touch guard and friction at the top

  So the user can watch and read without losing the stage.
- **Mobile lanes:** `min-height: 30px` so spare-height growth via `--lane-h` can apply (was a fixed 30px override).
- **Tablet: one-line rail, and short "Analysis" drawer button** (label moved to `title` to avoid wrap). The tablet was treated as its own layout, not a scaled desktop.
- **Reduced motion keeps fades and removes movement.** Emil: fewer, not zero.

## 4. Handoff continuation (25 September 2026)

Priority work from [21](./21-CURSOR-HANDOFF.md) and [18](./18-CURRENT-STATE.md), without resolving the design-direction contradiction:

- **Data-driven Home and rail counts.** Removed hard-coded "Six moments" / "6 moments" / "last of the six".
- **Empty-moments path.** Studio empty state; no crash on `MOMENTS.length === 0`.
- **Hover** uses `(hover: hover) and (pointer: fine)`.
- **Touch markers** 24px under `(pointer: coarse)`.
- **Mobile sheet** tap threshold 14px (was 6px).
- **Tablet Analysis button** shortened to "Analysis".
- **Coach fallback** uses `M.finding` (was broken `M.head`).
- **Test hooks** `window.__RR__` plus [`tools/qa/overlay_sync.py`](../../tools/qa/overlay_sync.py) and [`tools/qa/smoke.py`](../../tools/qa/smoke.py).
- Screenshots: `qa-out/baseline/` (before) and `qa-out/after/` (after).

