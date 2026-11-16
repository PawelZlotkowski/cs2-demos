# Porcelain screens

Routes under `apps/web/src/app/`. Component numbers refer to `components.md`.

## Shared shell (`app/layout.tsx`)

- `body` background `--surface-app`. No top bar strip: the header is floating capsules at top 16, side 20 (§1).
- Fonts: replace the Hanken, Newsreader and Archivo imports with Mona Sans: `npm i @fontsource-variable/mona-sans`. Import the file that includes the width axis; check `node_modules/@fontsource-variable/mona-sans/` for `wdth.css` or `full.css`, and use `"Mona Sans Variable"` as the family. Keep Archivo installed until no CSS refers to it, then remove it.
- Remove `ThemeSelect` and the dark token blocks; keep `themeBootScript` out.
- Content starts at y 80 (`--header-h`).

## Studio (`app/studio/[matchId]/page.tsx`, `styles/studio.css`) — the showcase screen

Desktop (≥1180 px), three regions, all sized from tokens:

| Region | x | width | material |
|---|---|---|---|
| Moment stack (§3) | 20 | 276 | glass |
| Stage (§4–§10) | 312 | fills | dark stage |
| Coach sheet (§11) | right 20 | 380 | solid sheet |

Gaps are 16 between regions and 20 to the edges. All three run from y 80 to 20 above the bottom; the moment stack is as tall as its content.

`.studio` grid becomes `grid-template-columns: var(--reel-w) minmax(0, 1fr) var(--coach-w); gap: var(--gap); padding: var(--header-h) var(--gutter) var(--gutter);`. `.panel-off` drops the coach column, and the stage takes the width.

Tablet (720–1179 px):
- The moment stack becomes a horizontal glass pill strip above the stage (numbers and glyphs only; the active one shows its title).
- The coach sheet becomes a right drawer, 360 wide, opened by a glass pill "Coach" on the stage's top right. It slides with `--ease-spring`.
- The HUD keeps its slots and drops the round label.

Phone (<720 px, decision 14 still holds):
- Header: brand bead, score, menu bead.
- Moment pills scroll horizontally.
- The stage is full width with radius 20 and a compact HUD of 5 + 5 short health bars (bars, not rings).
- The dock sits under the stage, transport only plus a 4px scrubber.
- The coach is a bottom sheet with a grab handle. Collapsed, it shows the meta line, the title and the verifier tile; expanded, everything. All inputs are 16px so iOS does not zoom.

Keyboard (unchanged): Space plays, ← → steps, N next moment, L toggles the lens, `/` focuses Ask, Escape closes the drawer or sheet.

## Matches and Home (`app/matches/page.tsx`, `app/page.tsx`)

- **Matches:**
  - Title "Your matches" 36px 720, a count in `--text-3`, and a map filter segmented control (All, Anubis, Ancient) on the right.
  - A grid of match folders (§14), 3 columns of 400 at desktop with gap 28, 2 columns on tablet, 1 on phone.
  - The first folder is the newest. The last tile is "What keeps coming back": a radius-24 `--glass` panel with up to 3 recurring findings as 40px tinted pills, e.g. "Shot while moving, 3 of 5 matches".
  - Data: the existing match list and `PatternsResponse`.
- **Home:**
  - The newest unfinished match as one large folder (840 × 360) with "Continue review" and its next moment.
  - Then "What keeps coming back".
  - Then "Ask across matches": a 48px Ask pill that hands off to `/coach`.
  - No greeting and no stat tiles.

## Upload (`app/upload/page.tsx`)

- One large drop folder centred under the header: the back plate is dotted (`radial-gradient` dots in `--tint-2`), the front is frosted, and it reads "Drop a demo to review it" with the accepted formats and maps.
- Dragging over it: the front pane lifts 4px and the dotted back turns `--accent-soft`.
- After drop: the status island takes over with the real upload percent, then routes to processing.
- Wrong file: the error shows inside the folder, saying how to fix it.

## Processing (`app/processing/[id]/page.tsx`)

- The status island at the top centre, large (height 56).
- **Waiting for setup:** the player sheet (§15) centred, max width 880. The run log is a narrow glass column to its right on desktop and below it on smaller screens.
- **While parsing and analysing:** the radar plate appears as soon as the replay exists (radar works from `awaiting_player`), with a "Watch the radar" pill, so the teachers see the map while the coach works.
- **Completion:** the island shows "Review ready", then the page routes to the Studio. A spring cross-fade of the island is the only transition.

## Coach page (`app/coach/page.tsx`)

- The same solid sheet as the Studio coach column, centred, max width 760, with the Ask, Plan and Knowledge tabs as a tab pill.
- Answers follow the Ask tab rules (§11). Citations to other matches (M2) open that match's folder.

## Sign-in, welcome, settings (`app/signin`, `app/welcome`, `app/settings`)

- A single `.sheet` (radius 28, max width 440) centred on the bone ground, with pill inputs (48px, white, `--border` ring) and a full-width ink pill button.
- The Steam sign-in keeps Steam's own button rules.

## Shared review (`app/r/[token]/page.tsx`)

The Studio without the Ask composer and without edit controls, with a quiet pill "Shared review, read only".

## Admin (`app/admin/**`)

Tokens only for the showcase. Do not restyle the admin pages beyond what the new tokens change automatically.

## Optional for the showcase: How it works (`app/about/page.tsx`)

One page for the teachers, linked from the account menu:
- Headline: "Find the rounds that cost you, and see why."
- The real pipeline as a row of 8 glass pills joined by a line: Upload, Parse, Choose a player, Detect, Select moments, Explain, Verify, Record. Group the four model steps under "On our own GPU, Qwen3-14B".
- Three short reasons to trust it: numbers come from code; evidence is one click away; it says when a part is off.

Only build this after the Studio, Matches and Processing are done.
