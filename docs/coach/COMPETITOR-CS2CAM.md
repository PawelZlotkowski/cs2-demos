# cs2.cam teardown and what Round Reviewer can borrow

Researched 29 October 2026 from public pages only: the landing page, the wiki and the translation bundle that every page ships. No account, no paid features, no private API calls. Treat it as a snapshot; the product changes quickly.

## How the teardown was done

- **Front end:** Next.js App Router, built with Turbopack, served from `cs2.cam`. The canonical links point at `euapi.cs2.cam`, so the same app is also served from an EU API host.
- **The inventory source:** every page embeds the app's full `next-intl` message bundle (71 namespaces, about 8,400 strings) in the React Server Components payload. It holds every screen, button, tooltip, error and empty state of the logged-in app, so it maps the product more reliably than the marketing copy does. Namespace names below (`chat`, `mcp`, …) come from that bundle.
- **Third parties seen:** Paddle (billing), Google Analytics plus a self-hosted analytics script at `analytics.cs2.cam`, Discord for support, and a Windows desktop installer (`instaladores.cs2.cam/cs2cam_full.exe`).
- **LLM provider:** one error string reads *"The AI chat is not configured on this server (missing DEEPSEEK_API_KEY)"*, so the AI Studio chat calls DeepSeek's hosted API. Internal keys such as `ultimas-pistolas` and `Finalización` suggest a Spanish-speaking team.
- **Data:** about 10,000 HLTV matches pre-processed, plus FACEIT, ESEA and GamersClub ingest and private uploads. They mention ML models for role/position detection and for estimating which site a round was heading to.

## Full feature inventory

### 1. Demo library and viewer
| Feature | What it does |
|---|---|
| Demo list / match browser | Browse HLTV matches by team, event and date, with veto info and match stats |
| 2D viewer | Top-down, tick-accurate playback with HUD, utility effects, copy-positions and a toolbox that launches the other modules |
| 3D replay | Toggle into 3D without losing filters, round, playback position or drawings (paid) |
| Playback controls | Speed, round skip, timeline |
| Paint tools | Strokes, shapes and lineup arrows, drawn live or while paused |
| Notes | Timestamped notes with @mentions; the mentioned teammate is notified and jumps to the round |
| Reaction time (closed beta) | Measure players' reaction times in chosen situations, with categories you define and per-player stats |
| VOD viewer | Link a YouTube video and draw or take notes over it |
| Repair demo | Injects missing round events into HLTV/ESL GOTV demos that show "Round 0" in the CS2 player |
| Render studio | Renders one player's multi-round overlay to ProRes 4444 video with a transparent background (broadcast, SimpleRadar or custom radar) |

### 2. Analysis tools
| Feature | What it does |
|---|---|
| Filters | Team, map, period, side, outcome, buy vs buy, bomb, weapons, man count. All filters combine into a single query, and you can pool a whole HLTV tier |
| Multi-round | Overlay every filtered round at once and carve out an area |
| Heatmaps | Per player, per side, across rounds |
| Grenade mode | Every grenade in the filtered rounds, pattern search, lineups, opponents' counter-utility |
| Similar rounds | Drag player and utility tokens onto the map to describe a situation, then search the index. Supports AND / OR / NOT / EVER / NEVER, rival tokens, before/after time windows, tolerance radius, C4, AWP or scoped, boosts, post-plant, buy and outcome. *Auto* builds the query from the current frame |
| Pathings | Draw a zone and the routes players take to reach it are clustered (the final stretch weighs more), with average arrival time and win rate. Templates can be saved |
| Match stats | Rating, ADR, KAST, entries, trades, clutches, eco-frag share, kills per round against full-buy vs eco opponents |
| Players | Search players across official matches and your practices, unified by SteamID; role/map/weapon splits, rating adjusted for equipment value |
| Team stats | Maps, matches, roster, veto patterns, and official vs training comparison |

