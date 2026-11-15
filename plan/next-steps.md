# Round Reviewer — next steps

Synthesised from [FINAL-DELIVERY-PLAN](FINAL-DELIVERY-PLAN.md), [HOSTING-AND-GPU-PLAN](HOSTING-AND-GPU-PLAN.md), [RECORDING-AND-TRAINING-PLAN](RECORDING-AND-TRAINING-PLAN.md) and [STUDIO-UI-AND-MOTION-PLAN](STUDIO-UI-AND-MOTION-PLAN.md). Aligned with repo truth in `docs/coach/TASKS.md`, `docs/handoff/18-CURRENT-STATE.md` and `AGENTS.md` as of the monorepo snapshot (Demo Replay landed; coach phases 1–3 largely in review; design paused by Paweł).

British spelling. For Paweł Złotkowski (owner).

---

## 1. Recommended order (this week → next)

Goal: earliest path to something you and Aleksander can test in the browser/API.

| Order | Focus | Why it unblocks testing |
|---|---|---|
| **1** | Local real-demo baseline (RR03) + freeze shared contracts (RR05) | Proves upload → parse → Radar → findings on your machine; stops UI/API drift before cloud work |
| **2** | Shared cloud CPU API foundation (RR37), then cloud upload/parse (RR08) | Both of you hit the same HTTPS backend; parsing must work with home GPU workers offline |
| **3** | Access + durable jobs (RR07, RR09) thin slice | Invites/isolation and job IDs so concurrent sessions and async work are safe |
| **4** | Coach path you can click: Ask/Analysis with local llama.cpp or honest templates (RR15–RR17 wiring against existing phase-2 code) | Browser demo of grounded coaching without waiting for clips or fine-tuning |
| **5** | Recording transport first, then real CS:DM (RR20 smoke with known-good MP4 → real capture) | Clips arrive asynchronously; Radar must stay usable either way |
| **6** | Resume design only after you unpause; freeze Studio direction (RR18) before polish agents touch production CSS | Design is paused — do not burn coding capacity on Tactical Lens integration until you choose palette/tokens |
| **7** | Labelling pilot + eval runner (RR12, RR06) in parallel once a few matches parse | Research track; does not block first invited browser tests |
| **Later** | Dust II (RR10), cloud recorder VM experiment, QLoRA (RR25), rented GPU (OPT01) | After Mirage/Anubis + local coach + cloud parse are solid |

Monorepo today already has Radar, detectors, tools/MCP/agent (scripted-model only), Ask SSE and stub clips. Prefer wiring and verifying that stack over greenfield features.

---

## 2. First coding work for agents (testable builds)

Prefer slices that produce a runnable demo. Assign one slice per agent/branch.

### Slice A — Real-demo analysis smoke
- **Goal / acceptance:** Upload one Mirage or Anubis `.dem`/`.dem.zst`, pick a player, open Studio: Radar plays, findings/moments appear; `pytest` real-demo analysis path passes on that file.
- **Area:** `apps/api/app/processing/`, `apps/api/app/analysis/`, `tests/analysis/`
- **Dependencies / blockers:** Demo stored outside git; demoparser field names verified locally (current state notes cloud session never had a demo).
- **Skill:** `rr-detector` if tuning detectors after smoke.

### Slice B — Clickable coach Ask/Analysis (local or template-honest)
- **Goal / acceptance:** In Studio, Analysis shows explanation for a selected moment; Ask answers with citations that seek the clock; with LLM off, labelled template answers; with LLM on (your 5080), one real tool-using turn and a saved trace under `data/traces/`.
- **Area:** `apps/api/app/coach/`, `apps/mcp/`, `apps/web` Studio Analysis/Ask tabs
- **Dependencies / blockers:** Slice A desirable; `RR_LLM_*` / llama.cpp for live path (T02/T03); no hosted LLM APIs.
- **Skill:** `rr-coach-agent`

### Slice C — Recording job transport (fake clip, real pipeline)
- **Goal / acceptance:** Worker claims a job outbound, uploads a known-good MP4 to private storage/API grant, Studio plays it with Range seek after worker stops; GET clips no longer side-effect starts a local recorder.
- **Area:** `apps/api/app/processing/moment_clips.py`, `video_clips.py`, `repositories/`, routes; thin Windows worker adapter
- **Dependencies / blockers:** RR05/RR09 lease/artifact contracts; object storage or interim API POST for smoke.
- **Skill:** none specific; follow recording plan §2.2–2.6.

### Slice D — Durable match/job visibility in UI
- **Goal / acceptance:** After upload, browser shows truthful queued/running/failed stages; cancel/retry on owned jobs; reload preserves status; second account cannot see first user’s artifacts.
- **Area:** `apps/api` jobs/routes, `apps/web` processing + Studio status chrome
- **Dependencies / blockers:** RR07 access policy; RR09 job table; RR37 for multi-device proof.
- **Skill:** Emil/`emil-design-eng` only for status copy/layout restraint — not a redesign.

