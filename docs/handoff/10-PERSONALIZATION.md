# 10 Personalisation

Related: [01 Product scope](./01-PRODUCT-SCOPE.md), [09 Coach](./09-AI-COACH.md), [16 Data contracts](./16-DATA-CONTRACTS.md)

**Status: mocked.** History is sample data (`pattern.last7` per moment, `LAST7`, `HOME.patterns`). There is no persistence layer.

## What to track (planned)

- repeated mistakes and repeated strengths
- behaviour per map and per side (T or CT)
- role and tactical tendencies (for example rotating on sound, dry peeking a mid entry)
- improvement and regression over time

## Classification

| Class | Rule (to be tuned) | UI wording |
|---|---|---|
| One-off | First occurrence in the window | "First time this has been flagged. It needs a few more matches before it counts as a strength." |
| Recurring problem | 3 or more of the last 7 matches, with a flat or rising rate | "Early rotations off A in 4 of your last 7 matches." |
| Improving | The rate dropped against the previous window | "Improving: 2 of your last 7 matches, down from 5 of the 7 before." |
| Established strength | A good play in 4 or more of the last 7 | "Window smoke on time in 5 of your last 7 matches as T." |

These thresholds are illustrative. The definitive rules are **unknown or planned** and must live in code, not in the LLM.

## Where it appears

- **Home:** "Work on next" (the single top focus), and "Repeated in your last 7 matches" (at most 3).
- **Studio:** the "Last 7 matches" disclosure (dots in the summary, newest first; the matches it occurred in are listed when opened).
- **Coach:** answers may reference history ("Compare with previous matches").

## Rules against unsupported claims

- Only say "occurred in N of your last M matches" when M analysed matches exist and N is counted by code.
- Show the evidence: the dots and the list of matches.
- If the history is too short, say so. Never extrapolate a trend from fewer than about 3 matches.
- The LLM may phrase a claim but never compute it. Counts, rates and trends come from the history service ([16](./16-DATA-CONTRACTS.md#player-history)).
- Do not add achievements, scores, XP or streaks ([01](./01-PRODUCT-SCOPE.md#out-of-scope-unless-deliberately-approved)).
