# 29 Tabs and feature roadmap

27 September 2026. Owner's ask: "let's plan other tabs we can add and all other functionality". Started as a plan; the tasks in section 6 are now built (see Progress under section 6), and section 9 lists where the code differs from this text.

This builds on, and does not repeat, the [AI Coach plan](../coach/AI-COACH-PLAN.md) and [TASKS](../coach/TASKS.md), the [26 Design polish plan](./26-DESIGN-POLISH-PLAN.md), the [27 Accounts plan](./27-ACCOUNTS-PLAN.md) (A00–A14) and section 4 of [28 Visual direction](./28-VISUAL-DIRECTION.md) (on PR #21). Where one of those already covers an idea, this doc points at its ID instead of redefining it.

## How ideas are ranked

Each idea gets:

- **Value**: how much it helps a player get better at CS2 (High, Medium, Low).
- **When**: the school deadline it should land before: **D** intermediary defence (17 Nov), **S** user study (late Nov), **H** prototype hand-in (6 Dec), **L** later.
- **Story**: which assignment technique it makes visible or stronger: `AGENT`, `RAG`, `MCP`, `FT` (fine-tuning), `EVAL`. An idea with no tag is still worth doing for players, but it earns nothing for the grade.
- **Size**: S ≈ half a day, M ≈ 1–2 days, L ≈ 3–5 days (as in TASKS).

The rules from [19 Decisions](./19-DECISIONS.md) hold throughout: evidence only, no scores (#13), no chatbot (#5), no dashboard cards (#6), self-hosted models only (#16), Mirage and Anubis only.

## 1. Navigation

Today the top bar has Home, and Studio once a match is open. Proposed:

| Place | Tabs | Who sees it |
|---|---|---|
| Top bar | **Home** · **Matches** · **Progress** · **Coach** · (Studio, when a match is open) | everyone |
| Top bar, right | **Lab** · Settings · account menu | Lab: admin only (A13 roles); before accounts, behind `RR_LAB_ENABLED=1` |
| Studio panel | **Analysis** · **Ask** · **Round** · **Notes** | everyone |
| Coach page | **Ask** · **Plan** · **Knowledge** | everyone |
| Lab page | **Runs** · **Labels** · **Evaluation** · **Dataset** · **Study** | admin |

Home, Matches, Studio, Coach and Progress are the five names from Pawel's redesign brief and doc 28. Lab and the extra Studio and Coach tabs are new here. Settings stays a page (A07), not a tab.

## 2. New top-level pages

### 2.1 Coach (cross-match coach) — High · D · `AGENT` `RAG` `MCP`

Doc 28 puts a cross-match ask bar on Home. The Coach page is where it lands and continues.

- **Ask**: questions across all the player's matches ("Why do I keep dying on A ramp on Anubis?"). Same layout rules as the Studio Ask tab ([09](./09-AI-COACH.md)): question in UI type, answer in serif, no bubbles. The agent uses the existing tools plus two new MCP tools: `list_matches(player_id, map?)` and `find_moments(player_id, detector?, zone?, map?)`. Every answer cites findings as `[M2:F3]` (M1, M2, … are the player's analysed matches, oldest first, as `list_matches` numbers them), and a citation opens that match in the Studio at that finding.
- **Plan**: a practice plan written by the agent from `get_player_history` and the drills in `data/knowledge/general/practice.md`. Three items at most, each with the evidence ("dry peek in 4 of your last 6 matches") and a drill with its `[K..]` source. The player ticks a drill off; the next plan notes whether that detector's rate moved. This is the "what should I do next" the wrap-up already gives for one match, carried across matches.
- **Knowledge**: see 2.3.

Why it matters for the grade: it is the one place where the agent has to plan several tool calls across matches and combine them with retrieval, which is exactly what "agent + MCP + RAG" should show. Needs A04 (history scoped per user) only once accounts exist; before that it runs over every match on the PC.

Size: M for Ask (new tools, endpoint, page), M for Plan (new `practice_plan.v1` job, verifier rules, tick-off table).

### 2.2 Lab (evaluation and data workbench) — Medium for players, **High for the grade** · D (Runs), S (Labels), H (Evaluation, Dataset) · `EVAL` `FT` `AGENT`

The school project needs labelled rounds (T17), human moment picks (T62), a reviewed fine-tuning set (T51), model comparisons (T61, `eval/compare_models.py`) and study exports (A13). Today those are scripts. One admin page makes them faster to do and easy to show at the defence.

| Tab | What it does | Replaces or feeds |
|---|---|---|
| **Runs** | Every agent run: job, model, language, steps, tool calls with arguments, retrieved passages, verifier result, time, tokens/s. Filters by job and "fell back to template". Opens the JSONL trace from `data/traces/` as a readable list. | Polish item 4 (the per-explanation disclosure links here); debugging the known wrap-up bug where tool calls leak as text |
| **Labels** | Detector labelling in the Studio layout: each finding with its clip and radar, marked Correct / Wrong, plus "Add missed event" at the playhead. A second mode: pick your own top 6 moments for a match without seeing the agent's. Cohen's κ on the shared 30 rounds computed on the page. | T17 `eval/label_tool.py`, T62 |
| **Evaluation** | Runs `python -m eval.run --config …` in the background and shows the tables from plan §12; side-by-side model comparison (Qwen3-14B, Gemma 4 12B, fine-tuned, template baseline) on the same moments, with a blind A/B rating mode for the two students. | T61, `eval/compare_models.py`, MODEL-OPTIONS |
| **Dataset** | Verifier-passed examples from rejection sampling, one at a time: Accept, Edit, Reject, with counts per job and language against the ≥ 300 target. Exports the reviewed set. | T50, T51 |
| **Study** | Participants, consent, their feedback and Ask logs, CSV export (pseudonymous). | A13 (the admin page lives here instead of `/admin`) |

Size: Runs M, Labels L, Evaluation M, Dataset M, Study is A13.

### 2.3 Knowledge (inside Coach) — Medium · H · `RAG`

A browsable view of `data/knowledge/`: pick Mirage or Anubis, click a zone on the radar (zones from `app/maps/zones/`) and read the passages for that callout, with the source (own notes or Liquipedia) and "cited in 7 explanations". A "Flag as wrong" action records passages that failed the in-game check T30 still needs. Admins can add a note, which re-indexes (`python -m app.rag.index`). Notes go to `data/knowledge/notes/<map>.md`, which sorts after every other folder, so existing `[K..]` ids do not move.

It shows graders what the retriever searches over and lets the pair fix the knowledge base without editing Markdown. Size M.

### 2.4 Matches, Progress, Settings — already planned

- **Matches**: A08 plus doc 28's dense table with the scorebug per row. Add one column here: the model that wrote the review, with **Re-run the coach** (already an A08 row action) offering a model choice, so a match can be re-reviewed after fine-tuning. `EVAL` `FT`.
- **Progress**: A11 and doc 28 (dots per match, per detector, good plays included). Add a per-map **Zones** list: the callouts where the player died most across matches, as a ranked list with counts and links, not a heatmap (polish plan "What not to add").
- **Settings**: A07. Add a **System** section (see 4.1) and a **Connect another app** section (see 4.2).

## 3. New Studio panel tabs

### 3.1 Round — Medium · D · no tag

The facts of the round the playhead is in, straight from `RoundStats` and the parse, no LLM: duels (who, where, won or lost, time to damage), utility thrown with where it landed, damage dealt and taken, the buy against the team's buy (D7's inputs). Each row seeks the clock and draws on the radar. It answers "what actually happened" before the coach says why, and it is the tab players open when they disagree with the coach. Size M.

