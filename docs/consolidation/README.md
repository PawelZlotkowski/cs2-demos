# Source consolidation — 20 October 2026

**Canonical folder:** `C:/Users/pawel/Documents/cs2-demos-studio`.

Pawel asked to pause design work and organise the best material from all project folders into one folder. The existing Studio repository is now that working folder. Its Git history is preserved. No commits, pushes, deployments, installs or deletion of original folders were performed.

## Source selection

| Source | Verified comparison | Decision |
|---|---|---|
| `cs2-demos-studio` | 516 tracked source/reference files at `286281c`; working tree clean before this task | Keep as the single application baseline: browser Studio, accounts/admin, Lab, coach, replay, evaluation and training utilities. |
| `cs2-demos-accounts` | All 516 Studio files are byte-identical; 62 additional files, all under `prototype/rr-floating-desktop/` | No duplicate app imported. Account/admin functionality is already present in Studio. Exclude the rejected floating desktop. |
| `cs2-demos` | 240 identical, 94 differing common files, 45 source-only files; the source-only files belong to the old floating desktop | Retain the fuller Studio implementation and shared technical references. No extra working app imported. Leave original demos and the untracked root lockfile at their source. |
| `cs2-demos-phase1-source/cs2-demos` | 261 packaged files: 150 identical, 69 differing common files, 42 source-only files | Copy current plans and technical evidence; preserve 69 selected code/config/test variants in five integration patches. Leave older UI/account-flow variants out of the active app. |
| Supplied Word proposal | Original from Downloads | Copy unchanged into `docs/university/`. |
| Conversation prototypes | Tactical Lens selected; other treatments rejected or superseded | Save Tactical Lens source and a standalone preview under `prototype/`; mark design paused. |

Counts refer to tracked working-tree files for the Git projects and packaged files for Phase 1. Private environments, dependencies, builds, raw demos/clips/models and runtime databases are excluded. Tracked source was compared using SHA-256, not modification dates.

## What is organised here

- **Current planning:** `docs/planning/`, with one authoritative RR backlog and its hosting, recording/training and UI references.
- **University material:** the untouched proposal, clearly separated from current implementation scope.
- **Historical technical evidence:** `docs/reference/phase1/`, including parser/recording/security findings, validation reports, dependency audit, research and skill drafts. Old plans are references, not parallel instructions.
- **Pending integration:** five patch files under `integration/phase1/` and a domain-by-domain checklist with owners and checks.
- **Paused design:** the latest Tactical Lens study; no new design iteration.
- **Provenance:** [source-inventory.json](source-inventory.json) and [import-manifest.json](import-manifest.json).

## What this does not claim

Folder consolidation is complete when the chosen material is accessible here, deduplicated and indexed. It is separate from **code integration**: Phase 1 safeguards are not yet active in Studio. The existing application source and configuration were deliberately preserved as a coherent baseline. A fresh live-demo, model, recording or cloud validation was not performed.

The original three alternative source folders and conversation visualisations remain untouched as recovery material. They are not additional active working folders.

## Verification and reproducibility

`tools/consolidate_sources.py` recorded the pre-change inventory and assembled the selected imports and patch sets. It refuses to overwrite its original inventory or import manifest.

`tools/verify_consolidation.py` checks the recorded application baseline, copied file provenance, selected patch hashes and internal documentation links. Its result is saved in [verification.json](verification.json). The original proposal and prototype fragment remain byte-identical; Markdown imports may have relative links adjusted for their new locations. Current planning files also carry explicit consolidation/pause notices.
