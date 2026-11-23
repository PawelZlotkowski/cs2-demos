# Round Reviewer — audit and defence guide, 23 November 2026

For Paweł and Aleksander, before the first-prototype presentation on **Wednesday 25 November** and the submission on **6 December**. It checks the proposal against the repository as it is today, says where each part lives and how it works so that both of you can defend it, and lists what is missing and what to do about it.

It builds on three earlier documents and does not repeat them:

- the [22 November audit](../PROJECT-AUDIT-2026-11-22.md): its software findings are still valid;
- the [run sheet](WEDNESDAY-RUN-SHEET-2026-11-25.md): how to start and present the demo;
- the [improvement plan](IMPROVEMENT-PLAN-2026-11-22.md): dated tasks to 6 December.

Everything below was re-checked on 23 November against the code, fresh test runs and the label files. Keep player names, Steam IDs and match IDs out of this file: the repository is public.

## 1 The short version

- **The product works end to end.** Upload → read the roster → choose player, focus and language → full parse → 10 detectors (6 on) → findings with IDs → 3 mistakes and 3 good plays picked → explanations and Ask from Qwen3-14B on your RTX 5080, reached through your own MCP server and checked by a verifier → Studio with radar, player-view clips and the coach panel. 364 API tests pass without a GPU.
- **Of the five AI techniques in the proposal, three are real and used by default** (self-hosted LLM, agent with tool calling, MCP). **One is half done**: RAG has keyword search, but the dense half is switched off and Ancient has no notes. **One is missing**: QLoRA has a dataset exporter and nothing else.
- **Evaluation has started, only just.** There is now one real result from Aleksander's labels. **50 % of 84 reviewed clips** were judged worth showing (95 % CI 40–60 %). On the 39 clips that show a single finding, detector precision is **36 % (95 % CI 23–52 %)**. Nothing else in the proposal's evaluation plan has results yet: moment picks, the question set, retrieval, blind ratings, the template baseline and the user study.
- **The grade will come from evidence, not from more features.** On Wednesday, show one decision end to end, say exactly what each number measures, show a limit of your own checker, and ask the teachers to approve a smaller evaluation. After Wednesday, freeze features and produce the tables.

## 2 What changed since the 22 November audit

| | 22 Nov | 23 Nov (checked today) |
|---|---|---|
| API tests | 346 passed, 3 skipped | **364 passed, 3 skipped**, 2 minutes, no GPU |
| Labeller tests | 114 passed | 113 passed, **1 failed**. `eval/tests/test_annotation_batches.py:238` expects the old shape of a teaching example; today's code adds `map` to it. One-line test fix (section 6.8) |
| Web typecheck | Pass | Pass. The production build was not rerun, so that the build prepared for Wednesday was not overwritten |
| Human labels | 0 in the repository | **90 clip labels by Aleksander** in `data/labels/`: 89 distinct findings, 5 players, 37 rounds, 2 professional Ancient matches, labelled 17–20 Nov |
| Detectors | `local-v1.1` | Changed after the labels: `shot_while_moving` now abstains on pistols, SMGs and shotguns; `unused_utility` skips last-alive deaths against 3 or more; `opening_duel` and `untraded_death` reworked |
| Coach | prompts v5 | `explain_moment.v6`, `answer_question.v7`, `answer_across.v3`. Labeller notes are now quoted to the model as teaching examples |
| Reviews | 5–6 moments | 3 mistakes + 3 good plays with at most 2 of one type; a per-round Ask whose tools only see that round; a rating line computed in code |
| Still open | | Verifier false passes (6 of 8 probes still pass), no seed sent to the model, hash-based fine-tuning split, Dutch still offered in the UI, the duplicate `plan/` folder, no CI for the API, the parse timeout, Ancient zones and notes |

## 3 Proposal against the repository: what, where and how

**Done** = in the code, tested and used by default. **Partial** = some of it exists. **Missing** = no code or no results. The "how it works" column is written so you can say it out loud.

