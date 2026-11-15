# Round Reviewer delivery plan

Final planning baseline, 19 October 2026; UI/motion refinement added 20 October. First defence: **17 November 2026**. Final invited-user product and university submission: **6 December 2026**.

This is the authoritative delivery scope, priority list and ownership plan. It supersedes the decision draft and its P/F/E/C/U/R/X task IDs. The [hosting reference](HOSTING-AND-GPU-PLAN.md), [recording and training plan](RECORDING-AND-TRAINING-PLAN.md) and [Studio UI and motion plan](STUDIO-UI-AND-MOTION-PLAN.md) supply details; their task references expand this backlog rather than add competing work. Implementation has not begun as part of this planning task.

## 1 The product to deliver

An invited user opens the browser Studio, signs in, uploads a Mirage, Anubis or Dust II demo, selects one player and receives a short review of useful mistakes and good plays. The review combines real radar playback, approximately five or six selected moments when supported by the evidence, recorded POV clips, English or Polish explanations and contextual questions. The user can inspect all rounds and the evidence behind the coach's conclusions.

The API and demo parsing must run on a real cloud instance accessible over HTTPS to both Pawel and Aleksander simultaneously. This is a required demonstration of backend engineering, not a future option. Uploaded demos are received and parsed there; the local PC is not a parsing dependency. Local inference and CS2 recording run on Pawel's RTX 5080 Windows PC, which can remain online for testing. Visitors use a browser and do not provide Steam credentials. Clips arrive asynchronously, and unavailable GPU workers do not conceal existing replay data.

The university question remains whether an open-weight model on consumer hardware can provide useful, grounded coaching. An unsuccessful fine-tuning experiment or a model that fails to beat templates is a valid research result when the method and limitations are reported. It is not permission to label an incomplete product complete.

## 2 Priorities and scope boundaries

| Priority | Commitment | Included work |
|---|---|---|
| P0 Product | Required for invited-user release | Browser Studio; manual demo upload; three maps; player selection; correct radar/time model; evidence and selected moments; real clips; EN/PL explanations and Ask; saved reviews; invited accounts and owner isolation; recoverable jobs; bounded resources |
| P0 Research | Required for submission | Deterministic baseline; local model and MCP traces; RAG evaluation; detector/selection/grounding evaluation; labelled data; a documented QLoRA experiment; blind human ratings; invited-user study; reproducible results and limitations |
| P0 Operations | Required for shared cloud backend and invited testing | Actual cloud API and parser; simultaneous authenticated sessions for both students; HTTPS; private artifacts; restricted parsing; scoped workers; offline/overload states; retry/cancel/recovery; deletion/retention; backup and restore check |
| P1 | Only after the next P0 gate is secure | Small rented-GPU comparison within the $30 target; extra Studio polish; convenient Lab screens where scripts already suffice; bounded short-video model probe; nonessential model comparisons |
| P2 | After 6 December | Public registration/unrestricted processing, scale-out infrastructure, 3D tactical replay, automatic match import, extra maps, extensive practice/progress dashboards and expanded administration |
| Excluded direction | Do not develop | OS simulation, floating desktop, native application shell, Dutch coaching, browser-side parser port |

Keep minimal operator tools: invite/disable a user, inspect jobs/errors, retry/cancel, inspect traces, collect labels/ratings, and delete data. Reuse existing account/admin code selectively. A large admin redesign is not a release requirement. Keep scoped retrieval of the selected player's prior findings for grounded history questions; a general memory service and new progress/practice product are deferred.

The 20 October UI decision adds expressive, coordinated tab transitions, truthful loading activity and flowing checked-answer presentation to RR18/RR22. Preserve Studio identity and immediate playback/typing. Use selected component references and existing motion tools; no wholesale kit migration. Actual incremental checked-block streaming is optional backend work under OPT02, not a promise implied by animated text. The UI plan includes concrete behaviour, source assessment, skill selection and accessibility/performance acceptance.

