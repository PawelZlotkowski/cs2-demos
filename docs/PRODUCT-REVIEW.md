# Product Review — Round Reviewer
**Analysis date:** 27 September 2026  
**Scope:** Repository state at main + development + PR #22  
**Reviewer:** Analysis-only review (no implementation changes)

---

## 1. What this product is

Round Reviewer is a **self-hosted AI coach for Counter-Strike 2**. It takes a competitive match demo file (`.dem.zst` from FACEIT or `.dem` from CS Demo Manager), parses it with demoparser2, uses Python detectors to find ~10-30 findings per player (mistakes like "died untraded" or "shot while moving," plus good plays), then uses a local LLM agent (Qwen3-14B Q4_K_M on llama.cpp) to:
1. Select the 5–6 moments with highest learning value (mix of mistakes and good plays)
2. Record each as a gameplay clip from that player's view (via CS Demo Manager)
3. Explain each moment in plain language (English, Polish or Dutch) with every claim citing a finding ID
4. Answer follow-up questions using tools, a knowledge base (map guides + CS2 fundamentals), and the player's history

The player reviews each moment in a web-based "Analysis Studio" that shows the clip or 2D radar replay, an event timeline, the coach's explanation, and a RAG-powered Ask tab.

**Direction coherence:** Yes, very. The product scope ([docs/handoff/01](docs/handoff/01-PRODUCT-SCOPE.md)) is clear: "What can this player learn from this match?" The guiding rule (code decides facts, LLM explains) runs through the whole codebase. [19 Decisions](docs/handoff/19-DECISIONS.md) has 24 owner-approved rules and every major architectural choice references them. The ~30 handoff docs are structured, cross-linked and current.

The solo overnight timeline (kicked off 26 Sep 2026, defence 17 Nov, hand-in 6 Dec) is ambitious but the work is scoped as a school project: two students, ~40 tasks split across six phases, 100 demos, hand labels only for evaluation, Mirage and Anubis only.

---

## 2. Architecture & code quality

### Stack
| Layer | Technology |
|---|---|
| Backend | FastAPI 0.115+, Pydantic 2.7+, uvicorn, SQLite |
| Demo parsing | demoparser2 0.42+, zstandard, pandas |
| LLM serving | llama.cpp `llama-server` (OpenAI-compatible) |
| Model | Qwen3-14B Q4_K_M (~9 GB), self-hosted on RTX 5080 |
| Agent | Custom tool loop (max 6 steps), MCP client, JSONL traces |
| MCP server | `cs2-demo` (official `mcp` SDK 2.x), stdio + HTTP |
| RAG | SQLite FTS5 BM25 + optional dense (bge-m3 from `RR_EMBED_URL`) fused by RRF |
| Clip recording | CS Demo Manager CLI (Windows + CS2 + PostgreSQL), stub fallback |
| Frontend | Next.js 15.5 (App Router), React 19, GSAP 3.15 (not used yet), TypeScript 5.8 |
| Fonts | Hanken Grotesk, Newsreader (bundled via `@fontsource`) |
| Deployment | Docker Compose (api + web + optional csdm-db), or local venv + npm |

**Line count:** ~19,500 LOC (12,840 Python in `apps/api`, 6,725 TypeScript in `apps/web`).

### Structure (good)
- **Monorepo:** `apps/{api,web,mcp,tracker}`, `docs/`, `eval/`, `data/`, `prototype/`, `tools/`.
- **Contract ownership:** Pydantic models in `apps/api/app/models/contracts.py` are the source of truth; TypeScript mirrors live in `apps/web/src/lib/contracts/`. Clear sync rule documented.
- **Agent-friendly:** Skills in `.cursor/skills/` (rr-detector, rr-coach-agent, rr-eval), 30 handoff docs indexed at [docs/README.md](docs/README.md), decisions traceable ([19-DECISIONS.md](docs/handoff/19-DECISIONS.md)).
- **Separation of concerns:** Detectors pure functions, tools typed, verifier decoupled, templates as fallback, MCP boundary standard.

### Biggest risks

#### 1. **No CI/CD pipeline** (HIGH)
- `.github/workflows/` does not exist. No automated tests on push, no linting, no build checks, no PR gates.
- `pytest` and `npm run typecheck && npm run build` are run manually.
- **Impact:** Regressions go unnoticed until local testing. PRs merge without green checks.
- **Fix:** Add GitHub Actions: `test-api.yml` (pytest on ubuntu-latest with Python 3.11, stub CSDM mode), `test-web.yml` (typecheck + build), `lint.yml` (ruff for Python, eslint for TS). Block merges on red.

#### 2. **Security not hardened for anything beyond private PC** (HIGH)
- Decision 23: "runs on owner's private PC only for now." Accounts plan ([27](docs/handoff/27-ACCOUNTS-PLAN.md)) adds auth but notes "revisit HTTPS and hardening before exposing."
- Gaps found:
  - No HTTPS in compose (HTTP only).
  - No `SECRET_KEY` for sessions yet (accounts not merged).
  - No rate limiting on upload or `/ask` (planned: 5 failed logins per 15 min, but not for other endpoints).
  - CORS allows `*` origins in dev config (settings not checked for production).
  - No input validation on uploaded file size before decompression (DoS risk).
  - No CSP headers.
  - SQLite with no row-level encryption (fine for local, but noted).