### 3.1 The pipeline (proposal sections 2 and 4)

| Promise | Status | Where | How it works |
|---|---|---|---|
| Upload `.dem` or `.dem.zst` | Done | [`api/routes.py`](../../apps/api/app/api/routes.py) `upload_match`, [`processing/decompress.py`](../../apps/api/app/processing/decompress.py) | The upload is streamed to disk and its magic bytes checked. zstd is decompressed as a stream with an output cap, so a crafted file cannot fill the disk. |
| Pick a player; radar while the rest runs | Done, improved | [`processing/parse_demo.py`](../../apps/api/app/processing/parse_demo.py) `inspect_demo_roster`, [`PlayerPicker.tsx`](../../apps/web/src/components/processing/PlayerPicker.tsx) | Only the roster is read first (status `awaiting_player`). The full parse and the analysis start after the user chooses one player, a focus and a language. |
| Parse with demoparser2 | Done | [`parse_demo.py`](../../apps/api/app/processing/parse_demo.py), [`normalize.py`](../../apps/api/app/processing/normalize.py), [`pipeline.py`](../../apps/api/app/processing/pipeline.py) | demoparser2 gives per-tick player data and events. `normalize` turns them into rounds, positions sampled at 8 Hz for the radar, kills, grenades and economy. `pipeline` moves the match through its states. 100 of 102 training demos parse. |
| Callout zones | Partial | [`maps/zones/`](../../apps/api/app/maps/zones/) (`de_anubis.json`, `de_mirage.json`, `zone_at`) | Hand-drawn polygons per map; a point-in-polygon test turns x, y into "A main". **Ancient has no zones**, so its findings say "an unnamed area". |
| About ten detectors, with unit tests | Done; precision 36 % (single-finding clips) | [`analysis/detectors/`](../../apps/api/app/analysis/detectors/), profile in [`analysis/policy.py`](../../apps/api/app/analysis/policy.py) | Plain Python rules over the parsed match. Each emits a finding with an ID, round, time, zone, severity, sentence template and an `evidence` dict of numbers. 10 exist; the `local-v1` profile turns 6 on. The policy itself says the thresholds are hypotheses to be labelled. |
| Round stats | Done | [`analysis/stats.py`](../../apps/api/app/analysis/stats.py) | Kills, deaths and damage per round: the only numbers besides finding evidence that the model may quote. |
| Five or six moments picked | Done | [`analysis/ranker.py`](../../apps/api/app/analysis/ranker.py) (code), [`coach/jobs.py`](../../apps/api/app/coach/jobs.py) `select_moments` (model) | The ranker groups findings within 6 s and scores each group by its highest severity plus 0.05 per extra finding, then takes 3 mistakes and 3 good plays at least 10 s apart, at most 2 of one type. It is both the no-LLM baseline and the fallback. The model version is one JSON-schema call with thinking on, checked by `verify_moments`, repaired once, otherwise replaced by the ranker. |
| Player-view clips from CS Demo Manager | Done on Windows | [`processing/video_clips.py`](../../apps/api/app/processing/video_clips.py), [`moment_clips.py`](../../apps/api/app/processing/moment_clips.py) | The CS Demo Manager command line records the moment window plus padding, clamped to the round and 60 s. Every frame is decoded to check the clip; audio is re-muxed to AAC for Safari. Clips are recorded in advance because CS2 and the model cannot share the GPU. |
| Studio: clip, radar and explanation side by side; Ask tab | Done | [`studio/[matchId]/page.tsx`](../../apps/web/src/app/studio/[matchId]/page.tsx), [`components/replay/`](../../apps/web/src/components/replay/), [`usePlaybackClock.ts`](../../apps/web/src/lib/replay/usePlaybackClock.ts), [`CoachPanel.tsx`](../../apps/web/src/components/coach/CoachPanel.tsx) | One shared playback clock drives the radar, the timeline and the clip. Clicking a citation seeks the radar to that moment. Ask answers stream over server-sent events (`ask_coach` in `routes.py`). |
| English, Polish, Dutch | English and Polish | [`coach/templates/`](../../apps/api/app/coach/templates/), [`lib/coach/language.ts`](../../apps/web/src/lib/coach/language.ts) | Dutch was dropped on 25 October but the UI still offers it (`language.ts:11`). |
| Mirage and Anubis (now Ancient and Anubis) | Partial | | Ancient parses, replays and has been labelled, but has no zones and no map notes. |