The core app does not silently switch to a managed model API. Local model inference stays local even when the API/parser are cloud-hosted; rented or managed comparisons are separately logged. The API is internet-reachable over authenticated HTTPS. Unrestricted public registration and processing remain outside the December deadline.

## 3 Architecture and source consolidation

Use `C:/Users/pawel/Documents/cs2-demos-studio` as the planned integration baseline because it contains the browser Studio and account/research surfaces. Import the relevant safeguards from `C:/Users/pawel/Documents/cs2-demos-phase1-source/cs2-demos` by domain. Preserve the original copies and record their revisions/hashes before changes. No folder merge or source move is performed by this document.

Keep the current layout: `apps/web`, `apps/api`, `apps/mcp`, `eval`, `ml`, `data/knowledge` and documentation. Retain existing `models`, `analysis`, `coach`, `rag`, `processing`, `repositories` and `services` responsibilities. Extract a Windows worker adapter where required; do not reorganise the entire tree to satisfy a diagram.

| Component | Responsibility | Lead |
|---|---|---|
| Next.js Studio | Upload/progress, selected moments, replay/video, evidence, Ask and feedback | Pawel |
| FastAPI and Python processing | Admission, parse/normalise, detector evidence, contracts, ownership and storage | Pawel |
| Application tools and MCP boundary | Same scoped data access for API and agent; compact typed responses | Pawel owns tool contracts; Aleksander owns agent integration |
| Coach and RAG | Model adapter, prompts, claims, retrieval, language, traces and fallbacks | Aleksander |
| Job coordination | Durable stage/attempt/lease state; shared GPU admission; recovery | Pawel, reviewed by Aleksander |
| Windows recorder | CS2/CS:DM/HLAE, bounded windows, owned processes and validated media | Pawel |
| Research | Runner integration by Pawel; datasets, metrics, training and studies by Aleksander | Both review results |

Local runs are for development and baseline checks. Deploy the API to a CPU cloud instance under RR37, then complete cloud upload/parsing under RR08 by 29 October. The instance hosts the API, durable metadata/job queue and private artifact storage, with Python parsing in a restricted process/container. Choose a host using measured parser memory/disk requirements and record its separate cost before provisioning. The $30 GPU experiment target is not the CPU-hosting budget.

Both students use this same API and persisted state from separate authenticated sessions. Neither needs to run a second backend. The Studio may initially run locally against the cloud API or be served as a lightweight web client; a separate frontend hosting service is not required. Document allowed origins/session routing, and provide a consistent HTTPS browser entry point for invited testing. The API host needs no GPU.

Inference and recording workers initiate outbound authenticated connections to claim jobs and return results. With home workers disconnected, cloud upload, parsing, numerical analysis and radar data must still work. Only model-dependent coaching and POV capture queue or use documented fallbacks. After bounded upload admission, return a job identifier and process asynchronously so parsing does not block the API's other requests.

Use one bounded GPU job at a time initially across inference and recording. Record queue wait separately from inference/capture time. Expose worker availability instead of guessing an ETA. Keep one metadata/database owner for the first invited deployment; retain SQLite if that deployment remains a controlled single-host writer design, otherwise decide a shared database explicitly during RR09.

Python contracts are authoritative. Generate/update frontend contracts and check drift. Owner, player, round/tick, schema version and artifact provenance cross every boundary. No model-generated shell commands or paths are accepted by the recorder. Changed schemas get fixtures and migration notes before dependent work begins.

## 4 Ownership and working method

**Pawel owns delivery of the application:** integration baseline, parser and detectors, map transforms, API/MCP data tools, playback, recording, identity, jobs, deployment and clean-install checks.

**Aleksander owns delivery of the AI evidence:** model serving/configuration, agent integration, RAG and source review, typed claim validation, bilingual questions, training data, QLoRA, benchmark analysis, study organisation and report drafting.

**Both own human judgement and defence:** overlap labels, independent moment picks, blind explanation ratings, scope amendments, demonstrations and final acceptance. Every task still has one accountable lead. The other student is the default reviewer; review means checking evidence, not necessarily reimplementing the work.

