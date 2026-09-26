# Round Reviewer

CS2 coaching tool: upload a demo, review ~5–6 high-value moments in Analysis Studio.

**Start here:** [docs/handoff/00-README.md](docs/handoff/00-README.md) · Cursor: [docs/handoff/21-CURSOR-HANDOFF.md](docs/handoff/21-CURSOR-HANDOFF.md) · Agents: [AGENTS.md](AGENTS.md) · MVP layout: [docs/handoff/24-MVP-ARCHITECTURE.md](docs/handoff/24-MVP-ARCHITECTURE.md)

## Monorepo (foundation)

| Path | Role |
|---|---|
| `apps/web/` | Next.js App Router shells |
| `apps/api/` | FastAPI + shared contracts + mock pipeline |
| `packages/shared/fixtures/` | Sample match JSON from the prototype |
| `prototype/` | Analysis Studio HTML reference |
| `docs/handoff/` | Product, design, contracts |
| `docker/` | Dockerfiles; root `compose.yaml` runs api + web |
| `tools/qa/` | Prototype QA scripts |

## Quick start (Docker)

With Docker Desktop running, from the repo root:

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Web (Analysis Studio) | http://localhost:3000 |
| API | http://localhost:8000 |
| API health | http://localhost:8000/health |
| API docs | http://localhost:8000/docs |

Compose file: [`compose.yaml`](compose.yaml) (API + Web). Alternative: `docker compose -f docker/compose.yml up --build`.

## Quick start (local, without Docker)

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

Sample match id: `match-sample-mirage`.
