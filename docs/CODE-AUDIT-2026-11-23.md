# Code audit, 23 November 2026

A findings list for fixing, not a plan. The project-level picture and the Wednesday advice are in [DEFENCE-GUIDE-2026-11-25](planning/DEFENCE-GUIDE-2026-11-25.md). The [22 November audit](PROJECT-AUDIT-2026-11-22.md) holds the earlier software findings; the ones still open are listed at the end, not repeated.

**What this repo does:** a player uploads a Counter-Strike 2 demo. The API parses it, rule-based detectors turn one player's rounds into "findings" (an ID plus measured numbers), and a local language model picks moments and explains them. A checker (the "verifier") must accept every answer before the Studio shows it next to a radar replay and player-view clips. **Load assumed:** one PC, two students and up to 5–10 invited players, plus the evaluation runs that produce the report's numbers. So the main risk is a wrong number, not traffic.

**How this was checked:** four independent read-only reviews (parsing, detectors, coach and verifier, evaluation and retrieval). They ran real code on two processed matches, on all 102 training demos in the private corpus, and on small built cases. Every finding below was then re-checked against the code by hand. Another session was editing the repository during the audit, so this reflects the code as of about 14:45 on 23 November.

## Status after the fixes (23 November, evening)

Six agents fixed these on 23 November, each in its own set of files. Nothing is committed. A rollback snapshot of the tree before the fixes is in `.local/pre-agent-fixes-2026-11-23/`.

**Checks:**

- API: 459 passed, 3 skipped, and 6 expected failures (the known meaning-blindness probes, kept as tests).
- Labeller: 115 passed.
- Web typecheck: passes.
- Not run: the production web build, a live model run, the new CI workflow.

| Finding | Status |
|---|---|
| Knife rounds (owner request) | **Removed.** Round 1 is now the pistol round, and the score is per team. On the 102 training demos, 58 lost a knife round and no knife flags are left. |
| 1 | Resolved: the deletion was intentional. |
| 2 Damage | **Fixed.** Damage is now the health actually lost. Training demos: equal to the game's own total for 965 of 1006 player-matches; mean error per player fell from 423 to 13. |
| 3 Fake rounds | **Fixed.** Rows with no winner, draws and pre-match rows are dropped. Not every `is_match_started = false` row: the last round of a match also reads false. Round count and score equal the game's for all 101 training demos that could be checked. |
| 4 Test-set exposure | **Open: your decision** (freeze the manifest; move the `g050` pair out of test). |
| 5, 6 Verifier loopholes | **Fixed:** `[t:..]` backs only clock times and seconds, and is refused across matches; glued numbers are split; `[mN]` backs only its findings' numbers; "SG 553" and "SSG 08" are not read as numbers; autocite uses evidence only. |
| 7 Label reader | **Fixed.** `python -m eval.label_tool score "data/labels/*.json"` works and reports train/validation and test separately (set `RR_CORPUS_MANIFEST`). Today: 14 of 39 single-finding clips correct (36 %). |
| 8 Model comparison | **Fixed:** explanations are restored, every repeat is listed, the median is a true median. |
| 9, 10, 11 Detectors | **Fixed.** `unused_utility` also skips deaths traded within 5 s, following the labels. The policy is now `local-v1.2`. On 82 real analyses every reviewer problem case went to 0. |
| 12 Trade kills | **Fixed:** same rule as traded deaths. |
| 13 Ranker against checker | **Fixed:** the checker allows what the ranker picks; the tool text says 3 and 3. |
| 14 Pick and agreement maths | **Fixed:** one-to-one matching, NDCG at most 1, None when undefined, time matching within 1 s, newest label wins. |
| 15 Passage IDs | **Fixed:** stable `K10000`–`K99999` from file and title. Old `K1`–`K158` citations in stored answers no longer resolve. |
| 16 Retrieval | **Fixed:** "A site" and "B site" are told apart; the tool defaults to the match's map. |
| 17, 18 | **Fixed:** malformed tool calls fall back with a trace; a per-round Ask cannot fetch or cite other rounds. |
| 19 Privacy | **Partly:** the scope checks and the deleted-match cache are fixed. Blanking cross-match Ask traces on delete is still open. |
| 20 After-round deaths | **Fixed:** kept in separate lists that only round stats read, so detectors are unchanged. |
| 22 Nov leftovers | **Fixed:** clip-path escape, 409 on deleting a processing match, recorder kills the process tree, on-demand model work uses the GPU queue, synthetic Steam ID in the test, `/demos/` ignored, Dutch hidden, CI workflow added (never run). **Still open:** Origin and trusted-host checks (postponed: risk to the Tailscale route), parsing in a child process, match records in memory, dependency pins, docs clean-up. |