### 3. Anti-strat suite (pro teams)
| Feature | What it does |
|---|---|
| Pre-match analysis | One screen per opponent/map/side/period |
| Playbook | Auto-detected defaults, executes, fakes and utility setups for every official team and map, with the rounds attached. Plays can be combined with + / − filters; there is an opponent view, a confidence slider and "estimated site" for rounds that never reached a site |
| Timing heatmap | Each play broken down by round clock (early, mid, late) |
| Veto analysis (beta) | BO1/3/5 veto simulation from historical preferences, a live decision tree, and an all-scenarios table with confidence |
| Routines | Saved filter sets that rerun before each match and return rounds grouped by element; can be cloned per map |
| Economy analysis | Buy-matchup loss matrix, pistol conversion, round-2 buy, re-force pattern, AWP in R3 after a pistol loss, force-buy tempo |
| Economy rankings | Ranks HLTV teams by how often they lose a given buy matchup |

### 4. Team workspace
| Feature | What it does |
|---|---|
| Private demos | Upload batches with POV/GOTV auto-detection. Uploads are shared with the team, tags propagate by roster, and uploads get the same stats and ML role detection as pro demos |
| FACEIT / GamersClub | Account linking and match import |
| Voice comms sync | Upload TeamSpeak/Craig audio. The first 5 minutes are transcribed by AI, and you align by clicking a subtitle at the matching demo moment (key K). Manual waveform and YouTube sync are also available |
| Create playbook | Wizard (top 10–50 teams, period, side, map, round type) that returns plays grouped by economy (pistol, second round, eco, force, first force, full buy), with live win rates and the rounds behind each one |
| Private playbook | The team's library. Strategy, protocol and setup formats; named playbooks per map/side/opponent; attachments (2D round, board play, YouTube/Twitch/Medal, cloud recording); utility auto-filled from the linked demo round; a per-player view; export to XLSX/PDF/text and Google Sheets sync |
| Strategic board | Multi-step tactical planner (setup → smokes → entry → post-plant), import any 2D frame as step 1, tactics saved per team |
| Playlists | Star a round from the viewer to save it; folders, sequential playback, temporary public share links |
| Teams | Up to 7 players, roles, join links |

### 5. Recording
| Feature | What it does |
|---|---|
| Record round | Server-side, all players of a round, with a weekly team quota. Results go to *My videos* |
| Record POV | One player across a match or series; needs the desktop app, which drives CS2 and a pre-configured portable OBS |
| Death analysis | The N seconds before each death, from the victim's camera, the killer's or both. *Automatic recording* follows up to 5 players and analyses every new demo |
| Team recording (beta) | All five practice POVs recorded in sync, from the browser or desktop, streamed live |