- **Impact:** Cannot expose to LAN/internet without hardening. Study participants must use Paweł's PC.
- **Fix (before any exposure):** HTTPS with self-signed cert or Caddy, rate limiting middleware (slowapi or custom), file size limit (e.g. 300 MB max), CSP headers, `SECRET_KEY` in env, lockdown CORS to known origins, audit SQLite writes for injection (Pydantic helps but check raw SQL).

#### 3. **Phase 2 not verified on real hardware** (MEDIUM)
- The coach agent, MCP tools, verifier, and RAG are built and merged to `development` (phase 1) and reviewed in PR branches (phase 2), but [18 Current state](docs/handoff/18-CURRENT-STATE.md) says "tested with a scripted model only." Open checks:
  - T22 live test (LLM client against llama.cpp).
  - T23 one real match end-to-end.
  - T25 five matches with moment selection.
  - T26 on-demand round < 20 s on RTX 5080.
  - Real CS:DM recording (Windows host).
- **Impact:** Risk that the 14B model is too weak for reliable tool use at 4 bits, or that latency blows the 17 Nov defence demo.
- **Fix:** Run T02 (llama.cpp smoke test), T03 (compose profile) and the open checks on the RTX 5080 PC before claiming phase 2 done. Have the code ranker + template fallback polished as the no-LLM path.

#### 4. **Heavy Windows dependency for clips** (MEDIUM)
- CS Demo Manager requires Windows + CS2 installed + Steam logged in + PostgreSQL + `psql` on PATH. Docker Linux containers cannot run it (compose comment acknowledges this).
- Stub mode works (tiny placeholder MP4s) but defeats the "show gameplay clip" value prop.
- **Impact:** Clips only work on Paweł's Windows PC. Cloud sessions, CI, other contributors see stubs. The defence demo depends on that one machine.
- **Fix (accepted trade-off for prototype scope):** Keep stub mode for CI. Polish the Radar-only path (it already works). Document the Windows setup clearly ([docs/RUN-LOCALLY.md](docs/RUN-LOCALLY.md) exists). If clips become a blocker, consider recording ahead of time for the defence sample match (task 4.3 in [29](docs/handoff/29-FEATURE-ROADMAP.md)).

#### 5. **Prototype as monolith** (LOW, technical debt)
- `prototype/analysis-studio.html` is 108 KB, single-file HTML with inline CSS and JS, sample data baked in. It was the design reference; the Next.js app has replaced most of it, but moment rail, PiP Flip, and overlay logic still live there only.
- **Impact:** Porting from prototype to app risks wholesale copy-paste (violates [19](docs/handoff/19-DECISIONS.md) and AGENTS.md "do not copy the whole prototype"). Also, QA scripts (`prototype/qa/screenshots.py`) target the prototype, not the Next.js app.
- **Fix:** Mark the prototype read-only reference. Write Playwright e2e tests for the Next.js Studio (missing). Delete or archive the prototype after the hand-in.

#### 6. **Missing or incomplete data for evaluation** (HIGH for school grade)
- Per [TASKS](docs/coach/TASKS.md) phase 6 (T60–T65):
  - T17 (150 labelled rounds, 30 shared for κ): status `doing`, no labels committed yet.
  - T60 (150 test questions, 50 per language): `todo`.
  - T61 (eval runner + metrics): `todo`.
  - T62 (moment picks for 20 matches): `todo`.
  - T01 (~100 demos, split 70/15/15): `todo`, `data/manifest.csv` does not exist.
- **Impact:** Evaluation chapter of the report is empty. No precision/recall for detectors, no grounding metrics, no human ratings, no model comparison. The project is graded on these.
- **Fix:** Prioritise T17 and T01 immediately (data collection and labelling are the longest lead-time tasks). T60–T62 can start once the agent runs on the 5080. T61 writes the tables but needs T60 first.

#### 7. **Accounts not started** (MEDIUM, blocks user study)
- The accounts plan ([27](docs/handoff/27-ACCOUNTS-PLAN.md)) is A00–A14, all `todo`. No Steam sign-in, no user table, no session cookies, no match library. Today every match is visible to anyone who can reach the API.
- The user study (T63, 5–10 players) needs per-person accounts to tie ratings and feedback to participants.
- **Impact:** Study participants see each other's matches. No progress tracking across matches. Coach history (`get_player_history`) counts every match that SteamID appears in, regardless of who uploaded it.
- **Fix:** A00–A08 are needed before the study (sign-in, sessions, ownership, match library, settings). A09–A14 (bookmarks, feedback, export, study admin) can follow. Size estimate: A00–A08 is ~6 days across two people (plan says M or L per task). Start now for the 17 Nov defence.

### What's good

