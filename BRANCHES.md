# Branches

Round Reviewer keeps three working branches after the 20 November 2026 cleanup. Historical experiments are preserved as tags; old feature branches whose commits are already contained in retained history have been removed.

| Branch | Purpose |
|---|---|
| `main` | GitHub default and the older shared baseline. The existing GitHub-linked tracker deployment uses this line. Current Studio work has not yet been integrated here. |
| `design/porcelain-ui` | Current Studio work in `C:/Users/pawel/Documents/cs2-demos-studio`. Includes the previous Studio integration and the Porcelain direction. Local uncommitted application work is not automatically present on GitHub. |
| `codex/labeller-recording` | Published labeller recording, grouped review, transfer and launcher work. Built on Porcelain, with a separate local worktree at `.local/git-labeller-branch`. |

## Where current work happens

Use the canonical `cs2-demos-studio` folder for ongoing application work. Its current checkout is `design/porcelain-ui`; start with `AGENTS.md`, `README.md`, `docs/planning/FINAL-DELIVERY-PLAN.md` and `docs/LOCAL-V1-RUNBOOK.md` there. Porcelain is the chosen design direction, resumed on 15 November.

The committed history is:

```text
previous Studio integration
  └─ design/porcelain-ui
       └─ codex/labeller-recording
```

The labeller tip is two commits ahead of the Porcelain tip at cleanup. The canonical folder has additional uncommitted changes. Do not replace its contents with another branch or assume a fresh clone contains those changes.

`main` remains the older baseline. Cleanup did not merge application code, promote a release, or change the default branch. Its branch-guide update is documentation only.

## Historical tags

These tags preserve the exact commits of historical work outside the retained branch histories:

| Tag | Saved branch | Commit |
|---|---|---|
| `archive/2026-11-20/coach-ui-stash` | `archive/coach-ui-stash` | `aa2cd35` |
| `archive/2026-11-20/phase1-source-snapshot` | `archive/phase1-source-snapshot` | `0365f18` |
| `archive/2026-11-20/product-review` | `docs/product-review` | `d55cdd0` |
| `archive/2026-11-20/floating-accounts` | `experiment/floating-accounts` | `e4609f9` |
| `archive/2026-11-20/floating-backend` | `experiment/floating-backend` | `10ecaf8` |
| `archive/2026-11-20/floating-desktop` | `experiment/floating-desktop` | `177be63` |

The floating desktop was not chosen for delivery. Phase 1 remains historical source/reference material; its useful safeguards still require domain-by-domain integration. The product-review tag preserves `docs/PRODUCT-REVIEW.md`, which was not integrated into the current Studio branches.

The old `development`, `integration/studio`, `feature/*`, `docs/delivery-plan`, `design/match-room-prototype`, and the merged design/model/run-guide/test archive branch tips remain reachable through the retained branches. They did not need separate archive tags.

PRs #26 and #28 were closed as superseded because their work is already in the retained Studio history. PRs #27 and #29 were closed for the rejected floating desktop direction. None was merged into its original target as part of cleanup.

## Branch policy

- Keep `main` as the reviewed shared baseline. Integrate the validated current Studio in a separate task.
- Keep task branches only while their work is active or awaiting integration. Use the `codex/` prefix for new Codex task branches unless the owner specifies another name.
- GitHub automatically deletes merged PR branches. Keep useful abandoned work as archive tags before removing its branch name.
- Do not delete or rename a branch checked out in an active worktree.
- The repository's no-commit/no-push rule still applies unless the owner explicitly authorises the action.

Raw demos, clips, models, runtime databases, credentials, university originals and real-player fixtures remain outside the public repository.
