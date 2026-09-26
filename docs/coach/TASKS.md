# AI Coach tasks

Source plan: [AI-COACH-PLAN.md](./AI-COACH-PLAN.md). The owner assigns each task (`Owner` column); agents pick only tasks assigned to them or explicitly handed over.

**Rules for agents picking a task**

- Read AGENTS.md, [19 Decisions](../handoff/19-DECISIONS.md) and the plan section named in the task first.
- One task per branch/PR. Keep the PR to the task's paths unless the task says otherwise.
- A task is done only when its **Done when** checks were actually run; record them in [23 Agent log](../handoff/23-AGENT-LOG.md) and update [18 Current state](../handoff/18-CURRENT-STATE.md) and the `Status` column here.
- No hosted LLM APIs anywhere (owner decision). Local llama.cpp only.
- Contracts: Pydantic first, then TypeScript (`apps/web/src/lib/contracts/`).

Sizes: S ≈ half a day, M ≈ 1–2 days, L ≈ 3–5 days. Status: `todo`, `doing`, `review`, `done`.

## Phase 0 — setup

| ID | Task | Depends | Paths | Done when | Size | Owner | Status |
|---|---|---|---|---|---|---|---|
| T00 | Merge or rebase `cursor/csdm-gameplay-video` into main (clips worker, clock sync) | – | branch | PR merged; `pytest` + `npm run typecheck` green; stub clips play in Studio | M | | todo |
| T01 | Demo collection: ~100 Mirage/Anubis matches, `data/manifest.csv` with split by match (70/15/15) | – | `data/README.md`, `data/manifest.csv` | manifest committed; demos stored outside git | M | | todo |
| T02 | llama.cpp on the 5080 with Qwen3-14B Q4_K_M; smoke script checks chat + tool call + JSON schema output | – | `ml/serving/README.md`, `ml/serving/smoke.py` | smoke passes; tokens/s and VRAM recorded | S | | todo |
| T03 | Add `llm` compose profile (llama.cpp server, GPU) and `RR_LLM_*` config | T02 | `compose.yaml`, `apps/api/app/core/config.py` | `docker compose --profile llm up` serves `/v1/models` | S | | todo |

## Phase 1 — analysis (deterministic)

| ID | Task | Depends | Paths | Done when | Size | Owner | Status |
|---|---|---|---|---|---|---|---|
| T10 | Extended parse: events + props from plan §4.1, dense window around kills/shots | – | `apps/api/app/processing/parse_demo.py`, `normalize.py` | tests on the real sample demo; blob size increase measured and noted | M | | todo |
| T11 | Map zones for Mirage + Anubis (callout polygons) + `zone_at(x, y)` | – | `apps/api/app/maps/zones/` | unit test: known spots map to right callouts; overlay check on radar | M | | todo |
| T12 | `Finding` + `RoundStats` contracts (Pydantic + TS), storage in SQLite, `/matches/{id}/players/{pid}/findings` | – | `contracts.py`, `lib/contracts/`, repositories, routes | contract tests; [16](../handoff/16-DATA-CONTRACTS.md) updated with migration note | M | | todo |
| T13 | Player selection step: `awaiting_player` state, `POST /matches/{id}/player` | T12 | pipeline, routes, contracts | state machine test; Radar still loads before selection | S | | todo |
| T14 | Detectors D1–D5 | T10 T11 T12 | `apps/api/app/analysis/detectors/` | unit tests per detector on labelled rounds | L | | todo |
| T15 | Detectors D6–D10 | T14 | same | unit tests; D10 yields ≥ 1 good play in most matches | L | | todo |
| T16 | Round stats + code ranker (severity × diversity fallback) | T12 | `apps/api/app/analysis/` | tests; ranker returns 5–6 moments with mix | S | | todo |
| T17 | Labelling tool/format + first 150 labelled rounds; κ on shared 30 | T14 | `data/labels/`, `eval/label_tool.py` | labels committed; agreement reported | M | | todo |

## Phase 2 — tools, MCP, agent

