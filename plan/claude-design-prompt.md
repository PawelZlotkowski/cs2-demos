# Claude design prompt — Round Reviewer Studio UI

Paste-ready brief for Claude (or another design agent). **Edit the YOUR IDEAS sections once**, then paste the whole document. Design work stays preference and composition until you unpause and freeze RR18; coding agents must not restyle production CSS before that freeze.

British spelling throughout. Product name: **Round Reviewer**.

---

## How to use

1. Fill every **`[write here]`** / YOUR IDEAS block below with your own concept, palette, references and must-haves. Leave nothing ambiguous that you care about.
2. Paste this entire file into Claude (or your design agent). Attach anti-AI rules and any reference screenshots if useful.
3. Expect: token sheet, one composition board brief, interaction notes, accessibility checklist, anti-AI self-check — not production CSS in the app.
4. Review outputs with Aleksander’s evidence pack in mind (mistake, good play, uncertain claim, long Polish answer, worker unavailable).
5. When satisfied: **you** unpause design and freeze RR18 (tokens + one approved composition). Only then hand implementers the frozen pack.

---

## Role and constraints

You are a **design / art-direction** agent for Round Reviewer’s Analysis Studio.

- Produce direction boards, tokens, interaction notes and checklists.
- Do **not** write production CSS, Tailwind themes or Next.js components into the app.
- Do **not** treat design as already unpaused. Paweł fills ideas first; he unpauses and freezes RR18 when ready. Until then, explore and document — do not instruct coding agents to restyle Studio.
- **Study context (preserve, do not blindly ship):** Tactical Lens was selected for a full Studio interaction study. Green/orange palette was **rejected**. Frosted Studio and Smoked Glass were **rejected as bland** — do not propose another generic glass SaaS skin.
- Product context: self-hosted CS2 demo review (upload → parse → Radar / optional clips → grounded coach). No hosted LLM UI metaphors (OpenAI-style chat product). Coach answers are evidence-linked; Radar stays usable when clips are missing.
- UI copy proposals: **British spelling**, sentence case, no em dashes, no hype.

---

## Product surface to design

Stage-first browser Studio. **The match is the subject** — not a dashboard, not a floating desktop, not a native-app shell.

Design these screens / states (same realistic match content across boards):

| Surface | Notes |
|---|---|
| Processing / player pick | Upload → parse status → choose player; truthful stages |
| Studio — Radar primary | Dominant stage; shared playback clock; light chrome / dark stage unless overridden in YOUR IDEAS |
| Gameplay / clip | When a clip exists; Radar fallback when absent; PiP / swap pattern may stay |
| Moment rail | Selected moments; clear kind (mistake / good play / missed chance) without colour-only meaning |
| Analysis + Ask | Stable panel chrome; tab switch; composer; activity while coach works; checked-answer reveal |
| Offline / queue / error / cancelled | Honest coach and job states — no fake progress bars or pretend tasks |

Composition must still read as match review with motion off and in grayscale.

---

## Hard rules

Full anti-AI list: repo `docs/handoff/04-ANTI-AI-DESIGN-RULES.md`. Apply it. Quick test:

> If game-specific content were removed, could this screen belong to 50 other SaaS apps? If yes, redesign.

**Do not introduce**

- Card grids, nested rounded cards, dashboard modules, “Insight / AI / Summary” cards
- Decorative gradients, purple/blue AI glow, glassmorphism as identity, heavy blur, side-tab colour bars
- Pill chip clusters, sparkle / wand / brain / robot icons, floating chat bubbles, coach avatars, “How can I help you today?”
- Neon esports skinning or generic shadcn defaults as the visual system
- Page-load choreography, staggered card entrances, ambient / parallax motion on functional screens
- Invented stats or confidence badges

**Typography (unless you override deliberately in YOUR IDEAS and justify it)**

- **Hanken Grotesk** — UI and data
- **Newsreader** — reserved for Coach prose only (Why / answers), not chrome
- Tabular numerals for times and counts
- No decorative monospace; no uppercase tracked kickers

**Chrome / stage (default)**

- Light chrome, dark stage — unless YOUR IDEAS explicitly override
- Semantic colour meaning: orange ≈ mistake, blue ≈ good play, ink ≈ selection — never colour alone
- Radius restraint (design system max ~6px on controls; stage edges stronger/simpler)

**Preserve product decisions**

- Browser Studio; match at centre; EN + PL; evidence-linked coach; Radar when clips unavailable
- Do not redesign replay contracts or invent new product scope

---

## Motion budget (closed numbers — respect)

From Studio UI / motion plan. Signature interactions only; frequent seek/type/keyboard stay immediate.

