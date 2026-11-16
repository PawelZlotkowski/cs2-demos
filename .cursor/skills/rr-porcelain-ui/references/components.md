# Porcelain components

Each entry lists anatomy, tokens, states, the data it reads and where it lives. Contract types are in `apps/web/src/lib/contracts/index.ts`. Paths are under `apps/web/src/`. Sizes are at 1440 × 900.

---

## 1. Header capsules (`app/layout.tsx`, `components/NavLinks.tsx`)

- **Nav capsule:** `.glass`, height 48, radius `--r-pill`, padding 6. Brand bead (36px ink circle with the logo mark), then links Home, Matches, Progress, Coach as 36px pills. The active link sits on a white bubble (`--surface-raised`, `--shadow-pill`) that slides between links with `--ease-spring` / `--dur-spring-quick` (measure the link with `getBoundingClientRect`, move the bubble with `transform` and `width`).
- **Score capsule** (Studio only, portalled into `#bar-match`): map name in `--text-3`, final score with `.num` at 22px, then the **round history**: one 8 × 18 pill per round, filled `--side-t` or `--side-ct` by the side that won it, a 6px gap at the half, the current round with a 2px ink ring offset 2px. Each pill is a button (aria-label "Round 12, counter-terrorists won") that jumps to the round. Data: the round results already used by `components/review/RoundStrip.tsx`.
- **Add match:** primary ink pill, height 48.
- **Account:** 48px glass bead with the initial (`components/auth/AccountMenu.tsx`).
- Remove `ThemeSelect` from the bar. Porcelain is light only for now.
- `SystemNotice` becomes a state of the status island (§2).

## 2. Status island (new: `components/StatusIsland.tsx`)

A dark pill (`#0E0F12`, white text) centred under the header or replacing the score capsule while something is running. It morphs between widths with a spring (animate `width` with the FLIP technique; never animate `height` of text).

| State | Content | Source |
|---|---|---|
| Upload | "Uploading match.dem.zst" + real percent | upload progress events |
| Processing | stage label + "stage 5 of 10" | `MatchStatus`, stages from `/processing/[id]` polling |
| Coach working | current tool label + elapsed ms | `AskEvent` `step` events, labels from `STEP_LABELS` |
| Checked | "Coach checked its answer" + model name | `AskEvent` `answer.verified`, `MomentExplanation.source` |
| Problem | what failed + what to do | `SystemStatus.checks` with state `problem` |

Never show a percentage that is not measured. A ring is allowed only for the real upload percentage.

## 3. Moment stack (extract from `app/studio/[matchId]/page.tsx` lines ~1096–1233 into `components/review/MomentStack.tsx`)

- `.glass` sheet, width `--reel-w` (276), radius 28, padding 12. Header row "Six moments" and "2 seen".
- **Row:** height 40, radius 16, grid `32px 1fr auto`: moment number (`.num`, 17px, `--text-4` when not active), title 14px 600, glyph (triangle `--mistake` or circle `--good`, 10px). Hover tint `--tint-1` on fine pointers only.
- **Active row expands** (Expand card) into a white tile (`--surface-raised`, radius 16, `--shadow-pill`): 52px radar thumbnail (radius 14, dark stage, map image positioned so the lens focus is centred, your side-coloured dot with a white ring), number + glyph, title 14.5px 700, "Round 12 at 0:41, Canal", then `SelectedMoment.pickedBecause` in `--text-3`. Height animates with `--ease-spring`.
- Seen moments keep their number in `--text-4`; there is no tick mark.
- **Debrief:** 40px `--tint-2` pill at the bottom.
- Data: `Moment[]`, `SelectedMoment[]` (pickedBecause, kind), seen state as today.

## 4. Stage (`.stage-wrap` in `styles/studio.css`)

