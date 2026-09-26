# Round Reviewer

A self-hosted coach for Counter-Strike 2. Upload a match demo, pick a player, and review the handful of moments that matter most on a radar replay, with an AI coach that explains what went wrong and what went right.

- **Working now:** `.dem` / `.dem.zst` upload → demoparser2 parse → radar replay in the Analysis Studio, plus detectors and the coach agent (phase 1 and 2).
- **Current milestone:** the self-hosted AI coach (Qwen3-14B on llama.cpp, tools over MCP, RAG, later QLoRA). Plan: [docs/coach/AI-COACH-PLAN.md](docs/coach/AI-COACH-PLAN.md) · tasks: [docs/coach/TASKS.md](docs/coach/TASKS.md).

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
