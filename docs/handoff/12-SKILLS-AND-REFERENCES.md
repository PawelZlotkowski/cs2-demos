# 12 Skills and references

Related: [04 Anti-AI rules](./04-ANTI-AI-DESIGN-RULES.md), [11 Motion](./11-MOTION-SYSTEM.md), [13 Accessibility](./13-ACCESSIBILITY.md)

This file maps the external design knowledge used in this project. It summarises only the rules adopted. Read the original skills for full detail; do not copy them into the repository.

## Local install (this machine / repo)

Skills are vendored for Cursor discovery (not runtime app deps):

| Source | Vendor path | Discoverable junctions |
|---|---|---|
| [emilkowalski/skills](https://github.com/emilkowalski/skills) | `.cursor/vendor/emil-skills/` | `.cursor/skills/emil-design-eng`, `review-animations`, `find-animation-opportunities`, `improve-animations`, `animate`, `animation-vocabulary` |
| [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | `.cursor/vendor/gsap-skills/` | `.cursor/skills/gsap-core`, `gsap-timeline`, `gsap-plugins`, `gsap-react`, `gsap-performance` (+ utils / scrolltrigger / frameworks) |

**Coach milestone — load:** `rr-detector` (adding a detector / finding), `rr-coach-agent` (tools, MCP, prompts, verifier, llama.cpp), `rr-eval` (evaluation runs and reporting). These are project-authored skills in `.cursor/skills/`, not vendored.

**Frontend work — load:** Emil `emil-design-eng`, `review-animations`, `find-animation-opportunities`; GSAP `gsap-core`, `gsap-timeline`, `gsap-plugins`, `gsap-react`, `gsap-performance`. See also `.cursor/skills/README.md`.

## Emil Kowalski

Source: https://github.com/emilkowalski/skills. Skills used: `emil-design-eng`, `review-animations`, `find-animation-opportunities`. `improve-animations` was skimmed.

**Problem it solves:** motion judgement, interaction quality and restraint.

**Adopted:**

- Decide whether something should animate based on how often it happens. Things that happen 100+ times a day get no animation, which is why keyboard actions are instant.
- Name the purpose of every animation (spatial consistency, state, feedback, preventing a jarring change); "looks cool" is not a purpose.
- Ease-out for entering, ease-in-out for moving. Custom curves: `cubic-bezier(.23,1,.32,1)` and the drawer curve `cubic-bezier(.32,.72,0,1)`. Never ease-in.
- UI motion stays under 300ms.
- `scale(.97)` on press. Never `scale(0)`.
- Tooltips skip the delay once one is already open.
- Interruptible transitions over keyframes.
- **Drag:**
  - pointer capture
  - velocity-based flick (above 0.11 px/ms)
  - friction instead of a hard stop at the top
  - ignore a second touch once a drag has started
- **Reduced motion means fewer and gentler, not none:** keep opacity and colour transitions and remove movement.
- Hover styles apply only on devices that can hover.

**Not used:** springs and Framer Motion (the stack uses GSAP), 3D transforms, clip-path tricks, Sonner. Blur to mask crossfades was tried and then removed from the moment switch.

## GSAP

Source: https://github.com/greensock/gsap-skills. Skills used: `gsap-core`, `gsap-timeline`, `gsap-plugins` (Flip), `gsap-react`, `gsap-performance`.

**Problem it solves:** synchronising overlays and camera with a time-based model, and spatial continuity.

**Adopted:**

- Sequence with timelines using the position parameter. The overlay timeline is **paused and scrubbed by media time** (`tl.time(t)`).
- `fromTo` with explicit values, so seeking in either direction is deterministic.
- Flip (`Flip.getState` then a DOM change then `Flip.from`) for the PiP-to-stage swap, the rail indicator and the Coach panel.
- `overwrite: true` for interruptible gesture tweens. `gsap.ticker` for the single render loop.
- Animate transforms and opacity only.
- In React (planned): `useGSAP` with `scope`, `contextSafe`, cleanup on unmount, and `gsap.matchMedia` for reduced motion.
- Register plugins once. All GSAP plugins are free; there is no Club token and no private registry.

**Not used:** ScrollTrigger and ScrollSmoother (no scroll effects in a functional tool), SplitText, MorphSVG, DrawSVG (possibly useful later for path drawing), physics plugins.

## impeccable

Source: https://github.com/pbakaus/impeccable. Its anti-pattern rules and the browser detector `crates/live/assets/detect-antipatterns-browser.js` were used.

**Problem it solves:** a measurable anti-AI audit of rendered pages.

**Adopted and fixed:**

- side-tab accent borders
- low contrast (`--text-3` raised to 4.5:1)
- text below 11px
- text overlapping the footage
- pill and kicker patterns
- nested cards
- the checks for overused fonts and gradients

**How it was run:** the script was injected into headless Chromium with `window.impeccableDetectAsync()` on Home, the Studio and Upload at 1440 and 390 wide.

**Known false positives:** see [18](./18-CURRENT-STATE.md#known-bugs).

**Not used:** its 23 command workflows and design-system scaffolding.

## better-* skills

Source: https://github.com/jakubkrehel/skills.

| Skill | Problem | Rules adopted | Not used |
|---|---|---|---|
| better-layout | Hierarchy and grouping | Group with space before lines. Most important content first. Progressive disclosure needs a visible cue (the chevrons and dot summaries). Collapse secondary UI before shrinking content | RTL mirroring, not needed yet |
| better-colors | Semantic colour | One colour, one meaning. One filled action per view. Semantic role tokens. Fix contrast through lightness, not hue | OKLCH ramp generation, P3 |
| better-typography | Scale and legibility | A small named scale. Tabular numbers. Balanced headings and pretty wrapping. No wrapping mid-label. 16px inputs on mobile | Variable-font tuning |
| better-accessibility | Custom controls | Visible focus with a token. Slider semantics. 24px hit areas. Focus return. Hover only on hover-capable devices. Honour reduced motion. A live region for Coach answers | Forced-colours testing, not done |
| better-writing | Interface copy | Verb-first buttons. Errors that say how to fix the problem. Specific labels. Sentence case | |

`better-ui` was considered and skipped, because it overlaps with Emil's skills.

## Other skills

- The frontend-design skill (in the environment) contributed the default-look calibration list: the cream background with a serif, the near-black with an acid accent, the SaaS card kit, and tracked kickers.
- Hallmark (nutlope/hallmark) was used on the **earlier** design direction, not on this one.

## Mobbin references

These are the ones that influenced the implementation.

| Reference | Problem | Adapted | Not copied |
|---|---|---|---|
| [VEED](https://mobbin.com/screens/1cee01ac-8d18-4090-868b-6f86cbcbe4d0) and [Riverside](https://mobbin.com/screens/0e4f6f7f-2603-423b-8849-69e2061ed095) editors | Keep the media central with fixed tool locations | Stage with the timeline docked below and an inspector at the side | Multi-track editing, tool rails |
| [Frame.io](https://mobbin.com/screens/ee704edf-a186-4f30-98ed-e15525a6ac59) review | Tie notes to both a time and a place in the frame | Frame-anchored annotations; the input carries live context | Comment threads, collaboration |
| [Grain](https://mobbin.com/screens/607c8850-4c6e-45bf-a20e-ab3117fc7520) | Who did what, and when | Event lanes (You, Team, Enemy, Utility) | Speaker talk-time bars |
| [Fabric](https://mobbin.com/screens/b392bc22-bf75-4b35-be0a-ae58de609dc2) web and [iOS](https://mobbin.com/screens/8794452b-215c-4c47-bc2a-2ea9ba3e329a) | The AI already knows what you're looking at | Coach inside the panel; tabs in the mobile sheet | Its chat UI, pill chips |
| [Perplexity Health](https://mobbin.com/screens/e879169d-0e6e-4105-91df-1befa935e6dc) | Personalisation without overclaiming | Stating the sample size, "too early to tell" | The card dashboard |
| [komoot](https://mobbin.com/screens/f87c2397-d781-4aaa-bae8-0f05ab298af2) | Point events over a continuous track | Glyphs above the match strip | Elevation charts |
| [Sentry session replay](https://mobbin.com/screens/9190841a-bd92-417a-b274-63b132865717) | Reviewing a recording event by event | A dense single event row, previous and next event buttons, minimal chrome | Its colours, the DOM inspector |
| [YouTube](https://mobbin.com/screens/58942936-2a14-4edf-80a1-ecf8385521cc) | Knowing what is happening now | The "now" event name next to the timecode | Chapter segments on the scrubber |
| [Felt](https://mobbin.com/screens/69d86dee-422e-4e76-a841-ffa2b51e54d8) | Maps as an analysis canvas | Full-bleed map, subdued base labels, legend, a zoom or framing toggle | Its layer panel, basemap picker |
| [Google Analytics realtime](https://mobbin.com/screens/20ee18fd-0fc6-43d2-976f-6c79210d0de4) | Making gaps between events readable | The interval bracket on the timeline | The vertical event stream |
| [Zoho CRM](https://mobbin.com/screens/bf58e8e4-f411-48db-905b-5a8802c27618) and [Airtable](https://mobbin.com/screens/ead709da-f625-4da0-bafd-81c311c9f5ec) | Collapsing a side panel | The hide control lives in the panel header; the same icon restores it | Floating canvas toolbars |
| [Garmin Connect](https://mobbin.com/screens/99a39061-4602-48dc-b819-65fad11f3b59) and [Runbuds](https://mobbin.com/screens/ff174a95-2186-456d-9782-54c4fec85a84) | Collapsed mobile sheet over a map | A grabber plus one strong summary line | Stat grids, buttons in the sheet |

**Considered and rejected:**

- Full-page AI home screens (ClickUp Brain, Apollo), because they isolate the Coach
- Inline AI popovers (Notion, Gamma) over the stage, because they would cover the footage
- Generic upload flows (Drive, Docusign, AWS), because they show no staged processing
- Higgsfield's neon card UI, as the counter-example
