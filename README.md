# Round Reviewer

## Labeller recording branch

This branch, **`codex/labeller-recording`**, contains the local labeller and Windows
recording scripts, including selected-player POV verification and one review clip
for overlapping findings about the same play.

If you already have the recording tools installed, close the old recorder after
its current session finishes, then run this from your existing repository:

```powershell
git fetch origin
git switch codex/labeller-recording
git pull --ff-only origin codex/labeller-recording
powershell -NoProfile -ExecutionPolicy Bypass -File .\labeler.ps1 update
powershell -NoProfile -ExecutionPolicy Bypass -File .\labeler.ps1 record
```

Open **http://127.0.0.1:8765** and refresh the page. Select a demo and player, then
prepare the player to create grouped recordings. Existing Docker volumes, notes
and clips remain intact. Git updates the source; `update` rebuilds the running app,
and starting a fresh recorder loads the updated Python code.

For a new checkout:

```powershell
git clone --branch codex/labeller-recording --single-branch https://github.com/PawelZlotkowski/cs2-demos.git
cd cs2-demos
powershell -NoProfile -ExecutionPolicy Bypass -File .\labeler.ps1 update
powershell -NoProfile -ExecutionPolicy Bypass -File .\labeler.ps1 record
```

Keep your existing `labeler.env` if it contains a custom project, port or database
configuration. Do not overwrite local changes to force a branch switch; use the
new-checkout commands if Git reports conflicts. [Setup and troubleshooting](docs/LABELER-SETUP.md).

The GitHub workflow checks the source kit, local API, recording jobs and launchers.
This branch's delivery target is the local labeller; the separate cloud web
labeller is described in its own setup guide.

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
