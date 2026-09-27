# 26 Design polish plan

Date: 27 September 2026, UI check added the same day. Baseline: branch `development` (everything in `main` plus the POV clips). Plan only; no app code changed.

Related: [03 Design system](./03-DESIGN-SYSTEM.md), [04 Anti-AI rules](./04-ANTI-AI-DESIGN-RULES.md), [05 Analysis Studio](./05-ANALYSIS-STUDIO.md), [09 AI Coach](./09-AI-COACH.md), [14 Responsive](./14-RESPONSIVE-BEHAVIOR.md), [19 Decisions](./19-DECISIONS.md), [25 Frontend review](./25-FRONTEND-REVIEW.md), [AI Coach plan](../coach/AI-COACH-PLAN.md).

## Goal

Make Round Reviewer feel finished for the 6 December 2026 prototype hand-in and the demo in front of graders. "Finished" here means four things:

1. Every screen has real data, real names and human copy, with no developer wording left in the UI.
2. The path from upload to the last reviewed moment has a clear start, middle and end.
3. The AI parts (agent, MCP tools, RAG, verifier) are visible and checkable, because they are what is graded.
4. Loading, empty, error and mobile states look designed, not left over.

Everything below stays inside the existing rules: light chrome with a dark stage, orange for a mistake and blue for a good play, shapes beside colour, no cards-for-everything, no chat bubbles, no AI sparkle ([04](./04-ANTI-AI-DESIGN-RULES.md), [19](./19-DECISIONS.md)).

## Where the app is today

Seen in `docs/coach/screenshots/` and the project's `coach-ui/` screenshots (1440 px and 390 px):

- The Studio already has the right bones: moment rail, stage with a Gameplay/Radar switch and a picture-in-picture, transport, a timeline with a Coach lane, and the Analysis and Ask tabs.
- Type falls back to a system sans. Hanken Grotesk and Newsreader load from Google Fonts at runtime (`apps/web/src/app/layout.tsx`), so any offline or blocked machine (the sandbox, a school network) shows Arial. The serif Coach voice only appears in the POV screenshot.
- Players show as `P0` to `P9` in the picker, on the radar and in coach text. On a real demo these must be player names.
- Developer wording is visible: "Ranked 1st of 2 by the code ranker, from F2 F3 F4 F5", "Built from the finding templates. The coach model is switched off.", "Answers will come from the coach once it's connected", and a processing list with both "Decompress" and "Decompressed".
- The Analysis panel repeats itself: the headline, the Coach paragraph and "In this moment" say the same sentence three times.
- There is no match overview: the Studio opens straight into round 1 and the top bar only says "Mirage, drew 1 to 1, just now".
- There is no end to a review: nothing says "you have seen 6 of 6 moments" or what to take away.
- Home is one sentence and a button, with no list of past matches.
- Mobile (390 px) stacks the rail into a horizontal strip, hides the panel behind an "Analysis" button and leaves half the screen empty below the timeline.

## What comparable products do