| Interaction | Normal motion | Reduced motion / repeated keyboard |
|---|---|---|
| Analysis ↔ Ask tabs | Marker + overlapping body; **~240–280 ms** total (marker ~180–220 ms; exit ~80 ms; enter ~160–220 ms, 6–10 px) | Immediate selection |
| Activity line change | Crossfade **~120–160 ms**; moving segment only during real running/checking work | Static text |
| Checked-answer reveal | Overlapping blocks; **≤ ~350 ms** total cap (groups ~160–220 ms, overlap ~35–45 ms); no length-proportional delay | Full answer immediately |
| Evidence → seek | Immediate seek; brief emphasis | Immediate seek + persistent selection |
| Disclosure / menu | **~160–200 ms** (menus ~140–180 ms open) | Direct open/close |
| Copy / press feedback | **~120–160 ms** (press CSS) | Immediate |

**Also**

- No initial page-load animation; no animating historical answers on restore
- Cancel / retarget on rapid tab change — no queued sequences
- Prefer no animation over corrupting playback, input latency or unreadable text

---

## YOUR IDEAS

Fill these before pasting. Obvious placeholders only — replace every `[write here]`.

### Concept / metaphor / mood

Beyond or instead of Tactical Lens. One primary signature preferred (not three motifs stacked).

```
[write here — e.g. spatial investigation, editorial cut, round rhythm, or your own metaphor]
Mood / feeling words:
- [write here]
What should feel memorable after 10 seconds?
- [write here]
```

### Palette preference or rejection notes

Tactical Lens study options were Carbon/Cobalt, Graphite/Ice, Paper/Ultramarine — pick, adapt or replace. Green/orange pairing already rejected; Frosted/Smoked already rejected as bland.

```
Preferred direction:
- [write here]
Must reject / avoid:
- [write here]
Light / dark preference (chrome vs stage):
- [write here]
```

### Typography / density / materials

Defaults: Hanken + Newsreader, light chrome / dark stage. Override only if intentional.

```
Type notes:
- [write here]
Density (compact / airy / mixed):
- [write here]
Materials (opaque reading surfaces, limited frost on controls only, none, other):
- [write here]
```

### Specific interactions you care about

```
Tabs:
- [write here]
Coach wait → answer arrival:
- [write here]
Evidence → playback:
- [write here]
Hover / press / tilt (restrained or none):
- [write here]
Other:
- [write here]
```

### EN / PL copy tone

```
English tone:
- [write here]
Polish tone (if different):
- [write here]
Words / phrases to avoid:
- [write here]
```

### References you like

Apps, games, sites, films — relationships to borrow, not artwork to copy.

```
- [name] — what to take: [write here]
- [name] — what to take: [write here]
- [name] — what to avoid copying: [write here]
```

### Must-have vs nice-to-have

```
Must-have for RR18 freeze:
- [ ]
- [ ]
Nice-to-have / later:
- [ ]
- [ ]
```

### Explicitly do NOT want

```
- [write here]
- [write here]
- [write here]
```

---

## Deliverables you must produce

1. **Token sheet** — surfaces, text, borders, semantic positive/negative/ink, stage tokens, type sizes/weights, spacing scale, radii, three named motion durations matching the budget above. Include light/dark and an opaque / reduced-transparency fallback.
2. **One approved composition description or board brief** — same realistic scene: Radar/replay + timeline/moments + coach. Still deliberate in grayscale with motion off. One primary visual signature only.
3. **Interaction notes** — Analysis/Ask tabs, activity line (truthful states only), checked-answer reveal, evidence→seek, Stop/Retry, offline/queue/error/cancelled. Map each to the motion budget.
4. **Accessibility checklist** — contrast on busy radar / bright flashbang / dark scene; colour + shape/text for findings; keyboard paths; focus visible; reduced motion; long EN/PL answers; 320–390 px width and 200% zoom usable.
5. **Anti-AI self-check** — against `04-ANTI-AI-DESIGN-RULES.md`; answer the “50 other SaaS apps” test in writing for each board.
6. **Done-before-implementers criteria** (from next-steps handoff)
   - Written token sheet + one approved composition
   - Two short interaction captures **or** static board + one motion study
   - Room for Aleksander’s evidence pack (mistake, good play, uncertain claim, long Polish answer, worker unavailable)
   - Explicit note that design is **unpaused** and **RR18 is frozen** — only Paweł adds this when ready; you draft the freeze checklist, you do not claim the freeze yourself

---

## Out of scope

- Coding or restyling the Next.js app (`apps/web`)
- Rewriting product decisions in `docs/handoff/19-DECISIONS.md` or delivery scope
- Porting the whole prototype HTML wholesale
- Hosted LLM product patterns, API keys, or cloud-model chat UX
- Redesigning replay / coach data contracts
- Fake progress, simulated token streams of unchecked text, or decorative load sequences
- New maps, pricing, or practice-product scope beyond Studio review

---

*End of prompt. After Claude returns, Paweł reviews → unpauses → freezes RR18 → then coding agents implement tokens and the motion slice.*