### 3.2 The AI techniques (proposal section 3)

| Technique | Status | Where | How it works |
|---|---|---|---|
| Self-hosted LLM via llama.cpp; no hosted API | Done | [`coach/llm_client.py`](../../apps/api/app/coach/llm_client.py); default model `qwen3-14b-q4_k_m` in [`core/config.py`](../../apps/api/app/core/config.py) | llama-server exposes an OpenAI-compatible API. The client sends tool definitions and JSON-schema response formats, sets sampling per model family and separates Qwen's thinking from the answer. `MockLLMClient` keeps the whole test suite GPU-free. Qwen3-14B Q4_K_M uses 13.2 of 16.3 GB of VRAM with a 32k context. |
| Agent with tool calling, bounded and traced | Done | [`coach/agent.py`](../../apps/api/app/coach/agent.py) (loop, at most 6 steps), [`coach/tools.py`](../../apps/api/app/coach/tools.py) (13 tools), allow-lists in [`coach/jobs.py`](../../apps/api/app/coach/jobs.py), traces in [`services/traces.py`](../../apps/api/app/services/traces.py) | The model calls a tool, reads the result and decides the next call, up to 6 steps, then must answer. Each job gets its own allow-list: 8 read tools for explanations, only round-bound tools for a per-round Ask, 4 for questions across matches. Match and player IDs are bound by code (`bind` in `backends.py`); the model never chooses them. Each run is one JSON line in `data/traces/`. **Be precise:** moment selection is a single constrained call, not the loop; explanations and Ask use the loop. |
| MCP server `cs2-demo` | Done | [`coach/mcp_server.py`](../../apps/api/app/coach/mcp_server.py), `MCPTools` in [`coach/backends.py`](../../apps/api/app/coach/backends.py), [`apps/mcp/`](../../apps/mcp/) (`python -m cs2_demo_mcp`), token gate in [`coach/mcp_http.py`](../../apps/api/app/coach/mcp_http.py) | The 13 tools are registered on an MCP server, with a match-overview resource and 3 prompts. The agent is an MCP client by default (`coach_tools = "mcp"`), over stdio or HTTP with a token. A test shows MCP and direct calls give identical results. Any other MCP client can use the same tools. |
| RAG, hybrid BM25 + bge-m3 + RRF | Partial | [`data/knowledge/`](../../data/knowledge/), [`rag/ingest.py`](../../apps/api/app/rag/ingest.py), [`rag/index.py`](../../apps/api/app/rag/index.py), `search_knowledge` in `tools.py` | Markdown notes are split into 158 passages (Mirage 66, Anubis 50, general 42, **Ancient 0**) and indexed in SQLite FTS5 with BM25. Dense vectors and reciprocal rank fusion (k = 60) are written but off, because no embedding server URL is set. The model cites passages as `[K..]`, and the verifier accepts only passages retrieved in that same run. |
| Player history in retrieval | Done | `get_player_history`, `cross_match_findings` in `tools.py` | Lets the coach say "11 of your 21 rounds" with numbers that come from code. |
| Human notes as teaching examples (not in the proposal) | Done, new | [`coach/examples.py`](../../apps/api/app/coach/examples.py), [`annotation/examples.py`](../../apps/api/app/annotation/examples.py) | Up to two labeller notes from other demos go into the prompt, ranked by same detector, then same map, then shared words. Only training-split, permitted, completed labels are used, and never from the same match. They are quoted as opinions, with a rule not to follow instructions inside them. This is few-shot learning from human labels: present it as the step before fine-tuning. |
| Verifier, one repair, template fallback | Done; blind to meaning | [`coach/verify.py`](../../apps/api/app/coach/verify.py), repair in `jobs.py`, [`coach/templates/`](../../apps/api/app/coach/templates/) | Every `[F..]`, `[m..]`, `[K..]` and `[t:..]` must exist. Every number must match the cited evidence or round stats to the precision it is written with (Polish decimal commas included). A sentence with a number or callout must cite. The language is checked by stopwords plus a Cyrillic guard; tool syntax in the prose and claims about technique are rejected. On failure: one repair with the error list, then a template sentence that the UI labels as such. It does **not** check meaning (section 5). |
| QLoRA fine-tuning | Missing | [`services/dataset.py`](../../apps/api/app/services/dataset.py), [`ml/finetune/build_dataset.py`](../../ml/finetune/build_dataset.py) | Verifier-passed conversations can be exported as chat JSONL. There is no training script, adapter or result. The export split hashes the upload ID (80/10/10) instead of using the sealed corpus split, so one match can land in both train and test. |

