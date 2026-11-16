# Agent guide — Round Reviewer

## Current workspace direction — 25 October 2026

This is the canonical project folder after source organisation. Read [README.md](README.md), [the current delivery plan](docs/planning/FINAL-DELIVERY-PLAN.md) and [the consolidation record](docs/consolidation/README.md) first. The RR delivery tasks and the user's confirmed decisions override older scope, typography, language and map instructions below.

- **Design resumed on 15 Nov 2026: Porcelain.** The owner chose the Porcelain direction for the 25 Nov showcase. Follow [`.cursor/skills/rr-porcelain-ui`](.cursor/skills/rr-porcelain-ui/SKILL.md) for every UI change; it replaces the design notes below and in `docs/handoff` (see [19-DECISIONS](docs/handoff/19-DECISIONS.md) #28). The Tactical Lens study stays a saved reference only.
- Delivery scope: browser Studio, Ancient/Anubis (owner changed scope on 25 October), English/Polish, cloud API/parser, local RTX 5080 inference and Windows recording; invited users by 6 December 2026.
- Local V1: `start-local.ps1` and [runbook](docs/LOCAL-V1-RUNBOOK.md). Its `local-v1` detector profile is deliberately narrower than the legacy research profile. Recording and the model are explicit startup options. Design remains paused.
- Personal coach: one selected player only. New uploads pause after roster inspection for player, focus and language confirmation before full event/tick parsing. Teamwork focus means that player's support/trades, not a team-wide review.
- `integration/phase1/` holds reference patches, not applied safeguards. Reconcile them by domain with Studio accounts and contracts; do not apply the full sets blindly or claim their historical test results for this application.
- `docs/reference/phase1/` and older handoff/task documents retain historical evidence. They do not define a second active backlog. No duplicate app or floating desktop should be reintroduced.
- Preserve the existing no-commit/no-push rule unless the user explicitly requests either action.

British spelling. Handoff docs in `docs/handoff/` are the source of truth for product/design.
**Demo Replay MVP:** landed — real `.dem.zst` → demoparser2 → Radar playback. See [docs/replay/replay-architecture.md](docs/replay/replay-architecture.md), [docs/replay/demo-parser.md](docs/replay/demo-parser.md), and [docs/handoff/18-CURRENT-STATE.md](docs/handoff/18-CURRENT-STATE.md).
**Gameplay clips:** optional CS Demo Manager / stub worker after parse — [docs/replay/csdm-video.md](docs/replay/csdm-video.md). Radar ready first; clips fill asynchronously.
**Current milestone (kicked off 26 Sep 2026): AI Coach.** Detectors → findings → LLM moment selection → CS:DM clips → Analysis/Ask with a self-hosted Qwen3-14B agent (tools via MCP, RAG, verifier, later QLoRA fine-tuning). Plan: [docs/coach/AI-COACH-PLAN.md](docs/coach/AI-COACH-PLAN.md) · tasks: [docs/coach/TASKS.md](docs/coach/TASKS.md) · proposal: [docs/coach/PROPOSAL.md](docs/coach/PROPOSAL.md). Work only on tasks the owner assigned.

## Monorepo layout

| Path | Owner | Purpose |
|---|---|---|
| `apps/web/` | Demo Replay + Frontend | Next.js App Router — upload, processing, **Radar / Gameplay studio** |
| `apps/api/` | Demo Replay + FastAPI | Real zstd/demoparser2 pipeline + replay + clip APIs |
| `docs/` | All agents | Index of every doc: [docs/README.md](docs/README.md) |
| `docs/replay/csdm-video.md` | Demo Replay | CS:DM worker, env, storage |
| `apps/tracker/` | Owner | Coach task board (Vercel) seeded from `docs/coach/TASKS.md` |
| `docs/handoff/` | All agents (read-first) | Product, design, contracts, decisions |
| `docs/replay/` | Demo Replay | Parser research, time model, sampling, API, persistence, performance |
| `docs/coach/` | AI Coach (read-first for this milestone) | Plan, task board, school proposal |
| `apps/api/app/analysis/` | AI Coach | Analysis extract, detectors D1–D10, round stats, code ranker |
| `apps/api/app/coach/` | AI Coach | LLM client, agent loop, tools, MCP server factory, verifier, prompts, jobs |
| `apps/api/app/auth/`, `apps/api/app/admin/` | Accounts | Users, sessions, Steam sign-in, roles, the `guard` on every route; admin panel API ([30](docs/handoff/30-REVIEW-AND-ADMIN-PANEL.md)) |
| `apps/web/src/app/admin/` | Accounts | Admin panel pages (the Lab lives at `/admin/lab`) |
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

## Design direction: Porcelain (owner, 15 Nov 2026)

- Bone porcelain chrome with frosted glass only on floating parts; the radar is a dark game screen in Counter-Strike side colours; pink marks you and your selection
- Font: Mona Sans (one family, expanded width for numbers); Hanken Grotesk, Archivo and Newsreader are retired as the screens are rebuilt
- Stage-first Radar; one shared playback clock (unchanged)
- Skill and spec: [`.cursor/skills/rr-porcelain-ui`](.cursor/skills/rr-porcelain-ui/SKILL.md) (tokens, components, screens, build plan, ChatGPT/Codex prompts)
- Visual reference: [`prototype/glass/g1-porcelain.html`](prototype/glass/g1-porcelain.html) and screenshots in `docs/design/porcelain/` (sample data; rebuild from contracts, do not port wholesale)
- Supporting skills under `.cursor/skills/`: `apple-design`, `better-ui`, `avoid-ai-design` (run its scanner), `emil-design-eng`, the GSAP skills; `rr-detector`, `rr-coach-agent`, `rr-eval` for the coach milestone

## How to run

### Docker (API + Web)

From the repo root (Docker Desktop must be running):

```bash
docker compose up --build
```

- Web: http://localhost:3000  
- API: http://localhost:8000 (`/health`, `/docs`)  
- Compose: [`compose.yaml`](compose.yaml) · Dockerfiles under `docker/`

The browser calls `/api` on the web app, which Next rewrites to the API (`API_INTERNAL_URL`, fixed at build time: `http://api:8000` in Docker). Ports are bound to 127.0.0.1.

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

Set `API_INTERNAL_URL=http://127.0.0.1:8000` (default in `.env.example`); the browser reaches the API through the `/api` rewrite.

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
- Add delivery maps beyond Ancient and Anubis without the owner asking; retain legacy Mirage fixtures as regression evidence
- Use generic shadcn / neon esports styling
- Commit or push unless the owner asks (the owner assigns tasks from [TASKS](docs/coach/TASKS.md))
