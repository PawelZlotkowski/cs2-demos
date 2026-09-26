# Agent guide — Round Reviewer

British spelling. Handoff docs in `docs/handoff/` are the source of truth for product/design.
**Demo Replay MVP:** landed — real `.dem.zst` → demoparser2 → Radar playback. See [docs/replay/replay-architecture.md](docs/replay/replay-architecture.md), [docs/replay/demo-parser.md](docs/replay/demo-parser.md), and [docs/handoff/18-CURRENT-STATE.md](docs/handoff/18-CURRENT-STATE.md).
**Current milestone (kicked off 26 Sep 2026): AI Coach.** Detectors → findings → LLM moment selection → CS:DM clips → Analysis/Ask with a self-hosted Qwen3-14B agent (tools via MCP, RAG, verifier, later QLoRA fine-tuning). Plan: [docs/coach/AI-COACH-PLAN.md](docs/coach/AI-COACH-PLAN.md) · tasks: [docs/coach/TASKS.md](docs/coach/TASKS.md) · proposal: [docs/coach/PROPOSAL.md](docs/coach/PROPOSAL.md). Work only on tasks the owner assigned.

## Monorepo layout

| Path | Owner | Purpose |
|---|---|---|
| `apps/web/` | Demo Replay + Frontend | Next.js App Router — upload, processing, **Radar replay studio** |
| `apps/api/` | Demo Replay + FastAPI | Real zstd/demoparser2 pipeline + replay APIs |
| `docs/` | All agents | Index of every doc: [docs/README.md](docs/README.md) |
| `apps/tracker/` | Owner | Coach task board (Vercel) seeded from `docs/coach/TASKS.md` |
| `docs/handoff/` | All agents (read-first) | Product, design, contracts, decisions |
| `docs/replay/` | Demo Replay | Parser research, time model, sampling, API, persistence, performance |
| `docs/coach/` | AI Coach (read-first for this milestone) | Plan, task board, school proposal |
| `apps/api/app/analysis/` | AI Coach | Analysis extract, detectors D1–D10, round stats, code ranker |
| `apps/api/app/coach/` | AI Coach | LLM client, agent loop, tools, MCP server factory, verifier, prompts, jobs |
| `apps/api/app/rag/` | AI Coach (planned) | Knowledge ingest, hybrid index, retrieval |
| `apps/mcp/` | AI Coach | `python -m cs2_demo_mcp` entry point for the `cs2-demo` MCP server (stdio / HTTP) |
| `ml/` | AI Coach (planned) | llama.cpp serving notes, fine-tuning (QLoRA) |
| `eval/` | AI Coach (planned) | Evaluation datasets, runner, reports |
| `apps/api/app/maps/zones/` | AI Coach | Callout polygons per map + `zone_at` |
| `data/knowledge/`, `data/labels/` | AI Coach (labels format landed) | RAG sources and hand labels (never raw demos) |
| `prototype/` | Reference only | Analysis Studio HTML — do not port wholesale. `qa/` holds its Playwright checks, `fixtures/` the sample match it was extracted into |
| `tools/` | Dev scripts | `zones_overlay.py` redraws the zone overlays in `docs/coach/zones/` |
| `docker/` | Infra | Dockerfiles; root [`compose.yaml`](compose.yaml) runs api + web |

## Contract ownership

**Replay (this milestone):** Pydantic models in `apps/api/app/models/contracts.py` (`RoundReplay`, `RoundSummary`, …) mirrored in `apps/web/src/lib/contracts/`.

**Coach (this milestone):** `Finding`, `RoundStats`, moment selection and coach answers are defined in the plan (§4.4, §6). The mocked `services/coach.py` stays for tests only once the agent is live; the main path must not depend on fabricated match positions.

**Sync:** edit Pydantic first → update TypeScript → optional OpenAPI diff.

## Processing states (replay)

Current: `uploaded` → `decompressing` → `decompressed` → `parsing` → `normalizing` → `awaiting_player` → `detecting` → `complete` | `failed`. Radar works from `awaiting_player`.

