# 20 Agent instructions

Related: [21 Cursor handoff](./21-CURSOR-HANDOFF.md), [18 Current state](./18-CURRENT-STATE.md), [19 Decisions](./19-DECISIONS.md), [17 Testing](./17-TESTING-QA.md)

These are the operating instructions for Cursor, Claude or any other coding agent working on this project.

## Working principles

- **Inspect before editing.** Read the relevant docs and code, and take screenshots of the current state first ([`tools/qa/screenshots.py`](../../tools/qa/screenshots.py)).
- **Preserve working functionality.** The time-driven overlay model, the linked states and the responsive behaviour were hard-won.
- **Prefer incremental change.** Make one high-value change at a time, and don't rewrite the application.
- **Never document or claim something as working unless you ran it.** Keep [18](./18-CURRENT-STATE.md) truthful and update it in the same change.
- **Follow the writing rules** in UI copy and docs: British spelling, sentence case, no em dashes.

## Priority order

1. Broken functionality
2. Data correctness (engine facts versus LLM text, [16](./16-DATA-CONTRACTS.md))
3. Synchronisation (the video clock drives overlays, radar and timeline)
4. How playback, radar and the timeline relate
5. Accessibility
6. Responsive behaviour
7. Usability
8. Hierarchy
9. Anti-AI refinement
10. Motion
11. Micro-polish

## Agent loop

Inspect → choose the highest-value issue → implement → test → inspect the rendered result at desktop, tablet and mobile → refine → update the docs → continue.

## Do not do on your own initiative

Ask the owner first before you:

- change the product concept or the 5 to 6 moment model
- replace the stack, or rewrite the application
- change the core data model without a migration note in [16](./16-DATA-CONTRACTS.md)
- add expensive infrastructure or paid services
- reintroduce generic AI styling ([04](./04-ANTI-AI-DESIGN-RULES.md)) or decorative motion ([11](./11-MOTION-SYSTEM.md))
- let the LLM produce numbers or facts that are not in the findings
- resolve the design-direction contradiction ([18](./18-CURRENT-STATE.md#contradictions)) yourself

## Allowed without asking

- Bug fixes
- UI refinement within [03](./03-DESIGN-SYSTEM.md) and [04](./04-ANTI-AI-DESIGN-RULES.md)
- Responsive fixes
- Accessibility improvements
- Tests
- Local refactors and code clean-up
- Performance work
- Copy improvements

## Definition of done for UI changes

- Screenshots at all six sizes, compared with the previous ones
- No JS page errors
- The overlay synchronisation checks in [17](./17-TESTING-QA.md#overlay-synchronisation-tests-highest-priority) pass for the moments you touched
- Keyboard path still works, and reduced motion is respected
- Docs updated: [18](./18-CURRENT-STATE.md), plus [22](./22-CHANGELOG-DESIGN.md) if the design changed