The reported availability is 2–4 hours daily, but whether that was per person was not confirmed. Dates below are delivery targets, not invented person-hour estimates. On 22 October, use the baseline measurements and each person's actual calendar to estimate remaining work and reserve roughly a quarter of available time for integration/rework. If capacity is lower, remove P1 work first and raise any P0 shortfall immediately; do not silently reduce maps, languages, evidence or evaluation.

Work on one substantial implementation task per person at a time, with independent labelling/reading while a dependency is blocked. Review a real end-to-end flow at least twice weekly. Each week, explain your own part to the other student with code and traces open.

Use Ponytail's reuse-first approach: inspect existing callers, preserve validation/error handling, measure before optimising and change the smallest complete path. New abstraction or dependency requires a concrete current need. Existing working code is reused, but its integrated behaviour must still pass checks.

## 5 Research protocol and quality gates

The following are execution targets chosen to reconcile the proposal; they are not results already achieved. RR02 records the protocol and any course-approved adjustments before the final test set is used.

Use telemetry and reviewed knowledge as the core model inputs. Human labels assess decision quality, useful alternatives and uncertainty separately from match outcome. Fine-tune evidence-seeking tool conversations; do not treat automatic event labels as coaching truth. Reuse short recorded POV clips for both the Studio and annotation. The [recording and training plan](RECORDING-AND-TRAINING-PLAN.md) specifies the rubric, public-data assessment, exporter corrections and QLoRA experiment. Visual-model inference is optional OPT03; full-match video analysis and vision fine-tuning are outside December scope.

- Aim for **100 distinct matches**, split **65 train / 15 validation / 20 test** by match identity, with all three maps represented in each split. This resolves the proposal's conflict between a 15% test split and 20 test matches. Deduplicate demos and related derived records across splits.
- Label **150 unique rounds**, including **30 training rounds labelled independently by both students** as the rubric pilot. Proposed allocation: 90 train / 30 validation / 30 test, frozen in RR02. Split the remaining 120 rounds equally. Record correct/wrong/unsure findings, missed events, decision context, alternatives and uncertainty; report agreement and sample counts. Keep final-test labels separate from tuning.
- Each student independently selects top moments for **20 held-out test matches** before seeing generated rankings. Preserve both judgements; use additional train/validation matches for development.
- Prepare **150 final questions, 75 English and 75 Polish**, balanced across maps and tool/retrieval needs, with expected tools/passages. Use a separate development question set to tune prompts and retrieval.
- Review at least **300 accepted training conversations** drawn only from the training partition; track task, language, all source matches, tool schemas, provenance and rejection reason. Report underlying situations separately from translations/variants. No test answers or test-derived tuning enter training; replace the existing exporter's incompatible 80/10/10 split with the agreed manifest.
- Study **5–10 invited players**, with an agreed consent process and a short repeatable protocol on their own matches. Record usefulness, incorrect advice, trust and task completion, including negative feedback.

Build the evaluation runner early. Compare templates and the selected base model on validation data before the defence. Freeze final model/prompt/retrieval/detector configurations by 24 November, then run the held-out comparison, including the fine-tuned variant if it is operational. Report failed training/export attempts honestly if no viable variant results; do not substitute an invented result.

Report detector precision/recall, selection overlap/NDCG, retrieval hit rate/MRR, tool success, unsupported claims, language quality, repairs/fallbacks, human ratings and latency/VRAM separately. Give denominators. Citation acceptance is not factual accuracy; distinguish observed facts from coaching interpretations.

Product release gates:

