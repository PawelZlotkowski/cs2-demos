# Match room: handoff brief

Written 27 October 2026 so another assistant can continue this work without the original chat. It covers what was decided, what exists, how it works and what is left. Attach these files with this brief:

- `prototype/match-room.html` (the prototype, one file)
- `prototype/fixtures/extract_match_room.py` (data extractor)
- `prototype/fixtures/match-room.json` (real match data, 209 KB)
- `AGENTS.md` (repo rules)
- Optional: `docs/handoff/04-ANTI-AI-DESIGN-RULES.md`, `docs/handoff/28-VISUAL-DIRECTION.md`, `apps/web/src/lib/contracts/index.ts`, `apps/api/app/analysis/stats.py`

## 1. Goal

Build a FACEIT-style **match room** for Round Reviewer, the owner's self-hosted CS2 demo review app (`cs2-demos-studio`). It should feel close to FACEIT's match room, but in the owner's own style and colours, not a one-to-one copy. The order is: **prototype first, owner reviews and changes the design, then build it into `apps/web`**.

Status: the prototype is done and verified. The owner wants to change parts of the design before building (the list is still to come; see section 10). Nothing is committed. The work is on branch `design/match-room-prototype`. That branch also carries the owner's unrelated, uncommitted `pr-24` changes in the working tree; do not touch, revert or commit them.

## 2. Repo rules that matter here (from AGENTS.md)

- British spelling, sentence case, no em dashes in UI copy.
- Never commit or push unless the owner asks.
- No hosted LLM APIs in app code. This feature needs no LLM at all.
- Delivery maps: Ancient and Anubis. The sample match is Anubis.
- Contracts: edit Pydantic in `apps/api/app/models/contracts.py` first, then mirror the TypeScript in `apps/web/src/lib/contracts/index.ts`.
- Anti-AI rules (doc 04): no card soup or dashboard KPI tiles, no AI glow or sparkle icons, no invented stats or confidence badges, no neon esports skin, no page-load choreography. Every number must come from the parse.
- `prototype/` is reference only. Do not paste the prototype HTML into the app wholesale; rebuild it as React components on the app's own stack.
- Stack: Next.js 15 App Router, React 19, plain CSS files under `apps/web/src/styles/` (tokens.css, studio.css, pages.css), GSAP 3.15 installed. No Tailwind, no Motion/Framer. Fonts installed via @fontsource: Hanken Grotesk, Archivo (variable), Newsreader.
- The doc notes that "design is paused" are overridden by the owner's explicit request for this feature.

## 3. Owner decisions (answered in the chat)

| Question | Answer |
|---|---|
| Deliverable | Prototype first, then build into the app |
| Look | Closer to FACEIT, but different colours |
| Pieces | All four: team scoreboards, round map with kill lines, kills/utility feed, round timeline with highlights |
| FACEIT's "Swing" | A transparent impact score (explained, labelled as an estimate) |

## 4. Reference material used

- **The two FACEIT screenshots the owner shared.** Match room → Stats: two team scoreboards (Swing, DMG, K/D/A, checkboxes), a 2D radar with kill lines, a Kills/Utility feed listing "Entire round · N events", a round timeline split into halves with win-type icons, and a Round highlights row with a "Clip highlight" button.
- **Video "The Psychology of Premium Apps" (Tim Gabe).** Premium comes from proof of quality, not just looks:
  - Always show what happened and what to do next.
  - Keep patterns consistent across screens.
  - Design empty, error and failure states as carefully as success states.

  Applied here as:
  - empty states in the feed;
  - an honest Clip toast;
  - a tooltip explaining every impact number;
  - one consistent kill numbering shared by the map and the feed.
- **Owner's Mobbin collection "cs2-demos".** Hume AI, fal, Riverside, Whop, AirOps, Gumloop screens. The flows were Sana AI's video player with a clickable, timestamped transcript, a Zapier video modal and a ClickUp guided tour. The Sana pattern shaped the feed: timestamped rows that seek the replay.
- **Repo design docs.**
  - `docs/handoff/28-VISUAL-DIRECTION.md` (Tactical Desk): condensed Archivo numerals for data, Hanken Grotesk for UI, colour only where it carries meaning.
  - `plan/STUDIO-UI-AND-MOTION-PLAN.md`: motion budget (~240 ms tabs, immediate seek and keyboard, reduced motion), accessibility targets, and ObsidianUI / React Bits as optional detail sources only.
  - Rejected by the owner earlier: a green/orange palette, and the "Frosted Studio" and "Smoked Glass" looks as bland.

