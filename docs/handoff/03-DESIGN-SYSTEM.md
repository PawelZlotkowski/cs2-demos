# 03 Design system

Related: [04 Anti-AI rules](./04-ANTI-AI-DESIGN-RULES.md), [11 Motion](./11-MOTION-SYSTEM.md), [13 Accessibility](./13-ACCESSIBILITY.md), [22 Changelog](./22-CHANGELOG-DESIGN.md)

All values below are taken from the `:root` block and styles in [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html).

> **Conflict:** according to project history, the main repository's `docs/DESIGN.md` and the "CS2 Round Reviewer" design-system artifact describe an **earlier** direction:
>
> - olive-tinted dark OKLCH palette
> - chartreuse `#d4ed5c` accent
> - Big Shoulders Display, IBM Plex Sans and IBM Plex Mono
>
> Resolved by [decision 21](./19-DECISIONS.md) (27 Sep 2026): the **Analysis Studio** direction below is canonical, in a light and a dark theme. The olive-dark direction is dropped.

## Colour (semantic roles)

Colour carries meaning only:

- orange means mistake
- blue means good play
- neutral ink means selection, focus, links and structure

| Token | Light | Dark | Role |
|---|---|---|---|
| `--surface-page` | `#E8EBEE` | `#131619` | App background |
| `--surface-panel` | `#F5F6F7` | `#1A1E22` | Rail, panel, top bar |
| `--surface-raised` | `#FFFFFF` | `#21262B` | Inputs, selected rail item, raised controls |
| `--text` | `#15181C` | `#E7EAED` | Primary text, filled buttons, playhead, selection outlines |
| `--text-2` | `#3F4751` | `#B8C0C8` | Secondary text |
| `--text-3` | `#59616B` | `#98A1AA` | Metadata (meets 4.5:1 on the page background) |
| `--border` | `#D0D5DA` | `#30373D` | Structural borders |
| `--border-soft` | `#E0E4E8` | `#262C31` | Separators, hover fill |
| `--negative` | `#B04512` | `#F28C4C` | Mistake, missed chance, error text |
| `--positive` | `#2A52D6` | `#8FA9FF` | Good play only |
| `--focus-ring` | `#15181C` | `#E7EAED` | Focus outline |

Stage tokens stay the same in both themes because the stage is always dark:

| Token | Value | Role |
|---|---|---|
| `--stage` | `#0F1214` | Stage background |
| `--stage-line` | `#2A3137` | Picture-in-picture outline |
| `--stage-text` | `#EEF1F3` | Text on the stage |
| `--stage-text-2` | `#A6AEB6` | Secondary text on the stage |
| `--stage-pos` | `#8FA9FF` | Good play on the stage |
| `--stage-neg` | `#F28C4C` | Mistake on the stage |

Both themes ship ([decision 21](./19-DECISIONS.md)). With no stored choice the chrome follows `prefers-color-scheme`; the top bar's System / Light / Dark control sets `data-theme` on `<html>` and stores it as `rr.theme` in localStorage, and an inline script in `<head>` applies it before first paint. Checked in screenshots at 1440 and 390 px on 27 Sep 2026 (Home, Upload, picker, Studio, Ask, not-found).

Fonts are bundled with the app from `@fontsource/hanken-grotesk` and `@fontsource/newsreader`, so nothing loads from Google Fonts at runtime.

**Technical debt:** the JS repeats stage colours as literals instead of reading tokens:

- `POS`, `NEG` and `STX` in the script
- the team colour `#9AA4AE`
- the map fills `#20272D` and `#343D45`, and the label colours `#8C97A1` and `#3A434B`
- the zone fill `rgba(242,140,76,.14)`

There is no success or green token, on purpose (red and green are avoided, see [13](./13-ACCESSIBILITY.md)). There is no separate error token: `--negative` is reused for validation errors.

## Typography

- **UI and data:** Hanken Grotesk 400, 500 and 600 (`--ui`).
- **The Coach's voice:** Newsreader 400 (`--serif`). Used only for Why explanations, Coach answers, Home's focus line and the history answer.
- `font-variant-numeric: tabular-nums` is set on `body`, so times and counts line up.
- Type scale (the only sizes allowed, noted in `:root`):

