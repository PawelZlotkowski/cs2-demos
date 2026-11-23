# What to improve and what to add, 26 November – 6 December

The working plan from the day after the presentation to submission. It turns the [project audit](../PROJECT-AUDIT-2026-11-22.md) into dated tasks. It keeps the RR task ownership of [FINAL-DELIVERY-PLAN](FINAL-DELIVERY-PLAN.md) and replaces that plan's missed dates. The Wednesday steps are in the [run sheet](WEDNESDAY-RUN-SHEET-2026-11-25.md).

## 1 Rules for the last eleven days

1. **No new features.** The product is good enough to answer the research question. Every hour goes to evidence or to a listed fix.
2. **Evidence beats polish.** A table with honest denominators is worth more than a nicer screen.
3. **Freeze the system on Tuesday 1 December:** detectors `local-v1.1`, prompts v5, one model, one retrieval setup. After that only bug fixes, and each one records whether it changes evaluated behaviour.
4. **Never tune on the 20 sealed test matches.** Use the 26 validation matches for anything you adjust.
5. **Every number has a file.** Results go to `eval/reports/<date>-<config>/`, with the config, commit, seed and model file named.

## 2 Improve what exists

### P0: needed for honest results (do these first)

| # | Improvement | Why | Where | Owner | Size | Done when |
|---|---|---|---|---|---|---|
| I1 | Bring in commit `d46f91b` from `codex/labeller-recording` | It fixes how rounds are paired when a demo has restarts or draws, adds context windows to good plays, and tightens clip checks. It is the only Codex work missing from this folder | `git diff 6882f6f d46f91b`; 16 of 17 files apply cleanly, and only `docs/handoff/23-AGENT-LOG.md` needs a manual merge | Paweł | 0.5 h | Applied, and the API and labeller tests pass |
| I2 | Split training data by the sealed `manifest.csv` | The 80/10/10 hash of the upload ID can put the same match in train and test | `split_of` in `apps/api/app/services/dataset.py:47` | Paweł | 1 h | A re-imported demo lands in the same split; a test covers it |
| I3 | Fixed seed and full provenance | Results cannot be repeated or compared without them | Send `seed` in `apps/api/app/coach/llm_client.py`. Record the seed, sampling settings, detector policy version, knowledge fingerprint and commit SHA in each trace (`coach/agent.py:164-198`) | Paweł | 2 h | Two runs with the same seed give the same moment picks |
| I4 | Cheap verifier fixes | They close the easiest false passes | Ask answers that contain numbers must cite (`coach/jobs.py:521,569`). Run `verify_text` on the pick reason (`coach/verify.py:381`). Add the 8 audit probes as tests marked as known limits | Aleksander | 3 h | Those probes either fail or are listed as known limits in the report |
| I5 | Fix NDCG | It currently ranks the coach's picks by time | Score before moments are renumbered (`coach/verify.py:417`), or report overlap@6 only | Paweł | 1 h | A test with a known order |
| I6 | Decide Ancient | It is a delivery map with no callout zones and no notes | Either draw zones and write about 30 notes (about 1.5 days), or declare Ancient replay-only and evaluate on Anubis. **Ask the teachers on Wednesday** | both | 0.5–1.5 days | The report states which, and why |
| I7 | One source of truth in the docs | The docs contradict each other on maps, languages and design | Delete `plan/`; fix `README.md:12,38`, `docs/university/README.md` and `AGENTS.md`; hide Dutch in `apps/web/src/lib/coach/language.ts` | Paweł | 1 h | A search for Dust II, Dutch or "design paused" finds only history notes |
| I8 | CI that runs the real tests | Examiners and the reproduction step need it | Commit `.github/workflows/labeler.yml` with its scripts; add `pytest` for `apps/api` and `npm run build`; add `next/core-web-vitals` to ESLint | Paweł | 1.5 h | A green run on GitHub |
| I9 | Pin the dependencies | "Reproduce from a clean clone" must give the same parse | A constraints file from `pip freeze`; add `psutil`; Pydantic `>=2.11`; keep demoparser2 at 0.42.2 as on the labeller branch | Paweł | 0.5 h | A fresh environment reproduces the test run |

### P1: needed before other players use it (the user study)

