# 28 Visual direction: Tactical Desk

Related: [03 Design system](./03-DESIGN-SYSTEM.md), [04 Anti-AI rules](./04-ANTI-AI-DESIGN-RULES.md), [19 Decisions](./19-DECISIONS.md), [26 Design polish plan](./26-DESIGN-POLISH-PLAN.md)

Owner brief (27 Sep 2026): a completely new visual direction for the product, not a reskin. Clean, modern, gaming-specific, analytical, premium and memorable. Research on Mobbin first, three directions, a comparison, a visual system, then the Studio implemented and reviewed. This file is the source of truth for that direction; the Studio in `apps/web` implements it.

## 1. Research (Mobbin)

Twelve searches across video editing, media players, sports and fitness, maps, trading and finance, AI assistants, command palettes and productivity tools. Exact product matches (CS tools) are not on Mobbin, so the patterns below are borrowed from neighbouring categories.

| Reference | Pattern | Why it works | How it applies here |
| --- | --- | --- | --- |
| [Descript editor](https://mobbin.com/screens/338e6d29-b0bb-412a-ac03-94450d22cfe5) | Transport sits on the timeline's top edge; tracks run under one playhead; the inspector is a narrow right column | Time controls and time data read as one instrument | Transport becomes the timeline's header row; one playhead crosses every lane |
| [Descript selection toolbar](https://mobbin.com/screens/4387b423-3daa-4000-8e1e-d3da4bdb060e) | Actions appear attached to what is selected | The tool already knows the object, so the user never names it | The Coach ask bar states its context (round, time, moment) instead of asking the user to describe it |
| [Magnific editor](https://mobbin.com/screens/c84b022d-7cb2-43d1-9aa5-0e70aaba6526) | Large canvas, thin timeline with playhead, inspector that only appears for the selection | The stage keeps most of the width | Stage keeps the leftover width; secondary surfaces stay narrow |
| [Higgsfield video workspace](https://mobbin.com/screens/a76aec2a-b00a-4559-9d50-e390d4e6a91b) | Three columns: history left, media centre, properties right, all dark | A dark workspace makes the media the brightest thing on screen | Dark workspace in dark mode; the stage stays dark in light mode too |
| [Box Box Club race results](https://mobbin.com/screens/f4a42f13-e7c5-433e-8307-7bb6cefc3204) | Condensed display numerals for position, points and round; team named in its colour | Sports identity from typography and data, no decoration | Condensed numerals for score, clock, moment numbers and round numbers |
| [Box Box Club live tracking](https://mobbin.com/screens/69373cc2-c0b6-4da1-b3aa-da61cb6d1212) | Big session clock, circuit geometry as the graphic | The sport's own geometry is the identity | Map geometry and player paths are the only "graphics" we use |
| [Garmin race predictor](https://mobbin.com/screens/4dd7ac24-c55f-4d09-920b-59045d303e0e) | Each series has a shape and a colour | Shape carries meaning without colour | ▲ mistake, ● good play keep their shapes everywhere (decision 4) |
| [GetYourGuide itinerary](https://mobbin.com/screens/4c6089bb-c5ed-4e53-8b37-307c502463ea) | Numbered stops on one connecting line, start and end marked | A sequence reads as a route with a beginning and an end | The moment list becomes a review path: Brief, 01 to 06, Debrief |
| [Perplexity Health detail](https://mobbin.com/screens/20122940-8ac0-4b93-980a-b4ac799c9b5b) | A headline verdict, then the numbers, then "what this could mean" | Answer first, evidence second, interpretation last | Analyst column order: verdict, coach's read, evidence, round numbers |
| [Polarsteps trim](https://mobbin.com/screens/12c19481-4ca7-4f5a-9b65-ca4e2ca07069) | Filmstrip with a highlighted window and tick dots under it | The selected span is visible against the whole | The picked moment is a tinted band across the timeline with its label |
| [Basecamp timeline](https://mobbin.com/screens/9185e0ca-8d0e-4be3-bcff-9dd902a31666) | A labelled "today" line crossing every row | One current-time line ties rows together | Playhead crosses the moment band and every lane |
| [Copilot Money](https://mobbin.com/screens/ff5af71c-c937-448f-9e7d-f7e13567e38e) | Up/down values coloured only where direction matters | Colour is kept for meaning | Colour appears only for mistake, good play, enemy and live state |
| [Shopify keyboard shortcuts](https://mobbin.com/screens/51f33f53-363c-449e-bcaf-1878225245f7) | Shortcuts shown next to the action they trigger | Teaches the tool while using it | Key hints (Space, V, N, /) sit on the controls they drive |

### Patterns rejected

| Pattern (reference) | Why rejected |
| --- | --- |
| Centred "What can I help with?" prompt with suggestion pills ([Copilot](https://mobbin.com/screens/4a15bd28-f519-4d5d-9dcb-5cbbceb997b2), [Dropbox Dash](https://mobbin.com/screens/de82282c-0a19-4dd9-a571-bcfe644a8014), [v0](https://mobbin.com/screens/0af9b1a7-ede8-49fc-ac0c-a8417981cd70)) | Too AI-looking; an empty chatbot page is what the brief forbids |
| Assistant with an avatar and greeting ([Descript Underlord](https://mobbin.com/screens/4387b423-3daa-4000-8e1e-d3da4bdb060e), [AirOps Copilot](https://mobbin.com/screens/3b6d7233-195d-44db-bde7-ccc4ee8fdbd1)) | Generic assistant UI; the Coach is an analyst attached to the replay |
| Lime or neon accent buttons ([Higgsfield player](https://mobbin.com/screens/7dcf1c0a-58ac-4757-9da3-af32c88aa8a3)) | Too gaming-heavy and too loud for long sessions |
| KPI tiles with sparklines ([Shopify orders](https://mobbin.com/screens/4df3cf78-bc17-4632-8ad8-fb9d69bd90b2), [Customer.io](https://mobbin.com/screens/928c7456-2b75-4c2a-8883-fa1f62c33c6a)) | Template SaaS; fails the product-specificity test (decision 6) |
| Gradient progress rings and glowing gauges ([Lifesum](https://mobbin.com/screens/d9acc2a8-4746-4c6c-b0b4-0235eaf4c206), [Stardust](https://mobbin.com/screens/99fcae23-ac01-42f1-b58f-7ddc31dbbd00)) | Decorative; implies scores the coach does not compute |
| Streak and badge gamification ([LinkedIn games](https://mobbin.com/screens/2c9f89ec-f797-476b-9e7d-03ec5bc3ff8d)) | Decision 13: evidence only, no gamification |
| Street-map styling with pins ([Sweatpals](https://mobbin.com/screens/9b710af5-456b-4ee9-9b83-605ebace769f), [Google Ads](https://mobbin.com/screens/cf9aaf23-06a2-4ec8-8167-5a8bd2d77ef2)) | Makes the radar look like Google Maps |
| Floating glass player bars ([Apple Music](https://mobbin.com/screens/035569a0-e8da-454e-8bfd-83e7eacfecc5)) | Blur and float read consumer, and cover the stage |
| Big thumbnail card grids for recents ([Descript home](https://mobbin.com/screens/2d453eba-49c6-459a-8544-feb3e61d2163)) | Card-grid regression; Home should be a list with scores |

## 2. Three directions

### A. Tactical Studio
An editing workstation. Dark neutral workspace, stage in the middle, a dense multi-lane timeline across the bottom, a narrow inspector on the right. Hairline dividers, almost no colour, UI type only.
- Strength: the most usable replay tool; scales to more lanes and data.
- Weakness: looks like any NLE; nothing says Counter-Strike until the radar loads.

### B. Competitive Command Center
A broadcast desk. A scorebug with big condensed numerals, bolder active states, a framed stage with corner geometry, a kill-feed style event list, round history as a prominent strip.
- Strength: instantly reads as esports; energetic.
- Weakness: framing and big type compete with the stage; drifts towards esports-website and HUD parody; tiring over long sessions.

### C. AI Coach Workspace
A lesson player. Moments presented as lessons with a numbered path, the coach's text as the main column in the serif voice, clear mistake / good play / opportunity styling, a lighter stage.
- Strength: best for learning and for the coach's value.
- Weakness: the replay becomes an illustration of the text; weaker for free exploration; risks a course-app look.

### Comparison

| Criterion | A Tactical Studio | B Command Center | C Coach Workspace |
| --- | --- | --- | --- |
| Gaming identity | Low until the radar renders | High, partly through styling | Medium, from content |
| Replay usability | Best: transport and lanes are tool-grade | Good, but framing eats stage | Weaker: text leads, replay follows |
| Radar usability | Good | Good, though overlays tempt clutter | Smaller stage |
| Timeline clarity | Best | Tends to overload with kill-feed marks | Simplified, loses events |
| AI Coach integration | Inspector tab, bolted on | Easy to become a chat overlay | Best: the coach is the narrative |
| Information density | High | High and loud | Low to medium |
| Visual distinctiveness | Low | High | Medium |
| Mobile usability | Hard: lanes do not shrink well | Medium | Best |
| Scalability (more data, more screens) | Best | Medium | Medium |
| Long-session comfort | Best | Weakest | Good |
| Anti-AI quality | Good, if generic | Risk of HUD parody | Risk of AI-course look |

### Chosen: Tactical Desk (A's structure, C's review path and voice, B's numerals)

A alone is correct but anonymous; B alone is loud; C alone demotes the replay. The chosen direction keeps A's stage and timeline as the frame, takes C's numbered review path and the analyst's serif voice, and takes only one thing from B: condensed numerals for the data that makes CS feel like CS (score, round, clock, man advantage, moment numbers). Identity comes from what is shown: a scorebug with the round history, the fight graph (players alive over time), the picked moment as a band on the timeline, the path drawn on the radar.

## 3. Visual system

### Colour
Mostly neutral graphite. Colour has one meaning each, and there are five of them.

| Token | Dark | Light | Meaning |
| --- | --- | --- | --- |
| `--mistake` | #ff8a3d | #b4470f | Mistake, ▲ (decision 4) |
| `--good` | #86a8ff | #2851d8 | Good play, ● (decision 4) |
| `--enemy` (stage only) | #ff5f73 | same, stage is dark | Enemy players, as on the in-game radar |
| `--team` (stage only) | #b9c4ce | same | Teammates |
| `--you` (stage only) | #ffffff | same | The coached player, with a white view cone |
| `--live` | ink outline | ink outline | Current event, shared "live" chip (decision 11) |

The coached player's radar ring moved from blue to white, so blue now only means good play. Enemies moved from orange to red, so orange only means mistake.

Neutrals (dark / light): workspace #101316 / #eceff1, panel #15191c / #f6f7f8, raised #1c2125 / #ffffff, line #262c31 / #d4d9dd, text #eaedf0 / #111417, text-2 #aeb6be / #3c4550, text-3 #8b959f / #5a6470. The stage is #0a0c0e in both themes.

### Typography
- **Archivo Variable, condensed (width 72 %)** for data only: map name, score, round numbers, clock, man advantage, moment numbers, lane labels. Tabular figures. Never for sentences.
- **Hanken Grotesk** for UI and data labels (13 / 14 px, 600 for titles).
- **Newsreader** for the Coach's voice only (16 / 1.55).
Archivo was picked over Big Shoulders (dropped in decision 21) because it is a neutral grotesque that pairs with Hanken and has a width axis, so one file covers condensed numerals without an esports-poster feel.

### Shape, space, elevation
- Radii: 2 px controls, 4 px surfaces, 0 on the stage edge. Max 6 px holds (decision 6).
- Spacing: 4 px base; 8 / 12 / 16 / 24 between groups. Dense areas (timeline, path) use 4-8; the analyst column breathes at 16-24.
- Borders: 1 px hairlines only. No shadows on static content; overlays on the stage use a solid 88 % plate.
- Icons: 1.6 px stroke, 12-16 px, geometric; glyphs ▲ ● ◆ keep their meaning.

### Layout
Desktop: top bar with the scorebug; review path (200 px) | stage and timeline dock | analyst column (380 px). The stage takes the leftover width and the leftover height; the timeline dock sits under it at the stage's width, transport on its top edge. Tablet: the path becomes a horizontal strip, the analyst column a drawer. Phone: stage on top, compact timeline, the path as a strip, the analyst as a bottom sheet.

### Timeline language
- Transport is the dock's header: play, step, a big condensed clock, man advantage (4v5), the view switch, speed, fullscreen.
- The picked moment is a tinted band across all lanes with its number and label, tinted in its kind's colour at 10 %.
- Lanes: Coach (▲ ●), Fight (players alive per side as a mirrored step graph, kills as ticks; your own kills and death in white), Bomb, Utility.
- One playhead in ink crosses everything; the scrub ghost only on hover-capable pointers.

### Radar language
- Map image desaturated and dimmed so markers carry contrast.
- You: white disc, dark outline, white view cone, 4 s trail; the picked moment's full path is drawn as a dashed line and draws in when a moment opens.
- Team: slate dots with a facing tick. Enemy: red dots with a facing tick. Dead: × in the side's colour.
- Names in condensed caps with a dark halo.

### Overlay language
- One plate per corner at most: moment chip top-left (glyph, number, label, zone), camera toggle top-right, legend bottom-left.
- Plates are #0a0c0e at 88 %, 1 px line, 2 px radius; text 12 px.

### Coach language
- The analyst column is the Coach. It opens on a verdict (the finding in sans), then the coach's read in Newsreader, then evidence and numbers.
- The ask bar is pinned to the bottom of that column and shows what it knows: round, time, moment, view. No avatar, no bubbles, no sparkle, no "AI" wording. Questions and answers read as an analyst's notes: the question in sans, the answer in Newsreader.

### Motion
- GSAP only for space and time: the radar camera tween (320 ms, power2.inOut) and the moment path drawing in (420 ms, power2.out).
- CSS for state: presses scale to 0.97 in 100 ms; hover only under `(hover: hover)`.
- Existing FLIP for the Gameplay / Radar swap and the rail indicator.
- Nothing ambient, no glow, no staggered card entrances; keyboard actions are instant; reduced motion turns every tween into a jump.

## 4. Next screens

- **Home**: Continue (latest match with its scorebug and moment strip), Focus (the most repeated detector across matches, with the N-of-M dots from decision 13), Recent (a table: map, score, date, moments), Patterns (recurring findings, linked to their moments), Coach (one cross-match ask bar). No KPI cards, no greeting.
- **Upload**: "Add a match for review": one drop target on the dark stage colour with the accepted formats and maps written in condensed caps, then the file's own name and size once dropped.
- **Processing**: the pipeline stages as the same numbered path as the Studio (Parse, Pick player, Select, Record, Explain), honest counts only (decision 15); the player picker as a two-column team sheet with the scorebug on top.
- **Matches**: a dense table with the scorebug as each row's lead cell.
- **Progress**: per-detector history with dots per match (decision 13), no trend lines until there are enough matches.

## 5. Skills used

| Skill | Where it lives | What it changed |
| --- | --- | --- |
| `emil-design-eng` (emilkowalski/skills) | `.cursor/skills/` | Press feedback at scale 0.97; hover gated on `(hover: hover)`; no staggered card entrances. Keyboard actions never animate: moving between moments with N, arrows or other shortcuts now jumps the radar camera and draws the moment path at once, and only pointer actions tween. |
| `gsap-react`, `gsap-core`, `gsap-performance` (greensock/gsap-skills) | `.cursor/skills/` | The camera tween and the path draw-in are killed in the effect cleanup, so a fast moment change never leaves two tweens running. GSAP tweens a proxy box or `strokeDashoffset` only, never layout. Reduced motion skips both tweens. |
| `impeccable`, `better-layout`, `better-colors`, `better-typography`, `better-accessibility`, `better-writing` | Not installed in this repo or session | Not used. Their areas were covered by the repo's own rules instead: [04 Anti-AI rules](./04-ANTI-AI-DESIGN-RULES.md), [03 Design system](./03-DESIGN-SYSTEM.md), a manual contrast check of every text token and the writing rules in `AGENTS.md`. |

No additional skill was added.
