# Round Reviewer: handoff package

Round Reviewer is a CS2 coaching tool. A player uploads a match demo (`.dem.zst` or `.dem`), the engine picks the 5 or 6 moments with the most learning value, and the player reviews each one in a replay-analysis workspace. The workspace has rendered gameplay, a tactical radar, an event timeline and a Coach that already knows the context.

It is a pair project for the Howest Generative AI course (MTS5 MCTE). The proposal is due 4 October 2026 and the project is due 6 December 2026.

## Status in one paragraph

The **Analysis Studio** UI exists as a single-file interactive prototype, [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html), and every piece of data in it is sample data. Nothing is connected to a backend.

- **Scripted:** the gameplay clip is a canvas placeholder, the radar uses a simplified map, and Coach answers and processing are scripted.
- **Built separately, not in this package:** the analysis engine (`cs2coach`), the Cursor skill pack and the older scope and design docs live in the main project repository. They are known from project history but were not inspected here.

[18-CURRENT-STATE](./18-CURRENT-STATE.md) has the exact status. The current milestone, the self-hosted AI Coach, is planned in [docs/coach/](../coach/AI-COACH-PLAN.md).

## Where things live

| Path | What it is |
|---|---|
| [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html) | The whole UI prototype: HTML, CSS, JS, sample data. GSAP 3.12.5 and Flip load from cdnjs |
| [`docs/handoff/`](./) | This documentation package |
| [`docs/handoff/screenshots/`](./screenshots/) | Before/after sheets from the two design audits |
| [`prototype/qa/screenshots.py`](../../prototype/qa/screenshots.py) | Playwright script that screenshots the main states at six viewport sizes |

## Do not start coding before reading

At minimum, read these, in this order:

1. [21-CURSOR-HANDOFF](./21-CURSOR-HANDOFF.md) (short brief)
2. [19-DECISIONS](./19-DECISIONS.md) (what not to undo)
3. [18-CURRENT-STATE](./18-CURRENT-STATE.md) (what is real and what is mocked)

Then read the rest as the task needs it. For a full read, use this order:

1. [01 Product scope](./01-PRODUCT-SCOPE.md)
2. [03 Design system](./03-DESIGN-SYSTEM.md) and [04 Anti-AI design rules](./04-ANTI-AI-DESIGN-RULES.md)
3. [02 UX architecture](./02-UX-ARCHITECTURE.md)
4. [05 Analysis Studio](./05-ANALYSIS-STUDIO.md), then [06 Overlays](./06-VIDEO-OVERLAY-SYSTEM.md), [07 Radar](./07-RADAR-SYSTEM.md) and [08 Timeline](./08-TIMELINE-SYSTEM.md)
5. [09 AI Coach](./09-AI-COACH.md) and [10 Personalisation](./10-PERSONALIZATION.md)
6. [12 Skills and references](./12-SKILLS-AND-REFERENCES.md), [11 Motion](./11-MOTION-SYSTEM.md), [13 Accessibility](./13-ACCESSIBILITY.md) and [14 Responsive](./14-RESPONSIVE-BEHAVIOR.md)
7. [15 Implementation](./15-IMPLEMENTATION-ARCHITECTURE.md) and [16 Data contracts](./16-DATA-CONTRACTS.md)
8. [17 Testing and QA](./17-TESTING-QA.md)
9. [18 Current state](./18-CURRENT-STATE.md), [19 Decisions](./19-DECISIONS.md) and [22 Design changelog](./22-CHANGELOG-DESIGN.md)

[20 Agent instructions](./20-AGENT-INSTRUCTIONS.md) is the operating manual for any coding agent.

## How to approach the project

- **Code decides what happened; the LLM explains it.** Never let generated text become the source of a gameplay fact.
- **The replay is the product.** The stage (gameplay or radar), the timeline and the analysis are one instrument. It is not a dashboard.
- **Change incrementally.** Inspect first, take screenshots before and after, and keep what already works.

## Status labels used in these docs

- **implemented:** works in the prototype with its sample data.
- **partial:** works but is incomplete or has known gaps.
- **mocked:** looks real in the UI but is scripted or fake.
- **planned:** decided, not built.
- **unknown:** could not be determined from what was inspected.
