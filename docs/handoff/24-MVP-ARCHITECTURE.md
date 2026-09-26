# 24 MVP architecture

British spelling. Companion to [15-IMPLEMENTATION-ARCHITECTURE](./15-IMPLEMENTATION-ARCHITECTURE.md) and [AGENTS.md](../../AGENTS.md).

## Layout

```
apps/web/          Next.js App Router (shells + typed client)
apps/api/          FastAPI + Pydantic contracts + mock pipeline
packages/shared/   JSON fixtures shared by both stacks
prototype/         Reference UI (do not delete)
docs/handoff/      Product / design / contracts
tools/qa/          Prototype QA scripts
tests/e2e/         Future cross-app tests
docker/            Optional compose
```

## Contract sync

1. **Canonical models:** `apps/api/app/models/contracts.py` (OpenAPI at `/openapi.json`).
2. **Canonical TS:** `apps/web/src/lib/contracts/index.ts` — hand-maintained mirror, camelCase.
3. **Fixtures:** `packages/shared/fixtures/sample-match.json` (copied into `apps/api/data/fixtures/`).

Field provenance stays as in [16-DATA-CONTRACTS](./16-DATA-CONTRACTS.md): ENGINE / DERIVED / LLM / EDITORIAL.

## Runtime flow (MVP)

1. `POST /matches/upload` stores `.dem` / `.dem.zst` on disk, SQLite metadata, status `uploaded`.
2. Mock `ProcessingPipeline` advances statuses on poll (`GET /matches/{id}/status`).
3. When `complete`, moments come from the sample fixture (deterministic).
4. `POST /matches/{id}/coach` answers from moment `qa` / structured fields only — no invented facts.
5. Web shells: `/`, `/upload`, `/processing/[id]`, `/studio/[matchId]`.

## What stays mocked

- Demo parse / detect / rank / render / LLM explain
- Clip video and radar map assets
- Coach (scripted)
- Personalisation history (fixture last-7)

Agent D replaces `app/processing/pipeline.py` behind the same status contract. Agent B builds Studio UI on these types.

## How to run

See [AGENTS.md](../../AGENTS.md).
