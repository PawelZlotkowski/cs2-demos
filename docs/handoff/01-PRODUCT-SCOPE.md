# 01 Product scope

Related: [02 UX architecture](./02-UX-ARCHITECTURE.md), [10 Personalisation](./10-PERSONALIZATION.md), [16 Data contracts](./16-DATA-CONTRACTS.md), [19 Decisions](./19-DECISIONS.md)

## The central question

> What can this player learn from this match?

Every screen, metric and sentence should serve that question.

## Concept

**Upload** (Status: mocked in the prototype). The user uploads a `.dem.zst` (FACEIT) or a `.dem` (matchmaking via CS Demo Manager).

**Engine** (Status: partial). The engine reconstructs the match and detects:

- mistakes and missed opportunities
- good decisions and strong plays
- positioning and timing issues
- utility usage
- tactical patterns and recurring behaviour

A proof-of-concept Python package, `cs2coach`, exists in the main repository according to project history. It does the following:

- decompresses `.dem.zst` files
- parses demos into four Parquet tables (kills, death_states, blinds, rounds)
- runs rule-based detectors that produce findings with IDs (`F1`, `F2`, and so on)
- writes JSON and Markdown reports
- plots findings on radar images

It was not inspected in this handoff.

**Selection** (Status: planned). The engine ranks candidates and selects about 5 or 6 moments with the highest learning value. Each moment gets a plain reason for why it was picked.

**Explanation** (Status: mocked). An LLM explains each selected moment from the structured findings and cites finding IDs. The prototype's explanations are hand-written to show the target voice and length.

**Review** (Status: implemented as a prototype). The user inspects each moment in rendered gameplay or on the radar, both driven by the same clip time, with an event timeline and an analysis panel.

**Coach** (Status: mocked). The user asks follow-up questions. The Coach already knows the match, round, moment, timestamp, current view, findings and history. See [09](./09-AI-COACH.md).

**Personalisation** (Status: mocked). The system tracks recurring mistakes, strengths and improvement across matches. See [10](./10-PERSONALIZATION.md).

## Main flow

Upload → process → reconstruct → detect → rank → select → explain → review → ask the Coach → identify patterns → track improvement

## Source of truth

- Deterministic gameplay data, game-state reconstruction, metrics, spatial information and events come from code.
- The LLM interprets them. It must never be the source of a measurable fact (times, distances, counts, positions, who killed whom).
- Every factual claim in generated text must trace back to a finding ID.

## Target user and jobs

**Target user:** a competitive CS2 player, from roughly FACEIT level 4 to 10 or Premier, who wants to improve and reviews their own matches. They are not a professional analyst.

**Jobs to be done:**

1. After a match, find out quickly what actually cost or won rounds, without watching the full demo.
2. See the moment in context (footage and positions) and understand why it mattered.
3. Know what to do differently next time.
4. Notice repeated habits across matches, and see whether they are improving.

## Product principles

- A few high-value moments beat an exhaustive list.
- Show space and time before prose: overlays, paths, zones, timing brackets.
- Every claim is evidence-backed and citable.
- Personalisation states only what the history supports ([10](./10-PERSONALIZATION.md)).
- It is a workstation for reviewing a replay, not a stats dashboard ([04](./04-ANTI-AI-DESIGN-RULES.md)).

## Scope from earlier planning (Status: unknown for the Analysis Studio direction)

According to project history, the main repository's `PROJECT_SCOPE.md` also lists the following:

| Feature | Stack or data |
|---|---|
| Win-probability curves per round | CatBoost, then a PyTorch Geometric GNN, trained on CounterQuant pro demos |
| A five-skill scorecard scored 1 to 5 by code | |
| "How pros played it" comparisons | RAG with LanceDB |
| Map scope: Mirage first, then Anubis and Ancient | |

The Analysis Studio prototype does not show win-probability curves, the scorecard or pro comparisons. Whether they stay in scope, and where they would live in this UI, is **undecided**. See [18](./18-CURRENT-STATE.md#contradictions).

## Out of scope unless deliberately approved

- Live or in-game overlays, and anti-cheat-sensitive tooling
- Team or organisation dashboards and multi-player scouting
- Social features, leaderboards, achievements, streaks, XP or other gamification
- A standalone chatbot page detached from a match
- Generic stat dashboards (K/D grids, heatmap walls) with no link to a lesson
- 3D reconstruction of matches (explicitly dropped earlier)
- Any external clip-rendering service (clips are rendered by a CS Demo Manager CLI worker: on a local PC first, then an Azure GPU VM)