**Also added:** a fixed model seed (`RR_LLM_SEED`, default 20261125), and traces that now record the sampling, the tools, the policy version and the git commit.

**Known leftovers:**

- Deaths equal the game's scoreboard for 892 of 1006 player-matches; the after-round death rule needs one more look.
- `anb-026-p1` has a 416-second round after a mid-match restart.
- The labeller refuses new player choices on demos it parsed before these changes, because its telemetry fingerprint changed. Use a fresh workspace.
- Labels exported before today are one round off on demos that had a knife or fake round.
- The unused templates `untraded_death.traded_by_teammate` and `untraded_death.killer_unavailable` can be removed.

**You need to:**

- Re-process every match you show or evaluate. Stored analyses keep the knife round and uncapped damage.
- Then make the Wednesday review.

## Must fix

1. **Resolved: the 23 Nov deletion of the showcase review was intentional** (confirmed by Paweł). The Wednesday review and the paused setup upload must be made again. Land findings 2 and 3 first, so the new review shows correct numbers.

2. **Damage counts overkill, so damage, ADR and the rating are too high** (`apps/api/app/analysis/extract.py:93`)
   - **What this is:** reading each "player hurt" event from the demo. Its `dmg_health` field is the damage of the shot, not the health actually lost.
   - **Problem:**
     - An AWP hit on a 100-HP player is stored as 440 damage.
     - On the showcase match, one player's ADR (average damage per round) is 152.8 instead of 102.9.
     - This flows into round stats, `get_match_totals` (which the model quotes), the HLTV-style rating line in the Studio, and `utility_damage` good plays. Some of those findings should not exist: one says "57 grenade damage" against an enemy on 8 HP.
   - **Fix:** keep the remaining health per victim per round, starting at 100, and store `min(dmg_health, health_left)`. Then re-process the matches you will show or evaluate.
   - **If we skip it:** the coach states wrong numbers, and the checker accepts them, because they match the stored evidence.

3. **Warm-up rounds, restarts and rows with no winner become real rounds** (`apps/api/app/processing/normalize.py:33-63`)
   - **What this is:** turning the demo's round-end events into the list of rounds.
   - **Problem:** the filter keeps round-end rows that have no winner, and warm-up rows that do have one. Running the real code on the 102 training demos, 8 got a fake round:
     - a 0.1-second "round 1" that pushes the pistol round to round 2, so the economy labels are wrong;
     - a restart counted as a round, in which all ten players get an extra death;
     - a warm-up round whose kills count in the stats.

     Every later round number shifts by one.
   - **Fix:** drop rows with no winner, and parse `round_end` with `other=["is_match_started"]`, dropping rows where it is false (checked on the warm-up case).
   - **If we skip it:** about 8 % of demos give wrong round numbers, stats and findings, in training and evaluation alike.

4. **A sealed test match has been labelled, and the corpus split is not frozen** (`C:\Users\pawel\Documents\cs_replays\manifest.csv`; `data/labels/`)
   - **What this is:** the private corpus manifest, which decides train, validation and test per match.
   - **Problem:**
     - One of the two matches Aleksander labelled (`anc-053`) is in the sealed test set. So is its paired match `anb-050` (same series, same leakage group). The manifest still says `priorExposure: none` for both.
     - Those labels may have shaped the 22–23 Nov detector changes.
     - The manifest is still `v0-proposed` (its README says to freeze it before tuning anything).
     - It marks all 148 demos `trainingPermitted: false`, while the labeller marks both labelled demos as permitted, and the new teaching examples trust the labeller.
   - **Fix:** move the `g050` pair out of test, promote one validation match per map in its place, and record the exposure. Then set a frozen `manifestVersion`. Decide the permission once and make the labeller's provenance match the manifest.
   - **If we skip it:** the final test numbers are not clean, and the report has to say so.

