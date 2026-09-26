---
name: rr-detector
description: Add or change a Round Reviewer detector that turns parsed CS2 demo data into evidence-linked findings (F-ids). Use for anything under apps/api/app/analysis/.
---

# Round Reviewer detector

Read first: `docs/coach/AI-COACH-PLAN.md` §4, `docs/handoff/19-DECISIONS.md` (#2, #4), `docs/coach/TASKS.md` for the assigned task.

## Contract

- A detector is a pure function `detect(match: MatchData, round_no: int, player_id: str) -> list[Finding]` in `apps/api/app/analysis/detectors/<name>.py`, registered in `detectors/__init__.py`.
- No I/O, no randomness, no LLM. Same input gives the same findings.
- `Finding` fields (plan §4.4): `detector` is the module name in snake_case; `kind` is `mistake | good | context | pattern`; `t` uses the round clock of the replay (`time_utils`), not raw ticks; `zone` comes from `maps/zones` via `zone_at(x, y)`.
- Every number a sentence could quote goes into `evidence` with a unit-bearing key (`nearestTeammateM`, `speedUps`, `tradeWindowS`). The LLM may only quote numbers found there.
- `summary` is a deterministic English template; add the pl/nl template in `coach/templates/` in the same change.
- `severity` in 0..1, documented formula at the top of the module. Thresholds are module constants with a comment saying where the value comes from (game data, labelled rounds, or a guess to tune).

## Steps

1. Check the parsed fields you need exist (`parse_demo.py`); if not, extend the parse (task T10) and measure blob size.
2. Write the detector and a short docstring: signal, thresholds, known false positives.
3. Tests in `apps/api/tests/analysis/test_<name>.py`: at least one positive and one negative case from a real labelled round (`data/labels/`), plus a synthetic edge case. Tests must run without the real demo present (`pytest.skip` the real-demo case otherwise).
4. Run `cd apps/api && pytest` and record the result.
5. Update the detector table in the plan (§4.3) if behaviour differs, the task status in TASKS.md, `18-CURRENT-STATE.md`, and the agent log.

## Don'ts

- Don't encode coaching advice in detectors; they state what happened. Explanations are the agent's job.
- Don't add maps beyond Mirage and Anubis.
- Don't change `Finding` fields without updating Pydantic, TypeScript and `16-DATA-CONTRACTS.md` together.
