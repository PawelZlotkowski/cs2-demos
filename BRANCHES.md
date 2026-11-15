# Branches

Every line of Round Reviewer work lives in this one repository. Each branch holds one feature, experiment or archive. Branch names say what kind of work it is:

| Prefix | Meaning |
|---|---|
| `main`, `development` | Long-lived: stable release and the integration branch for reviewed work |
| `feature/` | Product work that is meant to be merged |
| `integration/` | Several feature branches merged together so the current app runs from one branch |
| `docs/` | Documentation or analysis only, no application code |
| `design/` | Static design prototypes (design is paused; reference only) |
| `experiment/` | A direction that was tried and not chosen; kept for reference |
| `archive/` | Already merged, or a recovered snapshot; read-only |

Reorganised on 15 November 2026. Branches previously named `claude/…`, `cursor/…`, `feat/…` and `test` were renamed (see the last table). The old PRs #22 to #25 closed during the rename and continue as #26 to #29.

## How the branches build on each other

```text
main
├─ development
│  └─ feature/roadmap-pages                  PR #26 → development
│     ├─ docs/product-review                 (branched from an early roadmap commit)
│     └─ feature/accounts-admin              PR #28 → development
│        ├─ feature/local-v1
│        │  └─ feature/labelling-tool
│        ├─ docs/delivery-plan
│        ├─ design/match-room-prototype
│        └─ integration/studio               = labelling-tool + delivery-plan + match-room-prototype
└─ experiment/floating-desktop               PR #27 → main
   └─ experiment/floating-backend            (also contains feature/roadmap-pages)
      └─ experiment/floating-accounts        PR #29 → experiment/floating-backend
```

## Run the current app

Use **`integration/studio`**. It is the canonical `cs2-demos-studio` folder: accounts and admin, Local V1, the labelling tool, the delivery plan and the paused design prototypes. Start with `README.md`, `docs/LOCAL-V1-RUNBOOK.md` and `start-local.ps1`.

Suggested merge order into `development`: `feature/roadmap-pages` → `feature/accounts-admin` → `feature/local-v1` → `feature/labelling-tool`, then `docs/delivery-plan` and, if wanted, `design/match-room-prototype`.

## Long-lived

