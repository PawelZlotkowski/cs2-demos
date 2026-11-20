# Labeller handoff verification — 20 November 2026

The recipient imports their own Ancient/Anubis demo, chooses one player, records
candidate moments locally and sends feedback back as JSON. This is the owner's
confirmed workflow. Existing personal annotations are retained; a new reviewer
handle starts an independent pass without deleting any database or Docker volume.

## Parser, context and video correction

This later correction supersedes the readiness assessment below. This revision
on `codex/labeller-recording`, based on `6882f6f`, contains the tested parser,
context and video-validation fixes. The owner authorised committing and pushing
the correction. Use this revision or the tested source kit; the earlier
`6882f6f` revision does not contain these fixes.

- Completed rounds now use their own observed boundaries. Restart rows and
  duplicate ends cannot reuse an earlier freeze end and duplicate live events.
  A missing freeze end falls back to that round's start; missing both fails
  visibly instead of inventing a 90-second interval.
- Good-play evidence carries its supporting time range. Multi-kills include the
  first and last kill; utility damage includes all counted damage; trades include
  the teammate death; clutch clips extend to the round result. Padding is applied
  to that range and ticks round outwards. Normal round-end clamping still applies.
- New video uploads use video-stream duration and decoded video coverage, rather
  than an audio-extended container duration. Unreadable frames, a delayed video
  track, incomplete decode and an insufficient requested window are rejected.
- Windows recording code, launchers, capture method and installed game/HLAE tools
  are unchanged. No fresh game recording was started for this correction.

Verification on this revision:

| Check | Result |
|---|---|
| Full Windows API/eval/unchanged-recorder suite | 488 passed, 4 skipped, 3 subtests |
| Full checkout, standalone Docker test-core | 241 passed, 2 skipped, 3 subtests |
| Extracted distributable source kit, Docker test-core | 201 passed, 1 skipped, 3 subtests; 190 source-file hashes verified |
| JavaScript and Windows launcher checks | Passed |
| Training corpus round-boundary check | 102/102 demos; hashes match; no overlapping rounds; no held-out files opened |
| Fresh selected-player Ancient / Anubis parse | 48 / 36 rounds; every freeze-end and live-round-end matches independent CS Demo Manager output |
| Duplicate live kills | None; 341 Ancient / 231 Anubis. CS:DM additionally retains 4 / 3 post-round deaths, outside the replay contract |
| Aggregate good-play context on those demos | All supporting events in the seven checked aggregate findings are inside their new clip windows |
| Existing footage, read-only validation | 185/186 pass decode and duration checks; one historical 299-frame clip is short at its end-of-round finding |
| Real HTTP upload and playback | 1 s video with 15 s audio rejected (422); existing matching CS2 clip accepted (200), served byte-identically |

The Docker core target excludes two tests that boot the separate Studio account
API, whose dependencies are absent from the standalone labeller. Those tests are
included in the full Windows suite. A Starlette/httpx deprecation warning remains.
Revalidation checks media integrity and timing coverage, not the human meaning or
POV of every historical clip. Existing labelled data was not edited or replaced.
Technical drafts and new batches used an isolated container with no recorder.