| # | Improvement | Where | Size |
|---|---|---|---|
| I10 | Parse in a child process with time and memory limits, so a bad demo cannot crash or block the API. Copy the pattern from `annotation/jobs.py:130-161` | `apps/api/app/processing/pipeline.py:147-152` | 3 h |
| I11 | Refuse to delete a match while it is processing (409) | `api/account.py:50`, `admin/routes.py:206` | 0.5 h |
| I12 | Kill the whole recorder process tree on timeout (Windows). This matters more because HLAE shows a **modal** error box when it is older than CS2: on 22 Nov, `AfxHookSource2\ViewModel.cpp:75` with HLAE 2.192.5 against CS2 1.42.0.0. An unattended recording then waits until someone clicks OK. HLAE was updated to 2.193.1 on 22 Nov, and a test recording showed no error box. Still check the advancedfx releases after every CS2 patch, and make the recorder's timeout kill the process tree, so a future box cannot hang it | `processing/video_clips.py:388-405`; HLAE lives in `%USERPROFILE%\.csdm\hlae` | 1 h |
| I13 | Check Origin on every write and add `TrustedHostMiddleware` when accounts are off | `apps/api/app/main.py:57` | 1 h |
| I14 | Check the demo size in the browser before uploading | `apps/web/src/app/upload/page.tsx` | 0.5 h |
| I15 | Polish wording review of the templates and prompts, done by the two of you | `coach/templates/findings.pl.json`, `coach/prompts/*.v5.md` | 2 h |

### P2: only if the evidence work is finished