| Product | What is worth borrowing | What to avoid |
|---|---|---|
| [Leetify](https://leetify.com/) | Match page opens with a scoreboard and a round-by-round strip before any detail; highlight clips per match; clear per-area breakdowns (aim, utility, opening duels) | A single invented "rating" number with no evidence (conflicts with [19](./19-DECISIONS.md) #13 and the no-invented-stats rule) |
| [Scope.gg 2D replay](https://scope.gg/replay/) | Jump to any round or kill from the timeline; kills drawn on both map and timeline | Busy multi-panel dashboard |
| [Recoil Analytics](https://recoilanalytics.com/features) | Health bars and names on the 2D map, grenade paths filterable by type, economy per round, export a clip | Pro-database AI search (out of scope) |
| [Refrag Coach](https://refrag.gg/coach/) | Each mistake ends in a concrete drill or practice step | Upsell-heavy chrome |
| Allstar / CS:DM | Clips as the reward for uploading; one clip per moment | Montage styling |
| Grain ([Mobbin](https://mobbin.com/screens/491a75cd-4c36-4ca3-b9c3-2bb5c7d7a8d6)), Loom ([Mobbin](https://mobbin.com/screens/5ae5edcf-1f5d-49dd-a0cf-2cfe56f75d2c)) | A short summary on top, then timestamped chapters that seek the video; Grain puts the summary left and video right | AI badges, gradient "Ask AI" buttons |
| Frame.io ([Mobbin](https://mobbin.com/screens/4933c75b-4209-49ff-a6a9-68050fb2e12f)), Vimeo review ([Mobbin](https://mobbin.com/screens/0b804d5e-14cc-4929-bf2b-efa3d0388435)) | Comments anchored to a time and to a point on the frame, shown as markers on the scrubber | Avatars and chat bubbles on coach text ([19](./19-DECISIONS.md) #5) |
| Apollo conversations ([Mobbin](https://mobbin.com/screens/2d40bc63-69af-4e24-85e9-a570f5e659cd)) | Per-speaker lanes under the video (like our You/Team/Enemy lanes), "Create clip" next to the player | Gradient Ask bar |
| Otter / Fireflies ([Mobbin](https://mobbin.com/screens/01981d27-dce2-4dce-a344-3cb6185da831), [Mobbin](https://mobbin.com/screens/3cd6c20c-a39e-4c44-be58-579510daf3b4)) | Summary and Q&A tabs beside the recording; timestamps in answers are links | Chat thread with avatars |
| Hotjar recordings ([Mobbin](https://mobbin.com/screens/ef9a51e9-49e3-416e-b757-1bcd1b288635)), Sprig clips ([Mobbin](https://mobbin.com/screens/03b7426e-cddd-481f-ba31-3ce854a05dc5)) | Home as a plain table of recordings with a Play action per row | Filter-chip rows |
| komoot activity page ([Mobbin](https://mobbin.com/screens/2eb53382-c644-4a8b-8e57-945ec9afc9d5)) | Big title, one line of key facts (time, distance, pace), tabs, and the map on the right | Social actions |
| Remote / PandaDoc upload ([Mobbin](https://mobbin.com/screens/6c60826e-31db-4ce4-b745-3f1b428db641), [Mobbin](https://mobbin.com/screens/6e7783c1-2ce2-4ba2-832d-bab89ec45f67)) | Processing shows the steps as plain lines that tick off, and says it is safe to leave | Illustrations and fake progress bars |

The common thread: review tools lead with a summary, turn the summary into a list of time-linked chapters, and make every chapter seek the media. Our moment rail is already that list; it needs a summary above it and an ending below it.

## UI check, 27 September 2026

A hands-on pass over the `development` branch (everything in `main` plus the POV clips), with the coach model off and CS Demo Manager off. It used a synthetic Mirage match with two rounds (the one the API tests use), clicked through every screen at 1440, 1024 and 390 px wide, and tried the error paths. Screenshots are in [`screenshots/ui-check-2026-09-27/`](./screenshots/ui-check-2026-09-27/).

What works: upload rejects a wrong file with a clear fix; the picker works from the keyboard (Enter picks and opens the Studio); moments, rounds, the clock, the Coach lane, the language switch and the citation links all respond; the Ask tab shows three moment-specific questions.

What the check found, most serious first. Each row names the plan item it belongs to.

| # | Where | What happens | Fix | Item |
|---|---|---|---|---|
| U1 | Upload | The box says "Drop a demo here" but has no drop handler, so dropping a file does nothing (`app/upload/page.tsx`) | Handle `dragover`/`drop`, highlight the box while a file is over it | 1 |
| U2 | Upload | A 150–300 MB demo shows only "Uploading…" with no progress or size | Show the file name, size and a real byte progress bar (XHR upload progress) | 6 |
| U3 | Studio stage | With clips off, a notice with an environment variable ("set RR_CSDM_ENABLED=1 on the Windows host") covers the top-right of the radar, including a player label | Move it off the stage into the Gameplay button's tooltip, in plain words: "Clips are off on this computer" | 1, 5 |
| U4 | Analysis tab | The pinned "Ask about this round" block takes the lower quarter of the panel, so the round stats (damage, utility, equipment) and the Next moment link are cut off at 1440 × 900 | Keep the Ask block only in the Ask tab | 1, 3 |
| U5 | Ask tab | Above the pinned questions the panel is empty (about 550 px of blank space) | Put the suggested questions and input at the top; the answers thread grows below | 8 |
| U6 | Studio, missing match | `/studio/<unknown id>` renders the full Studio chrome with "0 rounds", "Pick a round" and a 0:00.0 clock | A plain page: "This match isn't here. It may have been deleted." with Add demo and Home | 11 |
| U7 | Processing, missing match | Heading "Processing", the developer line "Real stages only. Counts appear when they exist." and "Match not found." with no way back | Same not-found page as U6 | 1, 11 |
| U8 | Any unknown URL | Next.js default 404 on a white background, out of the design | Add `app/not-found.tsx` in the Studio style | 11 |
| U9 | Home | Still says "Review a match on Radar", mentions a "shared playback clock", and says the sample match has no Radar positions, so use a real upload | New Home per item 7; until then, rewrite the copy to describe the coach flow | 1, 7 |
| U10 | Studio rail | "1 moments" when one moment is picked | Plural rule | 1 |
| U11 | Coach lane | "Untraded death +2" and "Shot while moving +2" read as a score | "Untraded death and 2 more" | 1 |
| U12 | Rounds list | Round rows use a grey ▲ for T wins and ● for CT wins, the same shapes that mean mistake and good play elsewhere ([19](./19-DECISIONS.md) #4) | Use side letters (T, CT) or a filled/outlined square for win or loss | 1 |
| U13 | Timeline | Lanes appear and disappear per round (round 1 has Team and Utility, round 2 has Bomb), so the rows jump when switching | Keep a fixed lane set and show an empty lane quietly | 9 |
| U14 | Coach text | "Died to P1 in Window 0 s after first contact" | Say "immediately after first contact" under 0.5 s (template change in `coach/templates/`) | 1 |
| U15 | Tablet and phone | At 1024 the moment labels truncate ("Shot while mov…"); at 390 the explanation sits behind an Analysis button and half the screen below the timeline is empty; the Gameplay/Radar switch wraps to its own row | Bottom sheet per item 10 | 10 |
| U16 | Every page | Hanken Grotesk and Newsreader fail to load when Google Fonts is unreachable (confirmed: font requests failed in the check), so the whole app renders in the system sans | Self-host the fonts | 1 |
| U17 | Every page | Tabs all read "Round Reviewer"; there is no favicon | Per-page titles | 11 |

Not checked: the Gameplay view with a real clip (CS Demo Manager needs Windows and CS2) and the Ask tab with the model on. Both need Pawel's PC.

## Recommendations, ordered by impact

Each item lists what it touches. "API" means `apps/api`; web paths are under `apps/web/src/`.

### 1. Fix what every screenshot shows (highest impact, smallest work)

- **Self-host the fonts** with `next/font/local` (Hanken Grotesk 400/500/600, Newsreader 400 and italic) so the design survives an offline demo machine. Touches `app/layout.tsx`, `styles/tokens.css`, `public/fonts/`.
- **Real player names everywhere**: picker, radar labels, timeline, coach text. Keep the SteamID for identity, show the name. Touches API player list and replay normalisation, `components/processing/PlayerPicker.tsx`, `components/replay/RadarView.tsx`, coach templates.
- **Rewrite developer copy** into player language:
  - "Ranked 1st of 2 by the code ranker, from F2 F3 F4 F5" becomes "Picked because it cost you the opening duel. Evidence: F2 F3 F4 F5".
  - "Built from the finding templates. The coach model is switched off." becomes a small "Written from the findings" note, visible only when the model is off.
  - "Answers will come from the coach once it's connected" is hidden when the model is on, and says "The coach model is offline, so answers use the findings only" when it is off.
  - The processing list merges "Decompress"/"Decompressed" into one "Unpack demo" line.
  Touches `components/coach/CoachPanel.tsx`, `CoachExplanation.tsx`, `app/processing/[id]/page.tsx`, API stage labels.
- **Stop the Analysis panel repeating itself**: headline = the moment label in plain words ("You shot while running in Mid"), then the coach's explanation in the serif, then evidence rows. Drop the duplicated "In this moment" first row when it equals the headline. Touches `CoachPanel.tsx`.

### 2. A match overview that opens the review

Add an overview state at the top of the Studio (not a new dashboard page): the Studio opens on it, and the stage shows the first moment's clip paused behind it.

- One line of key facts, komoot style: map, final score, date, the coached player's name, side at the half, K/D/ADR for that player only (numbers from `RoundStats`, nothing invented).
- A **round strip**: one narrow cell per round, filled or outlined for win or loss, with a ▲ or ● under rounds that hold a picked moment. Click seeks to that round. This is the Leetify/Scope pattern and already listed as missing in [25](./25-FRONTEND-REVIEW.md).
- **The coach's summary**: two or three sentences in the serif naming the pattern across moments ("Three of your six moments are fights you took while moving"), each claim cited. This is one extra agent job over existing findings, so it goes through the verifier like the rest.
- A "Review moment 1: Shot while moving in Mid" filled button, which is the single primary action ([03](./03-DESIGN-SYSTEM.md) buttons).

Touches `app/studio/[matchId]/page.tsx` (overview state), a new `components/replay/RoundStrip.tsx`, API match summary job and endpoint (`coach/jobs.py`, a prompt `match_summary.v1.md`), contracts in `models/contracts.py` and `lib/contracts/`.

### 3. A review with a beginning, middle and end

- **Progress in the rail**: "Moment 2 of 6" with the seen state already tracked ("1 of 2 seen"); make it a clear step list. A "Next moment" link already exists at the bottom of the Analysis tab, but at 1440 × 900 it sits below the fold behind the pinned Ask block (U4 in the UI check above). Move it under the explanation as a line button and add the `N` key.
- **Moment playback**: selecting a moment seeks to the clip start (moment minus 3 s), plays the POV clip once, and pauses on the key tick with the annotation up. The picked window already exists (PR #8).
- **End of review**: after the last moment, the panel shows a short wrap-up: what went well, what to fix, and one concrete drill per mistake type (Refrag's "practice this next" pattern), sourced from the knowledge base with `[K..]` citations. Then "Analyse another round" and "Add demo".
- **Deep links**: `?m=<moment id>&t=<time>` in the URL so a moment can be sent to a teammate or opened straight into during the demo.

Touches `app/studio/[matchId]/page.tsx`, `CoachPanel.tsx`, `lib/replay/usePlaybackClock.ts`, a drill section in `data/knowledge/`.

### 4. Make the AI work visible (high impact on the grade)

Graders need to see the agent, MCP, RAG and verifier, not only their output.

- **"How this was written" disclosure** under each explanation: the tool calls the agent made (names and short arguments), the knowledge passages it used, and the verifier result ("7 claims checked, all cite a finding"). The JSONL traces in `data/traces/` already hold this. Use a disclosure row ([03](./03-DESIGN-SYSTEM.md) `.more details`), not a card.
- **Citation hover**: hovering `F3` shows the finding's one-line summary and time; hovering `K7` shows the passage title and source (Liquipedia or own notes).
- **Feedback on each explanation**: "Useful" / "Not right" text buttons, stored per explanation. This feeds the evaluation chapter of the report with real human ratings ([19](./19-DECISIONS.md) #16).

Touches `CoachExplanation.tsx`, `CoachText.tsx`, API trace and feedback endpoints, `eval/`.

### 5. Richer stage: the radar and the clip should explain themselves

- **Radar**: health bar under each name, the coached player's view cone, grenade landings (smoke circle, molly area, flash burst) for their lifetime, the bomb, and a death cross that stays for the round. Scope.gg and Recoil show all of these; our parse (T10) already has the events.
- **Anchored annotation on the POV clip**: at the moment's key tick, the shared moment label ([19](./19-DECISIONS.md) #11) appears on the stage with one line of evidence ("206 u/s, accurate under 73"). One primary overlay at a time (#10).
- **Kill feed lower-third** on the stage for the current round, fading after 4 s, stage colours only.
- **Clip states**: "Recording clip 3 of 6", "Clip not recorded (CS Demo Manager is off). Radar only.", and a paused poster frame instead of a test pattern.

Touches `components/replay/RadarView.tsx`, `PovClip.tsx`, `GameplayView.tsx`, stage CSS in `styles/studio.css`, API events endpoint (grenades), clip job status.

### 6. Processing as part of the product

- Split the page into two moments: **before the pick** (the player picker is the main content; stages collapse to one line "Replay ready, 24 rounds") and **after the pick** (the coach stages are the main content: Finding mistakes, Picking moments, Recording clips 3 of 6, Writing explanations, each with a real count).
- **Picker rows**: name, side at start, K/D/ADR, and a "You" marker on the player whose POV the demo came from when known. Keep keyboard selection.
- "You can leave this page; the match will be in your list" once the pick is made.
- Show "Open the radar now" as a secondary link as soon as the radar is ready (from `awaiting_player`).

Touches `app/processing/[id]/page.tsx`, `PlayerPicker.tsx`, API status payload (clip counts).

### 7. Home with history

- Home becomes a plain table of matches (map, score, date, coached player, status, "Review" per row), like Hotjar or Sprig recordings. Empty state: "No matches yet. Add a FACEIT .dem.zst or a CS Demo Manager .dem." plus Add demo.
- A working **sample match** with real radar data and pre-recorded clips, so the demo never depends on a live upload or on CS2 running. Replace the current fixture that has no radar.
- Later ([10](./10-PERSONALIZATION.md)): a "Across your matches" line with evidence dots once there are several matches per player.

Touches `app/page.tsx`, API `GET /matches`, sample data under `apps/api/data/`.

### 8. Ask tab polish

- Suggested questions per moment (three, specific, disappear when asked) are in; add **timestamps in answers as links** (`[t:12.4]` already specified in [09](./09-AI-COACH.md)).
- While the agent works, show one live line of what it is doing ("Looking up round 1 stats", "Reading Mid notes") instead of a spinner. This exists over SSE; make it the only progress indicator.
- Keep the thread layout from [09](./09-AI-COACH.md): question in bold UI type, answer in serif, hairline between pairs.

Touches `CoachPanel.tsx` (Ask), `CoachText.tsx`.

### 9. Timeline refinements

- A bracket on the Match row showing the current clip window, and on the Coach lane for the selected moment.
- Hover on any marker shows its label and time (ink tooltip, 120 ms, per [03](./03-DESIGN-SYSTEM.md)).
- Zoom to moment: double-click a Coach marker to zoom the lane view to the clip window.

Touches `components/replay/ReplayTimeline.tsx`.

### 10. Mobile and tablet

- Follow [14](./14-RESPONSIVE-BEHAVIOR.md): a bottom sheet with the moment headline visible when collapsed, dragged up for the explanation. Today the explanation is behind a button and the lower half of the screen is empty.
- Moment rail as a swipeable row above the stage (keep), with the active moment's glyph and "2 of 6".
- Tablet: panel as a drawer from the right.

Touches `app/studio/[matchId]/page.tsx`, `styles/studio.css`.

### 11. Small finishing touches

- `?` opens a keyboard shortcuts sheet (Space, arrows, `,` `.`, `[` `]`, `/`, `V`, and new `N`). The keys already exist; nobody can discover them.
- Tab titles per page ("Mirage 13 to 11, review · Round Reviewer") and a favicon.
- Skeleton lines instead of "Loading…" text in the rail and panel.
- Error states that say how to fix it (already a copy rule in [04](./04-ANTI-AI-DESIGN-RULES.md)).
- Motion from [11](./11-MOTION-SYSTEM.md): Flip for the Gameplay/Radar swap and the rail's selected indicator; keep everything else still.
- Verify the dark chrome theme, or remove the toggle from scope; do not ship it unverified.

## Settle the style question

The docs never settled the older olive-dark style (chartreuse accent, Big Shoulders, IBM Plex) against the light Analysis Studio ([03](./03-DESIGN-SYSTEM.md) conflict note, [18](./18-CURRENT-STATE.md)). Recommendation: **keep the light Analysis Studio**. It is what is built, it is what [19](./19-DECISIONS.md) #4 to #6 describe, and a light chrome makes the dark stage and the footage the richest thing on screen. Record it as decision 21 and mark the olive direction superseded. This needs Pawel's OK.

## What not to add

- A single overall rating or score per player (invented number, no evidence).
- Heatmaps and pro-database comparisons: they need many matches and pull focus from coaching one player.
- Chat-style Ask, AI badges, sparkle icons, gradient buttons, even though most AI review tools on Mobbin use them.
- More maps before the owner asks.

## Suggested order

| When | Items |
|---|---|
| Before the intermediary defence (17 Nov) | U1 to U17 that belong to item 1, then 2, 3, 4, 6, sample match from 7 |
| Before the prototype hand-in (6 Dec) | 5, rest of 7, 8, 9, 10 |
| If time allows | 11 |

Items 1 to 4 are what change the demo most: real names and fonts, an overview that frames the match, a review that ends, and visible proof of the agent and verifier.

## Sources

- Leetify: https://leetify.com/ and https://leetify.com/blog/cs2-pov-demos/
- Scope.gg replay: https://scope.gg/replay/
- Recoil Analytics features: https://recoilanalytics.com/features
- Refrag Coach: https://refrag.gg/coach/ and https://wiki.refrag.gg/en/Coach
- Mobbin screens linked in the table above (Grain, Loom, Frame.io, Vimeo, Apollo, Otter, Fireflies, Hotjar, Sprig, komoot, Remote, PandaDoc).
