# 02 UX architecture

Related: [05 Analysis Studio](./05-ANALYSIS-STUDIO.md), [14 Responsive](./14-RESPONSIVE-BEHAVIOR.md), [04 Anti-AI rules](./04-ANTI-AI-DESIGN-RULES.md)

## Principle

The app is a **replay-analysis workstation**, not a dashboard that contains gameplay. The current moment is the centre of the interface, and everything else supports it.

## Visual hierarchy in the Studio

1. The current gameplay or radar (the stage)
2. The current insight (key finding, why, next time)
3. The timeline
4. Supporting metrics (evidence)
5. Deeper explanation (Coach, history, related moments)
6. Secondary controls

## Screens

All screens are views inside one page in the prototype, switched by `go()` in [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html).

### Home (`#view-home`, Status: implemented with sample data)

Home answers one question: "What should I review or practise next?" Its order:

1. **Latest match:** map preview with the moments plotted, the result, a glyph strip of the moments, and one filled action ("Review moment 1: ...").
2. **Work on next:** one personalised focus, with a last-7-matches dot strip and a link to the clearest example.
3. **Recent matches:** a compact table (map, score, date, moment glyphs, reviewed status).
4. **Repeated in your last 7 matches:** at most 3 patterns.
5. **Ask about recent matches:** a Coach entry scoped to history.

### Upload (`#view-upload`, Status: mocked)

A drop zone, "Choose a file", and "Use the sample match". Files are validated by extension. A wrong file shows an inline error that says how to fix it. No file is actually read or uploaded.

### Processing (inside `#view-upload`, Status: mocked)

A list of real pipeline stages:

1. parse
2. reconstruct rounds
3. detect events
4. rank moments
5. render clips
6. write explanations

Each stage shows its state and only counts that exist in the data (rounds, moments by type, clips, file size). Unknown counts say "Done". There are no percentages. The list opens the Studio when it finishes. See [18](./18-CURRENT-STATE.md).

### Studio (`#view-studio`, Status: implemented as a prototype)

The analysis workspace, covered in depth in [05](./05-ANALYSIS-STUDIO.md). It has three zones:

- **Moment rail:** 6 moments.
- **Work column:** stage, transport and timeline.
- **Analysis panel:** Analysis and Ask tabs. Can be hidden.

### Gameplay and Radar (Status: prototype)

These are two representations of the same moment on the same stage, not separate screens. See [06](./06-VIDEO-OVERLAY-SYSTEM.md) and [07](./07-RADAR-SYSTEM.md).

### Coach (Status: mocked answers)

The Ask tab inside the Studio panel, plus a history-scoped entry on Home. There is no standalone chat page. See [09](./09-AI-COACH.md).

### Progress and history (Status: planned)

There is no dedicated screen. History appears on Home (patterns, work on next) and in each moment's "Last 7 matches" row. A dedicated progress view has not been designed. If one is added, it must follow [04](./04-ANTI-AI-DESIGN-RULES.md): no metric-card dashboard.

## Navigation

- **Top bar:** product name, Home and Studio tabs, the current match (in the Studio only), and "Add demo".
- **Home → Studio:** "Review moment 1" or "Review the round 7 example" opens the Studio on that moment.
- **Upload → Studio:** processing finishes, then the Studio opens at moment 1.
- **Inside the Studio:**
  - Rail items, match-strip glyphs, the "Next moment" link, moment references in Coach answers, and the `[` and `]` keys all switch moments without leaving the view.
  - Timeline markers, evidence rows, citations, timestamp references, the previous and next event buttons, and the `,` and `.` keys all seek within the clip.

## Per-device summary

This is a short version of [14](./14-RESPONSIVE-BEHAVIOR.md).

- **Desktop (above 1180px):** rail (184px) | stage column | panel (332px, can be hidden). The stage takes the leftover width, and spare height goes to the timeline lanes.
- **Tablet (721 to 1180px):** the rail becomes a one-line horizontal strip, and the panel becomes a right-hand drawer opened by "Analysis: <label>". The stage is full width.
- **Mobile (720px and below):** the stage is full-bleed at the top, with the transport and a taller-lane timeline below. The analysis becomes a bottom sheet that shows the key finding when collapsed.