### 6. AI features (the part relevant to the coach)
| Feature (namespace) | How it works |
|---|---|
| **AI Studio chat** (`chat`) | Team-scoped conversations about any team or player. Shows "Consulted {tool}" chips and a usage line (`{calls} tool calls · {tokens} tokens · ≈ US${cost}`). **An answer that consulted no tool is thrown away** ("The AI tried to answer without looking the data up"). Has @team mentions, a per-turn tool-call limit, and a "pick one option" step when a name is ambiguous. Answers embed **radar snapshots the model looked at** (positions at 1:40 / 1:10 / 0:40, side heatmaps for early/mid/late, per-player heatmaps), round summaries (Buy → Start → Utility → Contact → End → Plays) and "Watch these rounds" playlists |
| **Report + section chats** (`chat`) | Long requests become a report built of sections (Pistols, Forces, Anti-forces, First full buys, Roles, Economy, Tendencies, *Patterns they repeat without realising*, Read). **Each section has its own chat thread with its own context** |
| **Dossiers with agents** (`antiStratDossier`) | One versioned document per rival (v1, v2, …). Built from blocks: Markdown text, round links with a 2D preview, image galleries, and **data blocks**, which are saved filters that **rerun on every revision** and mark what is NEW. Coach notes can be linked to a data block and are **flagged for review when new data no longer supports them**. A Planner splits requests into tasks for four agents: **Scout** (what changed in the rival), **Analyst** (tables, heatmaps), **Round Picker** (rounds that illustrate a pattern) and **Fact-checker** (tests coach notes against fresh data). Guardrails: agents only create drafts, never publish or change visibility, never rewrite coach notes (only flag them), and every agent block links to its rounds. Deleting needs explicit confirmation. Templates turn the rival and maps into variables. Briefs are published per player, with a login requirement |
| **AI connector (MCP)** (`mcp`) | A revocable URL per person (the URL is the credential, shown once, with last-used tracking) for Claude, ChatGPT or Claude Code. Public data only. 17 tools in families: Find (`search_team`, `search_player`), Team (`get_map_pool`, `simulate_veto`, `get_team_map_profile`, `get_recent_matches`), Players (`get_roster_stats`, `get_player_profile`, `get_player_roles`, `get_player_weapons`, `get_player_maps`), Tactics (`get_tactical_tendencies`, `get_playbook_categories`, `get_playbook_plays`, `get_playbook_timings`) and Economy (`get_economy_profile`, `get_pistol_economy`). Published **reading rules**: current map pool only, roles are map-specific, playbook categories are not comparable with each other, and **always state the sample size** ("100% over 3 rounds is not a tendency"). Every answer ends with a deep link into the app |
| **VOD analysis** (`vodAnalysis`) | Paste a YouTube URL, choose a language and type (team VOD review, coach tactical lesson, raw match with comms) and an optional time range. The output is structured: strategies, rounds, utility and economy, execution plan, map control, openings, protocols, step-by-step objectives, reactions (trigger → reaction), roles, patterns, adjustments, errors (error → correction, severity, priority), good plays, plus tactical, mental, physical, management, individual and emotional notes and conclusions. Also **speaker diarization with emotion** (speaking time, emotion distribution). Text-only mode is cheaper |
| **Voice comms AI sync** | Speech-to-text on the comms so the audio can be aligned to the demo |
| **ML models (not LLM)** | Role/position detection, a play detector with a confidence threshold, and a site estimator for rounds that ended before an attack |

### 7. Business and admin
Free tier (HLTV demos and 2D viewer), a 7-day Pro trial, three paid tiers, discounts for 3, 6 and 12 months, a tournament registration flow that grants free Pro days, an admin panel (updates/posts, copy playbook between teams), a surveys and beta flags system, guided product tours on most pages, and comparison pages against CS2Lens and Skybox Edge.

## What Round Reviewer already covers

| cs2.cam | Round Reviewer today |
|---|---|
| 2D viewer | Radar replay with one shared playback clock |
| Death analysis recording | CS:DM per-moment clips (`processing/moment_clips.py`) |
| Tool-calling AI chat | Ask tab with the Qwen3-14B agent (`coach/agent.py`, `coach/tools.py`) |
| MCP connector | `cs2-demo` MCP server with a token gate (`apps/mcp/`, `coach/mcp_http.py`) |
| "No tools → discard answer" | Verifier: every claim cites a finding/`RoundStats` ID (`coach/verify.py`) |
| Economy mistakes | `economy_mismatch` detector |
| Accounts, admin | Doc 30, `app/auth/`, `app/admin/` |

The main difference is focus. cs2.cam is a **team anti-strat tool over pro data**. Round Reviewer is a **personal coach for one selected player**. Anything team-wide (playbooks, veto, rival dossiers, the strategic board) only fits once it is reframed around that player.

## Ideas worth borrowing, adapted to our rules

All of these keep the owner's constraints: self-hosted models only (decision #16, so not their DeepSeek approach), no number from the LLM that isn't in a finding or `RoundStats`, one selected player, and Ancient/Anubis.