### Slice E — Eval entry point on fixtures
- **Goal / acceptance:** One command writes machine-readable metrics (detectors/selection/grounding stubs) with config hashes; Aleksander can run it independently.
- **Area:** `eval/`, hooks into `apps/api/app/analysis/` and coach verifier
- **Dependencies / blockers:** RR05 fixtures; RR02 protocol freeze for metric definitions.
- **Skill:** `rr-eval`

### Slice F — Studio motion slice (only after design unpause + RR18 choice)
- **Goal / acceptance:** Analysis↔Ask tab marker + bounded checked-answer reveal + activity line driven by real lifecycle events; reduced-motion immediate; keyboard Stop/Retry.
- **Area:** `apps/web` Studio coach panel; tokens/helpers; optional `@gsap/react` as planned
- **Dependencies / blockers:** Design unpaused; palette/tokens chosen; RR05 lifecycle events; do not implement while design remains paused.
- **Skill:** Emil + `gsap-react` / `gsap-timeline`; motion review skill after behaviour works.

---

## 3. What to hand Claude for design

**Design is paused (20 Oct).** Claude (design agent / design review) owns preference and composition work until you unpause and freeze direction. Coding agents implement production UI only after that freeze (RR18 → RR22).

### Claude owns
- Concept confirmation: **Tactical Lens** selected for study; green/orange palette rejected; Frosted/Smoked glass rejected as bland — next pass needs a deliberate identity, not another generic glass theme.
- Static direction boards: same realistic scene (replay + timeline + coach); type/material/event-mark samples; light/dark and opaque fallback; still looks intentional in grayscale with motion off.
- Palette/density choice from Tactical Lens study options (Carbon/Cobalt, Graphite/Ice, Paper/Ultramarine) or a successor you approve.
- Interaction brief: tab transition, activity line, checked-answer reveal, evidence→seek — timings from STUDIO-UI plan §4–5 and §9 budget (~240–280 ms tabs; ≤~350 ms answer reveal; no load choreography).
- Accessibility criteria checklist (contrast on busy radar, reduced motion, keyboard, EN/PL long answers).
- Anti-AI compliance pass against [`docs/handoff/04-ANTI-AI-DESIGN-RULES.md`](../../../workspace/docs/handoff/04-ANTI-AI-DESIGN-RULES.md) and handoff design system — no floating desktop, no OS shell, no dashboard card soup.

### Coding agents implement (after freeze)
- Tokens into existing Next Studio; Base UI for menus if approved; GSAP only for coordinated tab/answer; CSS for press/hover.
- Wire real lifecycle events and citations — no fake progress.
- Do not invent a new brand or port the whole HTML prototype.

### Handoff brief bullets (paste to Claude)
- **Screens:** processing (player pick), Studio stage (Radar primary; Gameplay/clip when ready), moment rail, Analysis + Ask tabs, offline/queue/error/cancelled coach states.
- **Motion refs:** STUDIO-UI §4 A–E and §9 closed budget; prototype behaviours in Tactical Lens study (tabs, block reveal, citation seek) — simulation only.
- **Anti-AI:** `docs/handoff/04-ANTI-AI-DESIGN-RULES.md`; match/replay must remain the subject.
- **Done before implementers start:** written token sheet + one approved composition; two short interaction captures (or static board + one motion study); Aleksander’s evidence pack (mistake, good play, uncertain claim, long Polish answer, worker unavailable); explicit “design unpaused + RR18 freeze” note from you.

---

## 4. How to perform checks

Use as a ladder; stop and fix before promoting a build.

### Unit / API
- [ ] `cd apps/api && pytest` (include analysis/detector/verifier; real-demo test when a local demo path is set)
- [ ] Contract drift: change Pydantic first, then TypeScript under `apps/web/src/lib/contracts/`
- [ ] MCP tools list/call smoke (`python -m cs2_demo_mcp` / inspector) when touching coach tools
- [ ] Job lease tests: claim, heartbeat expiry, duplicate complete, cancel owned only (RR09/RR20)

### Web
- [ ] `cd apps/web && npm run typecheck && npm run build`
- [ ] Manual: upload → awaiting_player → pick player → Studio Radar seek/speed
- [ ] Manual: Analysis citations seek; Ask Stop/Retry; template vs live answer labelled honestly
- [ ] Manual: clip absent → Radar still works; clip ready → play/seek without stealing focus mid-read
- [ ] Keyboard path + reduced motion for any RR18/RR22 UI change