- `--stage` background, radius 28, `--shadow-stage`, padding 12. Fills the column between the moment stack and the coach sheet, from y 80 to the bottom gutter.
- Children in order: team HUD (§5), radar (§6) with lens (§7) and kill feed (§8), playback dock (§9).
- The radar never sits under the dock or the HUD: size the square radar to `min(stage width − 24, stage height − HUD − dock − 36)`.

## 5. Team HUD (new: `components/replay/TeamHud.tsx`)

- 48px row at the top of the stage. Left: the five T slots. Right: the five CT slots. Centre: T round score (`--side-t`, `.num` 22px), "Round" over the round number, CT round score (`--side-ct`).
- **Slot:** 50 × 36, radius `--r-ctl`, background `rgba(255,255,255,.07)`, the health number (`.num` 12.5px) above a 3px health bar in the side colour, filled to health %. Dead: 40% opacity with an × in the side colour. Your slot: inset 1.5px white ring. aria-label "kestrel, 64 health".
- Data: `RoundReplay.players` (`team` gives the side for this round), the current interpolated sample (`SamplePlayerState.health`, `alive`). Round score before this round: count wins by side from the round results.

## 6. Radar (`components/replay/RadarView.tsx`)

Change, keep the props:
- **Map image:** full colour, `filter: saturate(.9)` at most. Remove any grayscale, brightness or contrast filter.
- **Players are coloured by side**, not by role. Dot radius 13 radar units at 1024 (scale with `pxPerUnit` as now), `--stage-halo` outline 3, a triangular facing tick from `yaw` (tip at r+9, base at r+2, ±25°), same fill.
- **You:** same side colour, plus a 2.4px `--stage-you` ring at r+4 and the label "You".
- **Labels:** only you and the players involved in the current moment. White 12–13px text, 600–700, with a 3.5px `--stage-halo` stroke (`paint-order: stroke`).
- **Dead:** an × in the side colour at 80% opacity.
- **Your recent path:** last 4 s as a dotted line (`stroke-dasharray: 2 9`, round caps) in your side colour.
- **Utility:** smoke as a `--stage-smoke` circle, molotov as a `--stage-fire` area, only while active. No view cones on the full map.
- Keep the camera tween and moment path code paths; restyle only.

## 7. Lens (new: `components/replay/RadarLens.tsx`) — the signature

- 168px circle, `overflow: hidden`, `--shadow-lens`, positioned on the radar at the moment's focus point.
- **Focus point:** centre of the moment camera box (the `Box` already computed for the camera tween), else the midpoint of you and the opponent in the moment's first kill or death event.
- **Content:** the same map image and a second, small SVG with only the players involved, your path and a dashed white line of fire from you to the opponent, scaled 1.8× about the focus point (`transform: scale(1.8)` with `transform-origin` at the focus, inside the clipped circle).
- **Behaviour:** appears with the moment (scale 0.92 → 1 and blur 6px → 0 together, `--dur-spring`); follows the playhead within the moment; hides on "Whole map", outside the moment window, and in Clip view. Keyboard: `L` toggles it. Reduced motion: appears instantly.
- No caption, no label plate under it; the coach sheet carries the words.

## 8. Kill feed (new: `components/replay/KillFeed.tsx`)

- Top right of the stage, under the HUD. Up to 2 rows, each a 30px `--stage-plate` pill: attacker name in their side's `*-on-dark` colour, weapon in `--stage-text` (`.num`, 11.5px, 700) if the event label carries it, victim name in their side's colour. A headshot adds a small "HS" after the weapon.
- Shows kills with `t` in the last 5 s before the playhead; rows leave after 5 s with a 150ms fade.
- Data: `ReplayEvent` with `type` kill, `actorId`, `victimId`, `label`.

## 9. Playback dock (`.dock`, `components/replay/ReplayTimeline.tsx`)