1. For each supported map, complete a real-demo review and manually verify sampled rounds/events, player selection and replay alignment.
2. No unresolved release-blocking cross-user access, data loss, replay corruption or incorrectly attached clip defect.
3. Known invalid/wrong-player/wrong-round/outcome claims fail validation; template fallback is labelled. Human evaluation reports remaining semantic errors without claiming general proof.
4. Clip POV and event alignment are measured. Initial engineering target: no more than 100 ms error at inspected event checkpoints; record failures and fix them before calling those clips aligned.
5. Model/recorder offline, queue full, retry, cancellation and restart cases produce truthful recoverable UI states.
6. Publish measured processing/Ask latency on the actual RTX 5080 setup. Set user-facing limits from RR03/RR04 results rather than promising an unmeasured speed.
7. One student reproduces the other's setup/results from written instructions, and a backup restores a usable sample review.
8. Pawel and Aleksander concurrently upload and inspect authorised reviews through the same cloud API from separate devices/sessions. Parsing completes with home GPU workers disconnected. Concurrent requests do not corrupt state or expose private artifacts. Two users can use the API simultaneously even when expensive processing jobs run serially in a bounded queue.

## 6 Assigned backlog

All RR tasks are P0. They are planned work, not claims of completion. Dates are in 2026. Dependencies refer to the required handoff; implementation can begin on agreed fixtures before final integration. The other student reviews each lead's evidence. Shared rows explicitly name a lead.

### Foundation and trustworthy data

| ID | Lead | Due | Depends | Task and completion evidence |
|---|---|---|---|---|
| RR01 | Pawel | 20 Oct | None | Record canonical source revisions/local changes, donor map and this backlog as authority. Preserve original folders; remove OS interface from active scope; map old T/A/AD/R tasks to retained, duplicate or deferred work. |
| RR02 | Aleksander | 22 Oct | None | Freeze the research protocol, match manifest, annotation allocation/rubric and two-language/three-map proposal amendment. Separate facts, player-available information, decision quality and outcome; define bounded training experiments and validation criteria. Confirm course expectations and enquire about university GPU/CPU hosting; do not wait for funding to begin local work. |
| RR03 | Pawel | 22 Oct | RR01 | Run clean API/MCP/web baseline checks in disposable storage and a real-demo parse/replay/capture preflight. Record failures, hardware, disk, stage times and recovery behaviour. |
| RR04 | Aleksander | 22 Oct | None | Exercise the real local model on RTX 5080: tool call, structured selection, English/Polish output and trace. Record model/quantisation/config, memory and latency; coordinate GPU use with RR03. |
| RR05 | Pawel | 23 Oct | RR01 | Freeze contracts for ownership, round/tick, findings, claims, review versions, jobs and clips with Aleksander. Include immutable chat context/request IDs and truthful queued/running/tool/checking/terminal events. Supply fixtures, schema drift checks and migration notes; no duplicate UI contract interpretation. |
| RR37 | Pawel; Aleksander validates remotely | 24 Oct | RR03, RR05 | Establish the shared cloud API foundation: choose CPU host from measured parser needs, record cost, deploy reproducibly with HTTPS and restricted development access, persist data, configure secrets/health/logging and document rollback. Aleksander reaches the same instance from another device. Keep uploads disabled until RR07/RR08 safeguards pass. |
| RR06 | Pawel | 26 Oct | RR02, RR05 | Assemble one evaluation entry point from existing utilities. A fixture run writes machine-readable metrics/tables with config and input hashes; Aleksander defines metrics and can run it independently. |
| RR07 | Pawel | 27 Oct | RR03, RR05 | Unify access policy using existing accounts plus Phase 1 safeguards. Invites, sessions, roles, API/MCP/clip ownership and revocation tests pass; visitor A cannot operate on B's review. |
| RR08 | Pawel | 29 Oct | RR03, RR05, RR07, RR37 | Integrate bounded cloud upload/decompression/native parsing and replay corrections. Return job IDs and process asynchronously; test limits, malformed inputs, timeouts, scoring and recovery on real demos. Both students upload concurrently through the deployed API; verify cloud parsing with home GPU workers disconnected. |
| RR09 | Pawel | 2 Nov | RR07, RR08 | Integrate durable match/job state, attempts, claims, private artifacts, GPU admission and versioned re-runs. Restart, duplicate submission, cancellation and migration/recovery tests pass; database choice recorded. |
| RR10 | Pawel | 3 Nov | RR05, RR08 | Complete Dust II transforms/assets/zones and validate all three maps. Known landmarks align; sample event counts/rounds are checked; missing telemetry is explicit. |
| RR11 | Aleksander | 4 Nov | RR02, RR05 | Review knowledge for Mirage/Anubis/Dust II with Pawel's in-game checks. Sources, attribution, language, map and review status are recorded; sample retrieval answers cite valid passages. |
| RR12 | Aleksander; both label | 6 Nov | RR02, RR08, RR10 | Independently label the 30-round training pilot, refine the rubric and divide the remaining 120 rounds. Produce development and sealed evaluation annotations; record missed/positive/uncertain cases, independent test moment picks and disagreements. Inspect full-round context, not only generated highlights. |
| RR13 | Pawel | 8 Nov | RR06, RR10, RR12 | Evaluate/tune deterministic detectors only on development data. Document required fields and false positives; qualify dry-peek/rotation uncertainty; ranker fallback produces valid supported moments without fabricated positive plays. |

