# Round Reviewer

A self-hosted coach for Counter-Strike 2. Upload a match demo, pick a player, and review the handful of moments that matter most on a radar replay, with an AI coach that explains what went wrong and what went right.

## Status (27 September 2026)

### What works

- **Replay:** upload a FACEIT `.dem.zst` or a CS Demo Manager `.dem`, parse it with demoparser2, and scrub every round on the radar (Mirage and Anubis).
- **Analysis:** you pick a player after parsing. Ten detectors turn the demo into findings with evidence, and the per-round stats and a code ranker pick five or six moments.
- **Coach:** the `cs2-demo` MCP server exposes the coach tools to an agent loop. A verifier checks every claim and number against a finding, and English, Polish and Dutch templates stand in when the model is off. It runs live on the RTX 5080 with Qwen3-14B on llama.cpp.
- **Knowledge (RAG):** Mirage, Anubis and fundamentals notes plus Liquipedia pages, searched with FTS5 and optional dense vectors. Answers cite passages as `[K..]`.
- **Studio:** opens on a match overview (key facts, a round strip and the coach's summary), then walks through the moments with "Moment N of M" and ends on a wrap-up with one drill per mistake type. Around it: a moment rail, the radar or a POV clip, a timeline with a Coach lane, the Analysis and Ask tabs, light and dark themes, and a bottom sheet on phones.
- **POV clips:** CS Demo Manager records the picked player's view for each moment before the analysis opens. This needs Windows with CS2 and CS Demo Manager.
- **Task board:** [cs2-coach-tracker.vercel.app](https://cs2-coach-tracker.vercel.app), seeded from [docs/coach/TASKS.md](docs/coach/TASKS.md).

### Waiting on you

| Decision or action | Recommendation | Where |
|---|---|---|
| Try Gemma 4 12B against Qwen3-14B on the 5080 | Yes, keep Qwen3-14B as the baseline | [Model options](https://github.com/PawelZlotkowski/cs2-demos/blob/claude/project-thread-0nc60h/docs/coach/MODEL-OPTIONS.md) (not merged yet) |
| Accounts plan (Steam sign-in plus password, private PC only, manual upload) | Merge | [PR #12](https://github.com/PawelZlotkowski/cs2-demos/pull/12) |
| Old draft PRs | Close [#3](https://github.com/PawelZlotkowski/cs2-demos/pull/3) and [#4](https://github.com/PawelZlotkowski/cs2-demos/pull/4); all of their commits are already in `main` (#3) or come with this README's PR (#4) | GitHub |
| Partner's name in the proposal | Add it | [docs/coach/PROPOSAL.md](docs/coach/PROPOSAL.md) |

### What to focus on, in order

1. **Proposal, due 4 October 2026.** Finish [PROPOSAL.md](docs/coach/PROPOSAL.md) with your partner's name.
2. **Label rounds** (T17, then T60 to T62). This tunes the detectors and produces the evaluation numbers the report needs. Use `python -m eval.label_tool`; the format is in [data/labels/README.md](data/labels/README.md).
3. **In-game check** of the map notes in `data/knowledge/` and the callout zones in `apps/api/app/maps/zones/` (both are first drafts).
4. **Before the intermediary defence on 17 November 2026:** the rest of the [design polish plan](docs/handoff/26-DESIGN-POLISH-PLAN.md) (the UI check and items 1 to 3 are done; next is item 4, showing the agent's work), then sign-in and the match library from the accounts plan (A00 to A14), then the defence deck (T64).
5. **Last:** the QLoRA fine-tune (T50 to T53), once the model is chosen, then the evaluation runs and the report for 6 December 2026 (T61, T63, T65).

### Known gaps

- Real CS Demo Manager recording has only been tried on your PC. The cloud sessions can only use stub clips.
- The detector thresholds and zones are first guesses until the labelled rounds are in.
- Polish answers are weaker than English and Dutch.
- There is no match list on Home yet, and the sample fixture match has no radar data.

## Quick start (Docker)

With Docker Desktop running, from the repo root:

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Web (Analysis Studio) | http://localhost:3000 |
| API | http://localhost:8000 (`/health`, `/docs`) |

## Quick start (local)

```bash
# API
cd apps/api
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000

# Web (separate terminal)
cd apps/web
npm install
npm run dev
```

Tests: `cd apps/api && pytest`. Web checks: `cd apps/web && npm run typecheck && npm run build`.

## Repository layout

```
apps/
  api/          FastAPI backend: upload, parse pipeline, replay APIs, detectors, coach agent
    app/
      analysis/   detectors → findings, round stats, code ranker
      coach/      LLM client, agent loop, tools, verifier, prompts
      maps/       radar transforms and callout zones
      models/     Pydantic contracts (source of truth for the web types)
      processing/ zstd + demoparser2 pipeline
    tests/
  web/          Next.js app: upload, processing, Analysis Studio (radar, timeline, coach)
  mcp/          MCP server exposing the coach tools (python -m cs2_demo_mcp)
docs/           all documentation, indexed in docs/README.md
  handoff/      product, design system, contracts, decisions (numbered, read-first)
  replay/       demo parser research, replay architecture, performance
  coach/        AI coach plan, task board, school proposal
eval/           evaluation and labelling tools (python -m eval.label_tool)
data/labels/    hand labels for the detectors (no raw demos)
docker/         Dockerfiles; compose.yaml at the root runs api + web
prototype/      the original single-file Studio prototype, for reference only
  qa/           its Playwright checks
  fixtures/     the sample match extracted from it
tools/          dev scripts (zones_overlay.py redraws docs/coach/zones/)
.cursor/skills/ agent skills shared by Cursor and Claude Code
```

## For contributors and agents

- [AGENTS.md](AGENTS.md) is the single source of agent instructions (Claude Code reads it through [CLAUDE.md](CLAUDE.md)).
- Before changing product or design, read [docs/handoff/19-DECISIONS.md](docs/handoff/19-DECISIONS.md) and [docs/handoff/18-CURRENT-STATE.md](docs/handoff/18-CURRENT-STATE.md).
- British spelling in docs and UI copy.