- **More specific explanations.** Today's are generic ("unused utility can limit your ability…"). Ask the model for one situational detail it gets from a tool (where teammates were, what the enemy did), then measure it against the template baseline. Do this only after the baseline table exists, otherwise you cannot show it helped.
- **More varied moments** with the Overall focus (a Utility review gave 4 of 5 picks as unused utility, which is expected for that focus).
- **Smaller fixes:**
  - Polling backoff.
  - The one-query ownership check (`auth/deps.py:122`).
  - Keeping replays out of memory (`repositories/matches.py:310`).
  - **The match `score` field.** `processing/normalize.py:98-107` counts CT wins against T wins, so it includes a knife round and ignores the side switch. One Anubis match reads "11–11" while the Studio header (from the player's round stats) correctly shows 13–8.
  - The Studio's round numbers count the knife round.

### Not before 6 December (cut or defer)

- **Cloud HTTPS deployment, invited accounts and public hosting.** The proposal does not ask for them, and they bring four security and load problems with them (audit findings 4, 5, 11 and 13). Run the user study on the PC, in person or over Tailscale.
- Hosted-labeller polish (Vercel, Supabase, R2), unless it is needed for remote labelling.
- Porcelain for the admin and Lab pages, splitting the 2,003-line Studio page, 3D replay, renting an RTX Pro 6000, and Dutch.
- **The `integration/phase1/` patches.** Port only the child-process parser idea (I10), then archive the rest.
- Deleting `apps/tracker/`. Do it any time; it is unused.

## 3 Add what is missing (the evidence)

Ordered by value per hour. Each row ends in a committed result file with its denominators.

| # | Addition | Owner (proposal split) | Size | Output |
|---|---|---|---|---|
| A1 | **One evaluation command** with the **template baseline as a row**, built from the existing `eval/compare_models.py` and `eval/label_tool.py`: `python -m eval.run --config eval/configs/<name>.yaml` | Paweł | 1 day | `eval/reports/<date>-<config>/*.csv` plus a README with the config, commit and model |
| A2 | **Grounding audit by hand.** Mark every claim in about 100 verifier-passed outputs from 3–4 validation matches as supported, unsupported or interpretation | Aleksander | 1 day | Unsupported-claim rate and verifier false-pass rate, per language |
| A3 | **Labels** with the existing labeller: about 60 rounds, 20 of them labelled by both of you, on the 6 detectors that are on | both | 1.5 days | Precision for each detector with a confidence interval, and Cohen's kappa |
| A4 | **Main table:** template vs Qwen3-14B vs Gemma 4 12B vs **Gemma 4 26B-A4B** (download about 13.6 GB first), EN and PL, 3 repeats, test matches. See the [22 Nov model update](../coach/MODEL-OPTIONS.md#update-22-november-2026-local-rerun-and-newer-models) | Aleksander | 1 day | Checker pass rate, fallback rate, latency, VRAM, and blind 1–5 ratings by both of you |
| A5 | **Moment picks.** Each of you picks the top 6 on 10 test matches before seeing the system's picks | both | 0.5 day | Overlap@6 for the ranker and for the model, with your agreement with each other as the ceiling |
| A6 | **Retrieval evaluation.** 40 queries with the known right passage; serve bge-m3 with `llama-server --embedding` and set `RR_EMBED_URL` | Aleksander | 0.5 day | Hit@3 and MRR, BM25 vs hybrid |
| A7 | **Tool-choice set.** 40 Ask questions (20 EN, 20 PL) with the expected tools, scored from the traces | Aleksander | 0.5 day | Tool-choice accuracy, steps and time per answer |
| A8 | **User study.** 5 players, 20 minutes each, on their own match; written consent | both | 1 day | Short table plus quotes: found something new? trusted it? what was wrong? |
| A9 | **QLoRA pilot**, only if A1–A7 are done. Qwen3-8B or 14B on verifier-passed and reviewed training conversations from the training split only, keeping the tool schemas | Aleksander | 1–2 days | Base vs adapter on the same validation set. If it is skipped or fails, write it up as a result |
| A10 | **Report and reproduction.** The other person reproduces the tables from a clean clone | both | 1.5 days | The final report; the reproduction notes |

## 4 What to ask the teachers on Wednesday

| Measure | Proposal | Ask to report instead |
|---|---|---|
| Labelled rounds | 150 (30 double-labelled) | about 60 (20 double-labelled), on the 6 enabled detectors |
| Moment picks | 20 test matches | 10 test matches, both students |
| Test questions | 150 (50 per language, 3 languages) | 40 (20 EN, 20 PL) |
| Fine-tuning | QLoRA plus comparison | one pilot if time allows, otherwise a documented descope with the dataset pipeline shown |
| User study | 5–10 players | 5 players |
| Maps | Mirage + Anubis (now Ancient + Anubis) | Anubis fully evaluated; Ancient as decided under I6 |

Also ask how they want "learning value" judged, and whether a cloud deployment matters to them. If it does not, cut it formally.

## 5 Calendar

Two people, both working. If only one person is available, drop A9, then A6, then A8 down to 3 players, and say so in the report.

| Date | Paweł | Aleksander | Together |
|---|---|---|---|
| Thu 26 Nov | I1, I2, I3, I5 | I4; prepare the A2 sheet | Agree the reduced numbers from the teachers' feedback |
| Fri 27 Nov | A1 evaluation command | A2 grounding audit | — |
| Sat 28 Nov | A1 finished; I7, I8, I9 | A2 finished; A7 question set | A3 labelling starts |
| Sun 29 Nov | I6 (Ancient), or I10–I13 if Ancient is cut | A6 retrieval | A3 labelling |
| Mon 30 Nov | I10–I14 | A4 main table run | A5 picks (before seeing the system's) |
| Tue 1 Dec | **Freeze.** Clean-clone check | A4 blind ratings | A3 kappa and precision |
| Wed 2 Dec | Study support (PC, demos, consent) | A9 starts only if A1–A7 are done | A8 user study |
| Thu 3 Dec | Results tables into the report | A9 results, or the write-up of why it was skipped | A8 analysis |
| Fri 4 Dec | Reproduction from a clean clone (A10) | Report drafting | Read each other's sections |
| Sat 5 Dec | Fix anything the reproduction found | Report final | Final acceptance: every unmet promise is named |
| Sun 6 Dec | — | — | Submit |

## 6 Risks

| Risk | Sign | What to do |
|---|---|---|
| Labelling takes longer than planned | Fewer than 30 rounds done by 29 Nov | Cut to 40 rounds, keep the 20 double-labelled ones |
| The model loses to the templates | A4 shows no gain | Report it. The proposal says that is a valid result |
| Only one person does the AI half | A2, A4 and A7 not started by 28 Nov | Drop A9 and A6, then narrow A4 to Qwen vs the templates |
| A late fix changes the results | Any change after 1 Dec to detectors, prompts or retrieval | Give it a new version and rerun the affected table, or leave it out |