### Coach and usable Studio

| ID | Lead | Due | Depends | Task and completion evidence |
|---|---|---|---|---|
| RR14 | Aleksander | 4 Nov | RR05 | Integrate structured factual claims and bounded validation. Wrong player/round/value/outcome fixtures fail; source-backed claims pass; interpretation and template output remain identifiable. |
| RR15 | Aleksander | 6 Nov | RR04, RR05, RR07, RR14 | Connect the agent to scoped MCP tools supplied by Pawel. Tool budgets/timeouts, trace capture, invalid calls and cross-owner history tests pass with the actual local model. |
| RR16 | Aleksander | 7 Nov | RR11, RR15 | Complete RAG and selected-player history retrieval. Compare keyword/hybrid on development queries, test missing embeddings, and resolve citations; history includes only authorised matches and explicit counts. |
| RR17 | Aleksander | 10 Nov | RR09, RR13, RR14, RR15, RR16 | Complete selection, explanation and Ask through one bounded pipeline. EN/PL, permitted evidence IDs/windows, repair, ranker/templates, lifecycle events, server cancellation and trace provenance pass. Keep the checked-answer boundary; no silent external fallback or invented progress. |
| RR18 | Pawel | 5 Nov | RR05 | Choose one Studio layout and tab/answer motion treatment after two small studies using the same review. Implement contextual composer, expressive tab transitions, truthful activity and bounded checked-answer reveal with existing tokens/motion tools. Record chosen component source/dependencies and update design handoff; no floating desktop or redesign after this date. |
| RR19 | Pawel | 9 Nov | RR10, RR18 | Integrate single-clock radar/video state, selected-player context and evidence seeking. Direct/reverse seek and exact death/HP transitions pass; keyboard and responsive use checked. |
| RR20 | Pawel | 11 Nov | RR09 | Adapt the existing Windows recorder to scoped outbound jobs for Studio and annotation. Measure short-window capture profiles; save demo/player/tick/profile/version provenance and private artifacts. Test fresh attempts, validation, GPU contention and owned-process cancellation; real three-map recordings verify POV/alignment and remote recovery. |
| RR21 | Pawel | 12 Nov | RR07, RR08, RR09, RR37 | Harden the existing cloud deployment for invited users: private storage/retention/backups, resource limits, job visibility and worker authentication. Test outbound inference with Aleksander and recorder transfer, concurrent sessions and restart recovery; document host cost; no public registration. |
| RR22 | Pawel | 13 Nov | RR17, RR19, RR20, RR21 | Complete browser journey, saved review/feedback and minimal operator controls. Clips do not block radar. Chat preserves context/draft/focus/scroll; Stop/Retry, citations, reduced motion, keyboard, EN/PL and long-answer checks pass. Validate offline/overload, restart, cross-user isolation and motion performance from another device. |

### Research and first defence

