# AI Coach plan (v1, 26 Sep 2026)

Status: **planned, owner-approved direction.** Nothing in this document is implemented yet unless [18 Current state](../handoff/18-CURRENT-STATE.md) says so. Tasks live in [TASKS.md](./TASKS.md); the school proposal draft is [PROPOSAL.md](./PROPOSAL.md).

Related: [09 AI Coach](../handoff/09-AI-COACH.md), [16 Data contracts](../handoff/16-DATA-CONTRACTS.md), [19 Decisions](../handoff/19-DECISIONS.md), [replay architecture](../replay-architecture.md), [CS:DM video (branch `cursor/csdm-gameplay-video`)](https://github.com/PawelZlotkowski/cs2-demos/blob/cursor/csdm-gameplay-video/docs/csdm-video.md).

## 0. Owner decisions (26 Sep 2026)

| Topic | Decision |
|---|---|
| Model | **Qwen3-14B**, GGUF **Q4_K_M**, on the RTX 5080 (16 GB). Bigger model later on an RTX Pro 6000 (96 GB) |
| Serving | **llama.cpp** `llama-server` (OpenAI-compatible, `--jinja` for tool calls) |
| Who is coached | **One player per match**, chosen by the user after parsing |
| Flow | upload → parse → choose player → LLM picks 5–6 moments (good and bad) from statistics → CS Demo Manager records clips of those moments → Studio shows the moments with clip + radar + analysis. Any other round can be analysed on demand |
| Data | About **100 matches**; only a subset is hand-labelled |
| Maps | **Mirage and Anubis** only for now |
| Fine-tuning | **Yes.** Pilot on the RTX 5080 first; the RTX Pro 6000 is rented only if the pilot works |
| Frontier models | **None.** No Claude, ChatGPT or any hosted API anywhere in the system, including data generation and evaluation. Everything is self-hosted |
| MCP | Undecided by owner. **Default taken:** tools are defined once and served by an MCP server that our own agent connects to (see §5). Can be kept internal-only without changing the agent |
| RAG sources | Own written map notes + openly licensed pages (Liquipedia, CC BY-SA) |
| Coach language | **English, Polish and Dutch** (user setting) |
| Team split | Tasks only, owner assigns them ([TASKS.md](./TASKS.md)) |
| Where the Coach lives | The **Ask** tab, next to the **Analysis** tab in the Studio panel |

## 1. Problem

CS2 players record every match as a demo, but a 40-minute demo rarely tells a player *what they did wrong or right*. Round Reviewer already turns a `.dem` into a replayable 2D radar. This milestone adds an **AI coach** that picks the handful of moments worth reviewing, records them as gameplay clips, and explains each one in the player's language, with every factual claim traceable to the demo data.

Why generative AI adds something: "died untraded" is plain code, but choosing *which* 5 or 6 moments teach the most, explaining *why* a mistake happened using map knowledge and the player's own history, and answering follow-up questions in three languages is language and judgement work that rules alone do badly.

## 2. Techniques combined (assignment fit)

| Technique | Where | Role |
|---|---|---|
| Transformer LLM, self-hosted | Qwen3-14B Q4_K_M via llama.cpp; bigger model on RTX Pro 6000 | Selects moments, explains them, answers questions |
| Agent with tool calling | `apps/api/app/coach/` | Tool loop over demo data, findings, knowledge, clip recording |
| MCP | `apps/mcp/` (`cs2-demo` server) | Standard interface to the tools; any local MCP client can use them |
| RAG | `apps/api/app/rag/` | Map and tactics knowledge + the player's past findings |
| Fine-tuning (QLoRA) | `ml/finetune/` | Adapts Qwen3-14B to our schema, citations, tool format and three languages |
| Deterministic verifier | `apps/api/app/coach/verify.py` | Rejects claims without valid finding IDs or with wrong numbers |

Guiding rule (decision 2 in [19](../handoff/19-DECISIONS.md)): **code decides what happened; the LLM chooses and explains.** Every number shown comes from code.

## 3. End-to-end flow

```
[1] Upload .dem/.dem.zst
[2] Parse + normalise (existing pipeline)            → Radar for all rounds available
[3] awaiting_player: user picks a player (SteamID)
[4] detecting: detectors run on every round for that player → findings F1..Fn + round stats
[5] selecting: moment-selection agent (LLM) picks 5–6 moments, mixed good/bad,
    each with "picked because [F..]"; verifier checks it; fallback = code ranker
[6] recording: CS:DM worker records one clip per moment, POV = chosen player
[7] explaining: agent writes the Analysis text per moment (cited, in user language)
[8] complete: Studio shows moment rail → stage (clip | radar, one clock) → Analysis / Ask tabs
[9] On demand: user opens any other round → findings already exist → agent explains it
    live; clip recording for that round is queued (radar available immediately)
```

Processing states (extends the replay states in AGENTS.md):
`uploaded → decompressing → decompressed → parsing → normalizing → awaiting_player → detecting → selecting → recording → explaining → complete | failed`.
Radar is usable from `awaiting_player` onwards. `recording` can finish after `explaining`; clips appear when ready (honest processing, decision 15).

## 4. Analysis layer (deterministic)

### 4.1 Extended parse

Add to `parse_demo.py` (all supported by demoparser2):

- Events: `weapon_fire`, `player_hurt`, `player_blind`, `item_purchase`, `bomb_beginplant`, `bomb_begindefuse`, `inferno_startburn`, `smokegrenade_expired`.
- Tick props: `velocity_X`, `velocity_Y`, `pitch`, `balance`, `current_equip_value`, `armor_value`, `has_helmet`, `active_weapon_name`, `inventory`, `flash_duration`.
- Full 64 Hz only in a window of about 3 s before each kill and each shot burst of the chosen player, so detectors like "shot while moving" have resolution without bloating replay blobs.

*As built (T10):* `weapon_fire` carries the shooter's velocity at the shot tick, so shots need no dense window. The 3 s full-rate window is kept before **every kill** (the player is not chosen yet at parse time); tracks are stored for the victim and the killer, plus an inventory/weapon/flash snapshot of everyone on the last tick before the kill. Economy props are read once per round at the end of buy time. All of it goes to `analysis.json`, not the replay blobs.

### 4.2 Map zones

Callout polygons per map in `apps/api/app/maps/zones/de_mirage.json` and `de_anubis.json`. Findings and the LLM say "A ramp", never raw coordinates.

*As built (T11):* polygons are stored in radar pixel space (the 1024 px overview) so they can be drawn and checked over the radar image; `zone_at(map, x, y)` takes world coordinates and converts them. Overlays: `docs/coach/zones/`, redrawn with `python tools/qa/zones_overlay.py <map> <png>`. First draft, no height separation.

### 4.3 Detectors

Each detector is a pure function `(match_data, round, player_id) -> list[Finding]`, with unit tests on real hand-labelled rounds.

| # | Detector | Signal | Kind |
|---|---|---|---|
| D1 | Untraded death | no teammate killed the killer within 5 s; nearest teammate distance | mistake |
| D2 | Shot while moving | `weapon_fire` with horizontal speed above the weapon's accurate threshold | mistake |
| D3 | Died with unused utility | grenades in inventory at death | mistake |
| D4 | Dry peek | death soon after first contact, no own/team flash or smoke near the fight in the previous 3 s | mistake |
| D5 | Team flash / self flash | `player_blind` from self or a teammate, duration > 1 s | mistake |
| D6 | Opening duel | first kill of the round, won or lost, zone | context |
| D7 | Economy mismatch | buy that does not match the team's buy (from `balance`, equip value) | mistake |
| D8 | Late rotation | time from plant / first contact to arrival vs team median | mistake |
| D9 | Repeated death zone | death in the same zone in ≥ 3 rounds of the match | pattern |
| D10 | Good plays | successful trade, entry kill, clutch, multi-kill, flash assist, utility damage | good |

*As built (T14–T15):* thresholds, severity formulas and known false positives are documented at the top of each module in `apps/api/app/analysis/detectors/`. Differences from the table: D4 has no view angles, so "first contact" is the player's first shot or first damage exchanged with the killer; D5 reports flashes **thrown by the player** that blinded teammates or themselves; D8 covers the CT side after a plant only; D10 counts entry kills on the T side only (D6 records every opening duel as context). D2 checks rifles, snipers and pistols only.

### 4.4 Finding contract

Pydantic first, then TypeScript (AGENTS.md sync rule). Replaces the "unknown" `Finding` sketch in [16](../handoff/16-DATA-CONTRACTS.md).

```python
class Finding(CamelModel):
    id: str                   # "F12", unique within a match + player
    detector: str             # "untraded_death"
    kind: Literal["mistake", "good", "context", "pattern"]
    round: int
    t: float                  # round clock seconds, same clock as the replay
    tick: int
    player_id: str            # SteamID64 of the coached player
    other_ids: list[str]      # killer, teammates involved
    zone: str | None          # callout from map zones
    severity: float           # 0..1, code-computed
    evidence: dict[str, float | int | str]   # every number the LLM may quote
    summary: str              # templated English sentence, the no-LLM fallback
    template: str             # summary template key, for the pl/nl fallback (added in T12)
```

Plus `RoundStats` per round (kills, deaths, damage, utility thrown, money, survival, trade stats), computed in code.

## 5. Tools and MCP

Tools are written once as plain Python functions in `apps/api/app/coach/tools.py` (typed arguments, compact JSON results). Two adapters expose them:

1. **MCP server** `apps/mcp/` (official `mcp` Python SDK, stdio and streamable HTTP). The coach agent connects to it as an MCP client. This is the default path and the one presented in the report.
2. **In-process adapter**, used in unit tests and as a fallback if MCP adds too much latency (measured in evaluation).

Because only local models are allowed, MCP's value here is: a standard, inspectable tool boundary between the model and the data; the ability to plug the same tools into other local MCP clients (e.g. LM Studio, Open WebUI) for the demo; and a clean seam for the clip recorder, which runs on a different machine (Windows host with CS2).

| Tool | Returns |
|---|---|
| `list_rounds(match_id)` | round number, winner, score, player's K/D/damage per round |
| `get_round_stats(match_id, round, player_id)` | `RoundStats` |
| `list_findings(match_id, player_id, round?, kind?, detector?)` | findings (id, kind, detector, round, t, zone, severity, summary) |
| `get_finding(finding_id)` | full finding with evidence |
| `get_round_timeline(match_id, round)` | kills, utility, plant/defuse with round-clock times |
| `get_player_state(match_id, round, t)` | positions (as zones), hp, weapon, utility of all players at time t |
| `get_player_history(player_id, detector?)` | per-detector rates across the player's earlier matches |
| `search_knowledge(query, map?, k?)` | RAG passages with IDs `[K7]` and source |
| `select_moments(match_id, player_id, moments[])` | validates and stores the agent's picks |
| `request_clip(match_id, round, t0, t1, player_id)` | queues a CS:DM recording, returns clip job id |

Resources: `match://{id}/overview`. Prompts: `select_moments`, `explain_moment`, `answer_question`.

## 6. Coach agent

### 6.1 Serving

- RTX 5080: `llama-server -m Qwen3-14B-Q4_K_M.gguf --jinja -c 32768 -ctk q8_0 -ctv q8_0 -ngl 99`. Budget: weights ≈ 9 GB; fp16 KV cache for Qwen3-14B is ≈ 160 KB/token, so 32k context ≈ 5 GB (≈ 2.6 GB at q8_0). Fits in 16 GB with headroom.
- RTX Pro 6000: llama.cpp or vLLM with a larger model. Candidates to benchmark when the card is available (pick by the evaluation, not up front): Qwen3-32B, Qwen3-30B-A3B / newer Qwen MoE, and whatever open-weight model is strongest at that point and fits 96 GB.
- One `LLMClient` (OpenAI-compatible chat + tools) chosen by config `RR_LLM_BASE_URL`, `RR_LLM_MODEL`. Swapping 14B → big → fine-tuned is a config change and an evaluation axis.
- Qwen3 thinking mode: **on** for moment selection (one call per match, quality matters), **off** (`/no_think`) for Ask answers (latency matters). Measured both ways in evaluation.

### 6.2 Jobs

1. **Moment selection** (`selecting`). Input: compact table of all findings and round stats for the player (code pre-sorts by severity and keeps the top ~40 candidates to fit context). Output (JSON schema, grammar-constrained by llama.cpp): 5–6 moments `{round, t0, t1, findingIds[], kind, pickedBecause}`, at least 2 good and 2 mistakes when available, no two moments in the same 10 s window. Verifier checks IDs, window bounds and the mix; on failure one repair round, else the code ranker (severity × diversity) decides.
2. **Moment explanation** (`explaining`). Per moment: 2–4 sentences for the Analysis tab, in the user's language, citing `[F..]`, `[t:..]` and `[K..]`, using `get_player_state`, `get_round_timeline`, `search_knowledge`, `get_player_history` as needed. Max 6 tool steps.
3. **Ask** (interactive). Same tools, context line from the Studio (match, round, time, moment, view, findings in view), 1–3 sentence answers. Streams over SSE.
4. **On-demand round.** Same as 2 for a round the user opens; also calls `request_clip`.

### 6.3 Verifier (code)

- Every sentence that states a fact carries at least one citation; every cited `F`, `K`, `m` ID exists and belongs to this match/player.
- Every number in the text matches a value in the cited finding's `evidence` or `RoundStats` (tolerance for rounding and unit formatting).
- Language check (fastText or `lingua`) matches the requested language.
- On failure: one repair attempt with the error list; then fall back to the templated `summary` (translated templates for PL/NL). Failures are logged for the evaluation and as fine-tuning negatives.

### 6.4 Languages

System prompt and tool results stay English; the model answers in `en`, `pl` or `nl`. Callout names stay in English (players use them that way). Templates for fallback text exist in all three languages. Evaluation is per language, with native-speaker ratings for PL and NL.

## 7. RAG

- **Knowledge base:** own notes per map (callouts, default positions and roles per side, common smokes/flashes per site, typical rotations) and general fundamentals (trading, crossfires, counter-strafing, economy rules), plus openly licensed pages (Liquipedia, CC BY-SA, with attribution). Markdown in `data/knowledge/`, chunked by heading, with `map`, `side`, `topic`, `source` metadata.
- **Player memory:** past findings and explanations per player, so the coach can say "third match in a row you died untraded on B apartments".
- **Embeddings:** local model (candidates: `bge-m3`, which is multilingual and matters for PL/NL questions, or `multilingual-e5-large`), served by llama.cpp `--embedding` or sentence-transformers.
- **Store:** SQLite + `sqlite-vec` (no extra service; same DB as the API). Hybrid retrieval: BM25 (SQLite FTS5) + dense, reciprocal-rank fusion, optional reranker (`bge-reranker-v2-m3`) if evaluation shows it helps.

## 8. Clip recording (CS Demo Manager)

Build on the unmerged branch `cursor/csdm-gameplay-video` (worker, `clips.json`, Studio clock sync, stub mode for tests). Changes for this plan:

- Record **per moment** (`t0 − 3 s` to `t1 + 2 s`), not per round, with `--focus-player` = the chosen player.
- Queue order: selected moments first, then on-demand rounds.
- Worker runs on the Windows host with CS2 + CS:DM; Linux Docker keeps stub mode. The worker is reachable as the `request_clip` tool.
- Recording time per clip is measured and reported (it limits how many moments are practical).

## 9. UI changes (Studio)

Within [03](../handoff/03-DESIGN-SYSTEM.md), [04](../handoff/04-ANTI-AI-DESIGN-RULES.md) and [19](../handoff/19-DECISIONS.md):

- **Player picker** after parsing (processing page): list of the 10 players with team and K/D, sentence-case copy, no avatars.
- **Moment rail** of the 5–6 selected moments replaces the "all rounds" list as the primary navigation; an "All rounds" list stays secondary for on-demand analysis. The current all-rounds layout is temporary.
- **Stage:** Gameplay (clip) and Radar on one clock (existing clock + branch work). Radar-only while a clip is still recording.
- **Panel tabs:** **Analysis** (picked-because line, explanation, findings list with seek links) and **Ask** (Coach, [09](../handoff/09-AI-COACH.md) rules). Language switch in settings.
- **Timeline:** Coach lane with finding markers (orange mistake, blue good play, decision 4).

## 10. Fine-tuning

Constraint: no frontier models, so training data comes from our own pipeline.

- **Data generation (self-distillation with rejection sampling):** run Qwen3-14B (thinking on, several samples per input) over findings from the ~100 matches for all three jobs and three languages; keep only outputs that pass the verifier; the two students correct and rate a sample (target ≥ 300 hand-checked examples, ≥ 1,500 verifier-passed total). When the RTX Pro 6000 is available, the larger model becomes the teacher and the process repeats.
- **Tool-calling traces:** successful agent runs (verifier-passed) as multi-turn training examples in Qwen3's chat template.
- **Method:** QLoRA with Unsloth (or PEFT + TRL SFT), rank 16–32, sequence length ≤ 4k. Pilot on the RTX 5080 (Unsloth reports Qwen3-14B QLoRA fits 16 GB at short sequence lengths; verify in the pilot, fall back to Qwen3-8B for the pilot if not). Full runs on the RTX Pro 6000.
- **Export:** merge adapter → GGUF → Q4_K_M so the fine-tuned model runs on the 5080 exactly like the base.
- **Split by match** (train / val / test), never by example, so test matches are unseen.
- Research question for the report: *does a fine-tuned 14B at Q4 close the gap to the bigger model on grounding, moment choice and language quality?*

## 11. Data

- ~100 matches on Mirage and Anubis: own and friends' Premier / FACEIT demos (coached perspective), plus a few HLTV pro demos (reference behaviour, detector sanity checks).
- Demos are not committed. `data/README.md` explains where to get them; a manifest (`data/manifest.csv`: match id, map, source, split) is committed.
- **Labelling (kept small on purpose):**
  - Detectors: ~150 rounds from ~15 matches, each finding marked correct / wrong, plus missed events. Both students label the same 30 rounds to report agreement (Cohen's κ).
  - Moment selection: for ~20 matches both students pick their own top 6; compare with the agent's picks.
  - Question set: ~150 player questions tied to moments (50 per language).

## 12. Evaluation

| What | Metric | How |
|---|---|---|
| Detectors | precision, recall per detector | vs labelled rounds |
| Moment selection | overlap@6 and NDCG vs human picks; good/bad mix; inter-annotator agreement as the ceiling | 20 labelled matches |
| Grounding | valid-citation rate, number-match rate, unsupported-claim rate, fallback rate | verifier over the test set |
| Answer quality | correctness, usefulness, specificity, language quality (1–5) | both students rate a blind sample; local LLM judge from a different model family only as a secondary signal, reported with its agreement with humans |
| Agent | tool-choice accuracy, steps per answer, task success | question set with expected tools |
| RAG | hit@k, MRR; dense vs hybrid vs +reranker | labelled question set |
| Models | all of the above + tokens/s, latency, VRAM | template-only baseline vs Qwen3-14B base vs fine-tuned 14B vs bigger model; thinking on/off |
| Users | usefulness and trust (Likert), "find your mistake" task time | 5–10 players |

One command reproduces the tables: `python -m eval.run --config eval/configs/qwen3-14b-q4.yaml`.

## 13. Timeline

| Dates | Milestone |
|---|---|
| 26 Sep – 4 Oct | Plan, proposal uploaded (**4 Oct**); start collecting demos |
| 5 – 19 Oct | Extended parse, zones, Finding contract, D1–D5, player picker, label first rounds |
| 12 Oct – 2 Nov | Tools + MCP server, llama.cpp setup, moment-selection agent, verifier, explanation job |
| 26 Oct – 14 Nov | RAG v1, Studio moment rail + Analysis/Ask tabs, CS:DM per-moment clips, first eval run |
| 17 Nov | **Intermediary defence** (end-to-end demo on one match, first numbers) |
| 18 – 30 Nov | D6–D10, fine-tuning pilot on 5080 → Pro 6000 if it works, bigger model, PL/NL evaluation, user study |
| 1 – 6 Dec | Final evaluation, report (~3 pages), demo script, reproducibility check; **hand-in 6 Dec** |

## 14. Repo layout this adds

```
apps/api/app/analysis/        extended parse helpers, detectors/, zones, stats
apps/api/app/coach/           llm_client.py, agent.py, tools.py, verify.py, prompts/
apps/api/app/rag/             ingest.py, index.py, retrieve.py
apps/api/app/maps/zones/      de_mirage.json, de_anubis.json
apps/mcp/                     cs2-demo MCP server (wraps coach/tools.py)
ml/finetune/                  dataset builder, Unsloth/TRL scripts, export to GGUF
eval/                         configs/, datasets/, run.py, reports/
data/knowledge/               RAG markdown (committed)
data/labels/                  labels (committed; no raw demos)
```

`compose.yaml` gains an optional `llm` profile (llama.cpp server with GPU) and an `mcp` service.