- Inside the stage, inset 12, radius 16 (28 − 12), background `rgba(251,249,245,.94)` with `--glass-filter`, padding 10 14.
- **Transport row:** 40px ink play button (icon nudged 1px right), clock `.num` 24px, "of 1:55" in `--text-3`, spacer, Radar / Clip segmented control (§13), speed pill "1×".
- **Coach lane:** a 20px `--tint-1` track. The current moment's window is a pill in `--mistake-soft` or `--good-soft`; findings are 10px glyphs in `--mistake` / `--good` with a 2px panel-colour ring. Clicking a glyph seeks.
- **Alive graph:** 24px, mirrored around the centre line: T players alive above in `--side-t`, CT below in `--side-ct`, stepped. Bomb plant and defuse as 8px diamonds on the centre line.
- **Axis:** 11px `--text-3` labels at 0:00, 0:30, 1:00, 1:30 and the end.
- **Playhead:** 2px ink line across the lane and graph; a 20 × 12 white capsule handle appears on hover and while dragging (fine pointers).
- The separate Bomb and Utility lanes are folded into the alive graph and the radar.

## 10. Clip view (`components/replay/GameplayView.tsx`, `PovClip.tsx`)

- The video fills the stage area between the HUD and the dock, radius 16, black letterbox.
- Recorder off or clip failed: on the stage, `--stage-text` 15px "The clip recorder is off on this PC. The radar shows the same moment." and a white pill "Show radar". Never a spinner without a reason.

## 11. Coach sheet (`aside.ctx`)

- `.sheet`, width `--coach-w` (380), radius 28, padding 12, gap 16, from y 80 to the bottom gutter.
- **Tab pill:** Analysis, Ask, Round, Notes (§13 style, 40px).
- **Analysis**, in order:
  1. Meta: glyph + "Mistake, moment 2 of 6" (13px `--text-3`).
  2. Title: 24/29, weight 720, `--track-display`, `text-wrap: balance`. From the explanation's first sentence or `Moment.title`.
  3. Prose: 15/24 `--text-2` through `components/coach/CoachText.tsx`, with citation chips (§12).
  4. Evidence tiles: 2 × 2 grid, gap 8, from `Moment.ev` rows `[label, value, findingId, clipTime]`. Value `.num` 22px with its unit at 13px `--text-3`, label 12.5px. The tile whose finding is hovered or selected turns `--accent-soft`. Clicking a tile seeks to `clipTime − 3` and pauses.
  5. Verifier tile (radius 16):
     - `source === "agent"` and no `verifierErrors`: `--good-soft`, green check bead, "**Checked.** Every claim matches the findings it cites. Written by {model} on our own GPU."
     - `source === "template"`: `--tint-1`, "Written from the finding templates. The coach model is off."
     - Never claim a check that did not run.
  6. Practise: the `PracticeDrill.title` for this detector, plus "came up in N of your last M matches" only when `Pattern.occurrences` exists.
  7. Ask composer pinned to the bottom: a 48px white pill with a `--border` ring, placeholder "Ask about this moment", 36px ink send bead with an up-arrow icon.
- **Ask tab:** no chat bubbles or avatars. The question is a 15px 650 line; the answer is prose with chips. While answering, the status island shows the live tool steps and the sheet shows a collapsible "Steps" list (tool label + ms). Answer blocks materialise one by one (opacity and 4px blur to 0, `--dur-spring-quick`). Each answer ends with its own verifier line. A Stop pill cancels.

## 12. Citation chip (`components/coach/CoachText.tsx`)

- A real `<button>`: a 22px pill, `--tint-2`, 11.5px 650, `font-stretch: 110%`, label F07, R12 or 0:41.
- Hover or focus: `--accent-soft` fill with a 1.5px `--accent-strong` ring. The matching evidence tile, timeline glyph and lens highlight together.
- Click: seek to the evidence time − 3 s and pause.

## 13. Pills, tabs and segmented controls

