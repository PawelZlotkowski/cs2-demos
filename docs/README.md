# Docs

Everything written about Round Reviewer, grouped by what you are trying to do.

## Start here

| Doc | Read it for |
|---|---|
| [RUN-LOCALLY](RUN-LOCALLY.md) | Every PowerShell command to run and test the app on Windows |
| [handoff/18-CURRENT-STATE](handoff/18-CURRENT-STATE.md) | What is real, what is mocked, what is next |
| [handoff/19-DECISIONS](handoff/19-DECISIONS.md) | Decisions not to undo |
| [coach/AI-COACH-PLAN](coach/AI-COACH-PLAN.md) | The current milestone, the self-hosted AI coach |
| [coach/TASKS](coach/TASKS.md) | The task board for the coach milestone |

## `handoff/` — product and design

The numbered package the project started from. [00-README](handoff/00-README.md) gives the reading order.

- **Product:** [01 Product scope](handoff/01-PRODUCT-SCOPE.md), [02 UX architecture](handoff/02-UX-ARCHITECTURE.md), [10 Personalisation](handoff/10-PERSONALIZATION.md)
- **Design:** [03 Design system](handoff/03-DESIGN-SYSTEM.md), [04 Anti-AI design rules](handoff/04-ANTI-AI-DESIGN-RULES.md), [11 Motion](handoff/11-MOTION-SYSTEM.md), [13 Accessibility](handoff/13-ACCESSIBILITY.md), [14 Responsive](handoff/14-RESPONSIVE-BEHAVIOR.md), [22 Design changelog](handoff/22-CHANGELOG-DESIGN.md)
- **Studio parts:** [05 Analysis Studio](handoff/05-ANALYSIS-STUDIO.md), [06 Overlays](handoff/06-VIDEO-OVERLAY-SYSTEM.md), [07 Radar](handoff/07-RADAR-SYSTEM.md), [08 Timeline](handoff/08-TIMELINE-SYSTEM.md), [09 AI Coach](handoff/09-AI-COACH.md)
- **Engineering:** [15 Implementation architecture](handoff/15-IMPLEMENTATION-ARCHITECTURE.md), [16 Data contracts](handoff/16-DATA-CONTRACTS.md), [17 Testing and QA](handoff/17-TESTING-QA.md), [24 MVP architecture](handoff/24-MVP-ARCHITECTURE.md), [25 Frontend review](handoff/25-FRONTEND-REVIEW.md), [30 Review, roles and admin panel](handoff/30-REVIEW-AND-ADMIN-PANEL.md)
- **For agents:** [12 Skills and references](handoff/12-SKILLS-AND-REFERENCES.md), [20 Agent instructions](handoff/20-AGENT-INSTRUCTIONS.md), [21 Cursor handoff](handoff/21-CURSOR-HANDOFF.md), [23 Agent log](handoff/23-AGENT-LOG.md)

## `replay/` — demo parsing and radar replay

- [demo-parser](replay/demo-parser.md): demoparser2 research, fields and events
- [replay-architecture](replay/replay-architecture.md): time model, sampling, API and persistence
- [replay-performance](replay/replay-performance.md): timings and sizes on the test demo
- [csdm-video](replay/csdm-video.md): CS Demo Manager gameplay clip worker, env and storage

## `coach/` — AI coach milestone

- [AI-COACH-PLAN](coach/AI-COACH-PLAN.md): architecture, detectors, agent, RAG, evaluation
- [TASKS](coach/TASKS.md): task board
- [PROPOSAL](coach/PROPOSAL.md): school project proposal
- [MODEL-OPTIONS](coach/MODEL-OPTIONS.md): open-weight models other than Qwen, compared for the 5080 and the Pro 6000
- `screenshots/` (Studio and player picker) and `zones/` (callout zone overlays)