1. **Excellent documentation.** 30 handoff docs, all current, with an index ([docs/handoff/00-README.md](docs/handoff/00-README.md)), cross-references, and "do not start coding before reading" warnings. Decisions are numbered and traced. Agent log ([23](docs/handoff/23-AGENT-LOG.md)) records who built what. This is rare.
2. **Tests where they exist.** `apps/api/tests/` has unit tests for detectors, tools, agent, verifier, replay pipeline, and clips. `pytest` collects 244 passed + 4 skipped. Coverage gaps (no tests for web components, no e2e, no CI) are known and noted.
3. **Type safety.** Pydantic everywhere in the API, TypeScript strict mode in web, contracts mirrored. This catches bugs early.
4. **MCP boundary.** The `cs2-demo` MCP server is a clean seam: tools are defined once, the agent is an MCP client, other local clients (LM Studio, Open WebUI) can use the same tools. The stdio and HTTP modes both work. This is well-architected.
5. **Verifier discipline.** Every coach output goes through `apps/api/app/coach/verify.py`: citations checked, numbers matched against evidence, language scored, tool names rejected in prose. One repair, then template fallback. This prevents hallucination from shipping to users.
6. **Semantic design system.** Orange = mistake, blue = good play, ink = structure. No decoration. Stage-first layout. Colour/shape combos for accessibility. Fonts bundled. Light and dark themes. Anti-AI audit passed ([04](docs/handoff/04-ANTI-AI-DESIGN-RULES.md), [25](docs/handoff/25-FRONTEND-REVIEW.md)). This is better than most shipping products.

### Maintainability (good, with caveats)

- **Readable:** Detector modules are ~150–200 lines each with docstrings, known false positives noted. Agent loop is ~200 lines. Tools are typed functions with compact JSON.
- **Extensible:** Adding a detector is pure function + template + test. Adding a tool is function + MCP registration + test. Adding a knowledge passage is Markdown + re-index.
- **Caveats:** In-memory cache alongside SQLite (noted as "fine for MVP"). No migrations yet (schema changes need manual ALTER). Zone polygons are first-draft (need in-game check, T30 open). Prototype still in tree.

---

## 3. UX / design from the codebase

Assessed from: Next.js pages in `apps/web/src/app/`, components in `src/components/`, design docs ([03](docs/handoff/03-DESIGN-SYSTEM.md), [04](docs/handoff/04-ANTI-AI-DESIGN-RULES.md), [26](docs/handoff/26-DESIGN-POLISH-PLAN.md), [28 Visual direction](docs/handoff/28-VISUAL-DIRECTION.md)), UI check results ([26](docs/handoff/26-DESIGN-POLISH-PLAN.md) §UI check), and the prototype (`prototype/analysis-studio.html`).

### What's working

1. **Stage-first layout.** The Studio gives 60–70% of the screen to the radar or clip, 184px to the moment rail, the rest to the panel. The stage is the richest surface. Decision 1 ("replay is the product, not a dashboard") is shipped.
2. **Light chrome, dark stage.** The chrome follows the system theme (or user choice: System / Light / Dark in the top bar, stored as `rr.theme`). The stage stays dark in both. Fonts load from `@fontsource` (bundled), so offline works. Screenshots checked at 1440 and 390 px. This is polished.
3. **Semantic colour.** Orange (`--negative`) for mistakes, blue (`--positive`) for good plays, ink for selection. No category colours. Timeline Coach lane uses ▲ (mistake) and ● (good play) with colour. Shapes carry meaning. Red/green avoided.
4. **Restrained type.** Hanken Grotesk 400/500/600 for UI, Newsreader 400 for coach voice. Sizes 11–26px, tabular nums on body, `text-wrap: balance/pretty`. No uppercase labels, no monospace decoration. British spelling. Sentence case.
5. **Honest processing.** Real stages: `uploaded → decompressing → decompressed → parsing → normalizing → awaiting_player → detecting → selecting → recording → explaining → complete | failed`. Radar loads from `awaiting_player`. No fake progress percentages. Clips appear when ready (stub or real). Errors say how to fix ("...isn't a demo file. Choose a .dem.zst from FACEIT or a .dem from CS Demo Manager.").
6. **Anti-AI compliance.** No card grids, no pill chips, no glow, no chat bubbles, no "How can I help you today?", no sparkle icons. `impeccable` detector ran and findings addressed ([26](docs/handoff/26-DESIGN-POLISH-PLAN.md) UI check). The Coach sits in the Ask tab, not a standalone page. Copy is specific ("Review moment 1: Dry peek into Connector") not vague ("Continue your journey"). This is a huge win vs generic AI UX.
7. **Shared playback clock.** One `usePlaybackClock` hook drives clip time, radar interpolation, timeline position, and Coach context. Switching Gameplay ↔ Radar keeps the same time and moment. Video is master when a clip plays. Decision 8–9 shipped.
8. **Citations seek.** `[F3]` in coach text seeks the timeline to that finding's time. `[K7]` opens the knowledge passage. `[M2:F3]` (cross-match) opens that match in the Studio at that finding (planned for Coach page, [29](docs/handoff/29-FEATURE-ROADMAP.md) R05–R06). Links are underlined tokens, not bubbles.

