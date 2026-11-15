# Studio UI and motion plan

**Paused by Pawel on 20 October 2026.** Preserve Tactical Lens as a saved study. Do not resume design exploration or implement its styling during source organisation. The saved source and standalone preview are under `prototype/` in the canonical Studio folder. This document records research and prior decisions; it is not a new instruction to continue design.

20 October 2026. Extends the [final delivery plan](FINAL-DELIVERY-PLAN.md). This is an implementation brief, not a claim of completed UI work or a live visual audit.

**Current decision order:** Pawel selected **Tactical Lens** for a full Studio prototype and explicitly rejected the green/orange palette. Section 14 records this direction and the interactive study. Its new palettes and detailed styling remain open for review. Section 11's accessibility/spacing requirements and section 12's small-stack recommendation remain relevant. Earlier concept recommendations are historical, not the current selection.

## 1 Confirmed direction

Pawel wants distinctive, observable animations when switching tabs, waiting for the coach and receiving an answer. The answer should arrive fluidly rather than pop into place. Preserve the browser Studio, with the match at its centre; no floating desktop or native-app shell.

Recommend a coherent tactical review experience: an animated tab marker, a compact activity line that follows real work, a flowing answer reveal and evidence links that connect advice to playback. These four related interactions create the signature. Keep typing, seeking and repeated keyboard actions immediate.

This request authorises richer tab and answer transitions than the older handoff's blanket bans on entrances would imply. It does not ask for a new brand, gradients, an OS dock or ambient effects over gameplay. Before implementing, record this narrow amendment in the active Studio design/motion handoff so future agents do not undo it.

Historical baseline, superseded for visual selection by section 11: Hanken Grotesk for UI, Newsreader for coach prose and Archivo for game numerals were the existing tokens. Pawel subsequently rejected the explored typography, colours and icons. Keep semantic meaning understandable independently of colour; choose the new visual tokens through the research/style comparison. Borrowed components must adopt that chosen system rather than introduce each kit's defaults.

## 2 What the inspected project already does

The intended integration baseline is `C:/Users/pawel/Documents/cs2-demos-studio`. I inspected its package manifest, coach component, API event path, motion helper, tokens and handoff documentation. I also inspected the archived `studio-ask.png` capture dated 27 September; it is a historical layout reference, not proof of the current rendered build.

React 19 and Next.js 15 are already present. GSAP is installed, but the inspected React motion helper uses CSS/Web Animations API, while the prototype documentation describes GSAP. Preserve the working helper for simple transitions; use GSAP only where coordinated timelines justify it. Tailwind and Motion are not listed in the inspected web package dependencies. Do not install either simply because a library demo uses them.

| Before, observed in source | After, planned | Why |
|---|---|---|
| Complete checked answer received, then two words revealed every 28 ms | Bounded, sentence/block reveal with stable wrapping and complete citations | Keeps arrival expressive without making long answers artificially slow |
| Every turn update sets scroll position to the bottom | Follow only while the reader remains near the bottom; otherwise show a return-to-latest control | Reading an older answer must not be interrupted |
| Whole changing thread has `aria-live="polite"` | Stable status announcement plus a concise completion announcement | Prevent repeated announcements of the transcript during reveal |
| Tool labels are English strings and historical queue time is reported as a step | Localised activity derived from explicit lifecycle events | Waiting, running and completed work need different representations |
| Abort controllers exist for unmount, but no per-turn Stop control in this component | Visible Stop with a terminal cancelled state and server cancellation acknowledgement | A usable chat needs user-controlled cancellation |
| Current context is visible above the input | Capture immutable match/player/round/time/language context on every submitted turn | Switching moments must not relabel an old question or attach its late response to the new context |

These are source-based planning findings. Accessibility, frame rate and live interactions have not been verified in a browser for this task.

## 3 Which libraries to use, and how

The YouTube page could not be retrieved directly. Its publisher's [companion article](https://www.getstage.co/blog/8-underrated-websites-every-vibe-coder-needs) confirms the supplied chapter list. Recommendations below use the libraries' own documentation where available. Catalogue counts in the video are not adoption criteria.

