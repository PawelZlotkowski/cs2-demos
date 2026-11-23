# Saved-review recalculation and clip audit

20 November 2026. Follow-up to [the detection research and correction](DETECTION-QUALITY-RESEARCH-2026-11-20.md), requested by the owner. This is a development audit, not a held-out human precision/recall evaluation.

## Applied results

Five Studio reviews were recalculated and saved using `local-v1.1`, preserving each selected player, focus and language. The five reviews contain two distinct demo inputs. No raw demo reparse was needed because the changed rules use existing telemetry.

| Studio review | Map | Preserved focus | Findings before → after | New selected moments |
|---|---|---|---|---|
| `match-02413d3a540e` | Anubis | Overall | 36 → 18 | 6 |
| `match-2cf7e2ca0c5b` | Ancient | Utility | 10 → 10 | 6 |
| `match-3eb58b658fa1` | Anubis | Shooting | 23 → 17 | 5 |
| `match-be98e1d79f14` | Anubis | Utility | 12 → 12 | 6 |
| `match-d2ab5e1f1078` | Ancient | Overall | 34 → 16 | 6 |

The running labeller had a separate database and still used `local-v1.0`. Its five prepared player analyses, across three distinct demos, were recalculated too. Two other imported demos only had roster inspection and no prepared player analysis; they were left at that stage.

The five labeller analyses now contain 120 findings, down from 213. Their 43 former moving-shot mistakes became ten contextual observations; nearby-death outcomes produce seven context findings and one successful personal trade. These counts describe behaviour, not measured improvement in precision or recall.

The owner's three personal batches are ready in the local labeller:

| Input alias | Demo hash prefix | Map | Ready grouped clips |
|---|---|---|---|
| A1 | `7e9d2fa1` | Ancient | 16 |
| N1 | `6f524687` | Anubis | 20 |
| N2 | `9478411d` | Anubis | 21 |

All **57** files passed media/duration checks locally; each live labeller streaming GET returned HTTP 200 and media bytes after restart. Thirty-five were cut from existing recordings with matching demo, player and tick coverage; 22 were newly recorded. Four additional Ancient audit clips were recorded separately to inspect the trade, no-trade and moving-rifle cases. The 22 replacement captures completed in three CS2 sessions with no failed clips. CS2/HLAE were no longer running at the final check.

The other two historical player profiles have 14 new grouped windows each, paused and awaiting recording. Their old recordings and labels remain available in history. Studio's optional recording jobs were relinked to its new moments; the 57 ready videos above belong to the labeller, not automatically to Studio's separate clip-job catalogue.

## Clip observations

The assistant inspected timestamped frames around **20 observations from 18 distinct video files**, including all 15 new trade/movement observations for the owner's three prepared demos and five old moving-shot examples removed by the new rule. This was visual frame inspection with telemetry cross-checks, not a human adjudication pass or continuous inspection of every recorded frame. Round numbers below are the saved API round numbers, which retain the knife round.

| Case | Observed footage and telemetry | Assessment of the new output |
|---|---|---|
| A1, round 2 | Nearby teammate dies; selected player kills the same opponent about 0.6 s later. Telemetry separation is 3.34 m using the project's conversion | Successful personal trade agrees with kill feed and POV. Dual Berettas movement is not labelled a shooting mistake |
| A1, round 6 | Teammate dies 1.03 m away. Selected player fires back and deals 24 damage, but does not kill that opponent inside the five-second window | `not_traded` is an observed outcome; the clip disproves an interpretation of “made no attempt” |
| A1, round 16 | Galil fire in/at smoke, followed by the selected player's death | Context only. No claim that the target was clearly visible or that movement caused the death |
| A1, round 18 | AK engagement, movement and successive kills are visible | Useful engagement context; winning shots do not establish that the movement was either correct or incorrect |
| N1, round 16 | Nearby teammate dies while the selected player's view is obscured by smoke; selected player fires and dies about 3.8 s later | Interrupted trade outcome agrees with footage; proximity alone cannot support a missed-trade accusation |
| N1, round 17 | Teammate immediately in front dies, followed by the selected player about 0.19 s later | `player_died` correctly separates this from a full unanswered five-second opportunity |
| N2, round 12 | Teammate ahead dies, then the selected player dies about 0.61 s later | Interrupted outcome is supported; Five-SeveN fire is not automatically criticised |
| N2, round 17 | Flash-obscured push; teammate dies, then a different teammate kills the opponent about 0.89 s later | `traded_by_teammate` is supported, rather than blaming the selected player for a missing team response |
| N1, round 12, old moving-shot finding | Deagle engagement and kill | Removed automatic movement judgement; weapon/context need their own calibration |
| N1 round 15/22 and N2 round 18, old rifle findings | Short fire, spam/area denial or an engagement without nearby qualifying damage in the gate | Removed as automatic mistakes. This also demonstrates the conservative gate's recall limitation: a visible target can exist without a qualifying hurt/kill |

