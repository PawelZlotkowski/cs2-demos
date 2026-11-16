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

## Added 15 Nov 2026 for the premium redesign (copied as is, each with its licence)
- `apple-design`: Emil Kowalski, https://github.com/emilkowalski/skills (commit 0f2e23b, MIT). Translucent materials, springs, depth.
- `frontend-design`: Anthropic, https://github.com/anthropics/skills (commit 1780c5e, Apache 2.0). Plan, review against AI defaults, build, critique.
- `avoid-ai-design`: funboy322, https://github.com/funboy322/avoid-ai-design (commit 2b7c718, MIT). AI-tell catalogue and `scripts/detect.mjs` scanner (`node .cursor/skills/avoid-ai-design/scripts/detect.mjs <path>`).
- `better-ui`, `variant`: Jakub Krehel, https://github.com/jakubkrehel/skills (commit a72290d, MIT). Surface polish (radius, shadows, optical alignment); three deliberate variants behind a picker.
Found via https://designbookmark.com/skills.

## Round Reviewer Porcelain UI (project-authored, 15 Nov 2026)
- `rr-porcelain-ui`: the chosen visual direction for apps/web: tokens, components, screens, a build plan to 25 Nov and ChatGPT/Codex prompts. Reference: `prototype/glass/g1-porcelain.html`, screenshots in `docs/design/porcelain/`.
