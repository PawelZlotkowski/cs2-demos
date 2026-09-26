# 06 Video overlay system

Related: [05 Analysis Studio](./05-ANALYSIS-STUDIO.md), [08 Timeline](./08-TIMELINE-SYSTEM.md), [11 Motion](./11-MOTION-SYSTEM.md), [16 Data contracts](./16-DATA-CONTRACTS.md)

Code: `buildScene()` builds the overlays and `renderGame()` positions the tracked ones, both in [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html). The data comes from each moment's `gov` array.

## The critical rule: playback time is authoritative

- One clock, `S.t` (clip seconds), drives everything. In production it must be `video.currentTime`.
- Overlay sequencing is built as a **paused** GSAP timeline in clip seconds (`sceneTl`). Every frame, `render()` calls `sceneTl.time(S.t)`, so the overlay state is a pure function of time.
- This means that seeking forward or backward, scrubbing, jumping from a citation, pausing, resuming, changing speed or switching view always shows the overlays for that exact time.
- An annotation from another timestamp can never linger, because nothing plays on its own clock.
- **Never** attach overlays to a free-running animation or `setTimeout` chains.
- Status: implemented in the prototype and verified by manual seeking. There are no automated tests yet ([17](./17-TESTING-QA.md)).

## Overlay types (`gov[].type`)

| Type | What it shows | Anchor | Status |
|---|---|---|---|
| `anno` | Short label with a leader line, e.g. "▲ **Dry peek** pre-aimed, no trade" | A tracked player (`at.track`) or a fixed point (`at.x`, `at.y` in 160×90 space) | implemented |
| `ring` | An ellipse around a player | A tracked player | implemented |
| `los` | A dashed line of sight from an enemy's head to the crosshair | A tracked player to a fixed point | implemented |
| `zone` | A dashed danger or area polygon | Fixed | implemented |
| `arrow` | A movement or throw direction path with an arrowhead | Fixed path | implemented |
| `blob` | Utility such as a smoke | Fixed | implemented |
| `line` | A static sightline (older type, superseded by `los`) | Fixed | implemented |

- Coordinates use a 160×90 overlay space that maps to the 16:9 stage.
- In production, anchors must come from projecting game positions into the rendered camera. How to do that is **unknown or planned**. It depends on what CS Demo Manager can export.

## Hierarchy

- **One primary annotation at a time** (`pri:1` at full opacity): it has the shared label and a meaning glyph.
- **A few secondary marks** (`pri:2` at 55% opacity): context such as "AWP on mid", zones, arrows. On mobile, secondary text labels are hidden, while secondary shapes (zones, arrows, rings) remain.
- Everything else stays hidden until it becomes relevant.
- Primary and secondary overlays are sequenced in time. For example, the enemy highlight appears first, then the danger zone, then the labelled annotation.
- The rule that there is only one primary annotation at a time is **enforced by data authoring, not by code**. That is technical debt: a future renderer should enforce it.

## Anchoring and placement

- Annotations sit next to the thing they describe, joined by a 16px leader line.
- They flip to the left automatically when they would overflow the right edge.
- Label text is two to five words. Visuals carry the explanation, and the text says only what the visual cannot.
- The primary annotation's bold label is the moment's shared `label`. That is what links it to the Coach-lane marker and the panel header ([08](./08-TIMELINE-SYSTEM.md#linked-state)).

## Positive and negative moments

- The annotation glyph is the moment's kind (▲ mistake, ● good play, ◇ missed chance).
- On the stage, orange means danger or mistake and blue means good play or the player's own path.
- Neutral light marks (arrows, links) mean movement or a relationship, not a judgement.

## Death

When the player dies:

- the gameplay dims (`#dim`)
- a caption reads "You died here. Playback continues so you can see what followed."
- the clip keeps running so the consequences are visible

## Why no floating cards

- A card in a corner separates the explanation from the thing it explains, and it hides footage.
- Anchored labels with lines, zones and paths keep the explanation where the eye already is.
- Longer reasoning belongs in the panel or the Coach.

## Fullscreen

- The stage enters fullscreen (`#fsBtn`) with the overlays, the PiP and the radar legend. Status: implemented.
- Transport and timeline controls are **not** available in fullscreen. Status: partial: fullscreen controls are planned.
