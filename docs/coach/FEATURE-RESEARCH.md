# Feature research: CS2 tools, other games and sports

29 October 2026. A wide sweep of what competitors and neighbouring products do, filtered for a **single-player, self-hosted, verifier-grounded** coach on Ancient/Anubis. Companion documents:
- [COMPETITOR-CS2CAM](COMPETITOR-CS2CAM.md): the cs2.cam teardown
- [FINE-TUNING-DATA](FINE-TUNING-DATA.md): the training-data question
- [DESIGN-REFERENCES](../planning/DESIGN-REFERENCES.md): the visual reference board

Sources are vendor pages, blogs and reviews read on 29 Oct 2026; nothing was tested hands-on. Some vendor pages blocked automated reading (Mobalytics, STRATZ, WHOOP, csstats, CS2Lens, Noesis pricing); for those the details come from search summaries and reviews.

> **Heads-up:** `github.com/PawelZlotkowski/cs2-demos` is **public**. Searching "CS2 AI coach" returns its PRs, which describe the Qwen3-14B, verifier and 5–6 moment design. If that isn't intended, consider making it private before invited users arrive.

## 1. Landscape in one table

| Product | Kind | LLM? | What matters for us |
|---|---|---|---|
| **cs2demo.gg** | Viewer, stats and LLM coach | Yes (hosted Claude, credits) | **Closest commercial rival.** Mistakes ranked by **win-probability cost** ("−58%"); win-probability ribbon; fog-of-war replay; Practice Deaths (console lines that recreate a death); daily decision puzzle; monthly AI report |
| **PureSkill.gg** | Mistake detector | ML? | 30+ graded checks (economy 12, grenades 8, shooting 6, teamwork 4, movement 3); "fix first" list; rank-up guarantee |
| **UpForge** | AI debrief plus human coaches | Yes | **One priority fix, checked again in the next demo**; debrief history can be handed to a human coach |
| **CSReplays** | AI coach | Yes | **Cross-round callbacks** ("same angle you died to three rounds ago"); utility named from a lineup catalogue |
| **PlayFix** / **CS2Coach** / **Callup** | AI report cards | Yes | "What went well" first; Top 3; "Do this first"; homework assignment; "Model estimate" badges on inferred scores |
| **Leetify** | Largest stats platform | No (win-rate tables) | Rating from round-win change; **benchmark against a chosen rank**; personal highlight threshold; personal-best cards |
| **Scope.gg** | Stats plus server clips | No | **Mistake clips** as the premium product; previous 15 vs last 15 matches; Discord "ready" pings |
| **Refrag** | Training servers plus Coach | No | Current vs target table, where flagged rows build a training routine; Sessions tab shows whether training moved the stat; copy a throw from the replay |
| **FACEIT Match Insights** | In-matchroom analysis | ML? | **Swing graph** under the kill feed |
| **Noesis**, **Skybox EDGE**, **RoundIQ** | Analyst suites | No | Round-set overlay; buy-type filter everywhere; 3D replay |
| **CS Demo Manager** | Our clip engine | No | v3.20.1; multi-sequence capture; focus camera per sequence |
| **cs2_analyst** (OSS) | MCP coach | Yes | **Atomic claims**: facts are checked by a deterministic verifier, interpretations by a judge; failures shown under **"did not hold up"**; XGBoost win-probability model with SHAP |
| **CS2-coach-agent** (OSS) | LangGraph coach | Yes | Citation scopes `[C#]` (this match), `[E#]` (history), `[G#]` (guides); denominators shown; missing data labelled, never counted as zero |
| **Mobalytics** (LoL) | Skill index | No | 8-skill shape against rank; **Challenges: meet the goal in 3 of your next 5 games**; Smart Highlights (5 best and worst) |
| **STRATZ** (Dota) | Analytics | ML | IMP win-probability contribution; **what-if simulation** sliders |
| **Dota Plus** | In-client | ML | **Death Summary**: a strip of every damage, stun and disable in the seconds before death |
| **iTero** (LoL) | AI coach | ML | Exactly **Top 3** things to improve, each with a percentile |
| **LoLCoach** (LoL, OSS) | Local LLM coach | Yes, **local** (Qwen2.5-7B + LoRA + FAISS) | Proof that our self-hosted architecture is viable and competitive |
| **Hudl Assist / Sportscode** | Sports video | ML plus human | **Every number is a play button**; user fixes tags or escalates to an expert; edits flow into reports |
| **StatsBomb** | Football data | Human plus CV | Radars bounded by the 5th/95th percentile per position; two collectors cross-checked |
| **Strava Athlete Intelligence** | Generative summary | Yes | 2-line summary plus "Say more"; **stays silent on metrics it can't judge**; 4-level feedback |
| **WHOOP Coach** | LLM coach | Yes | Visible, editable memory; real traffic turned into evaluation datasets |
| **Arccos / SwingVision** | Golf / tennis | ML | **Under-a-minute correction pass** after the round, and the corrections feed the AI; "challenge the call" replay |