5. **The checker lets made-up numbers through in two new ways** (`apps/api/app/coach/verify.py:35`, `:124-128`, `:284-287`)
   - **What this is:** the code that must reject any number not in the evidence. A citation like `[t:64]` points at a time in the round.
   - **Problem:**
     - Citing a time makes that number allowed anywhere in the sentence. "You dealt 64 damage and were 64 m from help [t:64]" passes. Across matches no round length is known, so "[t:4321]" passes too. The v7 Ask prompt tells the model to add `[t:..]`, so this happens in normal use.
     - Numbers stuck to a letter or colon are never checked: "a 1v5" passes when the finding says 1v2, and so does "t:99.9".
   - **Fix:** use a cited time only to check clock times such as "1:05". Before scanning, split `1v5`, `3:7` and `t:` into separate numbers, keeping the guard for weapon names like AK-47.
   - **If we skip it:** "passed the checker" means even less than it does today, and the grounding audit will find these by hand.

6. **Autocite adds a citation to a sentence whose number is invented** (`apps/api/app/coach/verify.py:224-226`, `:254-264`)
   - **What this is:** autocite is a helper that adds a missing `[F..]` citation when a sentence's numbers match a finding.
   - **Problem:** it matches against the finding's round number, its time and every round stat, not only its evidence. "Your nearest teammate was 15 m away." got `[F3]` attached because F3 happened at 15.5 s, and it was stored as a model answer.
   - **Fix:** autocite only when every number in the sentence is one of that finding's evidence values.
   - **If we skip it:** an invented distance is shown with a real citation, which is worse than no citation.

7. **The label scoring tools cannot read your labels** (`eval/label_tool.py:117-123,185`; `apps/api/app/services/labels.py:76,85`)
   - **What this is:** the documented commands and the Lab page that compute precision, recall and Cohen's κ (agreement between two labellers).
   - **Problem:**
     - `label_tool score data/labels/*.json` stops with `KeyError: 'findings'`. The tool expects one JSON line per round; the labeller exports one JSON document per labeller.
     - The Lab page shows 0 rounds with no error.
     - The four exports are cumulative (16 ⊂ 50 ⊂ 74 ⊂ 90), so pooling them would count the same label up to four times.
     - 46 clips cover several findings with one verdict.
     - The 50 % precision in the defence guide came from a separate script, not this tool.
   - **Fix:** add a reader for the `round-reviewer-notes-v1` export that keeps the newest save per finding, scores single-finding clips, and expands file patterns with Python's `glob`.
   - **If we skip it:** the report's detector numbers cannot be reproduced with the project's own tool.

8. **The model comparison deletes stored explanations and hides some answers** (`eval/compare_models.py:128-143,193-195,248`; `apps/api/app/repositories/analysis.py:185-189`)
   - **What this is:** the script behind the 22 November Qwen-versus-Gemma table. It says the app's data stays unchanged.
   - **Problem:**
     - Putting the moments back calls `replace_moments`, which also deletes every stored moment explanation (checked in a scratch run). If the match had no moments, the model's picks stay stored.
     - The text section of the report shows only the last repeat, so Qwen's one Polish fallback (Cyrillic output) is in the counts but its text is not shown.
     - The medians take the upper middle value: 1.21 s is reported where the true value is 1.135 s.
   - **Fix:** save and restore the `m*` explanations with the moments. List every repeat's text. Use `statistics.median`.
   - **If we skip it:** each comparison run on the showcase match wipes its explanations.

## Should fix

9. **Team-flash counts dead teammates and the player's own blindness** (`apps/api/app/analysis/detectors/team_flash.py:34-41`)
   - **What this is:** the detector for flashing your own team.
   - **Problem:**
     - Players who are already dead still get "blind" events. On real matches, 6 of 151 team-flash findings exist only because of a dead teammate, and 3 more have the wrong count.
     - The "longest" duration includes the player's own blindness: 1.2 s on a teammate and 4.5 s on yourself reads "blinded 1 teammate (longest 4.5 s)".
   - **Fix:** ignore blinds on players not in `rd.alive_at(b.t)`. Take `longest` from the teammates when any were hit.
   - **If we skip it:** wrong team-flash findings, and wrong numbers in true ones.

10. **A clutch is credited after the player died** (`apps/api/app/analysis/detectors/good_plays.py:101`)
    - **What this is:** the good-play rule for winning a round as the last player alive.
    - **Problem:** it only checks that the player was alive when the last teammate died. Die afterwards and let the bomb win the round, and it still reads "Won the round as the last player alive against 5 enemies". 3 of 30 real clutches are like this.
    - **Fix:** require that the player did not die in the round, or use a separate template for "died, round won by the bomb".
    - **If we skip it:** a good-play moment praises something that did not happen.