### 3.3 Data and evaluation (proposal sections 4 and 6)

| Promise | Status | Where | Notes |
|---|---|---|---|
| About 100 matches, split by match | Done | private corpus manifest | 146 match groups: 100 train, 26 validation, 20 sealed test. |
| 150 labelled rounds, κ on 30 | Partial | [`data/labels/`](../../data/labels/), labeller in [`apps/api/app/annotation/`](../../apps/api/app/annotation/), [`eval/label_tool.py`](../../eval/label_tool.py) | 37 rounds by one labeller: gives precision, not recall or κ. The κ and precision/recall code exists. |
| Both students' top 6 on 20 matches | Missing | scoring in [`services/labels.py`](../../apps/api/app/services/labels.py) | Overlap@6 and NDCG@6 exist; NDCG scores the coach's picks in time order, not by importance. |
| 150 test questions with the expected tool | Missing | [`eval/compare_models.py`](../../eval/compare_models.py) | Three fixed questions per language today. |
| Retrieval Hit@k and MRR | Missing | | |
| Blind 1–5 ratings | Partial | [`services/evaluation.py`](../../apps/api/app/services/evaluation.py), `/admin/lab` | Blind A/B pairs and a tally exist; no ratings are in the repository. |
| Template baseline as a results row | Missing | ranker and templates exist | Never run as a system. |
| Model table (baseline, base, fine-tuned, bigger) | Partial | `eval/results/2026-11-22-qwen-vs-gemma/` (not committed) | Qwen3-14B against Gemma 4 12B on one Anubis match, English and Polish, 2 repeats. |
| One command reproduces every table | Missing | | |
| User study, 5–10 players | Missing | | |
| CI with a mock model | Partial | `.github/workflows/labeler.yml` (untracked) | Tests use a mock model; the only workflow covers the labeller and has never run. |

## 4 The new evidence: how good are the detectors?

Aleksander reviewed each detector moment as a player-view clip and marked it correct, wrong or unsure, with a note. 45 of the clips show several findings at once and carry one verdict for the whole clip. So there are two honest numbers, and they measure different things:

- **Clip level (was this clip a moment worth showing?):** 42 correct of 84 decisive clips, **50 %**, 95 % interval 40–60 %.
- **Detector precision (was this one detector right?):** only clips that show a single finding count. 14 correct of 39, **36 %**, 95 % interval 23–52 %. The project's scoring tool now reports this one (`python -m eval.label_tool score "data/labels/*.json"`).

Single-finding clips, latest revision per finding, unsure left out:

| Detector | Correct | Wrong | Precision |
|---|---|---|---|
| `good_plays` | 6 | 2 | 75 % |
| `opening_duel` | 3 | 4 | 43 % |
| `shot_while_moving` | 1 | 6 | 14 % |
| `untraded_death` | 2 | 7 | 22 % |
| `unused_utility` | 2 | 6 | 25 % |
| **All** | **14** | **25** | **36 %** |

