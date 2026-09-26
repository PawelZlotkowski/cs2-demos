# 05 Analysis Studio

Related: [06 Overlays](./06-VIDEO-OVERLAY-SYSTEM.md), [07 Radar](./07-RADAR-SYSTEM.md), [08 Timeline](./08-TIMELINE-SYSTEM.md), [09 Coach](./09-AI-COACH.md), [14 Responsive](./14-RESPONSIVE-BEHAVIOR.md)

Code: `#view-studio` in [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html). The main functions are `applyMoment()`, `selectMoment()`, `setMode()`, `render()`, `fillInsight()` and `fitStage()`.

## Layout

These are desktop values. For the other breakpoints see [14](./14-RESPONSIVE-BEHAVIOR.md).

```
┌ top bar 44px: Round Reviewer | Home  Studio | Mirage, lost 11–13, yesterday | Add demo ┐
├ rail 184px ┬ stage (16:9, fills the width) ─────────────┬ panel 332px ───────────────┐
│ 6 moments  │ gameplay or radar, with PiP of the other   │ ▲ Dry peek  R3 1:15        │
│ ▲ Dry peek │                                            │   Analysis | Ask   [hide]  │
│ ▲ ...      ├ transport: ▶ ⏮ ⏭ 1:15 now-label … view ⛶    │ key finding (20px)         │
│ ● ...      ├ timeline: match strip, bracket, lanes      │ Why / Next time            │
│            │   (the lanes absorb spare height)          │ Evidence ▸ Last 7 ▸ Related ▸│
└────────────┴────────────────────────────────────────────┴ Ask about this moment ─────┘
```

- The stage is top-aligned, with the transport directly under it and no gap. Status: implemented.
- When the stage is limited by width, `fitStage()` gives the spare height to the timeline lanes. Status: implemented.
- The panel can be hidden (`setPanel()`). When it is hidden, the same icon in the transport brings it back and the stage grows. Status: implemented.

## Primary stage

The stage shows gameplay or radar, and the other view appears as a picture-in-picture (23% of the stage, bottom-right). Clicking the PiP, the segmented control, or pressing `V` swaps them.

## Moment navigation

There are 6 moments in the sample (planned: about 5 or 6 from the ranker). Each moment has these fields (see [16](./16-DATA-CONTRACTS.md)):

| Field | Example |
|---|---|
| title | "Dry peek into Connector" |
| label | "Dry peek", shared by the stage, the timeline and the panel |
| round and key time | R3 1:15, on the round clock |
| kind | mistake, good play or missed chance, shown as glyph and word |
| category | Peek, Rotation, Utility… |
| pick | "Lost mid control and the round" |
| finding, why, instead | See the panel below |
| evidence | Findings with IDs and times |
| pattern | Last-7-matches history |
| related | Other moments in this match |

The rail shows the glyph, title and round clock. The pick reason is visible only on the current item. Viewed moments get a ✓ (marked "Seen").

**Switching moments.** `selectMoment()` runs one coordinated change:

1. The rail indicator moves with Flip (180ms).
2. The panel text crossfades (80ms out, 140ms in).
3. The radar camera pans to the new area (320ms).
4. Playback starts about 5s before the key time and pauses at the decision.

Keyboard switching (`[` and `]`) is instant. Status: implemented.

## Gameplay

This is the rendered clip. Status: **mocked**.

- In the prototype, the clip is a canvas scene drawn by `renderGame()`. A caption says "Placeholder for the rendered clip".
- Planned: clips rendered by a CS Demo Manager CLI worker on a local PC first, then on an Azure GPU VM. Whether Steam login works on the VM is an open risk.
- The clip is 20s (`DUR`) in the sample. Real clip length is unknown.

## Radar

This is the tactical reconstruction on a simplified map. See [07](./07-RADAR-SYSTEM.md). Status: prototype with a hand-drawn map.

## Synchronisation

Gameplay and Radar are two views of one moment and one clock (`S.t`). Switching views keeps all of these, because none of them is stored per view:

- the timestamp
- the active overlays and event
- the round and the selected moment
- the Coach context (its "Knows ..." line updates the view name)

Status: implemented.

## Analysis panel

This is the content hierarchy, in order. Status: implemented with hand-written text.

1. **Header:** glyph, shared label (outlined while its annotation is on screen), round clock, the Analysis and Ask tabs, and the hide button.
2. **Key finding:** one sentence, 20px, 600 weight, for example "You peeked Connector alone with no flash and died untraded."
3. Kind and pick reason: "Mistake. Picked because: lost mid control and the round."
4. **Why:** two lines of serif text.
5. **Next time**, or **Keep doing** for good plays: one actionable sentence.
6. **Collapsed disclosures:**
   - Evidence: the finding count is shown in the summary; rows seek when clicked.
   - Last 7 matches: dots in the summary; the text and the matches it occurred in are revealed on open.
   - Related in this match: links to other moments.
7. "Next moment: ..." link.
8. The Coach entry at the bottom (Ask tab). See [09](./09-AI-COACH.md).

**Progressive disclosure:** the first screen answers what happened, why it matters and what to do differently. Numbers and history are one click away. The Coach is for depth.

## Controls

| Control | Action | Keyboard |
|---|---|---|
| Play and pause | Toggle playback | Space (unless a button or the slider has focus) |
| Previous and next event | Jump to the adjacent event time (`stepEvent()`) | `,` and `.` |
| Seek | 1s steps (0.1s with Shift) | ← → |
| Stop at the decision | Pause automatically at the key time (on by default) | |
| Speed | 1×, 0.5×, 0.25× | |
| Gameplay and Radar | Swap the views | `V` |
| Whole map and This moment | Toggle the radar camera framing | |
| Fullscreen | Stage fullscreen (`requestFullscreen`) | |
| Hide and show panel | Desktop only | |
| Ask | Focus the Coach input | `/` |
| Back to Analysis | Leave the Ask tab | Esc |