| ID | Task | Depends | Paths | Done when | Size | Owner | Status |
|---|---|---|---|---|---|---|---|
| T20 | Tool functions (plan §5) with typed args and compact JSON | T12 T16 | `apps/api/app/coach/tools.py` | unit tests per tool; result sizes logged | M | | todo |
| T21 | `cs2-demo` MCP server wrapping T20 (stdio + streamable HTTP) | T20 | `apps/mcp/` | MCP inspector lists tools; integration test calls each | M | | todo |
| T22 | `LLMClient` (OpenAI-compatible, tools, JSON schema, streaming) | T02 | `apps/api/app/coach/llm_client.py` | test against llama.cpp; mock for CI | S | | todo |
| T23 | Agent loop (MCP client, max steps, thinking on/off, trace logging) | T21 T22 | `apps/api/app/coach/agent.py` | traces saved as JSONL; runs one match end-to-end | M | | todo |
| T24 | Verifier (citations, numbers, language) + repair + template fallback in en/pl/nl | T12 | `apps/api/app/coach/verify.py`, `templates/` | unit tests with good and bad answers | M | | todo |
| T25 | Moment-selection job (`selecting` state) | T23 T24 T16 | agent prompts, pipeline | 5–6 valid moments on 5 matches; fallback path tested | M | | todo |
| T26 | Explanation job (`explaining` state) + on-demand round endpoint | T25 | pipeline, routes | Analysis text stored per moment; on-demand round < 20 s on 5080 | M | | todo |
| T27 | Ask endpoint over SSE, replacing mocked `services/coach.py` on the real path | T23 T24 | routes, `coach/` | streaming works; mock kept for tests | M | | todo |

## Phase 3 — RAG

| ID | Task | Depends | Paths | Done when | Size | Owner | Status |
|---|---|---|---|---|---|---|---|
| T30 | Knowledge base content: Mirage + Anubis notes, fundamentals, licensed excerpts with attribution | – | `data/knowledge/` | ≥ 40 sections per map; sources listed | M | | todo |
| T31 | Ingest + index (FTS5 + sqlite-vec, bge-m3) | T30 | `apps/api/app/rag/` | re-index command; test retrieval | M | | todo |
| T32 | `search_knowledge` + player-memory retrieval wired into tools | T31 T20 | `rag/`, `coach/tools.py` | `[K..]` citations resolve in verifier | S | | todo |

## Phase 4 — clips and UI

| ID | Task | Depends | Paths | Done when | Size | Owner | Status |
|---|---|---|---|---|---|---|---|
| T40 | CS:DM per-moment recording with focus player; queue priority; `request_clip` tool | T00 T25 | `processing/video_clips.py`, tools | real clip recorded on Windows host; timings noted | M | | todo |
| T41 | Player picker UI on processing page | T13 | `apps/web/src/app/processing/` | screenshots at six sizes; keyboard path | S | | todo |
| T42 | Studio moment rail (selected moments primary, all rounds secondary) | T25 | `apps/web/src/app/studio/` | screenshots; seek sync checks pass | M | | todo |
| T43 | Panel tabs Analysis + Ask; citation tokens seek the clock | T26 T27 | Studio components | [09](../handoff/09-AI-COACH.md) rules met; overlay sync checks | M | | todo |
| T44 | Coach lane on timeline with finding markers | T42 | timeline components | colours/shapes per decision 4 | S | | todo |
| T45 | Language setting (en/pl/nl) end to end | T26 T27 | web settings, API param | answers in chosen language; UI copy stays English | S | | todo |

## Phase 5 — fine-tuning and bigger model

| ID | Task | Depends | Paths | Done when | Size | Owner | Status |
|---|---|---|---|---|---|---|---|
| T50 | Dataset builder: rejection sampling from agent runs, verifier filter, split by match | T25 T26 T27 | `ml/finetune/build_dataset.py` | dataset card with counts per job/language | M | | todo |
| T51 | Human review of ≥ 300 examples (both students) | T50 | `ml/finetune/review/` | reviewed set committed (no raw demos) | M | | todo |
| T52 | QLoRA pilot on RTX 5080 (Unsloth), export to GGUF Q4_K_M | T51 | `ml/finetune/` | pilot model runs in llama.cpp; loss curves saved | M | | todo |
| T53 | RTX Pro 6000: bigger model serving + full fine-tune run | T52 (go/no-go) | `ml/` | models registered in eval configs | M | | todo |

## Phase 6 — evaluation and hand-in

| ID | Task | Depends | Paths | Done when | Size | Owner | Status |
|---|---|---|---|---|---|---|---|
| T60 | Question set: 150 questions (50 per language) with expected tools and answer notes | T25 | `eval/datasets/` | committed | M | | todo |
| T61 | Eval runner + metrics from plan §12, one config per model | T24 T60 | `eval/` | `python -m eval.run --config …` writes tables | M | | todo |
| T62 | Moment-selection human picks for 20 matches + metrics | T25 | `eval/`, `data/labels/` | overlap@6 / NDCG reported | S | | todo |
| T63 | User study (5–10 players) | T43 | `eval/user-study/` | results table | S | | todo |
| T64 | Intermediary defence deck + demo (17 Nov) | T26 | `docs/defence/` | dry run done by both | S | | todo |
| T65 | Final report (~3 pages) + reproducibility check from a clean clone | T61 | `docs/report/` | second student reproduces results from README | M | | todo |