## 5. Data

**Source:** a parsed match in `apps/api/data/matches/match-cd1d9c4263cb/` (git-ignored). The `analysis.json` there has, per round:
- winner, reason, knifeRound, sides
- economy (balance, equipValue)
- kills (attacker, victim, weapon, headshot, assister, flashAssist, attackerPos, victimPos)
- hurts (damage), blinds, grenades (type, thrower, pos), bomb

`rounds/r<N>.json` holds ~8 Hz player samples.

**Extractor:** `prototype/fixtures/extract_match_room.py <match-id>`, run with `apps/api/.venv/Scripts/python.exe`. It writes `prototype/fixtures/match-room.json` and:

- skips knife rounds (round 1 here), leaving 20 rounds;
- replaces Steam ids with `p1`…`p10` and keeps nicknames;
- converts world coordinates to radar pixels with the same transform as `apps/web/src/lib/replay/maps.ts`: `rx = (x − posX) / scale`, `ry = (posY − y) / scale`, with Anubis `posX −2796`, `posY 3328`, `scale 5.22` on a 1024 px radar;
- per kill, adds `open` (the first kill of the round), `trade` (the victim killed the attacker's teammate within 5 s before) and `traded` (this death was avenged within 5 s);
- sums enemy damage per attacker, capped at 100 per victim per round, ignoring self and team damage;
- matches flash blinds to throwers by player and by a detonation time within ±0.4 s (done in the page);
- downsamples positions to 1 Hz, with `null` once the player is dead.

**Fixture schema:**
```
{ matchId, source, map:{name,display,radarSize}, tickRate,
  players:[{id:"p1", name, startSide:"CT"|"T"}],
  rounds:[{ n, winner, reason, dur, sides:{pid:side}, equip:{pid:value},
    kills:[{t, a, v, w, hs, as, fa, ap:[x,y]|null, vp:[x,y], open, trade, traded}],
    dmg:{pid:int}, nades:[{t,type,by,p:[x,y]}], blinds:[{t,by,v,s}],
    bomb:[{t,type:"plant"|"defuse",by,p}], pos:{dt:1, p:{pid:[[x,y]|null,…]}} }] }
```
Win reasons seen: `t_killed`, `ct_killed`, `bomb_exploded`, `bomb_defused`; the page also handles `target_saved`. Weapon ids include `m4a1` (this is the M4A4), `m4a1_silencer` (M4A1-S), `usp_silencer`, `galilar` and others; the display names are mapped in the page.

**Sample match:** the coached player is `pawcio_` (the owner), who started T. Your team won 13–7: 8:4 in the first half, 5:3 in the second.

## 6. Prototype: what it contains

To run it, serve the repo root and open http://127.0.0.1:8765/prototype/match-room.html (the page uses fetch, so `file://` will not work). `.claude/launch.json` has the same command.
```
apps/api/.venv/Scripts/python.exe -m http.server 8765 --bind 127.0.0.1
```
`?player=<name>` changes the coached player. The radar loads `../apps/web/public/maps/<map>_radar.png`, falling back to `maps/<map>_radar.png`.

**Layout (desktop):**
1. **Top bar**, sticky with a light blur. Breadcrumb "Round Reviewer / Matches / Anubis 13–7". Centre tabs "Overview" and "Round room", with one accent underline that slides between them. Right side: a "Prototype · real parse" tag and three accent swatches.
2. **Scorebug.** "Your team" and "Opponents", each with a stack of monogram avatars and a "Started T · finished CT" line. A big condensed score "13 : 7" (the loser's number dimmed) over "ANUBIS · 20 ROUNDS · FINAL". A "WON" tag in the accent colour.
3. **Round room grid**, three columns: scoreboard 340–400 px | stage | feed 270–320 px.
   - **Scoreboard.**
     - Segmented control: "This round / Whole match".
     - Team header: side chip (CT/T in its side colour), team name, and the team's score after this round in side colour (dimmed when behind).
     - Columns: Player | Impact | DMG (ADR in match mode) | K/D/A.
     - Rows sorted by impact. Each row has a monogram avatar tinted by side, a "YOU" tag, and † if the player died that round.
     - Impact is a diverging mini bar (green right, red left of centre) plus the signed value.
     - Clicking a row **follows** that player: their row gets an accent inset, other rows fade, and the map and feed fade unrelated events. A "Following <name> ×" chip appears on the map.
     - Footer: a "How impact works" link that opens a modal.
   - **Stage.**
     - Header: "R3", "T win · Ts eliminated the CTs · your round", and "First half · score after 2–1 · 0:47 long", plus previous/next buttons.
     - Map: SVG with the radar desaturated and darkened. The viewBox is cropped to the area used across the whole match, so it doesn't jump between rounds.
     - Each kill: a line from killer to victim in the killer's side colour, a dot for the killer (larger with a white ring if it is you), an outlined × for the victim in their side colour, and a numbered badge for the kill order next to the victim.
     - Bomb plant and defuse are shown as a diamond with a label.
     - In Utility mode the kills fade and the grenades show: smoke as a dashed translucent circle, molotov as an orange area with a flame, flash as a starburst, HE as a ring, decoy as a square.
     - While scrubbing or playing, live player dots are interpolated from the 1 Hz positions (you have a white ring and a name label).
     - Legend at the bottom right.
   - **Scrubber.** A play/pause circle, a condensed clock "0:42 / 1:45", and a range slider with ticks for each kill (in the killer's side colour) and plant/defuse diamonds. Speed 1/2/4/8× (4× by default) and an "Entire round" toggle. Events after the scrub time are hidden on the map and faded in the feed.
   - **Feed.**
     - Segmented control "Kills K / Utility U" with keyboard hints, and a summary line ("Entire round · 8 kills" or "Up to 0:42 · 3 of 8 kills").
     - Kill rows: a numbered badge in the killer's colour, killer name → weapon chip (condensed caps) → victim name, both names in side colour. Below: time, "assist <name>", and flags for Opening, Trade, Headshot, Flash assist and "Got traded".
     - Utility rows: thrower, type chip and time. For flashes: "N enemies blinded · X s" and "N teammates".
     - Hovering a row highlights its kill on the map (thicker line, names shown, others faded) and the reverse. Clicking seeks the scrubber to that event.
     - Empty states: "No kills this round." and "No grenades thrown this round."
4. **Round strip (bottom panel).**
   - Segmented control "Results / Economy" with a legend.
   - Halves are split by when the coached player's side changes. Header: "FIRST HALF · YOU T" and "8:4".
   - Cells are 52×72 px and clickable: the round number in the winner's side colour, a 2 px top bar in that colour, a win-reason icon (elimination crosshair, bomb, defuse shield, clock; original SVGs), and pips for your kills. Rounds your team won get a faint tint; the selected round has an accent outline.
   - Economy mode replaces the icon with mirrored bars: your team's total equipment value above the line and the opponents' below, scaled to the match maximum, with exact values in aria-label and title.
   - **Round highlight row:** the top-impact player of the round ("Top impact" flag, kills, damage, impact), a select to pick any player, and an accent "Clip highlight" button. The button only shows an honest toast with the clip window (first kill −4 s to last kill +3 s), because clipping isn't wired.
5. **Overview tab.**
   - A table per team: Player, K, D, A, ADR, HS %, Opening (won–lost), Impact.
   - "Impact by round": a row of 20 small squares per player coloured green/red by size, with a gap at the half. Each square has a tooltip; clicking it opens that round in the Round room with that player followed.

**Keyboard:** ←/→ change round, Space plays, K/U switch the feed, Esc clears the follow or closes the modal. Arrow keys also switch tabs. The page starts on the first round where you got 2 or more kills.

**Accessibility:** skip link, ARIA tabs, aria-pressed on toggles, aria-labels on cells and rows, a visible accent focus ring, tooltips on focus, modal focus return, and `prefers-reduced-motion` removes transitions. Hover styles only apply under `(hover: hover)`.

**Responsive:**
- Under 1240 px the stage spans the top and the scoreboard and feed sit side by side below.
- Under 760 px everything is a single column (stage first), the top-bar actions and map legend hide, and the score shrinks.
- Verified at 375 px with no horizontal overflow.

## 7. Design tokens (prototype values)

Dark only, near-black like FACEIT.
```
--bg #08090b  --s1 #0e0f12  --s2 #141519  --s3 #1b1c21  --stage #050607
--line #22242a  --line-2 #2d2f36
--tx #f3f4f6  --tx-2 #a4a7b1  --tx-3 #6f737e
--ct #5aa9ff (CS2-like CT blue)   --t #f5a524 (T amber)
--pos #34d399  --neg #f87171   (impact direction only)
--accent #ff2d87 magenta (default; swatches: signal red #ff4b3e, volt #c8f03c with dark ink)
radii 4 / 8 px; fast 120 ms, medium 220 ms, ease cubic-bezier(.2,.7,.2,1)
```
- **Typography:** Hanken Grotesk 400–700 for UI. Archivo variable at `wdth` 72–80 with tabular numbers for all numbers, the clock, round numbers, weapon chips and side chips.
- **Accent is used only for:** the active tab underline, the selected round, the followed row, the WON tag, the Clip button and the focus ring.
- **Radar treatment:** `grayscale(.55) brightness(.62) contrast(1.15) saturate(.8)`.

## 8. Impact score (the "Swing" replacement)

Per player per round, from parse facts only:

| Fact | Weight |
|---|---|
| Kill | +1.00 |
| Opening kill (extra) | +0.50 |
| Trade kill (extra) | +0.25 |
| Assist | +0.35 |
| Flash assist (extra) | +0.15 |
| Every 100 damage | +0.50 |
| Death | −0.60 |
| Opening death (extra) | −0.40 |
| Your death was traded | +0.30 |
| Bomb plant | +0.40 |
| Bomb defuse | +0.60 |
| Team kill | −1.00 |

Then **subtract that round's lobby average** across all 10 players, so 0 is an average round and the ten scores add up to 0 every round (verified). Without this step every player came out positive. Match impact is the sum over rounds. Sample totals: pawcio_ +12.35, XxkelegxX +6.14, rsC- +4.49 … FAssan1337 −10.34. The tooltip shows the full breakdown, including the "Lobby average this round" line. The modal states that this is an estimate for finding rounds to review, not a win-probability model.

## 9. Verified

Checked in a browser at 1440×900 and 375×812:
- no console errors;
- following a player, scrubbing with live positions, hover linking between map and feed;
- Utility mode, Results and Economy strips;
- the Overview table, heat-strip tooltips and the jump into the Round room;
- the per-round zero-sum check;
- no horizontal overflow on mobile.

**Not done:**
- a screen-reader pass;
- contrast measurements;
- performance profiling;
- light theme (none);
- the real clip action.

## 10. Next steps

**A. Design changes the owner wants.** These were never listed in the chat; the owner will provide them. Apply them in `prototype/match-room.html` first and check them in the browser.

**B. Build into the app, after the owner approves.**

1. **API**
   - Today `RoundStats` exists only for the coached player (`apps/api/app/analysis/stats.py`, `match_round_stats(match, player_id)`; route `GET /matches/{id}/players/{pid}/round-stats`).
   - Add a match-room endpoint, for example `GET /matches/{id}/room`. It should return the same shape as the fixture: per round, all ten players' kills (with positions, open/trade/traded), damage, grenades, blinds, bomb events and equipment, plus 1 Hz positions.
   - Reuse the extractor logic, put the endpoint behind the existing auth `guard` and ownership checks, and add pytest coverage (trade/opening flags, the damage cap, knife-round skip).
   - Define Pydantic models first, then mirror them in TypeScript.
2. **Web**
   - A new route, for example `apps/web/src/app/matches/[id]/room/page.tsx`, linked from the match list and the Studio.
   - Components: `Scorebug`, `TeamBoard`, `RoundMap` (SVG, reusing `getMapMeta` / `worldToRadar` from `lib/replay/maps.ts`), `RoundScrubber`, `EventFeed`, `RoundStrip` (extend or replace `components/review/RoundStrip.tsx`), `RoundHighlight`, `MatchOverview`, and `impact.ts` (pure function plus unit tests).
   - Put the tokens in `styles/tokens.css` and a new `styles/room.css`.
   - Use existing data fetching from `lib/api/client.ts`.
   - Keep the Studio replay as the place for full playback; the room's "Open in Studio" should deep-link to the round and time.
3. **Clip highlight:** wire it to the existing clip job system (`apps/api/app/processing/moment_clips.py`) only if the owner asks. Otherwise keep it disabled with an honest label.
4. **Checks:** `cd apps/web && npm run typecheck && npm run build`, `cd apps/api && pytest`, then a manual pass at desktop and 375 px width, plus keyboard and reduced motion.

## 11. Prompt to give the next assistant

> You are continuing work on Round Reviewer (self-hosted CS2 demo review: FastAPI + Next.js 15). Read the attached MATCH-ROOM-HANDOFF.md, AGENTS.md and prototype/match-room.html. First apply these design changes to the prototype: <paste your list>. Keep everything in sections 2, 7 and 8 unless a change says otherwise, British spelling, no invented stats, no commits. When I approve the prototype, build it into apps/web and the API following section 10B, showing me the plan before writing code.