Intervals are Wilson 95 %. The per-detector counts are too small for intervals to be useful; report them as counts. 9 of these verdicts are on the match that is in the sealed test split (caveat 4).

**What the notes say.** Most "wrong" notes are about *importance*, not about whether the event happened: "pistol round", "eco round, acceptable to play risky", "insignificant moment", "regular gameplay", "clip chosen twice". On the same labels, pistol bursts in `shot_while_moving` were 5 correct and 9 wrong, rifles 4 correct and 2 wrong. The detector now keeps only rifles, and `unused_utility` now skips hopeless last-alive deaths.

**Caveats to say out loud:**

1. One labeller, so there is no agreement figure yet.
2. Precision only. The labels cover what the detectors flagged, so they say nothing about what they missed (recall).
3. These labels were made on the detectors **before** the 22–23 November changes. Do not recompute a "new" precision on the same labels: that is tuning on your evaluation data. Re-measure on rounds nobody has looked at.
4. One of the two labelled matches is marked `test` in the labeller (14 of the labels, 10 of them correct). If its labels informed the detector changes, it is no longer a clean test match. Move it to validation and draw a replacement from the corpus, or state it in the report. The teaching examples already use training-split labels only.
5. Two professional Ancient matches are not your target users' games.

**The story for Wednesday:** "We reviewed 84 detector clips from two professional matches. Half were worth showing, and where a clip shows a single detector, about a third were right. The notes told us why: pistols on eco rounds, hopeless last-alive deaths and moments that do not matter. We changed those rules, and we will re-measure on rounds we have not seen." This is a real evidence → change → re-test loop. It also supports the proposal's main argument: telling what *matters* is the part rules do badly.

**Improve the next round of labelling:** ask two questions per moment, "did it happen as described?" and "is it worth showing a player?". The first measures the detector; the second measures moment value, which is what the model is supposed to add.

## 5 What is still missing, ranked by how much it hurts the grade

1. **No answer to the research question yet.** No template-versus-model comparison, no grounding audit, no moment-pick comparison, no question set, no retrieval evaluation, no user study.
2. **"Passed the verifier" does not mean "grounded".** Re-probed today with an untraded-death finding. Still accepted:
   - "A teammate traded your death [F12]" (meaning flipped);
   - "You died in B apartments [F12]" (wrong zone);
   - "Your nearest teammate was 5 m away" (the 5 is the trade window in seconds);
   - "You had 87 HP left" (87 is round damage);
   - numbers written as words;
   - "because you peeked without a flash" (invented cause).

   Now rejected: an answer in the wrong language, and an uncited number that is in no evidence.
3. **QLoRA is not started.** It is one of the five headline techniques.
4. **Labels:** a second labeller for κ, missed events for recall, and fresh rounds after the detector changes.
5. **Ancient** is a delivery map without zones or notes, and all labels are on Ancient.
6. **Dense retrieval is off**, so "hybrid" cannot be claimed yet.
7. **Reproducibility:** no seed, traces lack the commit and sampling settings, dependencies are not pinned, the fine-tuning split can leak, there is no single evaluation command and no CI for the API.
8. **Code mistakes that change numbers:** damage counts overkill, warm-up and restart rows become rounds in about 8 % of demos, and the label-scoring tool cannot read the exports. All 20 are in the [code audit](../CODE-AUDIT-2026-11-23.md).
9. **Team evidence:** git shows 83 commits by Claude, 42 by Paweł, 5 by Cursor and none by Aleksander. His labels are his only work in the repository.

## 6 Wednesday

### 6.1 Open with three sentences

"Code decides what happened; the model decides what matters and explains it. The model never sees raw coordinates: it reaches findings only through tools on our own MCP server, and a checker reads every answer before the player does. Today we show it working end to end, our first measurements, and where our checker is still blind."