### What's rough

1. **Player names still `P0..P9` in synthetic test data.** Real demos already use player names, but the screenshots show "P0 killed P1 in Window" because the API tests use a synthetic match. This reads as unfinished. The UI check noted it but said "nothing changed" because real demos work. **Fix:** Replace the synthetic fixture with a real sample match (task 4.3 in [29](docs/handoff/29-FEATURE-ROADMAP.md), size M, due before 17 Nov defence). Seed it with pre-recorded clips so the demo never depends on CS2 running.

2. **No match overview.** The Studio opens straight into round 1. No scoreboard, no round strip, no summary of "what went wrong and right" before diving into a moment. Leetify, Scope, and every reviewed product lead with this. **Fix:** Merged in PR #21 (`claude/design-polish-plan-amk6du`, 27 Sep): overview shows key facts (score, K/D, ADR), a round strip (click to jump), and a coach summary (new `match_summary.v1` job, cited, through verifier). The rail row "Match overview" comes first. Ships with the polish plan.

3. **No ending.** After the last moment, nothing says "you have seen 6 of 6" or what to take away. **Fix:** Also in PR #21: "Moment N of M" with a Next button, then "Finish the review." The wrap-up (new `review_wrapup.v1` job) says what went well, what to fix first, and lists one drill per mistake type from `data/knowledge/general/practice.md` with `[K..]` sources. This closes the loop.

4. **Mobile layout half-empty.** At 390 px the rail becomes a horizontal strip, the panel hides behind an "Analysis" button, and half the screen below the timeline is white space. The transport wraps to two rows. **Fix:** Merged in PR #18 (`claude/design-polish-plan-amk6du`, first pass): a draggable bottom sheet with a grab handle, the moment label and key finding visible when collapsed, tap or drag to open. Transport kept on one row. This follows the prototype's mobile sheet (decision 14).

5. **Lab and Coach page only in PR #22.** The top bar has Home, Coach, Lab (when `RR_LAB_ENABLED=1`), Settings and a setup warning (when a check fails). The Coach page (R05–R06 in [29](docs/handoff/29-FEATURE-ROADMAP.md)) is built for cross-match Ask ("Why do I keep dying on A ramp on Anubis?") with new tools `list_matches` and `find_moments`. Lab Runs lists every agent trace (job, model, tool calls, passages, verifier result) from `data/traces/`. These are grader-visible AI technique screens. They are done but not merged (PR #22 open). **Recommendation:** Merge after the defence, or sooner if graders need to see the trace viewer.

6. **Empty and error states generic.** Missing match shows "Match not found." with no way back. 404 was the Next.js default on a white background (U8 in the UI check). **Fix:** Merged in PR #18: not-found pages say "This match isn't here. It may have been deleted." with Add demo and Home links, in the Studio theme. Upload drop zone works (U1 fixed). Still open: upload progress bar (U2, XHR `progress` event, merged in second pass).

7. **Processing wording still developer-ish in some paths.** "Ranked 1st of 2 by the code ranker, from F2 F3 F4 F5" reads as debug output. "Built from the finding templates. The coach model is switched off." is API jargon. **Fix:** Most rewritten in PR #18 second pass: "Picked because it cost you the opening duel. Evidence: F2 F3 F4 F5." Template note becomes "Written from the findings" and only shows when the model is off. Ask tab note: "The coach model is offline, so answers use the findings only." Processing merged "Decompress"/"Decompressed" into "Unpack demo." Still some rough edges in edge-case messages.

### Concrete design directions

These are not vague "make it prettier" — they are specific next moves.

1. **Finish the match library (Home).** Today Home is one sentence and a button. [29](docs/handoff/29-FEATURE-ROADMAP.md) R02 and [28 Visual direction](docs/handoff/28-VISUAL-DIRECTION.md) describe it: a dense table, one row per match, scorebug per row (map icon, score, date, K/D/ADR), Play action opens the Studio, kebab menu for re-run/export/delete. Needs accounts (A08) to scope matches to the signed-in user. **Size:** M (after A08). **Value:** High — this is how players return to a past review.

2. **Progress page (A11, R17).** Per-detector dots grid: one dot per match, orange = that mistake happened, blue = that good play happened, empty = didn't happen, per [10 Personalisation](docs/handoff/10-PERSONALIZATION.md) and [28](docs/handoff/28-VISUAL-DIRECTION.md). Below it: a ranked list of zones where the player died most across matches, with counts and links to those moments (not a heatmap, per the polish plan "What not to add"). This is the evidence-only personalisation (decision 13). **Size:** M. **Value:** High for player retention ("am I improving?").

3. **Round tab in Studio (R04).** The facts of the round: duels (who, where, won or lost, time to damage), utility thrown with where it landed, damage dealt/taken, the buy vs team buy. Each row seeks and draws on the radar. This is "what actually happened" before the coach says why. It answers players who disagree with the coach. **Size:** M. **Value:** Medium (power users love it, casual players skip it).

