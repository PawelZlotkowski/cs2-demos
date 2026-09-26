# 14 Responsive behaviour

Related: [02 UX architecture](./02-UX-ARCHITECTURE.md), [05 Analysis Studio](./05-ANALYSIS-STUDIO.md), [17 Testing](./17-TESTING-QA.md)

The principle: **collapse secondary UI before shrinking the analysis stage.**

The breakpoints in the prototype CSS are `max-width:1180px` for tablet and `max-width:720px` for mobile. The sizing logic is in `fitStage()`.

## Desktop (above 1180px)

- **Grid:** rail 184px | work column | panel 332px. Hiding the panel (`.panel-off`) removes the third column.
- **Stage:** 16:9, as large as the width allows and top-aligned. The transport is directly underneath.
- **Spare height:** if the stage is limited by width, the timeline lanes grow from 22px up to 34px.
- **Rail:** vertical; the pick reason shows only on the current item.
- **Panel:** full analysis, with the Coach at the bottom and the Analysis and Ask tabs in the header.
- **Hover:** tooltips, the ghost playhead and hover fills.

Checked by screenshot at 1440×900 and 1920×1080.

## Tablet (721 to 1180px)

- **Rail:** a horizontal strip of one-line items (176px wide, truncated). The pick reason is hidden.
- **Panel:** a right-hand **drawer** (up to 392px) over the content, opened by the "Analysis: <label>" button in the transport. It has a shadow, because it really floats.
- **Stage:** full width of the work column, limited by height. The spare width becomes side bars.
- **Panel hide and show buttons:** hidden. The drawer replaces them.
- **Timeline:** same as desktop.

Checked by screenshot at 1024×768 and 834×1194.

**Known issue at 834×1194 (portrait):** the stage is limited by width, and about 200px is left empty below the timeline. The "Analysis: <label>" button also wraps onto its own row. Consider using the mobile bottom-sheet pattern for portrait tablets (see [18](./18-CURRENT-STATE.md#known-responsive-issues)).

## Mobile (720px and below)

- **Top bar:** "Add demo" becomes "Add", and the match label is hidden.
- **Rail:** horizontal and scrollable. Titles are truncated.
- **Stage:** full-bleed at 16:9 with no radius.
  - Hidden: the caption, the legend and secondary annotation labels (`pri:2`). Secondary shapes stay.
  - Primary annotation labels drop to 11px and flip away from the edge.
- **Transport:** wraps onto two rows. The "now" label and the speed control are hidden.
- **Timeline:**
  - the lane label column shrinks to 52px
  - lanes are a fixed 30px (the spare-height growth is overridden on mobile, see [18](./18-CURRENT-STATE.md#technical-debt))
  - Coach-lane marker labels are hidden and only the glyphs remain
  - markers are still 22px, which is below the 24px target
- **Analysis:** becomes a **bottom sheet** (72vh maximum).
  - **Collapsed (104px):** the grabber, a header row with the glyph, label, round clock and the Analysis and Ask tabs, and the key finding clamped to two lines.
  - **Detents:** collapsed, half (about 58% of the sheet visible) and full.
  - **Drag:** the grabber, the header and the summary line are all drag handles. A flick over 0.11 px/ms snaps in its direction, and there is friction past the top.
  - **Tap:** a tap on a handle toggles between collapsed and half. A tap on the stage collapses the sheet.
  - Focusing the Coach input opens the sheet fully.
- **Hover:** no hover-only information. Everything is also available on tap.

Checked by screenshot at 390×844 and 430×932, and with a synthetic tap. **Not verified on real touch hardware.**