- **Track:** `--tint-2`, `--r-pill`, padding 3–4. **Bubble:** `--surface-raised` with `--shadow-pill`, sliding with `--ease-spring` / `--dur-spring-quick` (DesignBookmark "Tab pill" and "Segmented control" behaviour).
- **Buttons:**
  - Primary: ink pill, white 650 text.
  - Secondary: white pill with `--shadow-pill`.
  - Quiet: `--tint-2` pill.
  - Accent: the pink fill is only for the "new match" bead.
- Heights: 48 in the header, 40 inline, 34 in the dock, 28 inside tracks. Press: `scale(.97)` over `--dur-press`. Hover only under `(hover: hover) and (pointer: fine)`.

## 14. Match folder (new: `components/MatchFolder.tsx`, used on `/matches` and Home)

- 400 × 280 at desktop (fluid: `aspect-ratio: 10 / 7`).
- **Back plate:** radius 24, the map's radar image on a map tint (Anubis `#E9DCC6`, Ancient `#DCE5D6`), `--shadow-sheet`.
- **Front pane:** frosted (`rgba(250,248,244,.58)` with a 16px blur) shaped as a folder with a tab. Use an SVG `clipPath` with `clipPathUnits="objectBoundingBox"` so it scales, plus a 1.5px white top edge drawn by an SVG path.
- **Content:**
  - Map name.
  - Score: `.num` 42px; the losing number in `--text-4`.
  - Won/Lost pill: `--accent-soft` or `--tint-2`.
  - Date and player.
  - Next moment, or "Reviewed, 5 clips".
  - Seen dots: 8px.
  - 44px ink action bead.
- **States:**
  - Processing: an island bar inside the folder with the stage label and "stage 5 of 10".
  - Failed: what failed and a Retry pill.
  - Unsupported map: "Mirage is not supported yet".
  - The **New match** folder: a dotted back plate and a 52px pink plus bead.
- The whole folder is one link with a full aria-label.

## 15. Processing (`app/processing/[id]/page.tsx`, `components/processing/PlayerPicker.tsx`)

- The status island at the top, large.
- **Player sheet** (`.sheet`, radius 28): "Who should the coach review?" 28px.
  - Two columns headed "Started T" and "Started CT", each with a side-coloured dot.
  - Players as 44px pill rows: a 28px bead in the side colour with the initial, then the name. The selected row is white and raised with a 2px `--accent-strong` ring and a check.
  - Arrow keys move between rows (keep the current keyboard logic).
- **Focus:** four pill options (Overall, Shooting, Utility, Teamwork); the selected one is white and raised.
- **Language:** English / Polski segmented control.
- **Start review:** an ink pill, 48px, full width of its column.
- **Run log:** a glass list of the real stages with timings. The finished check marks pop in with `--ease-spring-bounce` (the only bounce in the app). Pending stages are `--text-3`.

## 16. States

- **Empty:** say what the place is for and give the one action ("Drop a demo to review it").
- **Loading:** shaped skeletons in `--tint-1`, never spinners on the stage.
- **Model off:** coach sheet verifier tile in its template state; the island says "Coach model is off. Explanations use the finding templates."
- **Recorder off:** §10.
- **Error:** what happened and what to do, in the interface's voice, no apology.

## 17. Motion summary

| What | How |
|---|---|
| Bubble in pills and tabs | transform + width, `--ease-spring`, `--dur-spring-quick` |
| Moment row expanding | height and opacity, `--dur-spring` |
| Radar camera to a moment (pointer) | existing GSAP tween, `ease: "power2.inOut"`, 0.32 s; keyboard jumps |
| Lens in and out | scale .92 → 1 + blur 6px → 0, `--dur-spring` |
| Island morph | width (FLIP) + content cross-fade 150ms |
| Answer blocks | opacity + blur 4px → 0, staggered by arrival only (not by a timer) |
| Run-log check | scale .6 → 1, `--ease-spring-bounce` |
| Press | scale .97, 120ms |

Never animate on page load, never stagger cards, never loop.