4. **"How this was written" disclosure (item 4 in polish plan).** A small link under each explanation and answer: opens the run in Lab → Runs (showing tool calls, passages, verifier result). This makes the AI techniques visible to graders. **Size:** S. **Value:** High for defence demo, low for players.

5. **Feedback buttons (item 4 in polish plan, A10).** "Useful" / "Not right" under each explanation and answer, with an optional note. Stored per user, exported for the study (A13). This is evaluation signal and expected UX. **Size:** S. **Value:** High for the study (T63).

6. **Settings, System section (R01).** Already in PR #22: checks that llama-server is reachable, that the model on port 8080 matches `RR_LLM_MODEL`, that the MCP server lists tools, that CS:DM and Steam are reachable, that the Postgres DB is up, and shows GPU queue length. A warning appears in the top bar only when a check fails. This would have caught the "old Qwen server on port 8080" bug and the ".env read only at start-up" issue. **Size:** S. **Value:** High practical (saves debugging time).

7. **Knowledge tab (R12).** Inside the Coach page: browse `data/knowledge/` by map, click a zone on the radar, read the passages for that callout, with source (own notes or Liquipedia) and "cited in 7 explanations." A "Flag as wrong" action records passages that failed the in-game check (T30 still open). Shows graders what RAG searches. **Size:** M. **Value:** Medium (graders yes, players maybe).

8. **Clip download (R16).** The moment's MP4 with the shared label in the file name, so players can share clips outside the app or make a montage. **Size:** S. **Value:** Medium (nice-to-have, expected by Allstar/CS:DM users).

### User flows

**Upload → review (happy path):**
1. Home → Add match → drag/drop `.dem.zst` → shows file name, size, upload progress (XHR, U2 fixed).
2. Processing page: stages tick off (`Unpack demo → Parse → Normalise → Pick player`), real names in the ten-player grid, you are marked, Enter picks you, starts coach (`Detecting → Selecting → Recording → Explaining`), safe to leave.
3. Studio opens on match overview (score, round strip, summary), first moment paused behind it. "Review moment 1: …" button.
4. Stage (clip or radar, picture-in-picture, Gameplay|Radar segmented control), transport (seek, play/pause, 0.5/1/2/4× rates), timeline (Coach lane ▲ ●, interval bracket, prev/next).
5. Analysis tab: moment label headline, coach explanation (serif, cited), pick reason ("from F2 F3 F4"), round stats, all findings. Citations `[F3]` `[t:41.5]` seek. Next moment button.
6. Repeat 4–5 for moments 2–6.
7. Wrap-up: what went well, what to fix first, one drill per mistake type with `[K..]` sources. Home or Add another match.

**Ask flow:**
1. In the Studio, Ask tab (next to Analysis).
2. Three suggested questions per moment (e.g. "Why did I die here?" "What should I have done?" "Show me my other deaths on A ramp").
3. Input bar, ask a question, SSE stream starts. While the coach works: tool call names, retrieved passages (collapsible), then the answer (serif, cited).
4. Citations `[F3]` seek, `[K7]` opens the passage overlay, `[M2:F3]` opens that match in Studio.
5. Answers built from templates say "Written from the findings" when the model is off.

**Rough edges in the flow:**
- No way to jump to a specific finding from the all-findings list (only citations in prose seek). **Fix:** Make finding rows clickable → seek to that time.
- No way to ask "show me the round after this one" without leaving the Studio and picking it from the rail. **Fix:** Prev round / Next round buttons in the transport (prototype has these).
- Clip plays once and pauses on the key tick (planned in [26](docs/handoff/26-DESIGN-POLISH-PLAN.md) item 3), but this is not built yet. **Fix:** `onEnded` handler on the `<video>` seeks to `finding.t`.

---

## 4. Features worth adding next (prioritised top 5)

Drawn from [29 Feature roadmap](docs/handoff/29-FEATURE-ROADMAP.md) (R00–R18), [27 Accounts plan](docs/handoff/27-ACCOUNTS-PLAN.md) (A00–A14), and gaps found. Each has: **value** (to players or the grade), **when** (D = 17 Nov defence, S = study, H = 6 Dec hand-in), **story** (assignment technique it demonstrates), **size** (S/M/L from TASKS), and **why**.

### 1. Accounts + match library (A00–A08) — High · D · no tag · ~6 days
**What:** Sign in through Steam (OpenID 2.0) or local password (Argon2id), server-side sessions in SQLite behind an HttpOnly cookie, `owner_id` on matches, auto-pick the signed-in player, match library on Home (dense table per [28 Visual direction](docs/handoff/28-VISUAL-DIRECTION.md)).

**Why:**
- **Blocks the user study (T63).** Today every match is visible to anyone. Study participants (5–10 players) need per-person accounts to tie ratings and feedback to them.
- **Biggest daily UX win:** signed-in player is auto-picked, no "which of these ten is you?" every upload.
- **Match library is how players return.** Home as "one sentence and a button" is not a product.
- **Coach history becomes real.** `get_player_history` currently counts every match that SteamID appears in, regardless of uploader. With ownership it counts only the user's own matches.

