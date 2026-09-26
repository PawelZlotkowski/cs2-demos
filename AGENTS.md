# Agent guide — Round Reviewer

British spelling. Handoff docs in `docs/handoff/` are the source of truth for product/design.
**Demo Replay MVP:** landed — real `.dem.zst` → demoparser2 → Radar playback. See [docs/replay-architecture.md](docs/replay-architecture.md), [docs/demo-parser.md](docs/demo-parser.md), and [docs/handoff/18-CURRENT-STATE.md](docs/handoff/18-CURRENT-STATE.md).
**Next milestone (not started):** analysis detectors → findings → moments on the replay clock. Do not implement coaching/LLM until that milestone is kicked off.

## Monorepo layout

| Path | Owner | Purpose |
|---|---|---|
| `apps/web/` | Demo Replay + Frontend | Next.js App Router — upload, processing, **Radar replay studio** |
| `apps/api/` | Demo Replay + FastAPI | Real zstd/demoparser2 pipeline + replay APIs |
| `packages/shared/` | Foundation | Shared JSON fixtures (moments stub) |
| `docs/handoff/` | All agents (read-first) | Product, design, contracts, decisions |
| `docs/demo-parser.md` | Demo Replay | Parser research |
| `docs/replay-architecture.md` | Demo Replay | Time model, sampling, API, persistence |
| `prototype/` | Reference only | Analysis Studio HTML — do not port wholesale |
| `tools/qa/` | Agent E (QA) | Playwright / overlay sync / smoke |
| `tests/` | Agent E | Cross-cutting / e2e placeholders |
| `docker/` | Infra | Dockerfiles; root [`compose.yaml`](compose.yaml) runs api + web |

## Contract ownership

**Replay (this milestone):** Pydantic models in `apps/api/app/models/contracts.py` (`RoundReplay`, `RoundSummary`, …) mirrored in `apps/web/src/lib/contracts/`.

**Coaching stubs:** moments/coach remain for later milestones; main path must not depend on fabricated match positions.

**Sync:** edit Pydantic first → update TypeScript → optional OpenAPI diff.

## Processing states (replay)

`uploaded` → `decompressing` → `decompressed` → `parsing` → `normalizing` → `complete` | `failed`

## Design direction (preserve)

- Analysis Studio: light chrome, dark stage
- Fonts: Hanken Grotesk (UI/data), Newsreader (reserved for Coach later)
- Stage-first Radar; one shared playback clock
- Anti-AI rules in [04](docs/handoff/04-ANTI-AI-DESIGN-RULES.md)
- Visual reference: [`prototype/analysis-studio.html`](prototype/analysis-studio.html) (chrome only — do not port wholesale)
- Agent skills: [12 Skills](docs/handoff/12-SKILLS-AND-REFERENCES.md); local paths under `.cursor/skills/` (Emil + GSAP)

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
| Analysis (next) | Detectors → findings → moments on replay clock (not started) |
| A / B | Upload/processing shells; Studio polish |
| C / D | Persistence / pipeline (merged into Demo Replay for MVP) |
| E QA | Overlay sync, smoke, e2e |
| F Design review | Anti-AI / design-system compliance |

## Do not

- Redesign the product or reverse [19-DECISIONS.md](docs/handoff/19-DECISIONS.md)
- Copy the whole prototype HTML as the app
- Implement coaching / moment ranking / LLM in this milestone
- Use generic shadcn / neon esports styling
- Commit unless the owner asks
