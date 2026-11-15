# Design references for the Studio

29 October 2026. Collected at Pawel's request after he said cs2.cam's design is stronger than ours. This is reference material for the paused design track ([STUDIO-UI-AND-MOTION-PLAN](STUDIO-UI-AND-MOTION-PLAN.md)). It doesn't change the Studio or [19 Decisions](../handoff/19-DECISIONS.md) on its own; adopting a direction is the owner's call.

Mobbin links open only with a Mobbin account.

## 1. What makes cs2.cam's design work

Measured from the live site's computed styles:

| Element | cs2.cam | Round Reviewer today |
|---|---|---|
| Ground | Near-black zinc `#09090B` everywhere; borders `#27272A`; text `#F4F4F5` / `#A1A1AA` / `#71717A` | Light chrome, dark stage |
| Accent | **One** muted brass/khaki `#CABE89`, used for small labels, active states and the main button. No neon | Open (green/orange rejected) |
| Display type | **Saira Condensed**, uppercase, 500 weight, tight negative tracking (-1.5px at 60px) | Hanken Grotesk |
| UI type | Inter Tight 16px | Hanken Grotesk |
| Labels | **JetBrains Mono**, small caps-like, wrapped in brackets: `[ 01 ]`, `R02 · WHATS_NEW`, `VIEWER · /DEMO` | — |
| Framing | Product screenshots sit inside thin frames with **corner ticks** (like a camera viewfinder), with a mono caption on the frame edge | — |
| Rhythm | Each section is numbered like a round (`R00 … R10`). The metaphor stays in the labels, not in fake HUD chrome | — |
| Underneath | shadcn/Tailwind zinc tokens, made distinctive purely through type, one accent and framing | — |

The takeaway: it isn't the dark background that makes it good. It's **strict restraint**: three neutrals, one desaturated accent, a condensed display face paired with a mono label face, and a single recurring motif (bracketed codes and corner ticks). That's compatible with our [anti-AI rules](../handoff/04-ANTI-AI-DESIGN-RULES.md), since there are no gradients, glows or neon. It does conflict with "light chrome, dark stage" in AGENTS.md, so moving to an all-dark chrome would be a decision to record in 19.

Where it's weaker, and what not to copy: marketing-grade all-caps everywhere hurts long reading (coach explanations, Polish text), and the logged-in app is much more generic shadcn than the landing page. Keep the motif for labels and headings; keep body text in sentence case at a readable size.

## 2. Reference board by Studio surface