### 6.2 What to show (about 8 minutes; the full script is in the [run sheet](WEDNESDAY-RUN-SHEET-2026-11-25.md#5-the-15-minutes))

1. The paused setup screen: roster first, then player, focus and language.
2. The saved review: finding → radar seek → player-view clip → explanation citing `[F..]`.
3. Ask the moment question (no tool needed), then "Does this happen in other rounds too?" (one `get_player_history` call through MCP). The numbers come from the tool.
4. A trace screenshot: tool, arguments, result, verifier result, model, prompt version, time.
5. Limits: one false pass from section 5, and the precision table from section 4.
6. Scope changes and the smaller evaluation you want approved.

### 6.3 Numbers for the slides, and exactly what each one measures

| Number | What it is | What it is not |
|---|---|---|
| 364 API tests pass without a GPU | The code does what it specifies, on synthetic data | Quality |
| 100 of 102 training demos parse | Parser robustness | |
| 146 match groups, 100 / 26 / 20 by match, sealed test | Leak-free data split | |
| Clips worth showing 50 % (n = 84); detector precision 36 % (n = 39 single-finding clips) | One labeller, two pro Ancient matches, detectors before the 22–23 Nov changes | Recall, agreement, current detectors |
| September pilot: 66/72 Qwen3-14B, 71/72 Gemma 4 12B | Checker pass rate | Correctness |
| 22 Nov rerun, one Anubis match: Qwen 19/20 explanations, 12/12 Ask, 4 repairs, selection 42 s; Gemma 20/20, 12/12, 1 repair, 54 s | Checker pass rate and speed | Quality: Gemma's Polish is clearly better, Qwen hedges more |
| Full review 71 s on a 22-round match; 13.2 of 16.3 GB VRAM; Ask on screen in about 10–13 s | It runs on one gaming PC | |
| 85 player-view clips checked by decoding every frame | The clips are intact | That every viewpoint and timing is right |

### 6.4 Questions to expect, with answers

**"Why do you need a language model? Your detectors already find the mistakes."**
The detectors find candidates, and half of them were judged wrong or unimportant by a human, mostly on importance. Choosing the 6 of 20–40 findings that matter, linking them to map knowledge and teammates, and answering free questions in two languages is judgement and language work. We test it: the ranker plus templates is the baseline row, and if the model does not beat it we report that.

**"How do you stop it making things up?"**
Three layers. Architecture: the model sees only tool results with IDs, and code fixes which match and player it can see. The verifier: every citation must exist and every number must match its evidence, otherwise one repair and then a labelled template. Measurement: a hand grounding audit. Then show a false pass yourselves; that answers the follow-up before it is asked.

**"What does 66 of 72 mean?"**
The share of explanations where all citations existed, the numbers matched and the language was right. It is not correctness; that is why we add a grounding audit and blind ratings.

**"Is MCP just decoration?"**
It is the default path. The same 13 tools serve any MCP client, the schema and calls are standard and logged, and the clip recorder can sit behind the same interface. A test shows MCP and direct calls return the same results. The cost is milliseconds against seconds of model time.

**"Is your retrieval hybrid?"**
Keyword search (BM25 in SQLite) is on. The dense half and the rank fusion are implemented but off until we run an embedding server; we will then compare BM25 with hybrid by Hit@k and MRR.

**"Did you fine-tune?"**
Not yet. The exporter turns verifier-passed traces into training data. Fine-tuning comes last because it needs reviewed data and a fixed evaluation to show it helped. Say what you will do: one QLoRA pilot, or a written descope.

**"How do you know the detectors are right?"**
Section 4: precision per detector, the notes, the rule changes, and the re-measure on unseen rounds.

**"Half are wrong, so why show them?"**
They are candidates, not verdicts. The policy and the UI say so. The ranker or the model picks 6 of many, and the moment-pick evaluation checks whether those 6 are the right ones.