| ID | Lead | Due | Depends | Task and completion evidence |
|---|---|---|---|---|
| RR23 | Aleksander | 10 Nov | RR02, RR11 | Finalise separate development and held-out bilingual question/retrieval sets and blind human-rating forms. Verify map coverage, expected tool/passage answers and access restrictions on held-out material. |
| RR24 | Aleksander; both review | 14 Nov | RR12, RR14, RR17 | Review/export at least 300 accepted training conversations. Replace hash splitting with the match manifest, include tool schemas and selection examples, validate human corrections against real evidence, and track every source match. Check cross-match/translation leakage and assistant targets; both review allocated examples. |
| RR25 | Aleksander | 20 Nov | RR04, RR24 | Prepare a small training/reload smoke test early, then run QLoRA on reviewed data with measured memory/configuration. Compare the same-size base and tuned models; verify adapter reload and deployed export where viable. Keep defence build separate; document failures and retain the base model if training regresses quality. |
| RR26 | Aleksander | 12 Nov | RR06, RR17, RR23 | Produce interim template/base-model comparisons using validation data only: quality, tool/retrieval success, latency, VRAM, repairs/fallbacks and blind ratings. Record failures as results, not missing rows. |
| RR27 | Pawel | 13 Nov | RR22 | Freeze a known-good defence build and permitted real sample with radar, saved explanation and recorded clips. Offline demonstration works and clearly identifies saved results; preserve recovery instructions. |
| RR28 | Aleksander; both present | 16 Nov | RR26, RR27 | Prepare/rehearse defence with real traces, measured interim results, research question, scope changes and limitations. Both explain the other's component and answer failure-case questions. |
| RR29 | Pawel; both present | 17 Nov | RR28 | Deliver first defence; capture feedback and convert required changes into bounded tasks without changing the frozen test protocol casually. |

### Invited-user release and submission

| ID | Lead | Due | Depends | Task and completion evidence |
|---|---|---|---|---|
| RR30 | Aleksander; Pawel operates | 24 Nov | RR22, RR23 | Run the 5–10-player invited study from 18 November. Capture consent, task outcomes, incorrect coaching, usefulness/trust feedback and faults; Pawel monitors worker/storage health. |
| RR31 | Pawel | 29 Nov | RR30 | Fix release-blocking study defects, complete all three-map/two-language core behaviour and finalise retention/deletion, quotas and support/runbook. Verify fixes without tuning on held-out test outcomes. |
| RR32 | Aleksander | 28 Nov | RR06, RR23, RR25, RR26 | Freeze model/prompt/detector/retrieval configs on 24 Nov and run held-out comparisons with blind ratings by both. Include viable fine-tuned model, or documented training limitation; preserve denominators, hashes and raw metric output. |
| RR33 | Aleksander; Pawel contributes | 1 Dec | RR29, RR30, RR32 | Complete report and final presentation with architecture, methods, results, local feasibility, actual costs and limitations. Pawel supplies implementation, reliability and recording evidence. |
| RR34 | Pawel; Aleksander reruns | 2 Dec | RR31, RR32 | Reproduce installation/results from a clean environment and perform backup restoration. Exchange instructions; verify saved sample and invited remote flow with the final configuration. |
| RR35 | Pawel; both sign off | 5 Dec | RR33, RR34 | Final acceptance: release gates pass; working invited accounts/sample, report, results and runbooks agree; presentation names every unmet commitment; no unresolved release-blocking defect. |
| RR36 | Pawel; both submit | 6 Dec | RR35 | Deliver final invited-user product and university materials; archive release/config/results references and provide setup/access instructions. Public opening remains deferred. |

Task-level acceptance is above; file ownership follows section 3. When starting a row, record exact changed paths, estimate, status and test/demo commands. No task is complete until its evidence is saved. A noncritical research finding does not block release; a broken promised capability must be fixed or explicitly escalated as a scope shortfall.

## 7 Optional and deferred tasks