### High value, fits the current milestone
1. **Evidence chips and a usage line in Ask.** Show "Consulted `get_round_timeline` · round 12" under each answer, and a footer with `{tool calls} · {tokens} · {GPU seconds}`. We already have the verifier; this makes it visible. Also adopt their rule outright: an answer that used no tool is rejected and the model is told to retry.
2. **Radar snapshots inside answers.** Render a PNG of the radar at the cited tick (the player plus nearby enemies) for each finding the answer cites, with a "Watch" button that seeks the shared clock. Snapshots can be rendered server-side from the replay blob. Optionally a local vision model (for example Qwen2.5-VL-7B on the 5080) could read them, but text tools alone are enough to start.
3. **Report sections with their own thread.** Split the Analysis tab into sections (for example Opening duels, Trades and support, Utility, Economy, Good plays), each with its own scoped Ask thread whose context is only that section's findings. Smaller context means fewer hallucinations on a 14B model.
4. **Sample-size and scope rules in the system prompt and tool descriptions.** Put their reading rules into `coach/prompts`: state n for every rate, never compare across maps or roles, and say so when the sample is too small. The verifier can check that a percentage is accompanied by its n.
5. **"Patterns you repeat without realising."** This is their best LLM section and fits a personal coach well. Feed `cross_match_findings` (which already exists) into a prompt that groups recurring finding types by zone, round phase and economy, each pattern citing at least 3 finding IDs from at least 2 matches.

### Medium value, next milestone
6. **Progress dossier with agents** (a single-player version of their rival dossier). One living document per player, revised for each new match: v1, v2 and a *What changed since v1* section. Map their four agents onto tools we already have:
   - Scout → `cross_match_findings` and `get_player_history`: what changed since the last match
   - Analyst → `get_match_totals` and `get_round_stats` tables
   - Round Picker → `select_moments` and `find_moments`
   - Fact-checker → reruns the verifier on **previous** advice against the new match ("last time: stop dry-peeking A main; this match: 1 dry peek vs 4")

   Copy their guardrails: agents only create drafts, never rewrite the coach's or player's notes (only flag them), and every block links to its rounds.
7. **Data blocks that rerun, and notes that go stale.** Store coach explanations alongside the finding IDs they depend on. When detectors are re-run (for example a new `local-v1` profile), flag explanations whose findings changed or disappeared instead of silently keeping them.
8. **Natural language → similar-situation search.** Their situation search is deterministic and powerful but fiddly. Let the LLM turn "times I held B alone after the plant on Anubis" into a structured query (zone, side, man count, post-plant, time window) and run it deterministically over the player's own matches. The LLM only writes the query; the numbers come from the index.
9. **Comms transcription for the selected player.** Run local Whisper large-v3 on the 5080 and align the transcript to demo ticks using round starts, plants and kills (as their AI sync does). The LLM can then classify the player's calls (info call, late call, no call before a death, tilt) and attach them to findings. VOD analysis's error → correction / severity / priority structure is a good output schema for this.
10. **Role per round.** Use a simple classifier (zones held in the first 20 s, plus side) so the coach can say "as the B anchor on Anubis…". Roles are map-specific and must not be averaged across maps.

### Low priority or out of scope for now
- Auto-follow a player: process each new FACEIT demo and record their deaths from both POVs. This fits the personal coach but depends on FACEIT ingest.
- Playlists and starred rounds, plus timestamped notes. These are cheap, but they are UI and design is paused.
- Reaction time (enemy spotted → first shot) as a deterministic metric that the LLM only explains.
- Repair-demo utility, render studio, strategic board, veto simulation, team playbooks, pro-data ingest. These are team or broadcast features outside the delivery scope.

## Things not to copy
- Hosted LLM calls (their DeepSeek chat). This conflicts with decision #16.
- Shipping the whole app's message bundle on every public page. It leaks the full product map (which is how this teardown was done) and adds about 470 KB per page. Load namespaces per route.
- Canonical URLs pointing at the API host. That is an SEO and configuration slip.
- Neon esports styling. See [04 Anti-AI design rules](../handoff/04-ANTI-AI-DESIGN-RULES.md).