**Size:** A00 (auth routes, sessions table) M, A01 (Steam) S, A02 (local password) S, A03 (sessions) S, A04 (ownership) M, A05 (auto-pick) S, A06 (welcome) S, A07 (settings) M, A08 (match library) M. Total ~6 days across two people.

**Risk:** 17 Nov defence is 7 weeks away; accounts need 6 days, detectors/labelling need 2–3 weeks, model serving needs 1 week. Start accounts now or accept that the defence demo has no library and all matches are public.

### 2. Label 150 rounds + tune detectors (T17) — High · D · EVAL · ~2–3 weeks
**What:** Use `python -m eval.label_tool` to mark each finding Correct / Wrong, add missed events, pick top-6 moments for 20 matches (blind, no agent picks shown). Compute Cohen's κ on 30 shared rounds. Tune detector thresholds and zone borders. Report precision, recall, agreement.

**Why:**
- **Required for the grade.** Evaluation chapter needs detector precision/recall against hand labels. Fine-tuning (T50–T53) needs moment-selection labels to judge quality. Model comparison (T61) needs test questions (T60).
- **Detectors are first-draft.** Thresholds like "isolated death = 30 m" and zone borders are guesses until labels exist. Some detectors have known false positives (e.g. D1 "killer dies to bomb or utility, no kill credit" — not detectable from the data, so accepted).
- **Zones need in-game check.** Callout polygons were drawn from overview images. T30 note says "names and borders need a pass by someone who knows the callouts."

**Size:** T17 is M (1–2 days of labelling per person for 150 rounds, plus κ compute and threshold tuning). In practice, spread over 2–3 weeks because labelling is slow and needs breaks.

**Risk:** This is the longest lead-time task. Start immediately. If 150 is too many, cut to 100 (50 per person + 20 shared).

### 3. Serve Qwen3-14B on the RTX 5080 + run phase 2 end-to-end (T02–T03, T22–T27 checks) — High · D · AGENT · ~1 week
**What:** Install llama.cpp on the RTX 5080, download Qwen3-14B Q4_K_M (~9 GB), run `llama-server` with `--jinja` for tool calls, set `RR_LLM_ENABLED=1`, run the smoke test (T02), then run a real match end-to-end: moment selection (T25), explanations (T26), Ask (T27). Record tokens/s, latency per job, VRAM usage. Verify that citations, tool calls, and verifier all work. Test en/pl/nl. Add the `llm` compose profile (T03).

**Why:**
- **Phase 2 is built but not verified.** The agent, tools, MCP server, verifier, and RAG are in the codebase (merged to `development`, phase 1 + 2 in review). But [18 Current state](docs/handoff/18-CURRENT-STATE.md) says "tested with a scripted model only." The risk is that the 14B model at 4 bits is too weak for reliable tool calling, or that latency blows the demo.
- **Defence demo depends on this.** If the model fails, the code ranker + templates are the fallback, but graders expect to see the agent working.
- **Unblocks fine-tuning (T50–T53) and evaluation (T60–T61).** Both need the model serving and the agent producing outputs to sample from.

**Size:** T02 (serve + smoke) S, T03 (compose profile) S, T22–T27 checks (run 5 matches, measure) M. Total ~1 week.

**Risk:** If Qwen3-14B is too slow or too weak, the plan has a fallback: Qwen3-8B for the pilot (T52), and the RTX Pro 6000 (96 GB) for a larger model (T53). But that decision needs data from this run first.

### 4. Lab (Runs, Labels, Evaluation, Dataset) — High for grade · D (Runs), S (Labels), H (Evaluation, Dataset) · EVAL · ~6 days
**What:** Four tabs under `/lab` (admin only, or `RR_LAB_ENABLED=1` before accounts):
- **Runs (R03, M):** Every agent run as a readable list: job, model, language, steps, tool calls with arguments and result sizes, retrieved passages, verifier result, latency, tokens/s. Opens the JSONL trace from `data/traces/`. Filter by job, language, "fell back to template." Links from "how this was written" disclosure (polish item 4).
- **Labels (R07, L):** Detector labelling in the Studio layout: each finding with its clip and radar, mark Correct / Wrong, "Add missed event" at the playhead. A second mode: blind moment picks (T62). Cohen's κ computed on the page.
- **Evaluation (R10, M):** Runs `python -m eval.run --config …` in the background, shows the tables from the plan (§12 in [AI-COACH-PLAN.md](docs/coach/AI-COACH-PLAN.md)), side-by-side model comparison (Qwen3-14B vs Gemma 4 12B vs fine-tuned vs template baseline) on the same moments, blind A/B rating mode for the two students.
- **Dataset (R11, M):** Verifier-passed examples from rejection sampling (T50), one at a time: Accept / Edit / Reject, counts per job and language against the ≥ 300 target, export the reviewed set for fine-tuning.