### 3.2 Notes — Medium · S · `EVAL`

Bookmarks and notes on a time in a round (A10's bookmarks), listed per match. A note has an **Ask about this** action that sends the time window to the coach as an on-demand moment (the on-demand round path from T26, narrowed to a window). Notes the player added are also a signal of moments the agent missed, which goes into moment-selection evaluation (T62). Size S on top of A10.

### 3.3 Not new tabs, but next to them

- **How this was written** under each explanation (polish item 4): a disclosure, not a tab. Links to the run in Lab, Runs.
- **Feedback** on explanations and answers (polish item 4, A10): "Useful" / "Not right" plus a note. Feeds the Lab.
- **Clip download**: the moment's MP4 with the shared label in the file name. Size S.

## 4. Other functionality

### 4.1 System status — High (practical) · D · `MCP`

A line in the top bar only when something is wrong, and a **System** section in Settings: llama-server reachable, which model it is serving (from `/v1/models`) against `RR_LLM_MODEL`, the MCP server's tool list, CS Demo Manager and Steam reachable, csdm-postgres up, GPU queue length. This would have caught the old Qwen server on port 8080 and the `.env` read only at start-up. Size S.

### 4.2 Connect another app over MCP — Medium · H · `MCP`

Settings, Connect another app: the command and URL to add the `cs2-demo` MCP server to LM Studio or Open WebUI (both local, so decision 16 holds), plus a read-only token when auth is on. The plan already names this as MCP's value (§5); a page and a two-minute demo make it visible. Size S.

### 4.3 Sample match — High · D · no tag

Polish item 7: a real sample match with radar data and pre-recorded clips, so the defence demo never depends on a live upload, CS2 running or the GPU being free. Listed again because the defence depends on it. Size M.

### 4.4 Fix before adding anything — High · D · `AGENT`

The wrap-up sometimes contains tool calls as text (`search_knowledge "practice drill dry peek"`) and the verifier passes it. Add a verifier rule that rejects tool-call syntax and tool names in prose, and a test with the leaked sample. Size S.

### 4.5 Coached-player comparison with themselves — Medium · H · `AGENT`

On a moment, "Show a round where you did this well": the agent finds a D10 good play in the same zone or situation from the player's own matches (`find_moments`) and opens it beside the mistake. Their own play is the reference, so no pro database is needed. Size M, after 2.1's tools.

### 4.6 Review notifications — Low · L

A browser notification when the review is ready, while the processing tab is in the background; the page offers "Tell me when the review is ready" and, once allowed, says it is safe to switch tabs. The app runs on one PC. Size S.

## 5. Considered and left out

| Idea | Why not |
|---|---|
| A single player rating or "aim score" | Invented number; decision 13 and polish plan |
| Death heatmaps, pro comparisons, team scouting | Need many matches or a pro database, pull focus from one player; polish plan "What not to add" |
| A general chat tab | Decision 5; the Coach Ask stays grounded and cited |
| Automatic FACEIT or Steam import | Decision 24 |
| More maps | Owner has not asked |
| Hosted LLM for judging or data | Decision 16 |

## 6. Tasks

Same format as [TASKS](../coach/TASKS.md). Pawel assigns them.

| ID | Task | Depends | Paths | Done when | Size | When | Story |
|---|---|---|---|---|---|---|---|
| R00 | Verifier rejects tool-call text in prose; test with the leaked wrap-up | – | `coach/verify.py`, tests | leaked sample fails and falls back | S | D | AGENT |
| R01 | System status: `GET /system`, Settings section, top-bar warning | – | routes, `app/settings/` | wrong model on 8080 shows a warning | S | D | MCP |
| R02 | Top bar with Home, Matches, Progress, Coach and Lab (flagged) | #21 | `components/NavLinks.tsx`, layout | links and empty pages in the doc 28 system | S | D | – |
| R03 | Lab, Runs: trace list and viewer from `data/traces/` | R02 | `app/lab/` (Runs tab), `api/lab.py`, `services/traces.py` | a real run shows tools, passages, verifier | M | D | AGENT EVAL |
| R04 | Studio Round tab from `RoundStats` and events | – | `components/review/RoundPanel.tsx` | each row seeks and draws on the radar | M | D | – |
| R05 | MCP tools `list_matches`, `find_moments`; cross-match Ask endpoint | A04 or none before auth | `coach/tools.py`, `mcp_server.py`, routes | tool tests; inspector lists them; citations open the right match | M | D | AGENT MCP RAG |
| R06 | Coach page, Ask tab | R02 R05 | `app/coach/` | answers cite across matches in en/pl/nl | M | D | AGENT |
| R07 | Lab, Labels: finding labelling and blind moment picks, κ | R02 | `components/lab/LabelsTab.tsx`, `services/labels.py`, `data/labels/` | T17 format written; κ shown | L | S | EVAL |
| R08 | Studio Notes tab and "Ask about this" window | A10 | `components/review/NotesPanel.tsx`, `api/roadmap.py` | a note's window gets an explanation | S | S | EVAL |
| R09 | Coach page, Plan tab: `practice_plan.v1` job, tick-off | R06 | `coach/plan.py`, `coach/jobs.py`, `components/coach/PlanTab.tsx` | plan cites history and drills; verifier passes | M | S | AGENT RAG |
| R10 | Lab, Evaluation: run configs, tables, blind A/B rating | R02 T61 | `components/lab/EvalTab.tsx`, `services/evaluation.py`, `eval/results/` | Qwen vs Gemma table on the page | M | H | EVAL FT |
| R11 | Lab, Dataset: review UI for T51 | T50 | `components/lab/DatasetTab.tsx`, `services/dataset.py`, `ml/finetune/build_dataset.py` | 300 reviewed examples exported | M | H | FT |
| R12 | Knowledge tab with zone picker and flagging | R02 | `components/coach/KnowledgeTab.tsx`, `services/knowledge.py` | zone click lists its passages and sources | M | H | RAG |
| R13 | Re-run the coach with a chosen model; model column in Matches | A08 | `app/matches/`, `POST /matches/{id}/rerun` | same match reviewed by two models, both kept | S | H | EVAL FT |
| R14 | Connect another app over MCP | – | `app/settings/`, `apps/mcp/README.md` | Open WebUI or LM Studio calls a tool | S | H | MCP |
| R15 | "Show a round where you did this well" | R05 | `components/review/DoneWell.tsx`, `GET …/findings/{id}/done-well` | links a D10 moment in the same zone | M | H | AGENT |
| R16 | Clip download | – | `routes.py` (`?download=1`), `PovClip.tsx` | MP4 downloads with the moment label | S | H | – |
| R17 | Progress, Zones list per map | A11 | `app/progress/` | list with counts links to moments | S | H | – |
| R18 | Review-ready notification | – | `lib/notify.ts`, processing page | fires once per match | S | L | – |

### Progress

- **27 Sep 2026, first batch:** R00, R01, R02 (without Matches and Progress, which arrive with A08 and A11), R03 and R05/R06 (the Coach page's Ask tab) are built. The top bar has Home, Coach, Lab (only with `RR_LAB_ENABLED`), a Settings link and a setup warning that shows only when a check fails. Settings has the System section only. A Coach citation such as `[M2:F3]` opens `/studio/<match>?f=F3`, which lands on the moment holding that finding, or on its round. API additions for the pages: `GET /players` (coached players) and `GET /features` (`{lab}`).
- **27 Sep 2026, second batch:** R04, R07 to R18 are built, and Matches and Progress join the top bar before accounts: they list every match on the PC and one coached player's matches, the same way the Coach page does. New routes live in `apps/api/app/api/roadmap.py`; the stores for notes, plans, reviews, passage flags, A/B votes and kept reviews share `matches.db` (`repositories/extras.py`). The wrap-up prompt is now `review_wrapup.v2`, without the literal `search_knowledge` example that caused the leak R00 guards against. What still differs from this doc is in section 9.

## 7. Suggested order

| Before | Tasks | Why |
|---|---|---|
| 4 Oct (proposal) | none to build; mention the Coach page and the Lab in the proposal's plan | Graders see the techniques mapped to screens early |
| 17 Nov (defence) | R00, R01, sample match (4.3), R02, R03, R05, R06, then R04, alongside A00–A08 | A demo that shows the agent working across matches, the trace behind it, and a stable setup |
| User study | R07, R08, R09, with A09, A10, A13 | Labels and study data come out of the app |
| 6 Dec (hand-in) | R10–R17, with A11, A12 | Evaluation and fine-tuning results visible in the app |
| Later | R18, A14 | |

R02 depends on PR #21, since the new pages should use the Tactical Desk system from the start. Everything under `apps/web` waits for the thread that owns it, or for Pawel to hand it over.

## 8. Decisions (owner, 27 September 2026)

1. **The Lab is built in the app** ([19](./19-DECISIONS.md) #25).
2. **The Coach gets its own page** (#26).
3. **The Round tab comes after the Coach page** (#27), so R04 moves after R05 and R06 in the defence batch.

## 9. Sanity check (27 September 2026)

Every claim above, checked against the code on this branch. Only the ones that do not hold as written are listed; everything else is built as described.

| Section | Claim | State | Why, and what would close it |
|---|---|---|---|
| 1 | Lab and an account menu sit at the right of the top bar | Lab sits in the main nav, no account menu | Accounts (A00–A07) are not built; Lab moves right with the account menu |
| 1, 2.2 | Lab has a **Study** tab | Not built | Needs participants and consent from A13, which needs accounts |
| 2.1 | "The next plan notes whether that detector's rate moved" | Partly | Each item shows the rate per 10 rounds in the last 3 matches against the matches before, once there are more than 3; it is not measured from the day a drill was ticked |
| 2.2 Runs | Runs shows tokens per second | Not shown | The llama-server usage is in each trace (`usage`) but the table shows time only |
| 2.2 Labels | Labelling "in the Studio layout", each finding with its clip and radar; missed events "at the playhead" | Partly | The tab lists the round's findings with a link that opens the round in the Studio; a missed event is typed in round-clock seconds |
| 2.2 Evaluation | "Runs `python -m eval.run --config …` in the background"; a template baseline column | Not built | `eval.run` does not exist yet (T60). The tab counts every model's runs from the traces instead, shows `eval/results/*.json` from `compare_models`, and has the blind A/B vote. Template-only runs are left out of the table |
| 2.2 Dataset | Examples come "from rejection sampling" | Partly | The tab reviews runs that passed the verifier on the first try in normal use; the sampling loop that makes several candidates per prompt (T50) is not built. An edit may not add citations or numbers the verified text did not have |
| 2.4 Matches | A scorebug per row; Re-run offers a model choice | Partly | Rows show map and score as text. A re-run uses the model llama-server serves now (one fits on the GPU), so the choice is made by restarting llama-server; the earlier review is kept but only counted in the table, not viewable yet |
| 3.1 Round | Duels with where and time to damage, where utility landed, damage taken, the buy against the team's | Partly | The tab shows the round's `RoundStats`, each duel (who, won or lost, time), each grenade thrown and the D7 buy finding. `RoundStats` has no damage taken, and zones and landing spots are not on the replay events yet |
| 3.3 | "How this was written" links to the run | Partly | The link under an explanation opens Lab, Runs filtered to that match's explanations, not the single run |
| 3.3 | Feedback, "Useful" / "Not right" | Not built | Polish item 4 and A10; it needs somewhere per user to store votes |
| 4.1 | System checks Steam, csdm-postgres and the GPU queue | Partly | The CS Demo Manager check finds the binary and says Steam and csdm-postgres must be running; it does not probe them, and there is no GPU queue to measure |
| 4.2 | A read-only token when auth is on | Not built | No auth yet. The server listens on 127.0.0.1 only, and two tools write (`select_moments`, `request_clip`); the Settings section says so |
| 4.3 | Sample match with radar and pre-recorded clips | Not built | Needs a real demo and CS2 on Pawel's PC; cannot be made in a cloud session |
| 4.5 | "Same zone **or situation**" | Zone only | Good plays of the same player in the same callout on the same map, from any match, best first |

"Done when" conditions that need Pawel's PC and the real model, since a cloud session has neither a GPU nor CS2: R06 and R09 answering in en/pl/nl through the verifier with Qwen3-14B or Gemma, R10's Qwen against Gemma table, R11's 300 reviewed examples, R14 with LM Studio or Open WebUI calling a tool, and R16 on a recorded MP4. The tests cover each with the mock model and synthetic match.