| Source | Specific use in Round Reviewer | Adoption decision |
|---|---|---|
| [Beautiful UI](https://www.beautifului.dev/) | Its Thinking, Task Rows, Streaming Text and Context Cards illustrate compact progress, answer delivery and source inspection | Primary interaction reference for the coach. Adapt the hierarchy into our unboxed reading panel. Do not copy reasoning transcripts, confidence meters or sample business content. Source licence/dependency details were not established here; reference-only until checked. |
| [AICSS](https://www.aicss.dev/) | Thinking State, Streaming Text, Inline Citations and Message Actions map directly to coach activity, answer rendering, evidence and feedback | First source candidate for a small component trial. The [public package](https://github.com/kvnkld/aicss) is MIT; free and Pro offerings differ. Its [documentation](https://www.aicss.dev/pricing) says delivered snippets use self-contained CSS. Inspect the exact free component and its dependencies before adopting. No paid kit is needed for this plan. |
| [coss/ui](https://coss.com/ui/docs) | Tabs, Collapsible, Popover, Tooltip and Composer provide useful patterns for controls and evidence disclosure | Selective accessible primitive candidate. It uses Base UI and Tailwind; prototype one component before accepting styling migration cost. Prefer existing working controls or a directly styled Base UI primitive when that is simpler. Its [UI README](https://github.com/cosscom/coss/tree/main/apps/ui) states MIT; preserve the licence for the exact files used. |
| [Bencho](https://bencho.dev/) | Collapsing sidebar, Split view, Copy field, Feedback bar and Time scrubber are interaction references | Borrow the relationship between gesture and feedback. Implement with existing motion tools where feasible. No new split-view resizer is required for December. Keep source reuse conditional on checking the selected block's terms/dependencies. |
| [ObsidianUI](https://www.obsidianui.dev/llms.txt) | Agent-readable manifests and text-stream examples can make a selected component easier to integrate correctly | Secondary reference/source candidate. Its documentation describes MIT components and complete manifests. Read supplied agent instructions as integration documentation, subordinate to this project's brief. Avoid landing-page galleries, marquees and text tricks inside the Studio. |
| [OriginKit](https://www.originkit.dev/docs/components) | A restrained product-demo reveal could help a later public landing page | Defer to public launch. Core Studio does not need hero particles or animated backgrounds. Verify current access and item terms if later used; the video's “free” description is not a blanket procurement decision. |
| [Componentry](https://componentry.dev/docs/mcp) | Registry/MCP delivery is useful when a particular source component has already been chosen | Optional installation mechanism, not a product dependency or design direction. Its [repository](https://github.com/harshjdhv/componentry) states MIT with separate dependency terms. No magnetic dock, kinetic reading text or WebGL effects in the match workspace. |

Earlier provisional stack, superseded by section 12: custom Studio components, existing CSS/WAAPI helpers, selective free AICSS source and an accessible primitive where needed. The current recommendation makes Base UI the first new control dependency and treats AICSS as an optional coach reference. MCP component installation is a development tool; it is unrelated to the coach's runtime MCP tools.

## 4 The intended experience, interaction by interaction

### A. Analysis / Ask tabs

Keep the panel header, context and composer anchors stable. On a pointer-selected tab, move one ink selection marker to the target over about 180–220 ms. The outgoing body fades over roughly 80 ms; the incoming body moves 6–10 px from the direction of travel and resolves over 160–220 ms, overlapping the exit. Total transition remains around 240–280 ms.

Do not animate the whole page or remount the media. Preserve each tab's scroll position and chat draft. Fast tab changes cancel/retarget the current animation; no queued sequence plays after the user has moved on. Hidden panels cannot retain focusable controls in the accessibility tree. Arrow-key tab navigation and reduced-motion mode switch directly while preserving a clear selected state.

### B. Sending and waiting

The submitted question settles into the conversation immediately with a small, brief entrance. Replace the send action with Stop while the request is active; retain a draft for the next question but do not issue duplicate requests against the current one-request limit.

Show one compact activity line, optionally expandable into plain task rows. Its visual motif can be a short segmented track echoing the match timeline. Use a subtle moving segment only during actual active work; queue/offline states use stable text. No fabricated percentage, false countdown or rotating list of pretend tasks.

Examples of event-backed labels, localised in English and Polish:

- “Waiting for the coach” when the request is accepted but no worker is running.
- “Checking round 12” only when the corresponding work starts.
- “Read round 12” for a completed tool result.
- “Checking the answer against the evidence” only during that actual stage.
- “Coach unavailable. Your replay is ready.” for a confirmed unavailable worker.

The current queue event is emitted after waiting, and existing step events carry completed-call timing. They cannot power truthful live queue/start/verification states by themselves. Until new lifecycle events exist, show a generic in-progress label and completed activity accurately. Never infer a start event from an arbitrary timer.

### C. Answer arrival: the signature transition

The activity line resolves into the first answer block in the same location. Reveal sentence/block groups with a restrained 3–5 px upward movement and opacity, approximately 160–220 ms per group, overlapping by about 35–45 ms. Cap the entire initial reveal near 350 ms regardless of answer length; long answers use larger groups instead of a longer wait. These timings are proposed starting values for comparison, not measured results.

Render stable text layout and complete citation links before animating presentation. Avoid per-character DOM wrappers, reflow on each word, scrambled text and blur on readable prose. Keep the final text selectable/copyable; selection, copying or a repeated request to view the answer should finish the reveal immediately. History loaded from storage appears directly, without replaying its original entrance.

The December baseline still receives a complete checked answer and animates its presentation. This is not true token streaming. During generation, real progress supplies continuity; once checked text arrives, the designed reveal makes delivery fluid. Do not delay the backend or remove claim checks to manufacture a streaming effect.

Optional future improvement: stream independently checked answer blocks. That requires sequence IDs, source context, validation/finalisation events, repair/retraction semantics and cancellation tests before the UI may commit each block. It is separate backend work, not something a streaming-text component supplies. Keep it P1 after the existing verified-answer path is secure.

### D. Evidence connects chat to the match

Use inline, readable citations such as “Round 12 · 0:38”, backed by valid evidence IDs. Activating one seeks the existing playback clock immediately, then briefly emphasises the target event/annotation and selected moment. A keyboard-accessible disclosure shows the supporting fact or knowledge passage without covering the footage. Unavailable clips fall back to radar and an explicit clip status.

Separate observed facts, coaching interpretation and missing information in the text hierarchy. Do not turn a successful syntax/citation check into a “100% accurate” badge. Keep template fallback and insufficient-evidence states visible, using calm copy rather than alarm styling.

### E. Reading and continuing

Keep the composer anchored beneath the thread. Allow a small multiline question with a bounded height, visible current context and sensible Enter/Shift+Enter behaviour; composition/IME input must not accidentally submit. Suggested questions remain concise text actions tied to the selected moment.

When the reader scrolls up, new content must not pull them down. Preserve draft, focus and scroll across tab switches. Scope history by match and player, deduplicate restored messages, and reject stale request updates after a context switch. Failures preserve the question and offer Retry. Stop stops server work where supported, not merely the animation.

## 5 Motion implementation and acceptance

| Interaction | Proposed normal motion | Reduced motion / repeated keyboard action |
|---|---|---|
| Analysis / Ask | Marker travel plus overlapping directional body transition; 240–280 ms total | Immediate selection/content |
| Activity change | Small text/indicator crossfade; about 120–160 ms | Static text update |
| Completed answer | Overlapping block reveal; about 350 ms total maximum | Full answer immediately |
| Evidence activation | Immediate seek; short event emphasis without camera theatre | Immediate seek and persistent selected state |
| Disclosure | Origin-aware opacity/transform, around 160–200 ms | Direct open/close with correct focus |
| Copy/feedback | Icon/label confirmation, around 120–160 ms | Immediate confirmation |

Use shared named motion values in the current tokens/helper; avoid per-component magic numbers. The existing ease-out and ease-in-out curves are suitable starting points. Reserve GSAP timelines for synchronised relationships that CSS/WAAPI cannot express clearly. Cancel active animations on retarget/unmount and listen to reduced-motion preference changes during the session. Do not rely on a library label as proof of accessibility or smooth rendering.

The deliberate answer sequence may span about 350 ms while each constituent transition stays short. This is the bounded exception requested for expressive answer delivery, not permission to slow high-frequency controls. Prefer no animation over replay corruption, input latency or unreadable text.

Acceptance evidence for RR22/RR31:

1. Keyboard-only upload, player selection, Ask, Stop/Retry, tabs and citations work; focus is visible and returns correctly from disclosures.
2. Screen-reader status announces useful stage/completion changes, not every token or the entire transcript; controls have names, roles and states.
3. Both languages, long answers, long player names, empty/error/offline states, 200% zoom, 320–390 px mobile width, tablet and desktop remain usable.
4. A 50-turn saved thread, active playback and repeated tab switches preserve focus, draft, scroll, playback time and request ownership. Late results never appear under the wrong player/match.
5. Measure on a representative invited user's laptop, not only the RTX desktop. Target immediate input response and smooth 60 Hz transitions; inspect frame timings and long tasks rather than asserting 60 fps from code. Record before/after bundle and performance changes.
6. First answer text appears promptly once the checked response arrives; long text does not lengthen the reveal budget. Copy/selection/history and reduced motion bypass decorative delay.
7. Record short before/after interaction videos plus desktop/mobile captures. Review once as a batch, fix the material findings, then confirm; avoid endless cosmetic iteration.

## 6 Skills: use the ones already available

These are developer guidance, not runtime dependencies. Paths below are relative to the Studio root. Local presence was checked; that does not mean every agent automatically discovers Cursor's skill directory. Implementation tasks should name the exact file to read. No skill was installed or updated for this planning work.

| Skill | Role and when to load | Verified location / source |
|---|---|---|
| Emil `emil-design-eng` | Design judgement and cohesive interaction decisions before building the tab/answer sequence | `.cursor/skills/emil-design-eng/SKILL.md`; [upstream](https://github.com/emilkowalski/skills) |
| Emil `review-animations` | Review the finished interaction for timing, interruption, origin and excessive motion | `.cursor/skills/review-animations/SKILL.md`; load for an explicit motion review, not every task |
| `better-typography`, `better-layout`, `better-colors`, `better-writing` | Readability, grouping, semantic colour and concise EN/PL interface copy | Corresponding `.cursor/skills/<name>/SKILL.md` files; [upstream](https://github.com/jakubkrehel/skills) |
| `better-accessibility` | Keyboard, focus, announcements, zoom and touch checks throughout implementation | `.cursor/skills/better-accessibility/SKILL.md` |
| `gsap-react`, `gsap-performance` | React lifecycle/cleanup and animation cost only when a change actually uses GSAP | Corresponding `.cursor/skills/<name>/SKILL.md`; [official skills](https://github.com/greensock/gsap-skills) |
| Impeccable | Plan a focused critique, then polish/harden the implemented Studio; preserve the existing visual direction | `.cursor/skills/impeccable/SKILL.md`; workflow advice only here, no launcher/audit executed |
| Official coss/ui skill | Component API/composition guidance only if coss source is selected | [Official skill documentation](https://coss.com/ui/docs/skills); not installed or tested here |
| Ponytail | Reuse-first implementation discipline and small complete changes | Previously reviewed in this project; complements design skills rather than choosing the visual style |

Do not load every skill at once. For the first slice use Emil plus typography/accessibility as needed; load GSAP guidance only if used, and run an explicit motion review after the behaviour is complete. Impeccable is a bounded review workflow, not a guarantee that a detector score proves good design. ObsidianUI's agent guide and component manifests are integration references, not authority to override project decisions.

## 7 Work sequence, ownership and deadline protection

These are subtasks of the existing backlog, not a parallel task board. Core tab/loading/answer quality is required under RR18/RR22; optional ornament and true block streaming remain P1. There is no need to add paid services or a new design tool to start.

| Parent task / target | Lead | Concrete work | Done when |
|---|---|---|---|
| RR05, 23 Oct | Pawel with Aleksander | Define request/context IDs and accepted/queued/running/tool/completed/error/cancelled semantics, distinguishing existing events from new ones | UI fixtures and backend schema agree; no invented progress |
| RR18 preparation, 30 Oct | Pawel | Compare two small motion studies using the same Studio content: A, directional tabs and overlapping answer blocks; B, shared marker and flowing sentence reveal | Two short interaction captures; choose one combination after both students review reading comfort and speed |
| RR18, 5 Nov | Pawel | Implement chosen tab/composer/answer components with one motion vocabulary; trial at most one source kit plus necessary primitives | Tokens, licences and dependency costs recorded; actual visual handoff updated; direction frozen |
| RR17, 10 Nov | Aleksander, Pawel owns API contract | Emit truthful coach lifecycle events and terminal cancellation/failure states; keep checked-answer boundary | Queue/offline/tool/checking/error fixtures match real backend behaviour in both languages |
| RR19/RR22, 9–13 Nov | Pawel | Connect evidence seeking, scroll/focus/draft preservation, Stop/Retry and final answer presentation to live data | Browser end-to-end flow and acceptance checks pass; no replay/context regression |
| RR27/RR28, 13–16 Nov | Pawel captures; Aleksander reviews | Record defence-ready successful and failed chat journeys, including a long Polish answer | Reproducible demonstration with measured timings and honest states |
| RR30/RR31, 18–29 Nov | Aleksander studies; Pawel fixes | Observe invited users reading, seeking evidence, switching tabs and cancelling a request | Fix navigation/readability/performance failures before decorative additions |
| OPT02, only after RR22 secure | Pawel; Aleksander for streaming protocol | Optional resizer/detail polish or separately checked block streaming, only if capacity permits | No P0 delay; protocol/evaluation changes respect 24 Nov freeze; feature work ends 29 Nov |

First implementation slice: one real or clearly labelled fixture question, one activity line, one checked answer with working citations, and Analysis/Ask transitions. Validate that slice before spreading the design across the app. The current task plans this work; it does not implement that slice.

## 8 What remains to verify at implementation

Exact component source licences and dependency graphs, live accessibility, animation feel, mobile gestures, backend lifecycle coverage and performance still need the checks above. Beautiful UI and Bencho are currently design references; no claim is made that their components have been integrated or tested. Library counts, marketing performance claims and built-in accessibility claims were not independently certified.

Only planning documents changed. No packages, skills or MCP servers were installed, no UI code was changed, and no services were purchased or deployed.

## 9 Interactive prototype and firm engine decision, 20 October

The follow-up request produced an isolated interactive prototype in the thread's visualisation directory, named `studio-motion-prototype.html`. It is outside application source. It uses the project's existing GSAP 3.15.0 distribution with its licence header preserved, so core motion does not depend on a CDN request. Match, activity timings and answers are explicitly simulated; the encounter diagram is illustrative rather than real map geometry. Font loading is optional, with system fallbacks.

The user's follow-up spelling correction refers to GSAP. The recommendation below uses the existing GSAP dependency.

**Implementation decision:** use CSS for hover, press and state feedback; use GSAP core for the coordinated tab transition and answer reveal. Keep existing working WAAPI helpers where they already solve another interaction; do not rewrite them merely for consistency. Each property has one animation owner. Add no Motion/Framer Motion, ScrollTrigger, ScrollSmoother, SplitText or animated component suite for these features. The required behaviours do not justify those dependencies.

The animation budget is closed by default:

| Allowed motion | Purpose | Initial budget |
|---|---|---|
| Tab marker and content | Make the relationship between Analysis and Ask visible | 260 ms; transform/opacity; cancel and retarget on a new selection |
| Active work indicator | Show that an actual operation is running | One small loop only during running/checking; static during queued, idle, stopped and offline states |
| Checked answer blocks | Resolve activity into readable advice | 320 ms total; overlapping blocks; stable wrapping; no delay proportional to answer length |
| Evidence emphasis | Show where a citation led | Seek immediately; brief highlight, then return to normal |
| Press/focus feedback | Confirm input and preserve keyboard visibility | CSS; immediate functional response |

Do not animate initial page load, typing, routine scrolling, historical answers or every statistic. Keyboard tab/seek actions and reduced-motion mode resolve immediately. A new animation needs a named user benefit and must fit the existing inventory; otherwise omit it.

Use `gsap.timeline()` for sequencing and `overwrite`/explicit cancellation for interrupted transitions. In the application, scope animations to their React component and revert them on unmount; the official `useGSAP` hook supplies lifecycle cleanup, with `contextSafe` for event-created animations. Register the hook once if adopting it. `gsap.matchMedia()` can handle motion preferences; do not also run a second competing preference/animation controller. See [GSAP timelines](https://gsap.com/docs/v3/GSAP/gsap.timeline()/), [React integration](https://gsap.com/resources/React/) and [media conditions](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/). This is a small purposeful library use, not a claim that GSAP is automatically faster than CSS or WAAPI.

Prototype verification used headless Chrome and desktop/mobile captures. Checks passed for answer delivery, citation seeking, Stop/Retry, retaining the submitted round after changing the selected moment, rapid tab changes, draft preservation, keyboard navigation, manual/system reduced motion and mobile horizontal fit. No JavaScript errors were recorded. The initial sandboxed form submission issue was corrected with an explicit local send handler. These checks do not establish production frame rate, real API cancellation, screen-reader compatibility or real-demo accuracy.

The prototype adds concrete review evidence to RR18, but RR18 remains incomplete until the actual application is integrated and checked. Do not mark a product task complete from this simulation. No app code or dependency manifests changed.

## 10 Visual exploration after the Wallhack reference, 20 October

**Superseded visual recommendation:** Pawel rejected the colors, icons and typography of these concepts. Preserve them only as historical interaction studies. Section 11 is the current research brief; none of these three visual styles is approved for implementation.

The user requested more distinctive, exploratory design while retaining minimalism and the browser Studio. The new isolated `studio-design-exploration.html` compares three layouts using identical simulated round events and coaching content. These are alternatives for review, not an approved replacement for the production design system.

Primary references:

- [Wallhack](https://wallhack.com/en-eu), visually inspected in the live browser: a dominant product canvas, asymmetric composition, large technical typography, precise small specifications and generous space. Translate these relationships into replay-first composition and evidence annotations. Do not copy its artwork, logo or shopping interactions.
- [Linear's March 2026 interface refresh](https://linear.app/now/behind-the-latest-design-refresh): supporting navigation recedes, actions stay predictable, and unnecessary borders/icons are removed. Use this to keep an expressive visual direction workable during long reviews.
- [GSAP media conditions](https://gsap.com/docs/v3/GSAP/gsap.matchMedia()/): implement the reduced-motion branch and component cleanup as part of the animation system. The engine decision in section 9 remains unchanged.

| Direction | Distinct composition | Strength | Tradeoff |
|---|---|---|---|
| Precision — rejected visual direction | Large tactical canvas beside a narrow coach column; oversized round number; technical annotations | Replay and evidence remain visible together | Narrow coach column needs careful testing with long Polish answers |
| Screening Room | Wide replay above horizontal review tools and a vertical Analysis/Ask selector | Best candidate when real POV clips become a frequent workflow | More vertical travel between the scene and longer conversations |
| Field Notes | Smaller scene and moment index beside a wider editorial reading column | More comfortable for detailed reflection and longer advice | Less immediate focus on the replay; serif typography is a stylistic choice to validate |

All three preserve Analysis/Ask, seeking, two selected moments, a local question composer, simulated active-work feedback, cancellation, checked-block reveal and evidence links. The isometric scene is an original illustrative diagram, not Mirage geometry, real replay footage, or a commitment to building a 3D engine. Production uses the existing replay and recording plan. The diagram does not create a new delivery requirement.

The distinguishing elements are composition, typography, hierarchy and useful annotations. Motion stays within the section 9 budget: roughly 240 ms tab transitions, about 330 ms overlapping answer-block reveal, a small work indicator only while processing, and brief evidence emphasis. No initial-load choreography or ambient movement. The prototype uses theme-aware colors and optional font loading with fallbacks.

**RR18 next steps:** Pawel and Aleksander compare the same review in each layout; Pawel consolidates the selected shell and tokens by 5 November; Aleksander checks evidence clarity and realistic answer/error states. Test a long Polish answer, narrow-screen layout, keyboard operation and reduced motion before committing. Keep the unchosen layouts as reference, not three maintained production themes. RR22 integration and the existing November/December delivery dates remain unchanged.

## 11 Research reset: frosted materials and tactile interaction, 20 October

### Confirmed direction and status

Pawel clarified that the relevant Wallhack reference is the semi-transparent, frosted material and interaction feel, rather than its black/white palette or artwork. He wants subtle lift, pop and possibly tilt on interactive elements, while keeping the app accessible and calm. He explicitly requested research and proposed style ideas before another build. No new mockup or application implementation is authorized by this research step. This section supersedes section 10's proposed visual recommendation and its immediate prototyping sequence.

The browser Studio, hosted API/parsing, local GPU/recording workers and delivery scope remain intact. Material depth does not mean returning to an OS desktop, movable windows, or a native application. The previous olive palette, faux technical symbols, oversized round-number treatment and serif/monospace mixture are not defaults for the next exploration.

### Research method and limits

Reviewed designer-owned portfolios and essays, original project case studies, primary design-system guidance, W3C accessibility criteria and browser documentation. Visually inspected the Nike Breaking4 project and Teenage Engineering's OP-1 product presentation, in addition to the earlier Wallhack inspection. These references serve different purposes: artwork demonstrates visual identity; interaction essays explain behavior; accessibility criteria establish testable constraints. A visually impressive portfolio does not prove that an interface works for CS2 players.

No objective ranking identifies the world's best designers, and no universal combination of rules guarantees a perfect UI. Treat the recommendations below as explicit design hypotheses. The research pass is complete enough to propose directions; preference validation, realistic content and usability testing still have to happen.

[Mobbin's MCP page](https://mobbin.com/mcp) confirms a service on Pro and Team plans. The available plugin catalog returned no Mobbin result. Its web-app library redirected to a public landing page in the current browser session. No authenticated screen collection or private Mobbin search was reviewed, and no subscription or connector was installed.

### What to learn from the references

| Reference | Relevant finding | Application to Round Reviewer |
|---|---|---|
| [Apple — Meet Liquid Glass](https://developer.apple.com/videos/play/wwdc2025/219/) | Navigation/control materials have a different role from content; layered glass can undermine hierarchy | Keep glass primarily in the toolbar, tab selector, replay controls and temporary evidence preview; use a stable reading surface |
| [Microsoft Fluent materials](https://fluent2.microsoft.design/material) and [Acrylic guidance](https://learn.microsoft.com/en-us/windows/apps/design/style/acrylic) | Different materials support different kinds of surfaces; repeated acrylic layers create visual noise | One material recipe per functional layer, solid long-lived content panels, no nested blur |
| [Rauno Freiberg — Invisible Details](https://rauno.me/craft/interaction-design) | Craft depends on how interactions respond to human intent, not appearance alone | Preserve selection, focus, draft and scroll position; make interrupted transitions settle predictably |
| [Emil Kowalski — You Don't Need Animations](https://emilkowal.ski/ui/you-dont-need-animations) | Purpose and frequency matter when deciding how much to animate | Frequent seek and keyboard actions stay immediate; use restrained feedback and short transitions |
| [Giorgia Lupi and Eddie Opara — Nike Breaking4](https://www.pentagram.com/work/nike-breaking4) | Sports data can become an engaging visual explanation | Connect advice to timing, position and evidence; let meaningful match content carry identity instead of filling the screen with unrelated decoration |
| [Paula Scher](https://www.pentagram.com/about/paula-scher) | Distinctive typography can form a coherent identity across contexts | Give the brand a deliberate typographic voice, but preserve legibility and hierarchy in the working interface |
| [Susan Kare's work](https://kareprints.com/) | Small, recognizable symbols can have personality | Use a consistent icon vocabulary with meaningful labels; do not imitate retro pixels or substitute arbitrary Unicode symbols |
| [Dieter Rams' principles](https://www.rams.de/zehn-thesen-gutes-design) | Useful, understandable, honest and detailed design | Visible affordances, truthful AI states, and care in small alignments matter as much as surface polish |
| [Linear's interface refresh](https://linear.app/now/behind-the-latest-design-refresh) | Supporting navigation can recede while actions remain predictable | Keep the replay, selected evidence and current question ahead of app chrome |
| [Teenage Engineering OP-1](https://teenage.engineering/products/op-1/original/overview) | Functional color mapping can make an instrument recognizable | Use accent color consistently for a limited purpose; do not copy hardware controls or cryptic symbols into a web workflow |

[NN/g's glassmorphism guidance](https://www.nngroup.com/articles/glassmorphism/) emphasizes contrast over complex backgrounds. For this app, a bright flashbang frame, dark scene or dense radar can change the effective background dramatically. Blur alone does not guarantee readability: the material needs an appropriate tint or local scrim and validation against those cases.

[Tuch et al.'s 2012 study](https://research.google/pubs/the-role-of-visual-complexity-and-prototypicality-regarding-first-impression-of-websites-working-towards-understanding-aesthetic-judgments/) found that visual complexity and familiarity affected initial aesthetic judgments. This is evidence about first impressions of website screenshots, not proof of retention or a universal preference for plain interfaces. [NN/g's aesthetic-usability analysis](https://www.nngroup.com/articles/aesthetic-usability-effect/) further supports evaluating visual appeal separately from task success.

### Three style directions to discuss before drawing another screen

These names describe proposed treatments, not finished designs. They share the same content and basic task hierarchy so the comparison does not conflate styling with usability.

| Direction | Material and color | Typography and icons | Character and tradeoff |
|---|---|---|---|
| Frosted Studio | Soft neutral background; milky translucent navigation and controls; dark readable text; one restrained cool accent; clear replay and substantially opaque coach area | Inter Text/Display candidate; regular-weight icons; moderate rounded corners | Clean and tactile, with depth carried by edges, tint and separation. Strong starting point. Needs enough real content beneath glass to make the effect visible without artificial wallpaper |
| Smoked Glass | Neutral graphite base; smoky translucent controls; pale text; restrained icy accent; matte reading panel | Geist Sans candidate, with tabular numerals; slightly stronger icons against dark surfaces | Immersive media-review character. Must avoid disappearing boundaries, excessive dimness and reducing contrast to create atmosphere |
| Optical Accents | Neutral working surfaces; selective glass edges and a very faint cool reflection on featured match/clip previews; stronger thumbnail lift and optional tiny tilt | One readable sans family; a limited display treatment for match summaries; consistent medium-weight icons | Most expressive option, especially in the match library. Higher risk of distraction; constrain its effects to imagery and infrequent interactions |

Recommendation: shortlist Frosted Studio and Smoked Glass for the main workspace. Treat Optical Accents as an optional source of preview-card behavior rather than a third maintained theme. Pawel should choose the visual direction before the next mockup. Light/dark variants of the selected system must preserve the same hierarchy and behavior.

### Proposed shared foundation — adjustable starting values, not universal laws

Use spacing to show relationships. A consistent scale is useful, but equal spacing everywhere is not. [IBM Carbon's spacing guidance](https://www.carbondesignsystem.com/building-blocks/foundations/spacing/overview) supports tokens at both component and layout levels.

| Relationship | Starting range |
|---|---|
| Icon to label / label to value | 6–8 px |
| Closely related controls or text blocks | 8–12 px |
| Component internal padding | 16–24 px |
| Main panel gutters and distinct groups | 24–32 px |
| Desktop page inset / small-screen inset | 24–32 px / 16 px |
| Main control hit area | Aim for 40–44 px, using 44 px for touch |
| Body and coach text | 16 px; approximately 24–26 px line height |
| Secondary labels | 13–14 px; avoid low-contrast all-caps microcopy |
| Panel titles | 20–24 px; page titles approximately 28–32 px |

Use one principal text family in the workspace. [Inter](https://rsms.me/inter/) has text/display optical sizes and documented Polish support; [Geist](https://vercel.com/font) is an alternative to compare with actual English and Polish content. These are candidates, not a claim that either is inherently best. Test `Zażółć gęślą jaźń`, long player names, tabular timings and ambiguous characters such as I/l/1. Keep monospace limited to timestamps or identifiers where it improves scanning. Avoid tight tracking in small text.

Consider [Phosphor](https://github.com/phosphor-icons/core) as one consistent icon source, comparing a small representative set before adoption. Choose one normal weight and a deliberate selected treatment. Keep labels on uncommon actions. Do not mix outline icons, emoji and text glyphs as if they were one family. Check licensing and actual bundle imports at implementation.

Major groups remain anchored in the Studio grid. Use proportionally more room for replay, with a coach column wide enough for comfortable reading. Collapse secondary navigation before squeezing the coach; stack or switch views at the point real content stops fitting. Do not choose breakpoints solely from device names. Keep the selected match, round and question context visible. Default to a small ranked set of insights with access to the complete list; show rationale and supporting events on demand. This applies [progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) without hiding playback or recovery actions.

### Material policy

Use a three-level surface system: stable base, clear content surfaces, and selectively frosted controls/overlays. Frost combines backdrop blur, translucent tint, a subtle edge and restrained shadow; it is not simply low opacity. Text and icons remain fully opaque. Background motion is never added just to make the blur visible.

Good candidates: the navigation strip, selected-tab surface, replay toolbar and temporary evidence preview. Coach paragraphs, statistics, timeline labels and error messages use opaque or sufficiently occluding surfaces. Essential timeline events and crosshair/POV content should not be covered by decorative controls. Avoid nested glass or several adjacent independently blurred panels. CSS frosted glass is an approximation of a material, not Apple's native adaptive Liquid Glass renderer; native accessibility and battery behavior do not transfer automatically to the browser.

### Interaction policy after the user's hover request

All interactive elements need understandable feedback, but different controls need different feedback. Tilting every row, tab and sentence would compete with reading and targeting. The following values are proposed budgets for testing, not standards.

| Element | Proposed response | Boundary |
|---|---|---|
| Buttons and icon controls | Tint/edge change; optional 1 px lift or very small press compression; roughly 100–160 ms | Keep the hit area stable; no pointer-following magnetic displacement |
| Match/clip thumbnail | 2–3 px lift and up to about 1.01 scale; optional tilt capped near 1–2 degrees | Fine pointer only; visible focus alternative; no essential content revealed only by hover |
| Evidence preview | Anchored preview appears in about 150–200 ms; click/tap can pin it | Keyboard accessible and dismissible; pointer can enter it without dismissal; do not cover the referenced event unnecessarily |
| Analysis/Ask tabs | Shared marker and short content transition around 180–240 ms | Retarget interrupted motion; preserve drafts and selection; immediate keyboard/reduced-motion branch |
| Coach response | Truthful activity indicator, followed by short overlapping paragraph reveal | No fabricated thinking stages, forced character-by-character delay or animation of historical messages |
| Replay scrubber, data rows, paragraphs | Immediate state update; simple highlight/focus feedback | No tilt, bounce or movement that interferes with precise seeking or reading |

Start with CSS for local feedback and the existing GSAP core for coordinated transitions. No new motion library is justified by the research. Use transform/opacity for movement where practical; do not animate blur radius across the full screen. [web.dev's animation guide](https://web.dev/articles/animations-guide) explains rendering costs; [backdrop-filter guidance](https://web.dev/articles/backdrop-filter) supplies the browser mechanism. Actual performance must be profiled with playback, chat and scrolling running together on ordinary hardware, not only the RTX 5080 machine. Provide an opaque fallback and avoid a refraction shader in the university delivery scope.

### Accessibility and acceptance

Target WCAG 2.2 AA and evaluate the implemented flow; selecting a component library or adding a toggle is not proof of conformance.

- Measure normal text at least 4.5:1, qualifying large text at least 3:1, and applicable controls/graphical indicators at least 3:1. Check composited glass against representative bright, dark and busy backgrounds. See [text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) and [non-text contrast](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).
- The AA target-size criterion is 24 by 24 CSS px, with specified exceptions; the larger proposed 40–44 px controls are a usability choice, not a misstatement of the standard. See [target size](https://www.w3.org/WAI/WCAG22/Understanding/target-size-minimum.html).
- Make hover previews available through keyboard and touch, and satisfy applicable dismissible, hoverable and persistent behavior. See [content on hover or focus](https://www.w3.org/WAI/WCAG22/Understanding/content-on-hover-or-focus.html).
- Preserve keyboard focus, readable labels and status announcements. Use color plus text/shape for positive and negative findings. Scope playback shortcuts so typing in chat does not seek the replay.
- Test text resizing, zoom and narrow reflow. Support user text-spacing overrides without losing content; WCAG's override values do not prescribe the default styling. See [text spacing](https://www.w3.org/WAI/WCAG22/Understanding/text-spacing.html) and [reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html).
- Respect reduced motion. Offer a separate in-app reduced-transparency setting and opaque treatment for forced-color environments. [The transparency media query](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/At-rules/@media/prefers-reduced-transparency) has limited browser availability, so do not depend on it alone. The default glass must already be readable; the setting is not a substitute for contrast.

### Research-to-design handoff and ownership

1. Pawel chooses a material direction and reacts to the source references. This is a design preference decision, not an installation or deployment approval.
2. Pawel prepares a compact static style comparison only after that feedback: the same toolbar, evidence item and coach paragraph, with material, font, icon and spacing samples. Include light/dark and plain opaque fallback. Compare appearance before building another whole interface.
3. Aleksander supplies realistic successful, queued, unavailable, failed and cancelled coach states, an uncertain claim and a long Polish response. Pawel ensures those states fit the design.
4. After the static direction is accepted, Pawel creates one interaction slice with three levels of feedback: none/reduced, restrained, expressive. Keep the same visual design so the motion choice is meaningful. Test tab, hover/focus preview, click, rapid interruption and long answer.
5. Both observe a small formative round with invited players of differing CS2 familiarity. Tasks: locate a finding, explain its evidence, seek the exact moment, ask a follow-up, recover from a failure and identify a positive play. Record success, hesitation, misclicks and reading difficulty separately from visual preference. A small study identifies problems; it does not establish universal preference or retention.
6. Pawel consolidates tokens and components under RR18, with Aleksander reviewing evidence clarity. Preserve the 5 November direction freeze and 13 November integration target. Any research overrun reduces decorative scope rather than core functionality. Reassess with actual dates if those targets become infeasible.

For later implementation review, [Emil Kowalski's official skills](https://github.com/emilkowalski/skills) provide `emil-design-eng`, `find-animation-opportunities`, `review-animations` and `animation-performance`. Use them selectively after the art direction is chosen. They are review aids, not a replacement for accessibility checks, performance measurements or user feedback. No skills were installed or executed as part of this research.

## 12 Library integration research: interactive glass, menus and hover

20 October 2026. Research and proposed integration only; no dependencies installed, application code changed or new prototype built. “GASP” refers to GSAP. Light versus smoked glass remains undecided; this architecture supports either.

### Recommended dependency decision

Use custom Studio styling, **Base UI for controls that need accessible interaction mechanics, CSS for ordinary feedback, and existing GSAP for coordinated transitions**. Preserve working CSS/WAAPI code. Add an optional source component only when it improves the chosen interaction enough to justify maintaining it.

The inspected `apps/web/package.json` contains Next 15.5, React 19.1 and GSAP 3.15 version ranges; it does not list Tailwind, Motion, Base UI or `@gsap/react`. These are manifest ranges, not a claim about every resolved transitive version. The first proposed new packages are `@base-ui/react` and `@gsap/react`; install and lock them only in the implementation phase. Reuse the current package manager/lockfile. Do not initialise an unrelated starter theme over the app.

| Candidate | Useful role | Integration decision |
|---|---|---|
| [GSAP React integration](https://gsap.com/resources/React/) | Tab marker/content coordination, checked-answer block reveal, optional small preview tilt | Keep installed GSAP. Add the React hook adapter for scoped lifecycle cleanup. No scroll-smoothing or text-splitting plugin is needed for these interactions. |
| [Base UI Menu](https://base-ui.com/react/components/menu) | Account/actions menu, selects, evidence popovers, dialogs | First new control dependency. Apply our own CSS/material tokens instead of a preset visual theme. Keep main navigation as links and actual in-page panels as tabs; action menus are a different semantic pattern. |
| [ObsidianUI](https://github.com/Atharvsinh-codez/ObsidianUI) | Hover Image as a preview reference; Discover Button as an interaction candidate | Select one source item, not the gallery or dashboard shell. The project distributes editable source through a registry and documents MIT licensing. Its Tailwind styling needs deliberate adaptation to our current CSS setup. Exact candidate manifests could not be retrieved in this pass, so dependency approval remains pending. |
| [React Bits Glare Hover](https://reactbits.dev/animations/glare-hover) / [Tilted Card](https://reactbits.dev/components/tilted-card) | A restrained sheen or slight tilt on a match/clip thumbnail | Best optional effect shortlist. The current TypeScript/CSS [Glare Hover source](https://raw.githubusercontent.com/DavidHDev/react-bits/main/src/ts-default/Animations/GlareHover/GlareHover.tsx) and [Tilted Card source](https://raw.githubusercontent.com/DavidHDev/react-bits/main/src/ts-default/Components/TiltedCard/TiltedCard.tsx) import React and CSS, not Motion. They still contain their own animation logic; no dependency does not mean no runtime cost. Compare a selected component with a simpler local implementation before adopting. |
| [Animate UI Base UI dropdown](https://animate-ui.com/docs/primitives/base-ui/dropdown-menu) | Ready-made animated popup, moving item highlight and check feedback | Credible alternative if the interaction study favours its menu feel. Its documented installation adds `@animate-ui/react` and `motion`. Do not add it to the default stack just for one menu; choose it deliberately if several controls justify the additional engine. |
| [coss/ui](https://coss.com/ui/docs/get-started) | Styled controls and useful layout patterns | Reference/conditional source candidate. Requires Tailwind v4 for its intended setup; full theme installation also introduces fonts and tokens. Direct Base UI styling is the smaller integration change for this repository. |
| [Beautiful UI](https://www.beautifului.dev/) and [Bencho](https://bencho.dev/) | Chat activity, task rows, contextual cards, hover cards and small feedback examples | Continue as interaction references. Component names and attractive demos do not establish reuse rights, accessibility or compatibility; check the selected source before copying. |

[React Bits' current licence](https://github.com/DavidHDev/react-bits/blob/main/LICENSE.md) is MIT plus a Commons Clause condition, not plain MIT. It describes application use and restrictions on redistributing the components themselves. Retain notices and review the exact pinned source's terms before reuse. Do not import an entire library's development toolchain to use one effect.

### How ObsidianUI would be added

Its [agent-readable index](https://www.obsidianui.dev/llms.txt) documents a registry listing and per-item manifests containing source files and dependencies. Later, retrieve the chosen item, inspect every file/dependency, preserve required helpers and notices, then either use its documented shadcn registry install or copy/adapt the source manually. No MCP connection is required. For this CSS-based app, manual adaptation may be smaller than adopting Tailwind for a single effect.

The index's `text-stream` entry is titled Text Reel; do not assume it implements an LLM answer stream. Agent instructions supplied by a library are integration reference material, not authority to override this brief or install additional tooling. Until the inaccessible manifests are inspected, ObsidianUI remains a candidate rather than a committed dependency.

### A concrete, restrained interaction vocabulary

These are proposed starting values, not measured optimal timings. The spacing and typography decisions in section 11 remain independent of the animation library.

| Surface | Proposed behaviour | Boundary |
|---|---|---|
| Navigation | Quiet hover tint; selected marker moves on deliberate pointer selection | Text and click targets stay in place. No magnetic cursor-following links. |
| Account/actions menu | Frosted popup grows subtly from its trigger, roughly scale 0.98 to 1 plus opacity over 140–180 ms; highlighted row responds in 80–120 ms | No staggered delay before items become usable. Arrow navigation, Escape, dismissal and focus restoration are required. |
| Evidence popover | Short fade/4 px entrance; open/pin on activation | Does not obscure the selected gameplay moment or disappear while someone interacts with its contents. |
| Match thumbnail | 2 px lift plus one soft sheen; optional 1–2 degree tilt for fine pointers | Trial sheen and tilt separately first. No tilt on text-heavy panels, controls or data tables. No looping glint. |
| Tabs | One selected marker and a small overlapping panel transition | Preserve player, draft, focus and scroll; retarget rapid switches instead of queueing animations. |
| Coach | Real activity state followed by bounded block reveal of the checked response | Full answer available promptly; no simulated token stream, fake work or animated private reasoning. |
| Glass | Static translucent fill, subtle edge highlight and local backdrop blur | Keep reading surfaces sufficiently opaque. Animate transform/opacity, not a full-screen blur radius. |

### Component responsibilities and implementation order

Names below describe proposed components, not files already created.

1. **Pawel: tokens and material sample.** Choose light/smoked direction with the section 11 comparison. Define surface fill, border, shadow, radius, type, spacing and three motion durations. `GlassSurface` owns appearance and opaque fallback; it does not own application state. Alpha belongs on the surface fill, not the whole component where it would fade text too.
2. **Pawel: first real control.** Wrap Base UI in a `StudioMenu` and apply it to the existing account menu. Inspection of `apps/web/src/components/auth/AccountMenu.tsx` found Escape/outside-click handling and conditional unmounting, but no explicit arrow-key navigation or focus movement/restoration. Verify the replacement with keyboard and pointer before adding decorative effects. Keep authentication, permissions and sign-out behaviour intact.
3. **Pawel: popup and preview.** Add `EvidencePopover` and `MatchPreview` using the same tokens. Let the positioning primitive own coordinates; animate its popup child, not the positioning transform. Portal content must receive theme variables and deliberate stacking levels. Keep decoration separate from semantic links/buttons.
4. **Pawel: coordinated motion.** Integrate `@gsap/react` only in client components that need it. Use scoped `useGSAP`, `contextSafe` for later event-created animations, explicit listener cleanup and appropriate dependency cleanup. Check repeated mounts and rapid interaction. One owner per animated property; do not run CSS, WAAPI and GSAP on the same transform simultaneously.
5. **Aleksander: realistic data and state contracts.** Supply event-backed queued/running/completed/failed/cancelled examples, evidence records and long Polish text. Ensure stopping and changing context cannot attach a late answer to the wrong match. Expose true states independently of animation timers.
6. **Both: accept or remove the optional effect.** Compare the same screen with restrained sheen, slight tilt and neither. Record readability, task completion and perceived responsiveness. Retain an effect only if it improves feedback or material depth without making seeking, selecting or reading harder.

For ordinary popup entrance/exit, prefer the [Base UI CSS transition lifecycle](https://base-ui.com/react/handbook/animation): its starting/ending state attributes support interruption. This avoids custom GSAP unmount coordination for a simple menu. Base UI supplies interaction mechanics; it does not prove the final screen accessible.

### Verification and scope limits

- Keyboard: opening, arrow navigation where appropriate, Enter/Space, Escape, focus return, disabled items, nested controls and no focus inside hidden panels. Touch users get explicit activation instead of hover-only information.
- Motion: rapid open/close and tab changes leave one correct final state. Reduced motion removes movement/tilt and avoids delayed access. Preference changes during the session must take effect; source examples may need adaptation.
- Readability: test glass over light, dark and busy footage; long EN/PL labels; 200% zoom; narrow layouts; clear focus indication and opaque fallback. Follow section 11's accessibility criteria.
- Performance: profile a production build with replay and coach active on an ordinary laptop as well as Pawel's PC. Compare before/after bundle size, scripting, paint and missed frames. No performance benefit or frame-rate claim is established by this research.
- Verification after implementation: repository type/lint/build checks plus targeted interaction checks. No broad test suite or dependency installation is required for this documentation update.
- Schedule: core menu/tab/chat work belongs to RR18/RR22 and the existing 5 November visual freeze / 13 November integration target. Thumbnail optics are P1 and the first cut if work slips. Public landing-page effects remain after the December invited-user product.

The resulting signature should be a responsive selection marker, a tactile frosted menu and an evidence-linked answer arriving smoothly. Distinctiveness comes from their shared material, typography, spacing and timing rather than the number of libraries installed.

## 13 Identity research after the rejected glass comparison

20 October 2026. Pawel found both Frosted Studio and Smoked Glass bland and insufficiently considered. Neither is selected. The existing comparison remains a rejected study, not an implementation specification. This section proposes design concepts; it does not claim a market-first invention, validated preference or approved implementation.

### Diagnosis of the study

The study isolated material differences but did not establish a product identity. Both versions used the same familiar rounded shell, generic gradient header, uniform sans-serif treatment and conventional chat bubble. The large map heading consumed space without helping review. Glass sat over an abstract wash rather than visibly separating meaningful content. The player, match events and reasoning were absent or weakly connected, so replacing the CS2 copy with another topic would leave essentially the same interface.

The correction is to design the composition around observing a moment, understanding evidence and deciding what to practise. Light/dark appearance comes after that identity. More animation presets cannot resolve this composition problem.

### Research evidence and its application

| Primary reference inspected | Finding | Proposed application, not a claim made by the source |
|---|---|---|
| [Nike Breaking4, Eddie Opara and Giorgia Lupi / Pentagram](https://www.pentagram.com/work/nike-breaking4) | The campaign uses a recurring spiral grounded in the mile, with data and motion supporting its story. The public case study and visible lead composition were inspected; embedded film motion was not evaluated. | Derive a recurring graphic from a real round interval or selected moment. Give it a consistent job in navigation, evidence and report identity. Do not copy the spiral or neon treatment. |
| [Rauno Freiberg: Novelty](https://rauno.me/craft/novelty) | Argues that novelty should be selective and that frequent actions tolerate less flourish. This is a designer's working hypothesis, not a quantified usability law. | Concentrate expression in selecting and understanding evidence; keep repeated seeking, typing and menu navigation fast and familiar. |
| [Rauno Freiberg: Designing Depth](https://rauno.me/craft/depth) | Discusses composition through foreground/background layering and interaction choreography. | Use frost to distinguish a temporary control layer from replay, with opaque reading surfaces. Depth must remain understandable when blur is disabled. |
| [Linear: A calmer interface for a product in motion](https://linear.app/now/behind-the-latest-design-refresh) | Its design team reduces visual weight in supporting navigation and keeps action placement predictable. | Make the match the dominant subject; remove redundant boxes, headers and icon treatments rather than simplifying away functionality. |
| [Hudl Sportscode](https://www.hudl.com/products/sportscode) | Describes analysis with timelines and player reports linked directly to video. | Treat video/data/evidence linkage as useful product structure. This established pattern alone is not a distinctive identity; our composition and annotation system must do additional work. |
| [NN/g: Progressive Disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Describes showing primary choices first and revealing secondary detail when needed. | Keep the finding and its evidence action visible; disclose supporting measurements and advanced filters locally. Never hide failure, uncertainty or the selected match context for cosmetic simplicity. |

### Three genuinely different concepts

#### Review Cut — editorial sports analysis studio (recommended)

**Composition:** a dominant replay/radar stage beside an open, typeset coaching column, with a compact row of selected moments beneath the stage. A roughly two-thirds/one-third split is a desktop starting point to test, not a fixed rule for every screen. The coach is visibly part of the review rather than an unrelated messaging application. On narrow screens, the stage and finding stack in reading order with the selected round still visible.

**Visual identity:** large, compact round numerals; small precise timecodes; a readable proportional body face; deliberate asymmetry between the stage and annotation column. Avoid decorative monospace body text or the rejected serif coach treatment. Use rounded corners for temporary controls and stronger, simpler edges for the media stage. Compare the typography in black and white before choosing an accent or background tint.

**Signature:** a pair of open brackets marks one selected time interval. The same interval label appears beside its coach observation and on the timeline. Selecting an evidence link seeks immediately and briefly emphasises those matching anchors. This should feel like an analyst has marked a passage in the match. It does not draw permanent wires across the screen or outline every element.

**Glass:** one slim control strip at the edge of the stage and anchored temporary menus. A replay frame gives the frost real material context. Coach prose stays on a matte surface; overlay placement must not cover the relevant players or event.

**Scope:** can reuse existing playback, selected moment and evidence IDs. When recording is unavailable, the radar and timestamp carry the same identity. No new video-generation or inference requirement is implied. This is the recommended concept to explore first; it is not yet approved.

#### Tactical Lens — spatial and investigative

**Composition:** the radar/replay occupies a central analysis plane. A stable side inspector presents the selected observation, with one relevant location or pair of players emphasised in context.

**Visual identity:** precise alignment, restrained location annotations and a clear contrast between spatial content and quiet chrome. One local focus treatment provides depth; general UI does not imitate a weapon HUD or operating system.

**Signature:** activating a supported finding moves visual emphasis to the relevant part of the scene and brings its explanation into the inspector. Keep a visible action for keyboard/touch; hover can preview but never seek or commit selection.

**Glass:** inspector controls sit on a local frosted layer; important geometry remains clear. Never blur the actual evidence as a reveal effect.

**Risk:** visibility, cover and trade claims need real supporting data. Player coordinates alone do not establish line of sight. Spatial highlighting must use verified inputs; otherwise display the event and explicitly limited evidence. Potentially more engineering work than Review Cut.

#### Round Rhythm — a match expressed through its events

**Composition:** a compact sequence of rounds leads into the selected round's event track, with replay and explanation below. The same selected round remains visually continuous between overview and detail.

**Visual identity:** event marks and spacing derived from actual timestamps create a recognisable match graphic. Round labels and event types remain readable; the graphic is not an invented audio waveform or decorative performance score.

**Signature:** selecting a round expands its interval into the review track. A small version can identify the same match elsewhere, without claiming to be a unique identifier.

**Glass:** restricted to the selected controls or preview, leaving the event sequence crisp.

**Risk:** the overview could become dense and is less expressive for a new account with no parsed matches. Grouping, empty states and accessible alternatives need extra design. Do not compress every event into unreadable marks merely to make an attractive texture.

### How to keep the chosen concept simple

- Keep existing product requirements: upload/parse status, shared access, replay/radar fallback, round/player selection, findings, evidence-linked coach, notes/practice priorities, EN/PL, unavailable/error/cancelled states and account controls. A restyle does not remove these requirements or change their delivery priority.
- Keep the most common actions in conventional locations with labels. Make novelty live in the match/evidence treatment, not unfamiliar navigation gestures.
- Use one primary signature per concept. Do not combine an editorial strip, spatial lens, event graphic, liquid shader and animated dock into a single screen.
- Preserve the section 11 spacing scale, but use more space between different tasks than within one finding. Avoid mechanically placing every item in an equally padded rounded card.
- Keep distinct appearances for observation, interpretation and a practice suggestion; a visual highlight is not proof an AI claim is correct.
- Preserve accessibility and predictable focus. Optional movement is removable; [WCAG 2.3.3](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html) addresses disabling nonessential interaction animation at AAA. The existing AA target remains, with reduced motion as an additional product requirement.
- Use the existing CSS/Base UI/GSAP recommendation. ObsidianUI and React Bits are possible source details after the signature is selected, not the source of the overall composition.

### Evidence required before another full prototype

1. **Concept choice:** Pawel reacts to Review Cut, Tactical Lens and Round Rhythm as different compositions. Stop asking light versus dark as the main identity decision.
2. **Pawel, static direction boards:** after that feedback, compare one identical realistic scene in the relevant concepts. Show the full relationship of replay, timeline and coach at a usable desktop size; include type, material and event-mark samples. The board must still look deliberate with animation disabled and in grayscale. No abstract gradient stand-in for the central task.
3. **Aleksander, evidence pack:** provide one well-supported mistake, one positive play, one uncertain observation, a long Polish answer and recording/worker-unavailable states. Use supplied assets or clearly labelled sample content, never invented claims presented as actual match analysis.
4. **Pawel, one interaction:** demonstrate observation -> evidence -> exact moment using the chosen composition. Keep input response immediate, show interrupted/rapid selection, and provide reduced-motion/opaque equivalents.
5. **Both, formative review:** ask invited users what product they think this is before explaining it, what draws their eye first, how to find evidence, and how to resume the match. Record recognition, task success, hesitation and preference separately. Evaluate visual identity through recall and description; do not claim a small study proves retention or superiority over competitors.

Acceptance gates: recognisably about match review without relying on the logo; clear first task; visible relationship between advice and evidence; one memorable visual motif; comfortable reading; complete keyboard/touch paths; no regressions to core features. Failure means revising the concept, not layering on more effects.

Maintain the existing university milestones. Constrain the next design pass to one selected concept and one working interaction before the 5 November direction freeze; reduce decorative scope if it threatens the 13 November integration target. No new prototype or application changes were made in this research pass.

## 14 Tactical Lens selected: full Studio interaction study

20 October 2026. Pawel requested expansion of Tactical Lens with replay, timeline, coach chat and subtle frosted-glass animation, and rejected the greenish/orange palette. This authorises the interactive study; it does not approve a final palette or ask for production integration.

Prototype: `C:/Users/pawel/.codex/visualizations/2026/10/19/01a15595-6726-7230-90a4-71c88346d21e/tactical-lens-studio.html`.

### Palette and material

Reviewed [Adobe Color](https://color.adobe.com/create/color-wheel), [Adobe Spectrum's colour guidance](https://spectrum.adobe.com/page/color/) and [Radix's colour scale roles](https://www.radix-ui.com/colors/docs/palette-composition/understanding-the-scale). The application here is to separate quiet neutral surfaces from action/selection colour and readable text. These are custom proposed palettes, not downloaded Adobe themes or a claim of automatic accessibility compliance.

| Prototype option | Surface / accent | Purpose |
|---|---|---|
| Carbon / Cobalt, default | Charcoal `#111318`, raised `#191c23`, text accent `#a5b9ff`, action fill `#415be8` | A restrained dark analysis workspace with blue reserved for controls and selected evidence. |
| Graphite / Ice | Graphite `#131719`, raised `#1c2226`, text accent `#9ad6ed`, action fill `#28647b` | A cooler alternative with less violet in the accent. |
| Paper / Ultramarine | Cool paper `#eceff5`, raised `#fafbfe`, accent/action `#3553bd` | A readable light alternative using the identical composition and interaction. |

The scene image retains its natural sandy tones; the UI no longer uses the rejected orange/green pairing. IBM Plex Sans provides proportional reading text; Plex Mono is limited to timestamps. The selected moment's lens, number and timestamp provide the visual signature. No decorative OS shell or floating windows.

Frost is limited to the annotation controls over the scene. The coach and reading surfaces remain opaque. Appearance settings include reduced motion and solid surfaces; the host design control can vary blur strength. Opacity and small translation animate, not the blur radius or the underlying match evidence.

### Behaviours demonstrated

- Replay controls operate a clearly labelled simulation over a Mirage reference still: play/pause, stepping, speed, scrubbing and four selected moments. They do not decode a demo or render actual POV footage.
- Replay, Evidence and Notes & practice are functional tabs. A restrained sliding indicator and short content transition preserve the selection.
- Coach citations select the corresponding replay moment. Existing answers retain their original time context while the user explores the timeline.
- Coach suggestions and the composer demonstrate scripted replies, bounded block arrival, loading, interruption and limited conversation history. Unknown questions explain the simulation's limits. There is no live model or actual analysis.
- Notes and the selected practice focus are maintained locally in the prototype, with host state persistence when available.
- Keyboard controls, native inputs, reduced-motion support and solid-surface alternatives are included. Accessibility certification and a complete product audit are not implied.

GSAP 3.15 handles coordinated tab/answer transitions; ordinary hover/focus feedback uses CSS. No additional component framework is required for this study. Production integration should reuse the existing GSAP dependency and accessible app controls, not import multiple animation libraries to recreate the same effect.

Preview checks: visually inspected dark and light desktop states and the stacked narrow layout; verified replay playback, evidence seeking, typed and suggested chat replies, reply cancellation, saved practice appearing in Notes, and palette selection. The 320px preview frame reported no horizontal content overflow (305px usable width with its scrollbar); its Mirage image loaded at its original 1920px width. A preview-specific form submission issue was fixed by wiring the Send/Stop button directly. No browser console warnings or errors were reported at the inspected checkpoint. This is targeted prototype verification, not application integration testing or a complete accessibility audit.

### Next implementation split after prototype feedback

**Pawel:** confirm the palette and density; extract the selected tokens and reusable control treatments; integrate tabs, replay controls, coach states and reduced-motion behaviour into the existing Studio. Keep requesting visual feedback on concrete working screens rather than restarting the art direction.

**Aleksander:** provide verified replay/event IDs, timestamp mapping and evidence records; distinguish unavailable recording from available parsed data; connect actual analysis status and cancellation. Do not replace the prototype's clearly labelled samples with unverified visibility or trade claims.

**Together:** check one evidence-to-replay journey, one positive observation, one uncertain claim, a long Polish answer and worker-unavailable states with invited testers. Keep the existing 5 November visual freeze and 13 November integration target. The prototype is a design deliverable, not evidence that these production tasks are finished.