### Coach / eval (when LLM or labels involved)
- [ ] llama.cpp smoke: chat + tool call + JSON (T02); record tokens/s and VRAM
- [ ] One real match end-to-end with `RR_LLM_ENABLED=true`; trace JSONL saved
- [ ] Verifier fixtures: wrong player/round/number fail; evidence-backed pass
- [ ] `python -m eval.label_tool agreement|score` after overlap labels
- [ ] Eval runner (RR06/E): fixture run writes tables with hashes — no silent test-set tuning

### Product / ops gates (from delivery plan)
- [ ] Per supported map: real-demo review, sampled rounds/events, player selection, replay alignment
- [ ] Concurrent sessions on cloud API; parse with GPU workers disconnected
- [ ] Cross-user isolation; offline/queue/restart truthful UI
- [ ] Clip alignment ≤ ~100 ms at inspected checkpoints when claiming clips “aligned”

---

## 5. Data: collect, download, label

Targets (delivery + recording plans): **~100 matches**, split **65 / 15 / 20** by match identity (train / val / test); **150 labelled rounds** (pilot **30** double-labelled); demos **never in git**.

### Owner-only (Paweł / Aleksander)
1. Agree permission: process vs research/training reuse; invited-player consent later (RR30).
2. Collect demos you may use (your matches + permitted friends): Mirage and Anubis first; Dust II when RR10 is in scope (delivery P0 — monorepo today is Mirage/Anubis only).
3. Store raw `.dem` / `.dem.zst` on private disk or private object storage — **not** the git repo. Keep checksums and source notes.
4. Freeze protocol in RR02: exact split allocation, rubric, three-map/bilingual amendment if still open.
5. Reserve GPU windows with Aleksander for inference vs recording vs training.

### Agent-doable automation
1. Maintain `data/manifest.csv` (match id, map, split, hash, storage URI, permission flags) — commit manifest only (TASKS T01 pattern; align split numbers with RR02 once frozen).
2. Upload through API → parse → findings; paths under `apps/api/data/matches/<id>/` locally or cloud private storage.
3. Labelling via existing tool (extend fields per recording plan §3 when RR12 needs coaching columns):

   ```bash
   python -m eval.label_tool label --match-dir apps/api/data/matches/<match-id> \
     --player <steamid64> --rounds 3,7,12 --labeller <name>
   python -m eval.label_tool agreement data/labels/<a>.jsonl data/labels/<b>.jsonl
   ```

4. Labels live in `data/labels/` (JSONL format in `data/labels/README.md`); commit labels and manifests, never raw demos or identifiable clips in git.
5. Public datasets (OpenCS2 etc.): metadata-first, selective clips only; not a substitute for your labelled corpus; respect licences (recording plan §4).
6. Training export later (RR24): replace hash 80/10/10 with match manifest; include tool schemas; training partition only.

### Practical start this week
1. Put 5–10 permitted demos in a private folder; add rows to a draft manifest with provisional splits.
2. Run Slice A on two maps; fix parse/detector issues.
3. Both label **one shared round** end-to-end to time the pilot before the 30-round overlap.

---

## 6. What NOT to start yet

- **Paid GPU rental / $30 experiment (OPT01)** until local baseline and eval commands exist.
- **QLoRA / fine-tuning (RR25, T50–T53)** until reviewed training conversations and defence build are separate; prefer base model if adapter hurts grounding.
- **Azure/Google Windows recorder VMs** until local CS:DM preflight passes; treat cloud recorder as a bounded experiment, not a delivery dependency.
- **Design implementation / Tactical Lens production CSS** while design remains paused; no new visual exploration without your concept choice.
- **True token/block streaming of unchecked text (OPT02)** before verified-answer path and RR22 are solid.
- **Vision / short-video model (OPT03)** until next P0 gate is secure.
- **Public registration, extra maps beyond agreed three, full 3D POV recreation, progress/practice product (LATER*)**.
- **Hosted LLM APIs** (OpenAI/Anthropic/Google etc.) anywhere — self-hosted only.
- **Silent scope cuts** on maps, languages, evidence or evaluation — escalate instead.

Minimal Three.js tactical fallback is optional feasibility (one map, one round) under hosting/recording plans — not a substitute for starting Radar + cloud parse + local coach first.

---

## Do this next (today)

1. **Unblock demos:** place 1–2 permitted Mirage/Anubis demos in private storage; note paths for agents (outside git).
2. **Run local baseline yourself or assign Slice A:** upload → player pick → Studio Radar + findings; capture failures for RR03.
3. **Confirm design status in one line:** stay paused, or unpause with Tactical Lens + chosen palette for Claude’s static board — so coding agents do not touch Studio chrome prematurely.
4. **Agree this week’s agent assignments:** Slice A + B (and C only if contracts for leases are ready); Aleksander on RR02 protocol + llama.cpp smoke when GPU is free.
5. **Book one shared cloud decision slot:** CPU host candidates from measured parser needs (RR37) — still no GPU spend; uploads stay off until RR07/RR08 safeguards pass.