11. **Traded deaths are still reported as mistakes** (`apps/api/app/analysis/detectors/untraded_death.py:19`, `unused_utility.py:52`)
    - **What this is:** the untraded-death and unused-utility detectors.
    - **Problem:**
      - `untraded_death` skips only one kind of trade: 33 of 124 real findings are deaths a teammate did trade. They are shown as context, but count as "untraded" errors in labelling.
      - `unused_utility` also flags deaths by a teammate (team kill), by the world, and deaths traded one second later. Aleksander's notes list exactly this ("gets instantly traded by teammate, no mistake").
    - **Fix:** skip `traded_by_teammate` and `killer_unavailable` in `untraded_death`. Require an enemy killer in `unused_utility`. Whether a traded death still counts as unused utility is your call.
    - **If we skip it:** detector precision stays low for a reason you already know.

12. **Trade kills and traded deaths use different rules** (`apps/api/app/analysis/stats.py:27` against `:49`)
    - **What this is:** two round-stats fields the model may quote.
    - **Problem:** `trade_kills` counts only trades made within 5 m of the dead teammate; `death_traded` has no distance limit. On the showcase match, the ten players have 34 traded deaths in total but only 4 trade kills.
    - **Fix:** count trade kills with the same rule as `was_traded`. Keep the 5 m radius only inside the untraded-death detector.
    - **If we skip it:** "you made 1 trade kill" is quoted when there were several.

13. **The checker rejects the ranker's own picks** (`apps/api/app/coach/verify.py:430-433` against `apps/api/app/analysis/ranker.py:108-109`)
    - **What this is:** the rule "at most 2 moments of one type", which the ranker (the no-model picker) and the checker of the model's picks both apply.
    - **Problem:**
      - When nothing else fits, the ranker allows a third moment of the same type. The checker rejects it whenever any other type exists, even one that clashes in time.
      - On real data, 13 of 82 analyses fail the checker on the ranker's own picks. A model making the same sensible choice is sent to repair, then replaced.
      - Separately, the `select_moments` tool text says "at least 2 mistakes and 2 good plays" while the code requires 3 (`coach/tools.py:414`).
    - **Fix:** in the checker, allow a third of one type when the ranker could not avoid it; fix the tool text.
    - **If we skip it:** the model's pick-pass rate is understated in the evaluation.

14. **The moment-pick and agreement maths can give impossible scores** (`apps/api/app/services/labels.py:135-138`; `eval/label_tool.py:105,126-128,142-143,180-188`)
    - **What this is:** overlap@6 and NDCG@6 (how well the coach's 6 picks match a student's), and κ.
    - **Problem:**
      - One long human pick can match several coach picks: overlap 2 out of 1, NDCG 1.63 (it must be at most 1).
      - Labels are matched by rounding time to whole seconds, not "within 1 s": 41.4 and 41.6 do not match, while 41.5 and 42.49 do.
      - Labelling a round again appends rather than replaces, so it is counted twice.
      - κ is reported as 1.0 when both labellers always said "correct"; in that case κ is undefined.
      - Numbers are never split by train and test.
    - **Fix:** match one-to-one; ideal = min(distinct human picks, 6); report None when there is no human set. Match labels to the nearest time within 1 s and keep the newest label per round; return None for κ when expected agreement is 1; join each label with the manifest split.
    - **If we skip it:** the report's main evaluation numbers can be wrong without anyone noticing.

15. **Knowledge passage IDs change when a note is added** (`apps/api/app/rag/ingest.py:72-84`)
    - **What this is:** retrieval (RAG) cuts the map notes into passages numbered K1, K2, … in file order.
    - **Problem:** adding the planned Ancient notes renumbers the later passages. K113 changes from "Using utility before dying" (cited in the 22 Nov run) to a counter-strafing passage, so old citations, counts and flags point at different text.
    - **Fix:** build the ID from the file and section title (for example a short hash), not from the position.
    - **If we skip it:** saved answers silently cite the wrong passage after the next notes edit.

16. **Retrieval ignores "A" and "B" and the match's map** (`apps/api/app/rag/index.py:113,124`)
    - **What this is:** the keyword search behind `search_knowledge`.
    - **Problem:** one-letter words are dropped, so "A site retake" and "B site retake" return identical passages. When the model leaves out the map, an Anubis question returned a Mirage passage.
    - **Fix:** keep `a` and `b` as terms, and default the map filter to the match's map in the tool.
    - **If we skip it:** site-specific advice comes from the wrong site or the wrong map.