### Stage: clip + radar + timeline
- [Frame.io — timestamped comment with drawing on the frame](https://mobbin.com/screens/9ae6c925-ff35-4042-b856-b19e9b4ef09c): comment pinned to a timecode and a point on the frame, with an annotation toolbar. → A finding pinned to its tick *and* its position on the radar.
- [Riverside — transcript beside video, chapters on a multitrack timeline](https://mobbin.com/screens/75720d35-877e-4aca-9f8c-3f4586d13621): text and timeline scroll together; a comment is attached to a time range. → Coach lane under the timeline; the explanation highlights while the clip plays.
- [VEED — layered tracks with comments on the playhead](https://mobbin.com/screens/5251b0a0-feb2-4e0c-a1af-feef279907c0): coloured lanes per element type. → Separate lanes for kills, utility, findings and good plays.
- [Dialpad — call review with recap, transcript and #Moments](https://mobbin.com/screens/d272ee25-ebf8-4ce0-916c-1dd6969a548d): recap, transcript and excerpts as tabs; moments as a side list. → Very close to the Analysis tab with its moment rail.

### Coach answers (Ask / Analysis)
- [Gemini Notebook — numbered inline citations and a sources rail](https://mobbin.com/screens/05def46a-970f-46b2-8bf0-e0e83c7dd49e): every bullet carries small numbered citations; sources can be toggled on the left. → `F12` / `R7` chips inline; clicking one seeks the clock.
- [Cohere — "Performing multistep reasoning using tools" with the rationale shown](https://mobbin.com/screens/4100675f-3440-45a6-8b20-de1a8c765568): visible tool step with its query above the answer. → "Looked up round 12 timeline" steps, collapsed by default.
- [Dropbox Dash — thinking steps that list what was searched](https://mobbin.com/screens/f4ca9d48-c17a-40e5-98a2-f3a293483967) and [Customer.io agent — references pop-over](https://mobbin.com/screens/fafcbfb9-fa85-4b4d-b17f-54df962305b5).
- [ChatGPT — citations side panel](https://mobbin.com/screens/88d5e839-cf2b-447b-887c-a4beeead8040).

### Match summary and progress
- [The Outsiders — every stat with "vs 30-day average" underneath](https://mobbin.com/screens/37da1128-ae00-4b8d-8ca2-b5e50795582b). → Each match stat shown against *your* last-10 baseline. This is the single most transferable pattern.
- [WHOOP — trend with a shaded "typical range" band](https://mobbin.com/screens/cc99d5a2-38ee-40e3-931c-95106f6b5a26). → Trade rate over matches with your normal band; outliers stand out without colour noise.
- [Oura — 7d / 30d toggle on metric cards](https://mobbin.com/screens/6aee12bc-6f70-4812-a83e-455d5af2d77a).
- [Bevel — score ring plus a short written insight card](https://mobbin.com/screens/d99b3093-5eca-4cc4-aadd-36a6de950dd1). → One focus metric plus a two-line coach note; avoid a dashboard of rings.
- [Hevy — personal records plus a "level" bar against a population](https://mobbin.com/screens/14db3357-172d-401e-9179-05f032ec2a26) and Leetify's in-match **personal-best cards** ("best crosshair placement ever: 8.9° vs 9.62° before").
- [Runna — "How did you find this workout? Rate to unlock insights"](https://mobbin.com/screens/b391f097-28e3-4c50-b401-dde49ed68c25). → A thumbs prompt on each coach explanation that doubles as KTO training data (see [FINE-TUNING-DATA](../coach/FINE-TUNING-DATA.md)).
- [Google Health — "Ask Coach" floating action on metric cards](https://mobbin.com/screens/78e2bd2d-0268-4482-8241-0a58dcfe5f6c). → "Ask about this" on any stat opens Ask with that stat as context.

### Processing and upload
- [Gamma — vertical step list with the live step spinning](https://mobbin.com/screens/523d6c4f-ac58-44f7-9d7a-a9881cba40f7). → Our states map directly: decompressing → parsing → choose player → detecting → selecting → recording → explaining.
- [SoundCloud/Dolby — progress with a sentence describing the current step](https://mobbin.com/screens/cdaf74c3-e039-4276-ae2c-82025124ff20).
- [Remote — "you can leave this page" reassurance](https://mobbin.com/screens/52383c77-770b-4735-9863-58292ca510fa).

### Dense data views (situation search, all rounds)
- [Sentry — query builder above a chart above a sortable table](https://mobbin.com/screens/8e2b3e1e-0f4a-472e-9afe-8d63b1499306). → Situation search: conditions, then a distribution by round time, then the matching rounds.
- [Profound — metric tabs with "vs previous period" deltas over a single chart](https://mobbin.com/screens/f9423573-e4eb-4e70-8968-f545da183ce5).
- [Adaline — dark small-multiples of evaluation metrics](https://mobbin.com/screens/d5b2ad2a-dd83-4d6b-86fa-6edeee1991cd). → Good for the Lab's evaluation page.

## 3. Proposed direction to evaluate (not decided)

"**Tactical Lens on cs2.cam's restraint**": keep Tactical Lens's composition (central replay plane plus a stable inspector) and borrow cs2.cam's material system:
- All-dark zinc chrome. The stage stays the darkest surface, so it still reads as "stage first".
- One desaturated accent. cs2.cam's brass is theirs, so pick our own (for example a cool steel blue or a muted signal red), and keep orange/blue only for mistake and good-play marks on the timeline.
- A condensed display face for headings and numbers; a mono face for codes (`R12 · 1:14`, `F07`), tick times and citations; Hanken Grotesk stays for body text and the coach's prose.
- One motif: corner-tick frames around the stage and clip, and bracketed mono codes for rounds and findings. No HUD imitation.

To decide: whether to replace "light chrome" (a 19-DECISIONS change) and which accent to use. Test it on one realistic Anubis scene before going further, as section 13 of the UI plan already requires.
