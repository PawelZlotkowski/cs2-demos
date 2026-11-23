# GitHub branch audit — 20 November 2026

**Completed with the owner's approval: reduced 22 branches to three, preserving historical work with six tags.** All 19 approved branch deletions, six archive tags and four PR closures were verified on GitHub. The updated guide was committed and pushed to `main` as [`3a20033`](https://github.com/PawelZlotkowski/cs2-demos/commit/3a2003339e05a25b35f71d472ba642723f65cc39), changing only `BRANCHES.md`. Automatic deletion of merged branches is enabled.

The tables below preserve the pre-cleanup audit and approved action list. `main` now points to `3a20033`; the other two retained branch tips are unchanged. Local remote-tracking refs were refreshed. Checks against the execution baseline confirmed all 768 existing working files, the canonical checkout and its staging area were unchanged; the labeller worktree remains clean. The local audit report itself is the only non-ignored document created and updated by this task.

Repository: [PawelZlotkowski/cs2-demos](https://github.com/PawelZlotkowski/cs2-demos).

## Keep these branches

| Branch | Audited tip | Why it stays |
|---|---|---|
| `main` | `2b54ed3` | GitHub default branch and source of the latest GitHub-linked tracker production deployment. It is an older application baseline, not the current Studio. |
| `design/porcelain-ui` | `1534086` | Checked out in the canonical Studio folder, with ongoing Porcelain, detector and labeller work. The working tree had 155 modified/untracked status entries at the audit snapshot. |
| `codex/labeller-recording` | `8094754` | Checked out in `.local/git-labeller-branch`. Contains two published labeller commits beyond Porcelain; its latest GitHub Actions run passed. |

The committed ancestry is `integration/studio` → `design/porcelain-ui` → `codex/labeller-recording`. The current local Studio contains additional uncommitted changes, so the labeller branch must not simply replace it. Another active chat is working in the canonical folder.

Relative to the current remote `main`, Porcelain is 27 commits ahead and one behind; the labeller branch is 29 ahead and one behind. The one main-only commit adds the existing `BRANCHES.md`. Main's application code therefore does not contain the current Studio integration.

## Remove 13 redundant branch names

Every tip below is an ancestor of at least one retained branch, verified with `git merge-base --is-ancestor`. Deleting its name preserves its committed history in the retained branches. This does **not** mean all these changes have reached `main`.

| Branch | Audited tip | Preserved in |
|---|---|---|
| `archive/design-polish` | `eb8df8b` | `main`, Porcelain and labeller |
| `archive/gemma-vs-qwen` | `4747835` | `main`, Porcelain and labeller |
| `archive/run-guide` | `910752e` | `main`, Porcelain and labeller |
| `archive/tactical-desk` | `e848485` | Porcelain and labeller |
| `archive/test` | `e286df5` | `main`, Porcelain and labeller |
| `design/match-room-prototype` | `1b8416b` | Porcelain and labeller |
| `development` | `6a46889` | Porcelain and labeller |
| `docs/delivery-plan` | `ae781b7` | Porcelain and labeller |
| `feature/accounts-admin` | `286281c` | Porcelain and labeller |
| `feature/labelling-tool` | `57ab28c` | Porcelain and labeller |
| `feature/local-v1` | `1e44d0e` | Porcelain and labeller |
| `feature/roadmap-pages` | `8eb4731` | Porcelain and labeller |
| `integration/studio` | `b7965db` | Porcelain and labeller |

`development` and `integration/studio` are old checkpoints; neither is checked out in a local worktree. Their separate names no longer describe where current work happens.

## Archive six historical branches, then remove their branch names

These contain commits outside all three retained branches. Preserve their exact tips as tags on GitHub before deleting any of their branch names. The floating experiments share ancestry, so the commit counts below overlap and must not be added together.

| Branch | Audited tip | Commits outside retained branches | Proposed tag |
|---|---|---:|---|
| `archive/coach-ui-stash` | `aa2cd35` | 1 | `archive/2026-11-20/coach-ui-stash` |
| `archive/phase1-source-snapshot` | `0365f18` | 1 | `archive/2026-11-20/phase1-source-snapshot` |
| `docs/product-review` | `d55cdd0` | 1 | `archive/2026-11-20/product-review` |
| `experiment/floating-accounts` | `e4609f9` | 12 | `archive/2026-11-20/floating-accounts` |
| `experiment/floating-backend` | `10ecaf8` | 10 | `archive/2026-11-20/floating-backend` |
| `experiment/floating-desktop` | `177be63` | 4 | `archive/2026-11-20/floating-desktop` |

The floating desktop was explicitly rejected during source consolidation. Phase 1 remains reference material awaiting selective integration; archiving its original snapshot does not claim those safeguards were applied. `docs/product-review` has a unique `docs/PRODUCT-REVIEW.md`, absent from the current labeller tree, so it also needs an archive.

## Resolve four stale pull requests

| Pull request | Proposed action | Reason |
|---|---|---|
| [#26](https://github.com/PawelZlotkowski/cs2-demos/pull/26) | Close as superseded, without merging | Its roadmap work is already in both retained Studio branches. Its old target is `development`. |
| [#28](https://github.com/PawelZlotkowski/cs2-demos/pull/28) | Close as superseded, without merging | Its accounts/admin work is already in both retained Studio branches. Its old target is `development`. |
| [#27](https://github.com/PawelZlotkowski/cs2-demos/pull/27) | Close as abandoned, without merging | Rejected floating desktop direction; preserve the branch tip in its archive tag. |
| [#29](https://github.com/PawelZlotkowski/cs2-demos/pull/29) | Close as abandoned, without merging | Rejected floating desktop accounts direction; preserve the branch tip in its archive tag. |

Closing these PRs would not mean their code was merged into their original target branches. Their existing discussion remains available. No new PR comments are proposed.

## Approved execution plan — completed

1. Re-read GitHub branch tips and PR heads; stop and reassess any changed tip. Keep both checked-out local branches and all application working files intact.
2. Create the six archive tags above at the full SHAs recorded in the local manifest. Verify each remote tag resolves to its expected commit.
3. Close PRs #26–#29 without merging or posting comments.
4. Remove only the 19 listed remote branch refs, using expected-SHA leases to avoid deleting new work. Retain `main`, `design/porcelain-ui` and `codex/labeller-recording`.
5. Publish the prepared replacement for `BRANCHES.md` on `main` as one documentation-only commit. This requires an explicit exception to the repository's no-commit/no-push rule. It may trigger the existing tracker deployment integration. Do not merge application code or change the default branch.
6. Enable GitHub's automatic deletion of merged PR branches to prevent this accumulation recurring.
7. Prune stale local remote-tracking refs, and verify the exact three remote branches, six archive tags, four closed PRs and updated guide. Leave local branch names/worktrees in place; they do not clutter GitHub and may be useful for recovery.

The owner explicitly approved this plan, including the documentation commit and push, archive tags, branch deletions, PR closures and automatic deletion setting. Execution followed the plan without a release, application merge, branch rename, worktree deletion or application commit. The guide was prepared in an isolated checkout under the ignored audit directory and pushed with an ordinary fast-forward Git push. Branch deletion used one atomic push with exact expected-SHA leases.

## Evidence and recovery

- All 22 current GitHub branch SHAs matched the corresponding local remote-tracking SHAs. No fetch was required to perform the ancestry audit.
- The latest [Labeller CI run](https://github.com/PawelZlotkowski/cs2-demos/actions/runs/44203505373) succeeded at `8094754`. This is historical CI evidence for that committed tip, not validation of today's uncommitted changes.
- The latest GitHub deployment record, `7800147686`, is successful and uses `main` tip `2b54ed3`; its URL is the `cs2-coach-tracker` Vercel project. GitHub deployment records cannot prove the configuration of every external deployment. Local cloud-labeller documentation describes CLI deployment from the working tree.
- None of the 22 branches was protected; the ruleset, release and tag APIs returned empty lists. Automatic deletion of merged branches was disabled.
- The two observed worktrees are the canonical Studio folder and `.local/git-labeller-branch`. Older source folders named in the November 15 branch guide are not present at their documented paths on this machine.
- A verified, complete-history Git bundle preserves all 22 remote tips plus the six local branch refs: `.local/branch-audit-2026-11-20/branches-before-cleanup.bundle` (9,158,605 bytes).
- Bundle SHA-256: `2E4C2B54E1580ED9C88289E46096406704F08D1323B5D8D7DE1A6E5AD5068582`.
- `git bundle verify` passed and every audited remote branch SHA/ref pair was found in the bundle. The bundle contains committed history only; it does not back up the current uncommitted application files.
- Full branch evidence, PR metadata, working-tree status, cleanup manifest, published `BRANCHES.md`, final GitHub snapshots, commit metadata and working-file hash verification are saved in the same ignored local directory. The application files were not modified for this audit or cleanup.

To restore a deleted branch locally from the backup, substitute its original name:

```powershell
git fetch .local/branch-audit-2026-11-20/branches-before-cleanup.bundle refs/remotes/origin/BRANCH:refs/heads/restore/BRANCH
```

Publishing a restored branch would require a subsequent authorised push. Archived work remains accessible on GitHub through the six verified tags.

## Longer-term branch policy

Use `main` for the reviewed shared baseline and short-lived task branches for active work. Preserve old experiments with tags, not permanent branches. The two current task branches should remain until their local changes are reconciled, reviewed and integrated; avoid renaming or merging them during active work. The next integration task should bring the validated current Studio to `main`, then retire the task branches once neither is checked out or needed.