**Handoff decision:** the corrected application can be sent for a controlled
labelling trial with compatible demos. Unattended recording of arbitrary old
demos is not signed off: the observed game-version rejection and HLAE
`ViewModel.cpp:75` warning remain external compatibility issues. The recipient
must pass a short recording on their own game/tool versions before a full queue.
Existing workspaces need backup and refresh, or a new workspace when the corrected
rounds differ; see [setup](../LABELER-SETUP.md#parser-and-footage-correction--20-november-2026).

Private evidence: `.local/labeller-fixes-20261120/` in the canonical Studio folder
contains test logs, corpus results, independent round/event comparisons, media
validation and the isolated API results. No raw demos or player data are added
to Git or the distributable source kit.

## Changes

- Distinct selection usefulness, individual signal verdicts and player-decision
  assessment. A grouped clip can contain both correct and incorrect detections.
- Explicit footage check: verified, wrong player, wrong timing, missing context
  or unplayable. Problems remain exportable feedback but cannot enter training
  exports or verified coach examples. The form requires a footage check before completion.
- Drafts, reload, save-and-next, note exchange and optimistic revision checks
  preserve the added fields. Legacy notes remain readable. Historical group
  ratings are not converted to invented individual judgements.
- Old detector versions are blocked at batch creation, candidate review and save;
  the next-ready shortcut skips stale analyses. Prepare player refreshes analysis
  while keeping previous revisions in history.
- Source kits include detector, snapshot/cache and review-quality regressions plus
  SHA-256 hashes of their source files. The isolated Linux test target runs those checks.
- Setup explains Git branch selection, Docker rebuild, recorder restart, selecting
  a unique reviewer handle and annotating missed moments through full-round review.
  The friend-facing instructions are in Polish.

The underlying current policy remains `local-v1.1`: nearby teammate death within
5 m for selected-player trade outcomes; conservative combat-linked rifle movement;
unused utility, friendly flash, opening duel and good-play signals. These are
proposals for review, not proven mistakes. This local labeller does not run an LLM
to choose clips; selection feedback can later evaluate or improve model selection.

## Verification performed

| Check | Result |
|---|---|
| Full API, analysis, eval and recorder suite | 479 passed, 3 skipped, 3 subtests |
| Extracted source kit, Linux Docker test-core | 191 passed, 1 skipped, 3 subtests |
| JavaScript batch, navigation, replay and voice checks | Passed; includes mixed per-signal ratings and mandatory footage checks |
| Windows launcher regression | Passed, including spaced paths and backup recovery |
| Fresh runtime image via launcher in a folder containing spaces | Healthy; empty separate Docker volume, form revision 3, policy local-v1.1 |
| Fresh Ancient training demo | Roster of 10, selected-player parse of 23 rounds; 23.39 s including import and technical draft |
| Fresh Anubis training demo | Roster of 10, selected-player parse of 24 rounds; 25.17 s including import and technical draft |
| Fresh CS2 recordings | Two clips, native CS capture, 48.9 s / 45.0 s session time, zero capture failures |
| Media integrity | Both new videos fully decoded; zero identity/window/hash/media errors |
| Browser | Real POV playback, blocked incomplete form, autosave, completed technical note, reload restoring values, save-and-next to the second clip |
| Note transfer | One technical note imported; repeating the import changed nothing; new fields retained |
| Existing local installation updated | Healthy on port 8765; all 85 clips ready in five current batches; all 7 round and 10 clip-label revisions byte-identical to the pre-update backup |

The test used only the training partition of `Documents/cs_replays`. A first-roster
selection was explicitly requested by the technical smoke script; it does not
stand in for the recipient's player choice. Technical QA notes are clearly marked,
isolated in the disposable installation and have no training permission.
The original labeller data volume was not reset or replaced.

Private reproducibility evidence is under `.local/labeler-handoff-20261120/`:
`full-tests.log`, `final-container-tests.log`, `import-smoke.json`,
`import-anubis.json`, recording logs, `media-check.json` and the test note export.
The ten unrecorded windows in that technical batch are not failed recordings.

## GitHub handoff

Read-only GitHub verification found `codex/labeller-recording` at `8094754` and the
older default `main` at `3a20033`. These are the remote baselines, not this revision.
The prepared changes are isolated in `.local/labeler-handoff-20261120/git-ready/`;
the existing Studio branch and labeller worktree were not switched or overwritten.
The owner explicitly authorised committing and pushing this update on 20 November.
Use `codex/labeller-recording` for this revision; the older `main` is not the
recipient installation path. GitHub Actions validates the extracted source kit
and the Windows recorder/launcher on each push. The source ZIP is also available
for installation without Git.

Finite regressions and two real captures do not prove every future candidate
correct. Human judgement, missing context, demo/parser compatibility and a first
recording on the recipient's own Windows installation remain required checks.