| ID | Priority | Lead | Dependency | Completion or disposition |
|---|---|---|---|---|
| OPT01 | P1 | Aleksander | RR04, RR06, RR26 | Same-model rented/university GPU comparison, ideally by 24 Nov. Prepare before renting, target $30 total, record all charges, export results and verify billing stops. Skip before borrowing time from P0; university support can replace rental. |
| OPT02 | P1 | Pawel; Aleksander for streaming protocol | RR22 | Nonessential Lab/Studio convenience, extra interaction polish or independently checked answer-block streaming only after release defects are addressed. Streaming requires versioned protocol, validation and cancellation checks; respect 24 Nov evaluation freeze and 29 Nov feature cutoff. Core tab/loading/answer quality remains RR18/RR22. |
| OPT03 | P1 | Aleksander; Pawel supplies clips | RR20, RR26 | Before 24 Nov, if P0 secure, spend at most two working sessions on a 30-development-clip visual-model probe. Compare telemetry-only and added visual observations for quality, unsupported claims, latency and VRAM. No final-test tuning, full-match analysis or vision-training commitment; default defer product integration. |
| LATER01 | P2 | Pawel | RR36 | Public registration/processing with a separate operating budget, capacity and privacy/reliability review. No December promise. |
| LATER02 | P2 | Pawel | RR36 | 3D replay, automatic imports and extra maps; require their own scope/evidence plan. |
| LATER03 | P2 | Aleksander | RR36 | Expanded cross-match progress and personalised practice product; build on measured value rather than speculative features. |

## 8 Milestones and freeze rules

| Date | Required evidence |
|---|---|
| 22 Oct | Baselines, protocol, ownership, source map and actual capacity review |
| 24 Oct | Shared cloud API foundation accessible to both students under restricted development access |
| 29 Oct | Both students can upload through the cloud API simultaneously; cloud parsing and account boundary integrated; evaluation runner available |
| 5 Nov | Studio layout fixed; three-map validation and knowledge work underway; no further UI direction changes |
| 13 Nov | Defence build: real complete review, measured interim results and offline sample |
| 17 Nov | First defence delivered |
| 20 Nov | Training pilot outcome known; remaining training/export blocker has a specific fallback |
| 24 Nov | Study complete; model/analysis configs frozen; P1 work stops unless P0 is secure |
| 29 Nov | Final product candidate; core feature work ends |
| 30 Nov–5 Dec | Reproduction, defects, documentation and final acceptance only |
| 6 Dec | Invited-user product and final submission |

Model or detector changes after the final evaluation freeze require a new version and a clearly labelled rerun. Do not tune against the test set. A product/security fix may proceed, but record whether it affects evaluated behaviour and retain the evaluated version.

If a milestone slips: state the failed gate and remaining work that day; drop OPT01/OPT02/OPT03 first; stop unrelated refactoring; use the saved defence build while fixing the main line. If a P0 commitment is still threatened, record its impact and obtain a concrete scope decision from Pawel/course supervisor rather than marking it done. Keeping raw tests and limitations is part of the deliverable.

## 9 Immediate assignments

**Pawel, next work session:** RR01, then RR03. Record source versions and the real-demo baseline; use measured parser resources to prepare RR37 immediately after contracts. Do not defer hosting until the app is finished. Reserve GPU windows with Aleksander.

**Aleksander, next work session:** RR02 and RR04 preparation. Draft the research protocol and run the model baseline during the agreed GPU window. Validate RR37/RR08 from your own device against the shared cloud instance. Ask the university about compute access without making it a dependency of progress.

**Together by 23 October:** review the measured baseline and RR05 contracts, agree the exact labelled corpus and split allocation, estimate the backlog against actual calendars and record the handoff fixtures. No architecture approval is left waiting on unanswered product questions; remaining operational choices have named tasks and deadlines.

## 10 Evidence and limitations of this plan

This plan uses the supplied proposal, the four-project source comparison and Pawel's explicit decisions. Source evidence remains in the archived [analysis draft](CONSOLIDATED-PLAN-DRAFT.md). Existing tests/results mentioned there are historical; this planning work did not rerun the application, model, recorder or end-to-end tests. The RTX 5080 and availability are user-confirmed. External hosting costs in the hosting reference are dated research, not a purchase quote.

Only planning documents changed. Nothing was merged, committed, deployed, installed or rented. Keep this document as the source of task status until a tracker explicitly imports these RR/OPT/LATER IDs; do not independently maintain conflicting status lists.