**Why:**
- **Makes AI techniques visible.** The plan (§2 in [AI-COACH-PLAN.md](docs/coach/AI-COACH-PLAN.md)) says "agent with tool calling," "MCP," "RAG," "fine-tuning," and "evaluation" are the grade. Graders need to see them. Runs shows the tool calls and passages. Labels and Evaluation show the human-in-the-loop. Dataset shows the fine-tuning pipeline.
- **Replaces scripts with UI.** Today labelling is `python -m eval.label_tool` (terminal), model comparison is `eval/compare_models.py` (writes Markdown), and dataset review does not exist. A web UI is faster and easier to demo.
- **Lab Runs is low-hanging fruit.** The JSONL traces already exist in `data/traces/`. R03 is just a file list → viewer. Size M, high demo value.

**Size:** R03 (Runs) M, R07 (Labels) L, R10 (Evaluation) M, R11 (Dataset) M. Total ~6 days. Runs and Labels due before the defence (D), Evaluation and Dataset before hand-in (H).

**Risk:** R07 (Labels) is L (3–5 days) — it is a full Studio layout per finding. If time is short, keep the terminal tool and only build Runs for the defence.

### 5. Progress page (A11, R17) — Medium · H · no tag · ~1 day
**What:** Per-detector dots grid: one row per detector, one dot per match, orange = that mistake happened in that match, blue = that good play, empty = didn't. Click a dot → opens that match in the Studio filtered to that detector. Below the grid: a ranked list of zones where the player died most across matches, with counts and links to those moments (not a heatmap, per polish plan "What not to add"). Scoped per map or across all maps.

**Why:**
- **"Am I improving?" is the retention question.** Progress is how players know their work is paying off. The grid shows at a glance: "dry peek in 4 of my last 6 Mirage matches" (evidence only, per decision 13).
- **Completes personalisation.** The wrap-up already says "what to fix first." Progress shows "did I fix it?"
- **Low complexity, high value.** The data is already in `findings` and `round_stats` tables. It is a query + a grid render. No LLM, no new pipeline stage.

**Size:** A11 + R17 = S + S = 1 day total.

**Risk:** Needs accounts (A04) to scope progress per user. Can fake it before accounts by hardcoding one SteamID for the demo.

---

## 5. What to stop / cut / defer

### Stop

1. **Copying the prototype wholesale.** The prototype (`prototype/analysis-studio.html`, 108 KB) was the design reference. The Next.js app has replaced most of it, but AGENTS.md and [19 Decisions](docs/handoff/19-DECISIONS.md) both say "do not copy the whole prototype HTML as the app." The moment rail, PiP Flip, and overlay logic still live in the prototype only. **Action:** Port them piece by piece with tests, or defer them post-hand-in. Mark the prototype read-only.

2. **Adding more maps.** [19 Decisions](docs/handoff/19-DECISIONS.md) #24: "Add maps beyond Mirage and Anubis without the owner asking." The zone polygons for two maps are already first-draft (need in-game check). Adding Inferno, Dust2, Nuke, etc., multiplies the zone work by 5× and the knowledge base by 5×. The school project does not need it. **Action:** Keep Mirage + Anubis only until hand-in. Revisit after.

3. **Pro comparisons, win-probability curves, skill scorecards.** [01 Product scope](docs/handoff/01-PRODUCT-SCOPE.md) §Scope from earlier planning lists these (CatBoost, PyTorch Geometric GNN, LanceDB, CounterQuant pro demos). The Analysis Studio prototype does not show them. [18 Current state](docs/handoff/18-CURRENT-STATE.md) #Contradictions says "whether they stay in scope, and where they would live in this UI, is undecided." They are not in the task list. **Action:** Cut them. The coach flow (detectors → agent → explanations → Ask) is the product. These are scope creep.

4. **Hosted LLM APIs.** Decision 16: "no OpenAI, Anthropic, Google, … from app code, data generation or evaluation. Everything runs on self-hosted models." This is already enforced. **Action:** Keep enforcing it. Resist the temptation to use GPT-4 for eval judging or data generation. Human ratings are the primary signal.

### Defer (post-hand-in)

1. **Automatic FACEIT / Steam import.** [27 Accounts plan](docs/handoff/27-ACCOUNTS-PLAN.md) §2 explains why: matchmaking auto-import needs a Steam Web API key + match-history auth code + share codes + a separate Steam bot logged into CS2's Game Coordinator. FACEIT needs the Downloads API, which requires an application form and up to 30 days. Decision 24: "matches arrive by manual upload only." **Action:** Defer to later. Manual upload is fine for 100 demos and 10 study participants.

2. **Multi-map support beyond Mirage + Anubis.** Already covered in Stop #2. **Action:** Defer.

3. **3D reconstruction.** [01 Product scope](docs/handoff/01-PRODUCT-SCOPE.md) §Out of scope: "3D reconstruction of matches (explicitly dropped earlier)." Radar + POV clips are the two views. **Action:** Stay cut.

4. **Mobile app (iOS/Android).** Not in scope anywhere. The web app is responsive (tested at 390 px), but native is not planned. **Action:** Defer indefinitely.

5. **Fine-tuning on the RTX Pro 6000.** T53 is "RTX Pro 6000: bigger model serving + full fine-tune run" (M), gated on T52 (QLoRA pilot on RTX 5080). The RTX Pro 6000 is rented only if the pilot works. **Action:** Defer until T52 proves QLoRA fits in 16 GB and the loss curves look good. If the pilot fails, skip the big model and use Qwen3-14B + fine-tuned 14B as the two comparison models.

