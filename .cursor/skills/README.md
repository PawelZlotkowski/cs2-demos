# Agent skills (project)

Vendored under `.cursor/vendor/`; discoverable junctions in `.cursor/skills/`.

## Emil Kowalski
Source: https://github.com/emilkowalski/skills
Path: `.cursor/vendor/emil-skills/`
Frontend load: `emil-design-eng`, `review-animations`, `find-animation-opportunities` (also `improve-animations`, `animate`, `animation-vocabulary`)

## GSAP
Source: https://github.com/greensock/gsap-skills
Path: `.cursor/vendor/gsap-skills/`
Frontend load: `gsap-core`, `gsap-timeline`, `gsap-plugins`, `gsap-react`, `gsap-performance`

## Impeccable
Source: https://github.com/pbakaus/impeccable (commit 9d715cc, Apache 2.0, see `impeccable/LICENSE` and `NOTICE.md`)
Path: `.cursor/skills/impeccable/` (copied as is)
Frontend load: `impeccable` (read `reference/craft-floor.md` before UI edits; run `scripts/impeccable detect --json apps/web/src` after them)

## Jakub Krehel
Source: https://github.com/jakubkrehel/skills (commit 267330e, MIT, see each folder's `LICENSE`)
Path: `.cursor/skills/better-*/` (copied as is)
Frontend load: `better-layout`, `better-colors`, `better-typography`, `better-accessibility`, `better-writing`

## Round Reviewer (project-authored)
Written for this repo, not vendored. Coach milestone: [docs/coach/AI-COACH-PLAN.md](../../docs/coach/AI-COACH-PLAN.md).
- `rr-detector`: detectors → findings (`apps/api/app/analysis/`)
- `rr-coach-agent`: tools, MCP server, llama.cpp client, prompts, verifier (`apps/api/app/coach/`, `apps/mcp/`, `apps/api/app/rag/`)
- `rr-eval`: evaluation, labels, fine-tuning data (`eval/`, `ml/`, `data/labels/`)