17. **A malformed tool call crashes the job with no fallback and no trace** (`apps/api/app/coach/llm_client.py:296`, `agent.py:121`, `backends.py:180`, `jobs.py:706`)
    - **What this is:** reading the tool arguments the model writes.
    - **Problem:** arguments of `null`, `[]` or a bare string raise a Python error. Ask then shows "could not answer" instead of the template, "explain all moments" stops halfway, and nothing is written to the traces.
    - **Fix:** treat any argument value that is not a JSON object as invalid (the agent already handles invalid JSON), and catch errors in `_answer` so the fallback and the trace are still written.
    - **If we skip it:** one odd model output in front of the class shows an error.

18. **A per-round Ask can read and cite other rounds** (`apps/api/app/coach/jobs.py:96`; `apps/api/app/coach/tools.py:272`)
    - **What this is:** the per-round Ask, whose tools are meant to see only that round.
    - **Problem:** `get_finding` takes any finding ID. Asked about round 1, the model fetched a round-2 finding and answered "Look at round 2 instead [F5]", which the checker accepted.
    - **Fix:** build the checker's allowed findings from the bound round only, and make `get_finding` refuse findings from other rounds.
    - **If we skip it:** the round boundary you describe on Wednesday is not real.

19. **Match privacy gaps in the coach tools** (`apps/api/app/coach/tools.py:77-83`, `:216`, `:228`; `apps/api/app/services/traces.py:79-95`)
    - **What this is:** the per-user scoping that keeps one player's match away from another.
    - **Problem:**
      - `get_round_stats` and `get_match_totals` skip the "is this match yours" check that the other tools make.
      - A deleted match stays readable through the tools' in-memory cache.
      - Deleting a match does not blank the cross-match Ask traces that quote it.
    - **Fix:** add `if not allowed(match_id): raise ToolError(...)` to the two tools. Remove the match from the tool cache on delete. Store the match IDs a cross-match job used, and redact by them.
    - **If we skip it:** in the user study, a deleted demo is not really gone. With accounts on, a token can read another player's stats.

20. **Deaths after the round ends are dropped** (`apps/api/app/analysis/extract.py:52-73`)
    - **What this is:** the time window used to keep kills and damage for each round.
    - **Problem:** it ends exactly at round end. A player killed by the bomb or an exit kill a few seconds later counts as "survived". Five such deaths on one training demo all came out as `survived=True`, and the exit-kill player gets 0 kills. KAST, the rating and saving decisions are affected.
    - **Fix:** keep kills and hurts until the next round starts, as purchases already do (`from_prev_end`), and mark them as after the round.
    - **If we skip it:** small but systematic errors in survival-based numbers.

Left out, 8 smaller findings:

- the ranker reports a score after the diversity penalty instead of at pick time;
- a closing `</think>` without an opening tag keeps the reasoning (only with `--reasoning-format none`);
- the dataset edit check reads "4" out of `F14`;
- the `autocited` trace flag is set when only whitespace changed;
- teaching examples take a demo's provenance from the oldest export file (nothing leaks today);
- `purchases` are always empty because the column names are wrong (nothing reads them);
- language detection is confused by callouts like "A Main" (seen only with Dutch);
- traces lack the sampling settings (known since 22 Nov).

**Still open from the 22 November audit:**

- 3: parse timeout and in-process parse.
- 5: clip path escape on Windows.
- 6: no Origin check when accounts are off. Today's deletions show that any device on the tailnet is an admin.
- 9: delete while processing.
- 10: match records only in memory.
- 11: on-demand explain and Ask skip the GPU queue.
- 12: recorder timeout does not kill CS2.
- 14: no CI for the API.
- 15: contradicting docs and the `plan/` folder.
- 18: a real Steam ID in `tools/test_record_label_clips.py:134`; the `data/labels/` files are not git-ignored and contain Steam IDs.
- 19: dependencies not pinned (`demoparser2>=0.42.2` was raised today).

Fixed since then: 1, 7, 8, 16. Ancient zones are covered in the defence guide.

**Verdict:** the design is sound, but the numbers it produces are not yet trustworthy. Fix the damage and round bugs (2, 3) before making the new Wednesday review, and the test-set exposure (4) before any evaluation run, because every later table depends on them.

**Not checked:**

- The web app beyond the replay clock, citation seeking and the rating formula.
- The labeller server and its hosted variant.
- Clip recording with CS2.
- Any run with the real model on the GPU.
- The validation and test demos (only the 102 training demos were parsed).
- Mid-round disconnects and bots (no demo had one).
