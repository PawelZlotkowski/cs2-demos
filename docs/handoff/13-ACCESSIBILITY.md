# 13 Accessibility

Related: [08 Timeline](./08-TIMELINE-SYSTEM.md), [11 Motion](./11-MOTION-SYSTEM.md), [17 Testing](./17-TESTING-QA.md)

## Implemented in the prototype

- **Native elements:** every control is a `<button>` or `<input>` with a `<label>`, including markers, clusters, rail items, evidence rows, citations and references.
- **Focus:** `:focus-visible` shows a 2px outline in `--focus-ring` with a 2px offset. On the dark stage the outline switches to `--stage-text`.
- **Focus return:**
  - hiding the panel focuses the show button, and the reverse
  - opening the tablet drawer focuses the key finding, and closing it focuses the toggle
  - Esc closes the drawer
- **Timeline scrubber:** `role="slider"` with value min, max, now and text (round clock). Arrow keys, Shift+arrow, Home and End. See [08](./08-TIMELINE-SYSTEM.md#accessibility-semantics).
- **Global keys:**

| Key | Action |
|---|---|
| Space | Play or pause |
| ← → | Seek |
| `,` `.` | Previous or next event |
| `[` `]` | Previous or next moment |
| `V` | Swap Gameplay and Radar |
| `/` | Ask |
| Esc | Close |

  Keys are ignored while typing in an input. Space is ignored when a button, slider or summary has focus.
- **PiP:** `role="button"` and focusable, with the label "Show radar" or "Show gameplay". Enter or Space swaps the views.
- **Moment information is never colour alone:** the glyph shape plus a word ("Mistake", "Good play", "Missed chance"). Blue and orange also differ in lightness.
- **Contrast:** `--text-3` was raised to 4.5:1 on `--surface-page`. No text is below 11px.
- **Hit areas:** timeline markers are 22px on fine pointers and 24px under `(pointer: coarse)`.
- **Hover:** hover styles are wrapped in `@media (hover: hover) and (pointer: fine)`.
- **Reduced motion:** see [11](./11-MOTION-SYSTEM.md#reduced-motion).
- **Live region:** Coach answers (`#thread`, `#homeAnswer`) and the processing list use `aria-live="polite"`.
- **Mobile inputs** are 16px to stop iOS from zooming.
- **Canvas:** the gameplay canvas has `role="img"` with a label. The radar SVG has `role="img"` with a label.
- **Touch markers:** 24px under `(pointer: coarse)` (22px on fine pointers).
- **Tabs:** Analysis and Ask use `role="tab"`, `aria-controls` and `role="tabpanel"`. Arrow-key tab navigation is still missing.

## Partial or unresolved

- **Tooltips** are visual only. Each marker's `aria-label` carries the same information, but it isn't linked with `aria-describedby`.
- **Stage content** has no text alternative for what the overlays show. The planned alternative is an accessible event list and the panel text; this needs review.
- **Streaming text** updates the live region every 28ms. Screen readers may announce fragments. Planned fix: announce the complete answer once.
- **The mobile sheet** has no keyboard way to change its snap state. The tabs do work.
- **Cluster buttons** only jump to the first event; the other events in the cluster can't be reached individually by keyboard.
- **Not tested:**
  - screen readers (VoiceOver, NVDA)
  - 200% zoom
  - forced colours
  - dark theme contrast
  - real touch devices

Do not claim any of these as verified.
