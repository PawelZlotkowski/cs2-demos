# Round Reviewer

**Use this folder for ongoing work:** `C:\Users\pawel\Documents\cs2-demos-studio`.

A browser Studio for reviewing CS2 demos with radar replay, selected moments, recorded clips and an evidence-based coach. Pawel and Aleksander are building it for their university project: first defence **17 November 2026**, final invited-user product and submission **6 December 2026**.

**20 October status:** the selected material from the four project folders is organised here. Studio remains the application baseline. Phase 1 improvements are preserved as integration patches; they have **not** been merged into the running application. **Design is paused.** Tactical Lens is saved as a reference, not implemented or approved as the final design.

## Start here

1. [Current delivery plan](docs/planning/FINAL-DELIVERY-PLAN.md) — scope, priorities, dates, owners and acceptance criteria.
2. [Consolidation record](docs/consolidation/README.md) — what was kept, excluded and still needs integration.
3. [Phase 1 integration checklist](integration/phase1/README.md) — safeguards to reconcile with existing accounts and contracts.
4. [Local V1 runbook](docs/LOCAL-V1-RUNBOOK.md) — start on this PC, parser rules, recording checks and the immediate tasks for both students.

## Where to work

| Folder | Contents |
|---|---|
| `apps/web/` | Next.js browser Studio, accounts and admin UI |
| `apps/api/` | FastAPI, parsing, analysis, coach, RAG, accounts and storage |
| `apps/mcp/` | MCP entry point using the application's tools |
| `apps/tracker/` | Existing task board; older T/A task IDs are not the current delivery backlog |
| `eval/`, `ml/` | Evaluation, labelling and fine-tuning utilities |
| `data/knowledge/`, `data/labels/` | Knowledge sources, label formats and fixtures |
| `docker/`, `compose.yaml` | Existing development containers |
| `docs/planning/` | Current delivery, hosting, recording/training and UI plans |
| `docs/university/` | The original supplied Word proposal |
| `docs/consolidation/` | Source revisions, hashes, import manifest and verification |
| `docs/reference/phase1/` | Historical audits, validation reports, research and skill drafts |
| `docs/replay/`, `docs/coach/`, `docs/handoff/` | Existing technical documentation; current planning overrides older decisions |
| `integration/phase1/` | Five reviewable patch sets; reference material, not a second runnable app |
| `prototype/` | Saved Tactical Lens study and original Studio reference; design paused |
| `tools/` | Development and consolidation utilities |

## Current product boundaries

- Browser Studio; no floating desktop or native-app shell.
- Ancient and Anubis; English and Polish. Map scope changed by Pawel on 25 October. Legacy Mirage fixtures remain for regression checks.
- Cloud API and parsing shared by both students; local inference and Windows recording on Pawel's RTX 5080 PC.
- Invited users by 6 December; unrestricted public access later.
- About $30 total for optional rented-GPU experiments, separate from CPU hosting.

## Run locally

From this folder in PowerShell, run `./start-local.ps1 -Check`, then `./start-local.ps1`. Open `http://127.0.0.1:3003`. This uses the installed Python/Node dependencies and stores local data in ignored `.local/`. The optional model and CS2 recording are off until explicitly enabled; see the [runbook](docs/LOCAL-V1-RUNBOOK.md).

## Existing Docker baseline

With Docker Desktop running, use `docker compose up --build` from this folder. Web: `http://localhost:3000`. API: `http://localhost:8000`.

For local Python/Node setup, model configuration, recording prerequisites and checks, use [RUN-LOCALLY](docs/RUN-LOCALLY.md). Use disposable data directories for tests. Cloud/invited-user readiness still requires domain integration and the delivery plan's release gates.

## Ownership

**Pawel:** application integration, API/parser, contracts, replay, recording, accounts, jobs and deployment.

**Aleksander:** model configuration, agent/RAG, datasets, bilingual evaluation, fine-tuning experiments and research reporting.

**Both:** labelling calibration, acceptance, invited-user feedback and the defence.

Use one authoritative backlog: [FINAL-DELIVERY-PLAN](docs/planning/FINAL-DELIVERY-PLAN.md). The integration checklist expands existing RR tasks rather than creating a competing schedule.

The other source folders remain intact as recovery copies. Work here going forward. No originals, demos, credentials or runtime databases were deleted or relocated; no commits or pushes were made.