| Size | Use |
|---|---|
| 11 | Timeline scale, overlay tags, legends, the pip label |
| 12 | Metadata, lane labels, section labels |
| 13 | Secondary text, rail titles, controls |
| 14 | Body |
| 16 | Serif explanations, clock |
| 20 | Key finding |
| 26 | Home headline (22 on mobile) |

- **Weights:** 600 for titles, values and the Coach lane; 500 for controls; 400 for everything else.
- **Line heights:** 1.45 body, 1.5 to 1.55 serif, 1.2 to 1.3 headings.
- Headings use `text-wrap: balance` and paragraphs use `text-wrap: pretty`.
- Labels are sentence case, never uppercase, and never a kicker above a heading.

## Spacing

There are no spacing tokens. Values are literal:

- 8px gaps inside a group, 12 to 16px between groups
- 24 to 48px between Home sections
- Stage wrap: `8px 8px 0`
- Transport: `6px 8px 2px`
- Timeline: `0 8px 10px`
- `--lane-h` is 22px at its base and grows up to 34px on desktop and tablet to use spare height (see `fitStage()`). On mobile, a fixed `height:30px` rule overrides it, so the 40px growth that `fitStage()` computes has no effect (technical debt, [18](./18-CURRENT-STATE.md#technical-debt))

**Technical debt:** spacing tokens do not exist yet.

## Radius

The design deliberately moved away from large uniform rounding:

| Radius | Where |
|---|---|
| `--r-ctl` 4px | Controls and the stage |
| `--r-panel` 6px | Panels, the drop zone, the Home map |
| 2 to 3px | Overlay labels, clusters, tooltips |
| 10px | Top corners of the mobile sheet only |
| 50% | Only the play button and dot glyphs |

## Borders

- `--border` marks region edges: rail, panel, top bar, timeline Coach lane, table headers.
- `--border-soft` marks separators inside a region.
- Group with space first, then background, and use lines last.
- Bordered controls only where a control must read as a control (`.btn-line`).

## Elevation

- Shadows only where something actually floats over content: the tablet drawer (`-10px 0 28px rgba(0,0,0,.10)`) and the mobile sheet.
- Static content never has shadows.
- The tooltip is solid ink with no shadow.

## Icons

- There is no icon library. Icons are inline stroke SVGs at about 1.4 to 1.7px stroke.
- Allowed only where they are the convention:
  - play and pause
  - previous and next event
  - fullscreen
  - panel hide and show
  - disclosure chevron
- There are no decorative icons, and no icon on the Add or Ask buttons.
- **Moment glyphs are not icons. They carry meaning by shape:**
  - filled triangle for a mistake
  - filled circle for a good play
  - hollow diamond for a missed chance
  - hollow square for a note ("A falls")

## Components (prototype class names)

| Component | Class | Behaviour |
|---|---|---|
| Filled button | `.btn .btn-fill` | One per view: Review on Home, the sample match on Upload. In the Studio, the play button is the single filled action |
| Line button | `.btn .btn-line` | Secondary actions. Border darkens on hover (hover-capable devices only) |
| Press feedback | `:active` | `scale(.97)` over 140ms (`.94` on play) |
| Segmented control | `.seg` | Gameplay and Radar, with a sliding pill that transitions its transform over 200ms |
| Text question | `.q` | Underlined text rows for suggested questions. Never pills |
| Link | `.link` | Ink with a soft underline that darkens on hover |
| Citation | `.cite` | `F12`, dotted underline. Seeks to the finding |
| Reference | `.ref` | Timestamp or moment reference inside a Coach answer |
| Disclosure row | `.more details` | Label on the left, aside (count or dots) and chevron on the right |
| Moment rail item | `.mom` | Selected item is a raised surface with a border. The indicator moves with Flip |
| Timeline marker | `.mk`, `.mk-ins` | See [08](./08-TIMELINE-SYSTEM.md) |
| Stage annotation | `.anno` | See [06](./06-VIDEO-OVERLAY-SYSTEM.md) |
| Tooltip | `.tip` | Ink background, 120ms. Instant once another tooltip is already open |