Other inspected moving-rifle observations in N1 round 15 and N2 rounds 10, 13 and 19 were associated with visible firing/engagement context and remain observations. Two old clips, N1 round 22 and N2 round 11, stop at the round boundary immediately around the final shots. Their pre-event context was inspected, but their full aftermath was not established from those clips. A separate capture-tail/alignment check remains appropriate; no universal ≤100 ms alignment claim is made here.

All current `shot_while_moving` outputs are context, not mistake labels. This prevents the earlier automatic accusations; it does not establish that every actual shooting mistake is now found, nor does it validate other detector categories such as unused utility.

## Duplicate-action check

The three existing labeller batches contained 131 per-finding windows and **76 overlapping window pairs** (14 Ancient, 37 N1, 25 N2). Their refreshed equivalents contain 55 grouped clips. The additional two prepared profiles bring the total to 85 grouped windows.

Across all five new batches: **zero overlapping windows, zero repeated finding IDs**. For ready files, the comparison also used the probed `videoEnd`, not only requested endpoints. Findings from one overlapping action remain together in a single clip. All five refreshed Studio selections also have no overlapping selected windows or reused evidence IDs. Re-uploaded copies of the same demo remain separate reviews; this is not a claim of global deduplication across uploads.

## Fix found during this audit

An Ancient teammate death at `t=13.906` produced an observed duration of `4.999999999999998` seconds. Comparing that subtraction to five incorrectly returned `window_incomplete`. The detector now compares the intended deadline to round end, and a regression test covers this case. It now reports the complete no-trade observation correctly.

## History, deployment and reproducibility

- Studio's old findings, stats, explanations, clip-job references and seen/rating state were archived before new ordinal IDs became active. A consistent SQLite backup was taken. Active seen/rating flags were cleared after archival so an old `m1` would not mark a different new `m1` as reviewed.
- Labeller snapshot refresh now archives the previous snapshot, uses fresh finding IDs, and scopes current round reviews/progress to the active snapshot. Earlier round reviews remain exportable with their original snapshot IDs; imported notes without local snapshots retain compatibility.
- All **7 round-review revisions and 10 clip-label revisions** in the original labeller catalogue were compared after deployment and retained exactly. Five old snapshots are archived. No assistant judgement was saved as a human label or authorised for training.
- The running container's relevant detector/template/store files were updated, with its old runtime files archived. The labeller was restarted and verified healthy, serving policy `local-v1.1` and the five new snapshot IDs. The existing grouped-clip UI supports the resulting payloads. Source changes remain in the working tree; no Git commit or push was made. Recreating the container should build from this updated source, rather than reuse an older image.
- **109 affected regression tests passed**: annotation persistence, history refresh, import/export, batches/grouping, and trade/movement/ranker tests. The focused refresh/trade check also passed (17 tests). `git diff --check` passed for the source changes.

Private inputs, backups, scripts, manifests and frame sheets are in `.local/detection-quality-rerun-2026-11-20/` (ignored by Git). Key records are `studio-applied.json`, `labeller-applied.json`, `final-media-checks.json`, `visual-cases.json`, `additional-visual-case.json`, `ancient-capture/results.json` and `completion-capture/results.json`. `prepare.py`, `stage.py`, `reuse_media.py`, `capture_missing.py`, `apply_studio.py` and `deploy_labeller.py` record the operation. Application scripts contain preconditions and are not intended to be blindly rerun against already-refreshed state.

The container also retains `/data/detection-audit-20261120/` with database/runtime backups and the applied plan. No LLM was used to recalculate or label these results. The audit does not replace independent player review, weapon/visibility calibration, full-round discovery for recall, or the planned held-out evaluation.
