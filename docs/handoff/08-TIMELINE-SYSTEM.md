# 08 Timeline system

Related: [05 Analysis Studio](./05-ANALYSIS-STUDIO.md), [06 Overlays](./06-VIDEO-OVERLAY-SYSTEM.md), [13 Accessibility](./13-ACCESSIBILITY.md)

Code: `buildRounds()`, `buildLanes()`, `layoutClusters()`, `bindScrub()`, `renderTimeline()` and the linked-state block in `render()` in [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html).

The timeline should tell the story of the moment, not list every event.

## Structure (top to bottom)

1. **Match strip:** one cell per round (a darker cell means a won round), a glyph above each round that has a moment, and the current round outlined. Clicking a glyph selects that moment.
2. **Interval bracket:** the key time span of the lesson with a label, e.g. "Left 3.1 s after the first sound" or "No trade for 4.1 s". It is optional per moment (`bracket`).
3. **Lanes:**

| Lane | Contents |
|---|---|
| **Coach** | The labelled coaching markers. The lane is taller and has a bottom border |
| You | The player's own events |
| Team | Teammate events |
| Enemy | Enemy events |
| Utility | Grenades and utility |

   Lanes with no events are hidden.
4. **Scale:** 0, 5, 10, 15 and 20 s.

## Markers

- **Coach lane:** the glyph (▲ ● ◇ □) plus a text label at 12px, weight 600. These are the primary events.
- **Other lanes:** small neutral glyphs at 50% opacity:

| Glyph | Event |
|---|---|
| dot | kill |
| X | death |
| ring | spotted |
| grey disc | smoke |
| star | flash |
| bar | move |
| arc | sound |
| block | plant |
| square | note |

  They rise to full opacity while they are happening (`.now`, within 2.5 s of the event).
- Markers closer than 20px (26px on mobile) collapse into a count cluster, which jumps to the first event when clicked.
- Hit areas are 22×22px.

## States

| State | Meaning | Style |
|---|---|---|
| live | The coaching annotation is on the stage now | Outlined ink box on the Coach marker |
| now | A secondary event happened in the last 2.5 s | Full-opacity glyph |
| selected | The last marker the user clicked | Inset ink outline |
| current time | The playhead | Ink line with a triangle head, moved by transform each frame |
| hover | Where the pointer is | Ghost line |

## Linked state

The stage, timeline and panel are linked through one shared **label per moment** (for example "Dry peek") and **one outlined chip style**:

- The stage annotation starts with the bold label.
- While that annotation is visible:
  - the Coach-lane marker with the same label shows the outlined **live** style
  - the panel header label shows the same outline
- Hovering an evidence row highlights its markers (`data-ev`), and hovering a marker highlights its evidence row.
- The transport's "now" text names the latest secondary event.

Status: implemented. It relies on label strings matching between `gov[].lab` and the events. A stable ID would be more robust (technical debt).

## Interaction

- **Click or drag on the lanes:** seek. While dragging, playback holds and then resumes.
- **Click a marker:** seek to it, pause, and mark it as selected.
- **Tooltip:** the label and the round clock time, plus the finding ID if there is one.
- **Previous and next event:** buttons and the `,` and `.` keys.
- **Keyboard seeking:** see Accessibility below.

## Accessibility semantics

- The seek surface is `role="slider"` and focusable, with `aria-valuemin` 0, `aria-valuemax` 20 and `aria-valuenow` in seconds.
- `aria-valuetext` gives the round clock ("Round clock 1:15").
- Keys:
  - arrows step 1s (0.1s with Shift)
  - Home and End jump to the start and end
- Markers are real `<button>` elements with labels that include the time.
- Status: implemented. Screen-reader behaviour is **not verified**.