6. **Montage / social features.** [01 Product scope](docs/handoff/01-PRODUCT-SCOPE.md) §Out of scope: "social features, leaderboards, achievements, streaks, XP or other gamification." Allstar has montage feeds; CS:DM has clip sharing. Round Reviewer is a private coaching tool, not a social network. **Action:** Stay cut.

---

## 6. Verdict: good direction?

**Yes, with qualifications.**

### What's good (reasons to say yes)

1. **The product is coherent and defensible.** "Code decides what happened, the LLM explains" is a clear rule that runs through every layer. The verifier enforces it. The evidence-backed, citation-required coaching is a real differentiator vs "just ask ChatGPT."

2. **The technical architecture is sound.** Detectors → findings → agent → verifier → RAG → MCP tools → templates is a clean pipeline. The contracts are typed. The MCP boundary is standard. The fallback path (code ranker + templates) works when the LLM is off. This is well-designed.

3. **The documentation is exceptional.** 30 handoff docs, all current, with cross-references and an index. Decisions are numbered and traced. The agent guide (AGENTS.md) is comprehensive. The task board ([TASKS](docs/coach/TASKS.md)) is detailed. The proposal ([PROPOSAL.md](docs/coach/PROPOSAL.md)) is clear. This is rare for a student project, and it shows discipline.

4. **The design is specific, not generic.** Anti-AI rules enforced, semantic colour, stage-first layout, restrained type, honest processing. The UI check found 17 issues and most are fixed. The prototype is a visual reference, not copy-pasted. This is better than most shipping products.

5. **The self-hosted constraint is a feature, not a bug.** Running on hardware you control, no paid APIs, no third-party model dependencies — this is a real value prop for players who care about privacy and cost. The school project constraint (decision 16) forced a better product.

6. **The scope is school-appropriate.** 100 demos, 2 maps, 10 detectors, 1 local model, 2 students, 10 weeks. The task split (phase 1 detectors, phase 2 agent, phase 3 RAG, phase 4 UI, phase 5 fine-tuning, phase 6 eval) is pedagogically sound. Each phase demonstrates one technique.

### What's risky (reasons to qualify)

1. **The timeline is tight.** 17 Nov defence (7 weeks), 6 Dec hand-in (10 weeks). Accounts need 6 days, labelling needs 2–3 weeks, model serving needs 1 week, fine-tuning needs 1–2 weeks, evaluation needs 1 week. That is 6–8 weeks of critical-path work before the parallel polish tasks (Lab, Progress, clips). There is no slack.

2. **Phase 2 is not verified on real hardware.** The agent, tools, MCP, verifier, and RAG are built but only tested with a scripted model. The risk is that Qwen3-14B at 4 bits is too weak or too slow. The fallback (code ranker + templates) works, but graders expect to see the LLM agent.

3. **Critical data is missing.** No demos collected (T01 `todo`), no labels (T17 `doing`, zero committed), no test questions (T60 `todo`). The evaluation chapter of the report is empty. This is the highest risk for the grade.

4. **Accounts are not started.** A00–A14 are all `todo`. The user study (T63) needs accounts. Match library, progress tracking, and coach history all need accounts. Six days of work, not yet begun.

5. **Heavy Windows dependency for clips.** CS:DM requires Windows + CS2 + Steam + PostgreSQL. Docker Linux containers cannot run it. Cloud sessions see stubs. The defence demo depends on Paweł's PC. The fallback (Radar-only) works, but clips are a key value prop.

6. **No CI/CD.** No GitHub Actions, no green checks on PRs, no automated tests on push. Regressions go unnoticed. This is fine for a solo project but risky when two people merge to the same branch under deadline pressure.

### Verdict

**The product direction is good. The execution is incomplete but on track, with timeline risk.**

The single highest-leverage next move is: **start data collection and labelling (T01, T17) immediately.** Everything else can compress or cut scope, but evaluation needs labels and demos. Two weeks of labelling now buys three weeks of parallel work later (fine-tuning, model comparison, user study analysis).

Second priority: **accounts (A00–A08) for the study and match library.** Six days of work, critical path to the defence. Start this week.

Third priority: **serve the model on the RTX 5080 and run phase 2 end-to-end (T02–T03, T22–T27 checks).** One week of work, unblocks fine-tuning and evaluation. Measure latency and quality. If Qwen3-14B fails, pivot to the code ranker + templates as the defence demo and show the agent working in the Lab trace viewer.

**If forced to cut scope:** defer fine-tuning (T50–T53) to after the defence, cut Lab Evaluation and Dataset (R10–R11) to scripts only, and show Runs (R03) as the "AI techniques visible" screen. This saves 4–5 days and keeps the defence demo viable.

**The repo is in good shape for an overnight project.** The bones are solid, the docs are excellent, the design is specific, and the architecture is clean. The risks are all in the timeline and the critical-path data work. Start labelling today.

---

**End of review.**