**"Why Qwen3-14B?"**
It fits 16 GB with a 32k context, calls tools reliably and picks moments faster (42 s against 54 s). Gemma passes the checker more often and writes better Polish. The final choice comes from the blind ratings.

**"How do you judge moment selection when importance is subjective?"**
Each of us picks a top 6 independently, before seeing the system's picks. We report overlap@6 for the ranker and for the model, and our agreement with each other as the ceiling.

**"Any data leakage?"**
The split is by match, with 20 sealed test matches; thresholds and prompts are tuned only on train and validation. Mention the labelled match marked `test` (section 4, caveat 4) and the exporter split fix: saying it first earns trust.

**"What about privacy?"**
Raw demos never go into the repository, only derived labels and manifests. Friends are asked first; professional demos are public. Steam IDs will be stripped from the label files before they are committed.

**"What happens when the model is down?"**
The radar and findings always work; explanations fall back to labelled templates.

**"Can a player's name in the demo attack the prompt?"**
Names reach the prompt. The damage is limited: IDs are bound, explanations cannot use write tools, and numbers are checked. Praise or blame without numbers could still pass: a known limit.

**"Who did what? Did an AI write the code?"**
Answer truthfully (section 6.5).

### 6.5 Who did what

The facts an examiner can see: commits by Claude (83), Paweł (42) and Cursor (5), and none by Aleksander, whose labelled clips and notes are in `data/labels/`. The proposal gave Aleksander the model side: RAG, serving, agent, verifier, fine-tuning, ratings and the model comparison.

- **Say it plainly.** Paweł built the pipeline and the integration, using AI coding agents (Claude Code, Codex, Cursor), and reviewed and tested their output. Aleksander labelled the clips and wrote the error analysis behind the detector changes.
- **Agree a split for December** and say it. A natural one: Aleksander owns the grounding audit, the blind ratings, the question set and the fine-tuning pilot.
- **Each of you should walk the main path with the code open before Wednesday:** upload → parse → detector → agent → verifier. Then question each other with section 6.4, as the proposal promised.

### 6.6 Do not claim

- That passing the checker means the advice is right.
- That anything is fine-tuned, or that retrieval is hybrid.
- That Ancient is supported for coaching.
- That a cloud version exists.
- A detector precision for the new rules.

### 6.7 What to ask the teachers