## 2. Everything worth adding

Priority: **Now** fits the current milestone (before invited users, 6 Dec); **Next** is after the first invited users; **Later** is v2; **Out** is outside scope. LLM: whether the feature needs the model (it never produces the numbers).

### A. Measurement (deterministic, makes everything else better)
| # | Feature | Seen in | LLM | Priority |
|---|---|---|---|---|
| A1 | **Round win-probability model and ΔWP per kill/death/plant** for the selected player | cs2demo.gg, Leetify, STRATZ, FACEIT, Blitz, cs2_analyst | No | **Now** |
| A2 | Death recap strip (last ~5 s: who saw whom first, flashes, damage taken, nearest teammate, trade window) | Dota Plus, cs2demo.gg | No | Now |
| A3 | Personal baseline on every stat (this match vs your last-10 median vs reference band) | Catapult, Leetify, Valorant, The Outsiders | No | Now |
| A4 | New detectors from PureSkill's list that we lack: died reloading or holding a grenade, bad armour/kit buy, missed drop, wasted save, counter-strafe failure, first-shot accuracy | PureSkill, Scope, cs2demo.gg | No | Next |
| A5 | Fog-of-war view: the round as the player knew it (only enemies spotted by the team) | cs2demo.gg | No | Next |
| A6 | Utility named against a lineup catalogue for Ancient/Anubis ("Xbox smoke, 2 m short") | CSReplays, cs2demo.gg | No (RAG data) | Next |
| A7 | Role per round (entry, support, anchor, lurk, AWP), map-specific | Skybox, Macena, cs2.cam | No | Next |
| A8 | Skill shape (6–8 spokes per role, percentile-bounded), shown only after N matches | Mobalytics, StatsBomb, Leetify | No | Later |
| A9 | Impact sparkline per round with shape labels ("strong start, faded after R12") | OP.GG | No | Later |

### B. Coach output (LLM, grounded)
| # | Feature | Seen in | LLM | Priority |
|---|---|---|---|---|
| B1 | **Moment selection ranked by ΔWP × detector severity**, with a mix of mistakes and good plays and a "why this moment" line | Mobalytics, cs2demo.gg | Yes | **Now** (needs A1) |
| B2 | **At most 3 themes per match** ("untraded entries ×4: R3, R7, R14, R19"); everything else behind "All findings" | iTero, Insights.gg, PlayFix | Yes | Now |
| B3 | **"What went well" first**, then the fixes | PlayFix, Leetify Top Stats | Yes | Now |
| B4 | **"Did not hold up"**: claims the verifier rejected, visible rather than silently dropped | cs2_analyst | No (UI) | Now |
| B5 | Every number and ID in the text is a link that seeks the clock (3 s before, with hover preview) | Hudl, Wyscout, cs2demo.gg | No (UI) | Now |
| B6 | Cross-round callbacks inside an explanation ("same B-main angle as R6") | CSReplays | Yes (cites both findings) | Next |
| B7 | Two-line summary, "Say more", and a rule that summaries which only restate the scoreboard are rejected | Strava, Garmin (as the anti-pattern) | Yes | Next |
| B8 | What-if tool: "if you'd been traded / waited for the flash" re-evaluates ΔWP with one variable changed; shows the base rate and an implausibility warning | STRATZ | Optional (calls a tool) | Later |
| B9 | Visible, editable coach context ("what the coach knows": player, role, focus, language, current goal) | WHOOP, Strava Focus | Yes (consumes it) | Next |
| B10 | Natural language → situation search ("my untraded deaths at A main as CT") | Sportscode matrix, Wyscout, cs2.cam | Yes (writes the query) | Later |