| Branch | What it is |
|---|---|
| `main` | Stable. Demo replay MVP (real `.dem.zst` → demoparser2 → Radar), AI Coach detectors D1 to D10, tools, MCP server, knowledge base, the polished Studio, the Gemma vs Qwen comparison and the Windows run guide (up to PR #20, 27 Sep 2026). |
| `development` | Integration branch. `main` plus the Tactical Desk visual direction for the Studio (PR #21). Feature PRs target this branch. |

## Features

| Branch | Built on | What it does | PR |
|---|---|---|---|
| `feature/roadmap-pages` | `development` | Doc 29 roadmap: Coach page, Lab runs, Matches, Progress, Settings → System, the new top bar, Studio tab order and the verifier fix. | #26 |
| `feature/accounts-admin` | `feature/roadmap-pages` | Doc 30: users, sessions, Steam sign-in, roles, match ownership, the `guard` on every API route, admin panel API and pages, account settings, GPU queue and MCP token gate, with API tests. | #28 (draft) |
| `feature/local-v1` | `feature/accounts-admin` | Runs Round Reviewer on one Windows PC for one coached player. Uploads pause after a roster-only read so the player, focus (overall, shooting, utility, teamwork) and language are confirmed before the full parse. Adds the narrower `local-v1` detector profile, Ancient alongside Anubis and Mirage, ffprobe checks on every recording, clearer parse errors, and `start-local.ps1` with isolated `.local/` data. 301 API tests pass. | none yet |
| `feature/labelling-tool` | `feature/local-v1` | A separate local browser app (`python -m eval.label_tool serve`, port 8765, or `compose.labeler.yaml`) for hand-labelling detected moments from raw demos on Ancient and Anubis. It covers player selection, save and resume, batch recording through a host worker, clip review with two-step judgements, and local speech-to-text for notes. See `docs/LABEL-TOOL.md`. 64 tool tests pass. | none yet |

## Integration, docs and design

| Branch | Built on | What it holds |
|---|---|---|
| `integration/studio` | merge | `feature/labelling-tool` (which includes `feature/local-v1`), `docs/delivery-plan` and `design/match-room-prototype` merged. The tree equals the `cs2-demos-studio` folder on 15 November 2026, apart from the private files listed below. |
| `docs/delivery-plan` | `feature/accounts-admin` | Documentation only. Current delivery plan (Ancient/Anubis, English/Polish, invited users by 6 December 2026), hosting/GPU, recording/training, labelling plan and guide, UI/motion plan; the source consolidation record from 20 October 2026; phase 1 reference findings and five reference patches (not applied); competitor and fine-tuning research. |
| `docs/product-review` | early `feature/roadmap-pages` | A full product review, analysis only, no code changes. |
| `design/match-room-prototype` | `feature/accounts-admin` | Static prototypes: the match room on a real Anubis parse, the saved Tactical Lens concept and Film Room references. Design is paused. The match room's data file is not committed; regenerate it with `prototype/fixtures/extract_match_room.py <match-id>`. |

## Experiments (not chosen)

| Branch | What it was | PR |
|---|---|---|
| `experiment/floating-desktop` | The floating desktop shell: a light, macOS-style windowed UI with the PR #22 surfaces and a Playwright check. Rejected during consolidation in favour of the browser Studio. | #27 (draft) |
| `experiment/floating-backend` | The floating desktop connected to the real API, with Match as an installer window, clip parity with the web Studio, crash isolation per window and a Windows setup guide. | none |
| `experiment/floating-accounts` | Accounts, roles and the admin panel in the floating desktop style. | #29 (draft) |

## Archive

| Branch | What it is |
|---|---|
| `archive/design-polish` | Light and dark themes, bundled fonts, FLIP transitions, the draggable phone sheet. Merged through PRs #11, #13, #16, #17 and #18. |
| `archive/gemma-vs-qwen` | Per-model sampling and the Gemma 4 12B vs Qwen3-14B comparison. Merged through PR #15. |
| `archive/run-guide` | Windows run-locally guide and troubleshooting. Merged through PRs #19 and #20. |
| `archive/tactical-desk` | Tactical Desk visual direction for the Studio. Merged into `development` through PR #21. |
| `archive/test` | An old test branch, fully contained in `main`. |
| `archive/phase1-source-snapshot` | The `cs2-demos-phase1-source` package (13 to 20 October 2026), which was never in git. Overlaid on `main` so the diff shows what phase 1 changed. Its useful parts already live in `docs/delivery-plan` as references and patches. |
| `archive/coach-ui-stash` | A local coach UI build from 26 September 2026, recovered from a stash in the old `cs2-demos` folder. Superseded by the player picker and Studio coach UI on `main`. |

## Renamed branches

| Old name | New name |
|---|---|
| `claude/feature-roadmap-26ezhz` | `feature/roadmap-pages` |
| `claude/review-admin-panel-lmr5ft` | `feature/accounts-admin` |
| `feat/rr-floating-desktop` | `experiment/floating-desktop` |
| `claude/floating-ui-backend-fod66a` | `experiment/floating-backend` |
| `claude/floating-admin-accounts-96wjtv` | `experiment/floating-accounts` |
| `cursor/product-review-f988` | `docs/product-review` |
| `claude/design-polish-plan-amk6du` | `archive/design-polish` |
| `claude/gemma-coach-test-ve9n2z` | `archive/gemma-vs-qwen` |
| `claude/project-thread-ylksyl` | `archive/run-guide` |
| `claude/studio-visual-direction-a1se56` | `archive/tactical-desk` |
| `test` | `archive/test` |

## Local folders and where their work is

| Folder | Branch |
|---|---|
| `cs2-demos-studio` (canonical) | `integration/studio` |
| `cs2-demos-accounts` | `experiment/floating-accounts` |
| `cs2-demos` | `experiment/floating-desktop`; its stash is `archive/coach-ui-stash` |
| `cs2-demos-phase1-source` | `archive/phase1-source-snapshot` |

## Kept off GitHub

This repository is public. These files stay on the local machine and are listed in `.gitignore` on `integration/studio`:

- `docs/university/*.docx` and `*.pdf`: the university proposal and the teacher brief
- `prototype/fixtures/match-room.json`: real player nicknames from a parsed match

Raw demos, clips, model weights, databases and `.env` files were already ignored.