Planned for the coach (plan §3): `detecting` → `selecting` → `recording` → `explaining` → `complete`. Clips may finish after `explaining`.

## Design direction (preserve)

- Analysis Studio: light chrome, dark stage
- Fonts: Hanken Grotesk (UI/data), Newsreader (reserved for Coach later)
- Stage-first Radar; one shared playback clock
- Anti-AI rules in [04](docs/handoff/04-ANTI-AI-DESIGN-RULES.md)
- Visual reference: [`prototype/analysis-studio.html`](prototype/analysis-studio.html) (chrome only — do not port wholesale)
- Agent skills: [12 Skills](docs/handoff/12-SKILLS-AND-REFERENCES.md); local paths under `.cursor/skills/` (Emil + GSAP for UI; `rr-detector`, `rr-coach-agent`, `rr-eval` for the coach milestone)

## How to run

### Docker (API + Web)

From the repo root (Docker Desktop must be running):

```bash
docker compose up --build
```

- Web: http://localhost:3000  
- API: http://localhost:8000 (`/health`, `/docs`)  
- Compose: [`compose.yaml`](compose.yaml) · Dockerfiles under `docker/`

Browser calls the API at `http://localhost:8000` (`NEXT_PUBLIC_API_URL`). Server-side fetches inside the web container use `http://api:8000` (`API_INTERNAL_URL`).

### API (`apps/api`) — local

```bash
cd apps/api
python -m venv .venv
# Windows: .venv\Scripts\activate
pip install -e ".[dev]"
uvicorn app.main:app --reload --port 8000
```

Health: `GET http://127.0.0.1:8000/health`

### Web (`apps/web`) — local

```bash
cd apps/web
npm install
npm run dev
```

Set `NEXT_PUBLIC_API_URL=http://127.0.0.1:8000` (default in `.env.example`).

```bash
npm run typecheck
npm run build
```

### Local LLM (coach milestone, planned)

```bash
llama-server -m Qwen3-14B-Q4_K_M.gguf --jinja -c 32768 -ctk q8_0 -ctv q8_0 -ngl 99 --port 8080
# API reads RR_LLM_BASE_URL=http://127.0.0.1:8080/v1 and RR_LLM_MODEL
```

CI and unit tests must not need a GPU: use the mock LLM client.

### Tests

```bash
cd apps/api
pytest
```

## Agent roles

| Agent | Focus |
|---|---|
| 0 Foundation | Layout, contracts, stubs (done) |
| **Demo Replay Lead** | Real parse → replay API → Radar/timeline (**done**; see agent log) |
| Analysis | Extended parse, zones, detectors → findings, round stats (TASKS phase 1) |
| Coach agent | Tools, MCP server, LLM client, agent, verifier, moment selection, explanations, Ask (phase 2) |
| RAG | Knowledge base, index, retrieval (phase 3) |
| Clips + UI | CS:DM per-moment clips, player picker, moment rail, Analysis/Ask tabs (phase 4) |
| ML | Fine-tuning, bigger model on RTX Pro 6000 (phase 5) |
| A / B | Upload/processing shells; Studio polish |
| C / D | Persistence / pipeline (merged into Demo Replay for MVP) |
| E QA / Eval | Overlay sync, smoke, e2e; coach evaluation (phase 6) |
| F Design review | Anti-AI / design-system compliance |

## Do not

- Redesign the product or reverse [19-DECISIONS.md](docs/handoff/19-DECISIONS.md)
- Copy the whole prototype HTML as the app
- Call any hosted LLM API (OpenAI, Anthropic, Google, …) from app code, data generation or evaluation. Everything runs on self-hosted models (owner decision, [19](docs/handoff/19-DECISIONS.md) #16)
- Let the LLM produce a number or fact that is not in a finding or `RoundStats`; every claim cites an ID and passes the verifier
- Commit raw demos or player data other than derived labels and manifests
- Add maps beyond Mirage and Anubis without the owner asking
- Use generic shadcn / neon esports styling
- Commit or push unless the owner asks (the owner assigns tasks from [TASKS](docs/coach/TASKS.md))