1. Approve the smaller evaluation numbers ([improvement plan, section 4](IMPROVEMENT-PLAN-2026-11-22.md#4-what-to-ask-the-teachers-on-wednesday)).
2. The question from your handout: is a blind test of "rule-written versus model answer on the same evidence, judged on whether the suggested action is feasible" a fair test of what the model adds?
3. Ancient: full coaching (zones and notes), or replay and labels only?
4. Fine-tuning: is a small pilot, or a documented descope, acceptable?
5. Is any hosted deployment expected? If not, drop it formally.
6. How should AI-assisted coding be disclosed in the report?

### 6.8 Before Wednesday (freeze on Tuesday at noon)

First, two items added after the code audit:

- **Make the review you will show again.** The showcase review and the paused setup upload were deleted on purpose on 23 November. Fix the damage and round bugs first ([code audit](../CODE-AUDIT-2026-11-23.md), findings 2 and 3), then make the review, upload a demo for the paused setup screen, and back up `.local/data`.
- **Re-process the match before making the review.** The damage, fake-round and knife-round fixes landed on 23 November. A match parsed before then still has the knife round and inflated damage, ADR and rating (code audit, status section).

Then:

1. **Fix the failing test** so that "all tests pass" is true: add `'map': 'de_ancient'` to the expected dict at `eval/tests/test_annotation_batches.py:238`.
2. **Bring an updated handout.** The 15 November brief in `docs/university/` still shows only the September numbers and mentions Dutch. Add the 22 November rerun and the precision line from section 4.
3. **Make one limits slide** from sections 4 and 5.
4. **Keep the label files out of git for now.** The four files in `data/labels/` are untracked but not ignored. They contain Steam IDs and in-game names, so a `git add -A` would publish them on the public repository, against the proposal's privacy promise. Strip those fields before committing.
5. Optional: hide Dutch in the picker (`apps/web/src/lib/coach/language.ts:11`), or avoid opening the language menu.
6. Rehearse twice from a cold start, as in the run sheet.

## 7 After Wednesday: how to make the assignment as strong as possible

What examiners of a generative-AI project reward, in order:

1. A research question answered with numbers, against a baseline the model has to beat.
2. Each technique justified and measured, not only present.
3. An honest error analysis.
4. Results anyone can reproduce.
5. Both students able to explain every part.

Use the improvement plan's calendar. These are the changes to it:

| # | Do | Why it raises the grade | Size |
|---|---|---|---|
| 1 | Seed, full provenance in traces, fine-tuning split from the corpus manifest, pinned dependencies (I2, I3, I9) | Without them no number can be repeated | half a day |
| 2 | **The blind template-versus-model test** (A4 together with your handout's test): same moments, shuffled, both of you rate correctness, usefulness, specificity and a feasible next action 1–5, in English and Polish | This is the answer to the research question | 1–1.5 days |
| 3 | **Grounding audit** of about 100 verifier-passed outputs (A2), plus the cheap verifier fixes (I4) and the 8 probes as tests marked as known limits. One cheap meaning check per detector: for example, refuse "traded" in a sentence citing an `untraded_death` finding | Turns the biggest weakness into a measured, partly fixed result | 1.5 days |
| 4 | **Labels, round 2:** Paweł labels 20 of Aleksander's rounds for κ; about 30 fresh validation rounds with the two questions from section 4; missed events on 10 rounds for recall | Gives the "code decides what happened" premise its numbers | 1.5 days |
| 5 | **Ancient:** draw the zones (`tools/zones_overlay.py` already redraws overlays) and write about 30 notes, or declare it replay-only | All current labels are on Ancient, and "an unnamed area" weakens every Ancient explanation | 1–1.5 days, or 1 hour to declare |
| 6 | **Moment picks** on 10 test matches; fix NDCG or report overlap@6 only (A5, I5) | Measures the part the model is meant to add | half a day |
| 7 | **Retrieval:** serve bge-m3, 40 queries, BM25 against hybrid (A6) | Earns the word "hybrid" | half a day |
| 8 | **QLoRA pilot** on Qwen3-8B or 14B, trained on about 200 verified and reviewed examples from the training split, with the tool schemas kept. Measure citation-format errors and wrong-language slips, base against adapter. Only after 1–7; otherwise write up the descope with the dataset statistics | The fifth technique; a small measured run beats a big promise | 1–2 days |
| 9 | User study with 5 players (A8) | Real users' trust and surprise | 1 day |
| 10 | One `eval` command, CI running the API tests, and a reproduction by the other student from a clean clone (A1, I8, A10) | Proves 4 and 5 above | 1.5 days |

**Report outline:**

1. Problem and research question.
2. System: the architecture diagram and the rule "code decides, the model explains".
3. Each technique: why it is there and how it is measured.
4. Data and splits.
5. Results tables, each with its denominator, config and commit.
6. Error analysis: detector notes, verifier false passes, Polish quality.
7. Limits and scope changes, with dates.
8. Who did what, including the use of AI coding tools.
9. How to reproduce.

## 8 What this audit checked

**Did:**

- Read the proposal, the 15 Nov teacher brief, the 22 Nov audit, the run sheet and the improvement plan.
- Ran the API tests, the labeller tests and the web typecheck.
- Analysed all four label exports (latest revision per finding, Wilson intervals, split by train and test match).
- Re-ran the verifier probes against today's `verify.py`.
- Checked each "where" path in section 3 and the status of the 22 Nov open items in the code.

**Did not:**

- Run a model on the GPU, record with CS2, or start the Studio.
- Rebuild the production web build.
- Open the private corpus or its manifest; the split counts come from the 22 Nov audit.
- Check the hosted labeller's data.
