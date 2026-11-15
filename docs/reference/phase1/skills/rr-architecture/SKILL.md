---
name: rr-architecture
description: Plan or refactor Round Reviewer component boundaries, durable jobs and data contracts while preserving numerical moment selection followed by external recording.
---

# Round Reviewer architecture

Preserve upload/import, deterministic parsing, detectors, model selection, validation, and downstream CS Demo Manager recording. The user owns context and memory; do not introduce or overwrite memory files.

Inspect the relevant current code and requested change before choosing a refactor. The API is FastAPI/Python, Studio is Next.js/React, metadata currently combines SQLite, files and memory, and recording uses a Windows CS2 session. Match IDs, player IDs and side names have different roles; stable team identity must survive halftime/overtime.

Separate these boundaries when needed: parser process, deterministic analysis, budgeted inference, recording worker and public request handling. Persist stage state, source artifacts and worker claims before enabling multiple processes. A process-local lock cannot protect a distributed recording session.

Keep an instant radar/evidence review while selected clips become ready. A model selects supported moments; it does not control executable paths or arbitrary source downloads. Define ticks, round clock origin, artifact version and provenance in contracts.

Implement the smallest requested boundary, migrate stored data explicitly and validate restart/duplicate-work behavior. Report remaining limitations without claiming a complete public architecture from one refactor. Relevant project plans are in `review/APP-PLAN.md` and `review/APP-REVIEW.md`; if the skill is moved, locate those files in the project.