### C. Progress loop (makes it a coach, not a report)
| # | Feature | Seen in | LLM | Priority |
|---|---|---|---|---|
| C1 | **One priority fix carried into the next upload**, measured by detectors ("traded within 3 s on ≥ 60% of deaths, in 3 of your next 5 matches") | UpForge, Mobalytics, Dota Plus, CS2Coach | Suggests only | Next |
| C2 | Period vs period comparison (previous 10 vs last 10) and trend with a typical-range band | Scope, Leetify, WHOOP | No | Next |
| C3 | Personal-best and record cards | Leetify, Scope, Valorant, OpenDota | No | Later |
| C4 | Monthly progress report built from `cross_match_findings` | cs2demo.gg | Yes | Later |
| C5 | Practice Deaths: a `setpos`/`setang` + bot config per moment to replay the duel offline | cs2demo.gg, Aim Lab, Refrag | No | Next |
| C6 | Daily decision puzzle from your own rounds (fog-of-war, "what do you do?") | cs2demo.gg | No | Later |

### D. Feedback, trust and data (doubles as fine-tuning data)
| # | Feature | Seen in | LLM | Priority |
|---|---|---|---|---|
| D1 | Per-finding verdict for the *user* (Correct / Wrong / Wrong type plus a reason chip); flows into the Lab queue | Hudl, Arccos, SwingVision | No | Now |
| D2 | 4-level rating on each explanation or answer (very helpful / somewhat / unhelpful / wrong) | Strava, Runna | No | Now |
| D3 | Under-a-minute edit pass over the 5–6 moments: delete, reclassify, "add a moment I care about" | Arccos, Golfshot | No | Next |
| D4 | "Model estimate" badge on anything inferred (role, win probability) | CS2Coach | No | Now |
| D5 | Report-ready notification (e-mail or Discord) since clips arrive asynchronously | Scope, CSReplays, Hudl | No | Next |
| D6 | Share link to the 5–6 moments ("send to a mate / coach") | cs2demo.gg, Scope, CSReplays | No | Later |
| D7 | Hand-off of the review to a human coach | UpForge, PlayFix | No | Out (for now) |

### E. Out of scope for the delivery
Team playbooks, veto simulation, strategy boards, 3D replay, live in-game coaching, VOD vision analysis, pro-data ingest, aim-training servers, montage editors, scouting marketplaces.

## 3. The one to build next: **A1 + B1, round win probability and ΔWP-ranked moments**

Why this one:
- **Both research passes ranked it first, independently.** It's also the main thing the closest rival (cs2demo.gg) leads with.
- **It's deterministic and checkable.** ΔWP is a number in a finding, so the LLM can cite it and the verifier can check it. It gives moment selection an objective key instead of the model's taste.
- **It unlocks many other items in the backlog:** the death recap (A2), themes ordered by cost (B2), what-if (B8), the priority fix (C1), the impact sparkline (A9) and the timeline swing lane.
- **It fits the hardware and the rules.** It's a small tabular model (logistic regression or gradient boosting) trained in minutes on CPU, with no hosted service.

Sketch:
1. **Snapshots.** Every 1 s of each round, and right after each kill, plant and defuse, record: alive CT/T, equipment value CT/T, health and armour totals, time left, bomb planted, time since plant, plant site, map, and kit count. The label is the round winner.
2. **Data.** Our ~100 matches plus a set of public HLTV Ancient/Anubis demos. Pro demos are allowed for reference behaviour, and only derived features are stored. Split by match.
3. **Model.** Start with logistic regression, then try LightGBM; per map or with a map feature. Report Brier score and a reliability plot in `eval/`; the model must be calibrated, not just accurate.
4. **Attribution.** ΔWP = WP after − WP before an event. Credit the killer +, the victim −. A trade splits the credit. Store it as a `Finding.wp_delta` and in `RoundStats`.
5. **Use.** The ranker sorts moments by |ΔWP| × severity with a diversity rule. Tools gain `get_win_probability(match, round, tick)`. The UI shows a WP ribbon on the timeline and "−18% round win" on each moment chip with a "Model estimate" badge.
6. **Tests.** Monotonic sanity checks (losing a player never raises your side's WP; planting raises T WP), a calibration threshold, and golden snapshots on the sample Anubis demo.

Runner-up if you'd rather start with the coaching loop: **C1, one priority fix carried into the next upload.** It's cheaper, needs no new model, and makes the product feel like a coach. It's more convincing once ΔWP exists, though, because the goal can then be expressed as rounds won back.
