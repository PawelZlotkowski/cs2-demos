# Round Reviewer archived planning analysis

**Superseded on 19 October 2026 by [the final delivery plan](../../planning/FINAL-DELIVERY-PLAN.md).** Retained as evidence of the source comparison and decision process. Questions, proposed scope, dates and task IDs below are historical and are not the active backlog. Confirmed final direction: invited-user release by 6 December, public access later, RTX 5080 PC available for inference and Windows recording. Use the final plan for priorities, task owners and acceptance gates.

Status: revised decision draft, 19 October 2026, incorporating both rounds of Pawel's answers. Browser Studio, backend parsing, Mirage/Anubis/Dust II, English/Polish, local-model research, a $30 GPU-testing target and milestone dates are confirmed. The proposed deployment topology, detailed ownership and remaining scope decisions need review. This document does not approve a merge, purchase or deployment.

The aim is to build one coherent application from the strongest existing work and fulfil the agreed project proposal. Consolidation should preserve useful implemented behaviour while requiring evidence that the combined application actually works. No application code was changed during this review.

## Confirmed direction from Pawel

- University completion comes first; real-user availability is a subsequent delivery stage.
- First defence: **17 November 2026**. Final product and submission: **6 December 2026**. Missing capabilities must be disclosed in the presentation.
- Build a browser-based analysis Studio. Exclude floating windows, OS simulation, docks and native-app styling. Preserve the existing mockup as a reference without promoting its OS shell or deleting it.
- The Studio should give detailed insight into mistakes and good play, with replay and evidence at the centre. Explore alternative Studio layouts within that direction.
- Begin locally with a proof of concept; progress to invited friends and public website availability. Whether unrestricted public processing must be live by 6 December remains to be decided.
- Self-hosted model viability remains the research question. Local inference runs on Pawel's hosting device. A rented GPU with an API endpoint is an allowed fallback/comparison; a managed model API is a distinct experiment and must not be presented as self-hosted evidence.
- Coach languages: English and Polish. Dutch is removed because the team cannot fairly evaluate it.
- Maps: Mirage, Anubis and Dust II (`de_dust2`), confirmed. Adding Dust II requires full map and coaching coverage, not just a menu entry.
- Users need only a browser. Parsing and backend computation run on an operator-controlled hosting device, not the visitor's device. This supersedes the earlier device-side-parsing discussion; browser WASM work is removed from the critical path.
- Pawel and Aleksander can spend roughly 2–4 hours daily; clarify whether this is each person's availability before committing person-hour estimates.
- Optimise and simplify the working code. Pawel reports that the existing code works; this review has not independently rerun his setup.
- GPU rental target: $30 total for experiments, not a monthly hosting allowance. Additional funding or university hardware can be considered separately; no expense is authorised by this plan.
- The requested skill is confirmed as [DietrichGebert/ponytail](https://github.com/DietrichGebert/ponytail). Its instructions have been read and applied to planning; nothing has been installed.

These answers supersede conflicting earlier project notes. Amend the proposal for two languages, three maps and the local-versus-rented inference comparison. Confirm how course supervisors expect scope changes to be recorded. See [hosting and GPU experiment plan](../../planning/HOSTING-AND-GPU-PLAN.md) for the proposed topology, worker protocol and budget.

## 1 What was reviewed

The supplied Word proposal was read, including its data, evaluation and work-allocation tables. File inventories and selected source hashes were compared across all four supplied project folders. Key implementation boundaries, existing task lists, architecture notes and validation reports were inspected. Dependencies, generated builds, private environment files, model weights and raw player data were not treated as project source. This is a structural and planning review, not a line-by-line security audit or a fresh runtime certification.

| Project | Evidence and contribution | Planning consequence |
|---|---|---|
| `cs2-demos` | Earlier application and mock-driven floating prototype; original coaching plans, design references and task tracker | Keep useful design/history references; do not use mock UI behaviour as evidence of a working backend |
| `cs2-demos-studio` | Next.js Studio plus accounts, roles, admin, Lab, cross-match Coach, progress, notes and review versions in source | Candidate source for the fuller product and research workflow; acceptance still needs runtime verification |
| `cs2-demos-accounts` | Compared application source matches Studio; adds an API-connected floating desktop, sign-in, onboarding, admin and browser-flow scripts | Reuse backend/domain lessons where useful; floating UI is explicitly excluded |
| `cs2-demos-phase1-source/cs2-demos` | Hardened local pipeline, access middleware, bounded uploads/parser jobs, replay corrections, inference limits and fresh recording validation | Candidate foundation for reliability; lacks Studio's full account/admin/roadmap modules |

The comparison covered selected source/configuration/document formats, not every binary or ignored runtime file. In that comparison Accounts added 56 files over Studio, all under the floating prototype, with no differing common files. Phase 1 and Studio differ in core routes, configuration, contracts, repositories, pipeline and coaching code. Copying either tree over the other would lose behaviour.

Evidence anchors:

- Proposal: `C:/Users/pawel/Downloads/project-proposal-Pawel-Zlotkowski (1).docx`.
- Phase 1: `START-HERE.md`, `review/PHASE1-RESULTS.md`, `apps/api/app/core/access.py`, `processing/isolated_parse.py`, `processing/video_clips.py`, `coach/verify.py`.
- Studio: `docs/handoff/18-CURRENT-STATE.md`, `19-DECISIONS.md`, `29-FEATURE-ROADMAP.md`, `30-REVIEW-AND-ADMIN-PANEL.md`; `apps/api/app/main.py`, `auth/deps.py`, `services/gpu.py`.
- Accounts: `prototype/rr-floating-desktop/README.md`, `src/state/store.tsx` and the browser QA scripts.
- Planning: Studio's `docs/coach/TASKS.md`, `apps/tracker/README.md` and `scripts/sync-tasks.mjs`.

## 2 The strongest parts to preserve

1. **The proposal's core journey:** upload, select one player, get approximately five or six useful good/bad moments, review evidence with radar and POV clips, then ask contextual questions.
2. **Code-derived evidence:** parsing, round statistics, detector findings, map zones and deterministic ranking remain independently testable. The model selects and explains evidence.
3. **A single playback clock:** moment rail, radar, video and evidence citations must refer to the same player, round and time. Radar remains usable while clips are unavailable.
4. **Phase 1 failure handling:** bounded work, parser termination, durable match metadata, restart recovery, atomic outputs, clip provenance and explicit template fallbacks.
5. **Studio's research facilities:** traces, labelling, blind comparisons and dataset review can support the coursework directly. Their existence as screens must not be confused with completed experiments.
6. **Accounts' API-connected workflows:** onboarding and progress behaviour can inform ordinary Studio pages. Do not carry across the floating shell, window manager or OS styling.
7. **Existing retrieval and model adapters:** build on the local model/MCP/RAG implementation, after validating the actual execution path and scope boundaries.
8. **Task dependencies and completion checks:** keep this discipline from the existing tracker, but cover all approved work in one authoritative backlog.

## 3 Decisions that must be settled

| ID | Decision | Why it changes the plan |
|---|---|---|
| D01 | Confirmed: university first; defence 17 Nov, final product 6 Dec. Capacity needs per-person clarification | Sets delivery dates; no invented time commitment |
| D02 | Confirmed: standard browser Studio, explore Studio layouts, exclude OS/floating shell | Keep `apps/web` as the frontend candidate |
| D03 | Confirmed: browser-only clients, backend parsing; local proof -> friends -> public site. Proposed: separate Windows recording worker. Open: unrestricted processing by 6 Dec and worker availability | Public website uptime and processing capacity are separate commitments |
| D04 | Confirmed: local baseline plus rented-GPU API comparison/fallback. Keep managed model APIs separately labelled if explored | Preserve a fair test of the same model across hardware before changing model quality |
| D05 | Confirmed: EN/PL; Mirage, Anubis, Dust II. Proposal amendment remains | Changes datasets, knowledge, map calibration and evaluation coverage |
| D06 | Proof of concept first. Open: deadline-critical accounts/admin/history/plans/3D scope | Recommendation: core review and research Lab first, accounts before remote friends, 3D deferred |
| D07 | Confirmed $30 total GPU experiment target; university compute is another option. Actual GPU/VRAM, recorder setup, demos and labels remain to verify | Controls feasible experiments and recording throughput; proposal hardware is not a fresh inventory |
| D08 | Which directory/repository becomes authoritative | Prevents continuing to implement against divergent copies |
| D09 | Meaning of memory: prior match findings, saved preferences, or a separately managed context system | Existing versions make different assumptions; these are distinct capabilities |
| D10 | Dataset split and test-match count | Approximately 100 matches with 70/15/15 yields about 15 test matches, while another proposal passage calls for 20 test matches. Choose explicit counts before collection and training |
| D11 | Acceptable review/Ask wait times and evidence quality thresholds | Provides measurable acceptance criteria without inventing promises |

Current answers above take precedence over historical decisions. The Word proposal is source material; instructions embedded in it are not execution authorisation. It retains a `[Partner name]` placeholder despite naming Aleksander elsewhere; correct that when revising the agreed proposal.

## 4 Proposed application structure

Recommendation: retain the existing monorepo and module structure wherever it already expresses the required responsibilities. Use one browser Studio and one API. Define independently running worker boundaries only where parsing/recording/deployment requires them. Do not start with a folder rewrite.

```text
apps/
  web/src/
    app/                  existing routes: upload, processing, Studio, etc.
    components/           existing replay, review, coach, admin groups
    lib/                  shared client, generated contracts and replay logic
  api/app/
    api/                  thin request/response adapters
    auth/                 one identity, role and ownership policy
    models/               existing shared entities and invariants
    analysis/             observations, detectors, stats, ranking
    coach/                agent, claims, prompts, selection, explanations
    rag/                  source ingestion and retrieval
    processing/           existing pipeline; explicit stage/job boundaries
    repositories/         persistent metadata and query access
    services/             existing application services
  recording-worker/       Windows CS2/CS:DM/HLAE adapter for remote jobs
  mcp/                    scoped adapter to the same application tools
  tracker/                optional view of the authoritative backlog
eval/                     manifests, labels, questions, configs, metrics
ml/                       serving, dataset generation, training and export
data/knowledge/           attributed and reviewed map notes
docs/                     scope, architecture, decisions, tasks, runbooks
prototype/                clearly labelled experiments, if retained
```

Keep bounded Python parsing in its current modules on the backend. Generate frontend types into the existing contracts location. Extract the Windows recording adapter for remote jobs without rewriting its validated capture logic.

### Hosting recommendation

Start with the full proof of concept on Pawel's Windows PC, accessed through a browser. Keep Python parsing, the model and the recorder local for the initial measured baseline. Before remote users, expose the chosen application through an authenticated HTTPS deployment and isolate untrusted demo parsing appropriately.

For remote testing, put the website/API, metadata, private artifacts and durable job queue on a CPU host or university server. Keep local inference and Windows recording on Pawel's PC as workers which initiate outbound connections. The recording worker downloads the authorised demo, records selected tick windows, validates the media and uploads the result. Visitors install nothing and never provide their Steam password.

Do not make the CPU API synchronously wait for the model or recorder. Store separate parse, analysis, explanation and clip statuses; show radar/facts as soon as ready. If the home worker is offline, show that state and a bounded queue. Previously completed reviews remain available. Model and game workloads initially share a single GPU admission policy until measured otherwise.

A rented inference endpoint can replace the model adapter independently of parsing and recording. University compute can fill the same role. A cloud game recorder is a separate compatibility project and is not required for the proposed initial remote architecture. See the hosting plan for the exact decision gates.

### Studio layout exploration

Compare two small static/interactive layout prototypes using the same real review: (A) stage, moment rail and evidence/Ask side panel; (B) stage with a collapsible round/evidence inspector and a guided moment sequence. Judge both by finding a mistake, inspecting the evidence, seeing a good play and answering a follow-up. Preserve one clock and keyboard navigation. No OS window controls or desktop metaphor. Select one before full styling work.

### Simplicity and optimisation rules

The user confirmed [Ponytail](https://github.com/DietrichGebert/ponytail/blob/main/skills/ponytail/SKILL.md), read on 19 October 2026. Apply reuse-first changes, preserve error handling and avoid speculative layers. No skill installation or hook execution was performed.

For this project: profile a real demo before changing algorithms; record parse/analysis/inference/recording time separately, peak memory, payload size and replay responsiveness. Optimise the largest measured bottleneck. Keep shared routines and current libraries where they work. Remove duplicate runtime paths only after call sites and regression checks are covered. A skill is a review discipline, not proof of performance.

Required boundaries:

- API and MCP must use the same owner/player scoping and application services.
- Detectors consume parsed data, independent of web requests, models and recorders.
- Model selection consumes bounded findings/stats and returns round-bounded windows.
- Explanations distinguish observations, interpretations and recommendations. A valid citation alone does not prove a statement.
- Parsing, analysis, selection, explanation and recording have separate statuses. A clip failure must not invalidate an available radar review.
- All persisted outputs carry input, parser/detector/model/prompt versions as applicable. A re-run must not silently overwrite the earlier review.
- Jobs define attempts, idempotency, timeouts, cancellation, retry and restart behaviour. A process-local queue is not durable coordination across services.
- Metadata lives in the database; large demo/replay/media objects live in artifact storage. SQLite remains a candidate for local use; database selection for shared deployment follows D03.
- GPU admission must cover both inference and recording, including model load/unload or other measured scheduling policy.
- Frontend types should be generated from the agreed backend schema. No permanent second set of independently edited contracts.

Proposed user navigation: Matches/Upload -> Review Studio -> optional Coach/Progress, with Settings separately. Admin/Lab serves operators and research contributors according to roles. Exact navigation and mobile behaviour depend on D02 and D06.

## 5 Integration strategy

Do not merge folder trees wholesale. Once D08 is answered, record the exact source revisions and preserve local changes. Create a file-level donor map and integrate one domain at a time.

| Area | Candidate donor | Integration condition |
|---|---|---|
| Parsing, limits, replay corrections, media validation | Phase 1 | Preserve its regressions while checking against real demos |
| Accounts, roles, admin and research screens | Studio/Accounts shared app | Adapt to the single agreed access policy; keep Phase 1 ingress and local-host protections |
| Main UI | Studio `apps/web` | Explore Studio layouts; exclude Accounts' floating shell; use one client, contract set and playback implementation |
| Coaching | Shared existing agent plus Phase 1 budgets and honest validation labels | Keep cross-match functionality only with owner-scoped tools and evidence |
| Job scheduling | Phase 1 admission and Studio queue behaviour as references | Define a single job lifecycle; avoid stacking incompatible in-memory queues |
| Evaluation/ML | Existing label/comparison scripts and Studio dataset exporter | Build missing evaluation runner, sampling and training work explicitly |
| Documentation | Original decisions plus Phase 1 caveats | Replace contradictory status summaries with one verified current-state record |

Both API versions use an `rr_session` cookie but interpret authentication differently. This is a concrete integration boundary: choose one session scheme and ownership representation, migrate where needed, and test public sign-in, private resources, media and MCP together.

## 6 Ordered backlog

All tasks below are proposed and unassigned. Existing code can satisfy part of a task, but no row is considered complete merely because a file exists. Owners and calendar estimates are assigned after D01 and D07. Dependencies identify the minimum prerequisites; optional rows are activated only by the scope decision.

### Milestone A Agree scope and make one source of truth

| ID | Task and deliverable | Depends | Complete when |
|---|---|---|---|
| P01 | Resolve D01-D11 and write first-release requirements and exclusions | User answers | Each decision has an answer, rationale and impact; any remaining question explicitly blocks only dependent work |
| P02 | Record source revisions, local changes and file-level reuse/conflict map | P01 | Each major module has a chosen donor and integration owner; original copies remain recoverable |
| P03 | Reconcile T, A, AD, R and Phase 1 follow-up tasks into one backlog | P01, P02 | Every approved proposal requirement maps to tasks; duplicates and superseded tasks are linked |
| P04 | Define acceptance targets, ownership and dated milestones | P01, P03 | Both students agree capacity, task owners, reviewers, demonstration gate and submission gate |
| P05 | Establish an isolated, reproducible baseline check | P02 | Clean setup, API/MCP/web checks and recorded failures use disposable data rather than real matches |
| P06 | Benchmark current behaviour and verify host/worker feasibility | P01, P05 | Real-demo stage times/memory, model and recorder preflight, GPU contention and outbound-worker proof documented; no browser parser port |
| P07 | Amend proposal and research coverage | P01 | EN/PL, Dust II, local/rented comparison, split counts and partner naming reconciled; course approval process checked |

### Milestone B Integrate a trustworthy foundation

| ID | Task and deliverable | Depends | Complete when |
|---|---|---|---|
| F01 | Define canonical match, round, player, finding, moment, review, job and clip schemas | P01, P02 | Tick/time conventions, ownership, missing data, versions and invariants are documented with fixtures |
| F02 | Unify access policy and account integration where approved | F01, P05 | Owner isolation, role gates, sign-in, clip reads and MCP access pass; local mode retains actual peer/Host/Origin restrictions |
| F03 | Integrate bounded backend Python ingestion/parsing | F01, P05, P06 | Oversized/truncated input, queue saturation, cancellation/timeout and memory-limit cases handled; public deployment uses an appropriately restricted parsing worker |
| F04 | Unify repositories and write data migrations | F01, F02 | Existing representative records migrate; re-runs retain provenance; interrupted writes/restarts recover; migration has a recovery procedure |
| F05 | Define durable jobs and GPU/recording admission | F03, F04 | Duplicate submission, cancellation, retry, restart and overload have tested outcomes; multi-process leases exist if deployment needs them |
| F06 | Generate frontend contracts and unify API/MCP adapters | F01, F02, F04 | Schema drift fails a check; API and tools enforce identical resource scope |

### Milestone C Establish reliable numerical evidence

| ID | Task and deliverable | Depends | Complete when |
|---|---|---|---|
| E01 | Build demo manifest and freeze train/validation/test allocation | P01 | Counts reconcile the proposal; hashes, source/map and split recorded; duplicate matches cannot cross splits |
| E02 | Run real-demo parser/replay corpus checks | F03, F04, E01 | Both maps, side switches, overtime and selected failure cases have manually checked events, scores and round boundaries |
| E03 | Publish detector capability requirements and uncertainty rules | F01, E02 | Missing inputs produce unavailable/qualified findings; dry-peek and rotation heuristics do not imply unobserved intent/visibility |
| E04 | Review map zones and knowledge sources | E02 | Selected landmarks/callouts checked in game; source, licence, review status and map applicability recorded |
| E05 | Label rounds and collect independent moment preferences | E01, E03 | Agreed label counts achieved; overlap labelling and disagreements recorded; held-out data stays untouched by tuning |
| E06 | Evaluate/tune individual detectors and deterministic baseline | E05 | Per-detector precision/recall, false positives and sample counts reported on appropriate splits; threshold changes versioned |
| E07 | Add Dust II (`de_dust2`) end to end | P07, E02-E04 | Map acceptance, overview transform/assets, callout zones, knowledge, real demo fixtures, recording and evaluation coverage agree; replay support alone is not called full coaching support |

### Milestone D Complete and measure the AI workflow

| ID | Task and deliverable | Depends | Complete when |
|---|---|---|---|
| C01 | Live model serving and MCP smoke test | F05, F06, D07 resolved | Actual local model completes tool call and structured output; trace, latency and memory measurements saved |
| C02 | Integrate validated moment selection with ranker fallback | C01, E06 | Good/bad selection, permitted IDs, round windows, deadline and fallback tested on real matches |
| C03 | Implement typed factual claims and honest validation status | F01, E03 | Wrong player/round/outcome/stat references rejected; supported fields checked directly; interpretation remains labelled; no claim of general semantic proof |
| C04 | Validate RAG ingestion and retrieval with known-answer queries | E04, F06 | Sources resolve; keyword and hybrid retrieval measured separately; unavailable embeddings have an explicit fallback |
| C05 | Complete moment explanations and contextual Ask | C01-C04 | English/Polish, one repair/fallback policy, streaming cancellation, citation navigation and scoped context pass; Dutch excluded from product and evaluation |
| C06 | Implement cross-match history and practice plans if selected | C05, F02 | Only allowed history is retrieved; counts show their denominator; recommendations link to evidence and approved drills |
| C07 | Freeze prompts/configuration and compare base models | C02-C05, E05 | Same held-out inputs; quality, tool success, latency, memory, repair and fallback reported separately |

### Milestone E Deliver usable review and real recordings

| ID | Task and deliverable | Depends | Complete when |
|---|---|---|---|
| U01 | Compare two Studio layouts, retain one and define navigation/empty/error states | P01, F06 | Browser Studio covers upload, progress, selection and review without mock production paths; no OS interface |
| U02 | Consolidate replay state and citation navigation | U01, E02 | Radar/video switch, direct/reverse seek, death/HP state and selected player remain consistent |
| U03 | Extract/complete the Windows recording job adapter | F05, C02 | Preflight, fresh attempt directory, owned process lifecycle, retry and atomic validated media publication work |
| U04 | Measure real capture player/window/clock alignment | U03 | Known shots/deaths align within agreed tolerance; correct POV, timing and provenance checked, not just MP4 readability |
| U05 | Integrate progressive readiness, explanation and feedback UI | U02, C05, U04 | Radar remains available while clips run/fail; evidence/template status visible; feedback is stored against exact review version |
| U06 | Complete approved accounts/admin/Lab/history surfaces | F02, U01, P03 | Each retained screen has a working backend, role tests and explicit empty/error states; decorative unfinished screens are excluded |
| U07 | Build a permitted real sample review and demonstration fallback | U05 | Sample includes radar, clips and saved explanation; demonstration works with model/recorder unavailable; provenance is honest |
| U08 | Verify complete journeys and accessibility | U05-U07 | Keyboard path, chosen screen sizes, error recovery, refresh/resume and privacy boundaries pass on the integrated app |

### Milestone F Produce the research results

| ID | Task and deliverable | Depends | Complete when |
|---|---|---|---|
| R01 | Build one evaluation command and versioned run configuration | E01, F01 | Deterministic fixture run produces metric tables; all data/config/model references recorded |
| R02 | Build question/retrieval/rating datasets and rubric | E04, E05, E07, P04 | English/Polish and all three confirmed maps covered; agree whether 150 questions becomes 75 per language or a revised total; expected tools/passages and blind-rating instructions reviewed |
| R03 | Implement rejection sampling and dataset review/export | C03, C05, R01 | Several candidates per training example, filtering, human review, split checks and dataset card work; test data excluded |
| R04 | Run QLoRA pilot and serving export | R03, D07 resolved | Training config/logs/adapters saved; exported model runs through the same local interface; no claim of improvement before comparison |
| R05 | Compare templates, base model and fine-tuned model | C07, R01, R02, R04 | Frozen test results include selection, evidence quality, retrieval, tool use, language, latency, memory and human ratings |
| R06 | Conduct agreed user study | U08, R02 | Participants/consent and protocol set; findings and limitations recorded; study claims match the actual sample |
| R07 | Complete defence, report and reproducibility handoff | U07, R05, R06 | Both students explain both halves; clean setup independently reproduced; report distinguishes measured results and limitations |

Build R01/R02 early alongside integration; do not defer the evaluation harness until after model tuning. Defence can use an explicitly labelled interim snapshot if its date precedes final R05/R06, subject to the course requirements.

### Conditional work outside the agreed core

| ID | Work | Prerequisite and completion gate |
|---|---|---|
| X01 | Invited remote/public deployment | Confirmed direction, release date open; F02-F05 and U08 pass; restricted parsing, scoped outbound workers, HTTPS, private artifacts, quotas, retention, backups/restore and offline/restart drills proven before exposure |
| X02 | Tactical 3D replay | D06 selects it; E02 and U02 pass; versioned assets/telemetry, calibrated axes/scale, deterministic seek and performance checked; labelled tactical reconstruction, with radar fallback |
| X03 | Rented-GPU experiment within $30 target | Local baseline and frozen workload first; provision only after endpoint/cost review; report same-model hardware comparison before any larger-model experiment; save results and verify shutdown/storage charges |
| X04 | Maps beyond the requested three or automatic match import | Explicit additional scope change, acquisition support and per-map evidence/knowledge validation; estimates revised before implementation |

## 7 Task management contract

Each executable task must contain: ID, user-visible outcome, proposal requirement, source/donor paths, owner, reviewer, dependencies, in/out of scope, acceptance checks, effort estimate after investigation, status and evidence of completion. Use `proposed`, `ready`, `doing`, `blocked`, `review`, `done`, `deferred`. Record why a task is blocked and the precise input needed.

Choose one authoritative task store. Recommendation: version-controlled tasks with the tracker as a view, unless the team explicitly chooses a shared board as authority. The current tracker imports only `docs/coach/TASKS.md`, recognises T-number dependencies, and stores UI status overrides separately without writing them back. Reusing it requires broader IDs/dependencies and a reconciliation strategy. Do not seed this draft into the live board before scope is agreed.

Completion evidence must distinguish: code exists; mock/synthetic tests pass; real integration passes; measured research result achieved. Old `review` labels and reported test counts are not substitutes for these distinctions.

Suggested ownership, pending agreement: retain the proposal's split of Pawel on data/tools/recording/UI/evaluation runner and Aleksander on RAG/model/claims/training/questions. Shared work: architecture/contracts, labels, blind ratings, integration acceptance and defence. This is a proposal, not an assignment of either person's time.

## 8 Schedule and gates

Dates are confirmed. The following calendar is a proposed allocation, not a claim that the entire backlog fits the unknown effective capacity. Update estimates after the 22 October architecture gate. No GPU spending is committed.

| Dates in 2026 | Deliverable | Work emphasis and gate |
|---|---|---|
| 19–22 Oct | Frozen first-release scope and integration design | P01-P07; baseline timing; host/Windows worker preflight; proposal amendment; choose canonical repository; enquire about university compute |
| 23–29 Oct | One coherent real-demo flow | F01-F06 and E01-E03; establish R01/R02 scaffold; begin labelling and knowledge review immediately |
| 30 Oct–5 Nov | Usable Studio with measured coaching | E04-E07, C01-C05, U01-U03; prioritise faithful evidence and selected moments; start training-data preparation as soon as claim contract is stable |
| 6–12 Nov | Feature-complete defence candidate | U04-U07, initial model/baseline comparison, real clip timing; no new interface direction after 5 Nov |
| 13–16 Nov | Defence freeze and rehearsal | U08, saved real sample, reproducible traces and interim metrics, known-limitations slide; both students rehearse |
| **17 Nov** | **First defence** | Demonstrate the working proof of concept and actual measurements; disclose incomplete final-stage work |
| 18–24 Nov | Final research runs and friend testing | R03-R06; invite friends only through a tested deployment path, or use the local setup if remote delivery is unresolved |
| 25–29 Nov | Final product candidate | Finish agreed core and operational work; no new feature scope after 24 Nov; freeze evaluation configurations and collect final results |
| 30 Nov–5 Dec | Release hardening and submission preparation | Reproduce results, clean setup, fix failures, complete report/presentation and record limitations; retain a recovery buffer |
| **6 Dec** | **Final product and submission** | Deliver the agreed complete product, measured evaluation and reproducibility materials; clearly disclose any unmet commitment |

Suggested priority for the final product: reliable three-map/two-language review, selected clips/radar, contextual Ask, MCP/RAG, honest verification, reproducible comparison including a QLoRA experiment, and a usable Studio. Keep the required Lab workflow small. Public access, extensive admin tools, practice plans and 3D must receive explicit deadline decisions rather than silently sharing the core budget. Friends testing and eventual public availability remain goals even if their exact dates are open.

Provisional ownership remains the proposal split, subject to agreement. If both people truly have 2–4 hours every day, plan from the lower end and reserve time for exams, manual review and integration; do not schedule the maximum as guaranteed capacity. Report local-GPU and rented-GPU results separately so the original viability question stays answerable.

Gate 1: scope, source of truth, contracts and evaluation split agreed.

Gate 2: one real match completes upload -> player -> valid numerical review with restart/error handling.

Gate 3: live model/MCP/RAG selects and explains supported moments; fallback remains useful.

Gate 4: correctly aligned real clips and a coherent chosen interface complete the user journey.

Gate 5: baseline/base/fine-tuned evaluation, user study and reproducibility support the final claims.

Public deployment is a confirmed direction with timing and operating model still open. 3D remains unselected. Neither is a prerequisite for demonstrating a coherent radar/video Studio unless Pawel explicitly makes it one.

## 9 What remains unverified

This planning review did not start the app, run its tests, load the GPU model, upload a demo or run CS2/CS:DM. Phase 1's historical report records 271 API passes, 4 skips and 18 MCP access passes, while explicitly leaving live demo/model/recording checks open. Those are reported historical results, not checks repeated here.

The current verifier source explicitly says citation/number checks do not prove free-form truth. The dry-peek detector documents false positives because it cannot establish who peeked whom. Existing evaluation files include label and model-comparison utilities; the inspected trees do not contain the promised complete `eval.run` runner or QLoRA training pipeline. Studio contains a dataset exporter, which is only part of that work.

Next decision step: resolve the expectation questions, then revise this draft into the approved architecture, single backlog, owner assignments and dated delivery plan before implementing the consolidation.
