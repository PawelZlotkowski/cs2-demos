# Round Reviewer first prototype for 25 November 2026

**20 November local audit:** [results and rehearsal gates](../coach/SHOWCASE-READINESS-AUDIT-2026-11-20.md). All 85 current grouped clips are ready, with a verified private export. Use prepared footage for the demonstration. Local parser/annotation/Ask evidence safeguards are tested; the actual Mac/projector/Tailscale model route still needs rehearsal. This audit does not certify live inference or the shared cloud deployment.

Updated 16 November for Paweł Złotkowski and Aleksander Brunzlow. On **Wednesday 25 November 2026**, use the **15-minute presentation** to follow one decision from a player’s match to advice the teachers can inspect. Allow six minutes for hands-on Studio, keep the prepared review on the presentation Mac, and send one coaching question to Paweł’s RTX 5080 over Tailscale. [Mac setup](#run-the-demo-on-the-mac) · [15-minute running order](#the-15-minute-presentation) · [Teacher handout](../university/Round-Reviewer-teacher-brief-2026-11-25.pdf)

The older delivery plan schedules a first defence on **17 November**. Use **25 November** for the teacher presentation Paweł has requested. The dates alone do not establish that an earlier defence took place or that the course changed its final deadline. **6 December** remains the recorded invited-user and university submission target. The dates below apply to this checkpoint and use the existing RR tasks. [Submitted proposal](../university/project-proposal-Pawel-Zlotkowski-original.docx) · [Delivery plan and owners](FINAL-DELIVERY-PLAN.md)

## Run the demo on the Mac

**Paweł’s Mac runs Next.js, FastAPI, demoparser2 and the saved match. The Windows PC runs llama.cpp.** The browser opens `http://127.0.0.1:3003`. Next forwards `/api` to port 8003 on the Mac. FastAPI reads the selected player’s findings, calls the model over private Tailscale HTTPS, checks the answer, then returns it to Studio. Loading the match, playing the radar and opening an existing explanation only need the Mac. Use the real Studio on the projector. Apply the chosen Porcelain design to the Library, radar and coach panel as those screens are built from the contracts. [Next routing](../../apps/web/next.config.ts) · [Coach jobs](../../apps/api/app/coach/jobs.py) · [Porcelain showcase plan](../../.cursor/skills/rr-porcelain-ui/references/build-plan.md)

### 1. Prepare the Mac and the review first

Transfer the current Studio source, including intended uncommitted showcase changes, and one permitted Anubis demo privately to the Mac. Begin with a fresh project directory and native Mac dependencies. Leave Windows virtual environments, `node_modules`, private environment files and unrelated player data on the PC. In the commands below each new terminal starts at the Studio repository root. Python 3.13 and Node 24 match the major versions of the Windows baseline. Install and build while online.

```sh
python3.13 -m venv apps/api/.venv
apps/api/.venv/bin/python -m pip install -e ./apps/api 'demoparser2==0.42.0' 'mcp==2.2.0'
apps/api/.venv/bin/python -c 'from demoparser2 import DemoParser; import uvicorn; print("Parser and API runtime imported")'
npm --prefix apps/web ci
export API_INTERNAL_URL=http://127.0.0.1:8003
npm --prefix apps/web run build
npm --prefix apps/web run typecheck
```

In the **Mac API terminal**, create the rehearsal review with inference and recording off. Keep the same data directory for the whole presentation. It holds both the SQLite database with the selected player and findings, and the files containing each round’s replay. [Match storage](../../apps/api/app/repositories/matches.py) · [Analysis storage](../../apps/api/app/repositories/analysis.py)

```sh
export RR_DATA_DIR="$PWD/.local/teacher-demo-2026-11-25/data"
export RR_ANALYSIS_PROFILE=local-v1 RR_LOAD_SAVED_SETTINGS=false
export RR_AUTH_ENABLED=false RR_CSDM_ENABLED=false RR_LLM_ENABLED=false
export RR_PUBLIC_URL=http://127.0.0.1:3003
export RR_CORS_ORIGINS='["http://127.0.0.1:3003"]'
cd apps/api
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8003
```

In the **Mac web terminal**, start the production build. Use the same API address at build and start. Leave this terminal running.

```sh
export API_INTERNAL_URL=http://127.0.0.1:8003
npm --prefix apps/web run start -- --hostname 127.0.0.1 --port 3003
```

From another terminal, run `curl -fsS http://127.0.0.1:3003/api/health`. Open Studio, upload the demo, choose the intended roster player, **Utility** and **English**, then select **Start review**. Bookmark the resulting Studio review. Open one moment, play through the event, click its finding citation and confirm the player, round and clock after refreshing the page. Ask the rehearsal question with the model off and save the rule-written response for comparison. For the one-minute introduction to setup, upload the same file a second time and leave it paused at the roster in a separate tab.

### 2. Connect one live question to the RTX 5080

On 16 November the Qwen3-14B Q4_K_M file, llama.cpp executable and Tailscale CLI were present on the Windows PC. The local model endpoint refused a connection on port 8080. Start the server before testing the Mac link. From **Windows PowerShell**, leave this process running and keep the PC awake for rehearsal and class.

```powershell
& "$env:USERPROFILE\llama.cpp\llama-server.exe" -m "$env:USERPROFILE\models\Qwen3-14B-Q4_K_M.gguf" --alias qwen3-14b-q4_k_m --jinja -c 32768 -ctk q8_0 -ctv q8_0 -ngl 99 --host 127.0.0.1 --port 8080
```

Join both machines to the same tailnet, enable tailnet HTTPS and permit the presenter’s Mac to reach the chosen HTTPS port under the tailnet access rules. In a second **Windows administrator PowerShell**, check the local model and existing Serve mappings. If 8443 is free, use the command below and leave its foreground session open. If occupied, choose a free port and use the URL Serve prints. Ctrl+C ends this foreground proxy. [Tailscale Serve](https://tailscale.com/docs/features/tailscale-serve) · [Serve command reference](https://tailscale.com/docs/reference/tailscale-cli/serve)

```powershell
(Invoke-RestMethod http://127.0.0.1:8080/v1/models).data.id
tailscale serve status
tailscale serve --https=8443 http://127.0.0.1:8080
```

In the **same Mac API terminal** as step 1, stop uvicorn with Ctrl+C. Substitute the actual Serve URL below, including its port. Check that the Mac sees the model ID, then restart FastAPI with inference enabled. The Windows local launcher checks for a loopback model URL. Starting uvicorn directly on the Mac lets the coach use this private HTTPS endpoint. [Local launcher](../../tools/local_app.py) · [Model settings](../../apps/api/app/core/config.py)

```sh
export RR_LLM_BASE_URL='https://WINDOWS-HOST.TAILNET.ts.net:8443/v1'
curl -fsS --max-time 5 "$RR_LLM_BASE_URL/models"
export RR_LLM_MODEL=qwen3-14b-q4_k_m RR_LLM_ENABLED=true
.venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8003
```

Reopen the **same** prepared moment and submit a fresh Ask with the same question. Check the answer’s `source`, the cited finding, the tool result and verifier outcome in the matching trace. Capture the elapsed time and a redacted copy of the answer. A previously stored template stays a template after a server restart. Practise with the actual projector and, if possible, the classroom network.

### 3. Decide what to run live

By **Tuesday 24 November**, start the Mac services from a cold launch, open the bookmark and make the citation seek correctly. Try the live question twice. Budget **30 seconds from Send to a usable, cited model answer** per attempt. If either run misses the budget, returns a template or lacks evidence for the claim, present a dated model answer from a successful rehearsal. If there is no such run, use the template and describe the earlier model pilot with its date. This time limit is a presenter cue only.

Save a short screen recording, the two attributed answers and a redacted trace excerpt on the Mac. With the demo API stopped, copy the rehearsal data directory as a backup. Then turn Wi-Fi off, start the same API with `RR_LLM_ENABLED=false`, open the bookmarked match from a fresh browser tab and replay the finding. Also open the recording in a local player. On the day, if Ask stalls, switch to the saved answer at the 30-second mark. If Studio itself fails, play the local recording. Keep CS2 capture out of the live session. An optional POV clip earns its time only if both presenters can identify the same player, round and event in it.

**Where Vercel fits.** A hosted link can serve the Next.js frontend for the December invited-user work. Give that deployment an authenticated HTTPS FastAPI on a persistent CPU host, set `API_INTERNAL_URL` to that backend before building, and keep the private model connection on the backend side. An ordinary Vercel deployment has no route to the Mac’s loopback or the home tailnet by default. The existing upload passes the full demo through a Next.js route handler. Vercel Functions cap request bodies at 4.5 MB, well below a typical demo. For a hosted upload, send the file directly to an authorised backend or private object storage and have the persistent parser process it there. A hosted preview of a preloaded review can skip the upload change. [Studio upload handler](../../apps/web/src/app/api/matches/upload/route.ts) · [Vercel upload limit](https://vercel.com/docs/errors/function_payload_too_large) · [Shared cloud release scope](FINAL-DELIVERY-PLAN.md)

## Prepare the classroom example

**Proposed classroom demonstration.** Allow six minutes. Open a previously parsed Anubis match, select the intended player’s Utility finding, and seek to the event on radar. Ask one question about that decision. Compare a rule-written answer with a genuinely generated answer from the local model, then show the evidence the model used and one limitation. Rehearsing and saving the model output ahead of time gives the class a dependable demonstration even with the GPU offline. Label the saved run with its date and source. English is the presentation language proposed here. Polish stays in the evaluation pilot.

**What the students supply before case-specific work begins**

| Who | What to supply | What it unblocks |
|---|---|---|
| Paweł | One private demo path or saved Studio review reference, the exact roster player to select, and confirmation of what can be projected or recorded for class. If display permission is unknown, choose another permitted match. | The replay agent can establish a reproducible example. The path and player identity stay in the private handoff. |
| Aleksander | A window to use the RTX 5080 and the exact question from the moment below, adapted once if the chosen event changes. | The coach agent can compare answers to the same question on the same evidence. |
| Both | Rehearse the six-minute Studio segment within the 15-minute slot. Mark the first six training rounds and the four separate validation situations in the private manifest before looking at suggestions or model outputs. Confirm the same cases and player selections with each other. | The first demo, the labelling pilot and the evaluation have separate evidence. Full corpus labelling can continue later. |

Paweł can supply the match immediately while Aleksander prepares the model. The review example and scheduling are enough to start the replay work. The four validation situations are needed for the comparison stage. If 80 distinct usable matches are confirmed, the [data protocol](ROUND-LABELLING-GUIDE.md#a-collection-plan-for-the-current-eighty-demos) reserves 50 for training, 10 for validation and 20 for final testing.

**Acceptance for 24 November.** From a fresh Studio start, another person can open the saved review and land on the intended player, round and event by clicking the citation. Both answer sources are visible. A saved trace from this build connects the generated answer to its real tool output. The students have independently rated the validation pairs and recorded the actual denominator, including failures. The presentation laptop plays a timed offline rehearsal with no model or network. Report the pilot as partial if fewer than four situations are ready. If the fresh trace is missing, describe the classroom result as a replay/template prototype and show the dated September model pilot separately. Recorded player-view footage is optional and needs its own player and timing check.

## The moment to build around

In a saved Anubis Utility review, the deterministic ranker linked **finding F8** to **round 6**. At **46.469 seconds after freeze time ended**, the selected player died holding **an HE grenade and a flashbang**. The selected replay window runs from **41.47 to 49.47 seconds**. These values were checked in the saved database on 16 November. Ask “Which grenades was I holding when I died, and what should I look for in the replay to decide whether I could have used one?” The inventory answers the first part. Watch the approach to the fight before judging whether there was a safe throw.

This is a real technical example drawn from saved findings and moments. The smoke tool picked the first parsed player. It recorded six skipped clips for that review. Paweł should confirm the intended player and classroom use, then use the confirmed review’s own finding, time and clip. A new selection can produce different IDs. Review a wider portion of the round when deciding whether the advice is fair. [Anubis setup check on this PC](../../qa-out/setup-utility-smoke.json) · [Smoke checker](../../tools/check_local_demos.py) · [Labelling guide](ROUND-LABELLING-GUIDE.md)

## What exists and which decisions it supports

| Area | What the repository establishes | Consequence for this version |
|---|---|---|
| Source history | Studio is the canonical working tree, with September commit `286281c` and substantial later uncommitted work. The accounts tree shares Studio’s original 516 tracked files and adds the floating-desktop study. The older `cs2-demos` is a replay/coach predecessor. The nested Phase 1 folder is a 261-file export without Git history. Studio preserves selected changes in five patch sets. | Work in Studio. Keep the browser, accounts and contracts. Integrate parser reliability, replay timing, coach contracts, MCP access and dependency changes by domain. The Phase 1 test totals belong to that export. [Consolidation](../consolidation/README.md) · [Integration status](../../integration/phase1/README.md) |
| Selected-player pipeline | FastAPI inspects a demo’s roster before full parsing. The user chooses one player, focus and coach language. demoparser2 produces events and 8 Hz replay positions. The local profile filters candidates by focus and ranks up to six. An October check parsed 22 rounds and ten players on each map, producing 34 findings on Ancient and 36 on Anubis. An Anubis Utility review yielded 12 findings and six moments. | Use one known-good Anubis file and manually select a player. Show the difference between a measurable event and a judgement. Six is a cap. The conservative local profile leaves signals such as dry peeks and late rotations for further calibration. [Runbook](../LOCAL-V1-RUNBOOK.md) · [Detector policy](../../apps/api/app/analysis/policy.py) |
| Replay and interface | The Next.js Studio has upload/setup, saved matches, radar, per-round playback, evidence links, Analysis, Ask and feedback. The source implements citation seeking and explanation provenance. The setup offers English and Polish coaching. | Present the selected-player path and existing English interface. Check the cited moment and keyboard seek on the actual projector. Show English/Polish as coach output. The no-player Ask path and simulated coach screens are poor evidence for this demonstration. [Studio](../../apps/web/src/app/studio/%5BmatchId%5D/page.tsx) · [Coach UI](../../apps/web/src/components/coach/CoachPanel.tsx) |
| Model and retrieval | The code includes a self-hosted llama.cpp client, a tool loop with MCP, retrieval, saved traces, a checker, one repair attempt and template/ranker fallbacks. SQLite keyword retrieval works with map notes. Dense retrieval needs a configured local embedding service. The stored map notes and callout polygons cover Anubis and legacy Mirage. Ancient has a radar asset and transform, with named zones and reviewed knowledge still open. | Start with Anubis. Show a real tool result and the matching finding or retrieved passage. Record which transport and retrieval mode actually ran. Numeric and citation checks address some errors. The students assess tactical sense independently. [Coach jobs](../../apps/api/app/coach/jobs.py) · [Checker](../../apps/api/app/coach/verify.py) · [Retrieval](../../apps/api/app/rag/index.py) · [Knowledge](../../data/knowledge) |
| Measured local AI | The 27 September RTX 5080 pilot compared two matches, Mirage and Anubis, in EN/PL/NL, with two repeats. Qwen3-14B Q4_K_M passed the explanation checker on 66/72 outputs, Gemma 4 12B Q6_K on 71/72. On Anubis their moment selection took 24 s and 131 s respectively. | Qwen is a sensible first rehearsal model on this machine. Gemma is a documented quality/speed comparison. These figures describe the old pilot and its checker. A current trace and independent judgement answer different questions. [Model comparison](../coach/MODEL-OPTIONS.md) |
| Footage and annotation | The separate labeller saves independent full-round judgements, then reveals candidates for feedback, with separate signal and decision labels. Its Windows recorder produced real Anubis POV footage, including a 51-clip batch with spot-checked alignment. Another local batch had 46 ready on 30 October. Studio has asynchronous moment clip jobs and media checks. | Cite recorder results as labeller evidence. Use an MP4 in the presentation only after checking its review, player, round and event. File counts measure capture. Use independent full-round labels to measure missed events. [Labeller and recorded results](../LABEL-TOOL.md) · [Studio clip jobs](../../apps/api/app/processing/moment_clips.py) |
| Design | Paweł chose Porcelain for the showcase on 15 November. Its reference screens use sample data. | Rehearse the implemented Studio against a parsed match after each change to the radar, moment list or coach panel. [Design decision 28](../handoff/19-DECISIONS.md) · [Porcelain screens](../../.cursor/skills/rr-porcelain-ui/references/screens.md) |
| Delivery and research | Accounts, roles, an admin Lab, storage, evaluation helpers and a training-data exporter exist. The default local launcher uses loopback with sign-in, model and capture disabled. A shared HTTPS CPU parser, remote worker recovery, full Studio clip delivery, a deployed fine-tune and the invited study still need end-to-end evidence. | Keep the classroom demonstration local. Preserve shared cloud parsing and private artifacts as December commitments. Treat QLoRA as a measured experiment following a baseline and reviewed training data. [Local operation](../LOCAL-V1-RUNBOOK.md) · [Delivery gates](FINAL-DELIVERY-PLAN.md) |

**Scope to explain to the teachers.** The submitted proposal describes Mirage/Anubis, English/Polish/Dutch and roughly 70/15/15 by match. The team’s current delivery direction is **Ancient/Anubis, English/Polish**, with **65 training / 15 validation / 20 test matches** as the target allocation. This retains Anubis across both versions, gives each partner 20 held-out matches for independent moment picks, and concentrates map and language work. The newer setup also lets the user choose the player before expensive parsing. Present scope changes explicitly and record feedback on their academic acceptability. The repository’s archived Word proposal matches the supplied attachment byte for byte.

## Work through 25 November

| Date | Paweł owns | Aleksander owns | Evidence required to move on |
|---|---|---|---|
| Mon 16 – Tue 17 Nov | Build the app on the Mac and use the model-off setup above to save one permitted Anubis Utility review for the intended player. | Check the same round independently. Write one factual observation, one possible alternative and what the evidence leaves uncertain. Start Qwen on the PC and check its model ID. | The Mac serves a real replay after a restart. The private case record has the player alias, round, clock, finding ID, window and classroom permission. |
| Wed 18 Nov | Check the Mac-to-PC model connection, then replay the candidate and test the citation seek in both directions. | Make one fresh Ask from the Mac and compare it with the template on identical evidence. Save model, prompt version, tool result, checker decision, repair or fallback, and latency. | Two attributed answers and one real model trace, or a recorded failure with the template path working. |
| Thu 19 – Fri 20 Nov | Check evidence navigation, saved review reload and clip-unavailable behaviour. Fix only a reproducible blocker if implementation begins. | Repeat the paired comparison on the small pilot below. Include one unsupported statement from a controlled verifier test and show its rejection. | A short anonymised trace, matched answer pairs and honest failed-output counts. If the model remains unavailable, prepare the September results with their original scope. |
| Sat 21 – Sun 22 Nov | Create an offline screen recording of the same review, including evidence and source labels. Test the PDF and recording on the presentation device. | Collect independent blind ratings with Paweł. Write a two-sentence interpretation and one limitation. | Playback with network/GPU unavailable, plus a preliminary table with counts, ties and disagreements. A smaller completed pilot is acceptable if its actual denominator is shown. |
| Mon 23 – Tue 24 Nov | Freeze the Mac build and review. Rehearse from a cold launch on the projector, then with Wi-Fi off and the saved materials available. | Reproduce the example, time two Ask attempts, check the Polish wording for the pilot and rehearse explaining the parser half. Paweł rehearses explaining the AI half. | Six minutes in Studio, the whole talk within 15 minutes, and the offline review and recording both open locally. Decide whether live Ask meets the 30-second budget. |
| Wed 25 Nov | Drive Studio and replay. | Explain the model comparison and ask for feedback. | Record the teachers’ decision on scope, how they want learning value assessed and which December gap matters most. Add required changes to the owning RR task. |

**If time contracts**, protect the real player → finding → replay link, one attributed explanation, the September pilot figures and the offline rehearsal. Add a fresh paired trace next. A clip or a second language on the projector can be dropped from the talk while their December commitments remain visible. If current model output cannot be reproduced, present the rule-written answer and the dated GPU pilot separately.

## Direct instructions for the smaller agents

The repository history, backend/model and Studio reviews have run. Small Sol agents also checked the saved moment, the evaluation design and the teacher-facing claims. The following assignments can be handed to the implementation agents when work starts. Each has one owner and a handoff the next person can use.

### Copy this into a new agent session after approval

```text
Prepare Round Reviewer for the 25 November teacher demo in C:/Users/pawel/Documents/cs2-demos-studio. Read AGENTS.md, docs/planning/TEACHER-PROTOTYPE-2026-11-25.md (especially the four assignments below), and docs/planning/ROUND-LABELLING-GUIDE.md. Use the students' private inputs for the match, player, permitted display, model window and presentation constraints.

Start the Backend and replay, Coach and evaluation, and Studio and interaction assignments with small Sol agents. Backend produces the real event record first. While waiting, Coach checks local model availability and prepares the blinded rating sheet, and Studio tests replay navigation on an existing development review. When the real event record arrives, both use that same player, finding and round. Run Rehearsal and recording after the replay and answer outputs are available. Schedule GPU recording and inference in separate windows.

Keep the private inputs and evidence under .local/teacher-demo-2026-11-25/ on the working PC. Hand off evidence.md (player alias, source match reference, finding, raw tick/elapsed time, event and missing context), answers.jsonl (system, question, evidence, response source, trace reference, latency and failure status), the shuffled rating sheet, and a short walkthrough. Give the students the blinded sheet before revealing the answer key. Only the students fill human labels, ratings and classroom permission. Share redacted screenshots and trace excerpts for class.

Use the existing application and preserve the current working tree. Fix a reproduced blocker in the responsible agent's area and add a regression check where needed. Keep code outside that slice for a later task. Each agent returns the evidence location, exact check performed, observed result, and any remaining blocker. Finish with a ready/partial result against the 24 November acceptance criteria and identify every item demonstrated from a saved run.
```

| Agent and owner | Give the agent this assignment | Return when |
|---|---|---|
| Backend and replay · Paweł · RR03/05/10/19 | Start with the permitted private review. Trace a selected finding through `processing/pipeline.py`, `analysis/run.py`, the stored moment and its existing API contract. Establish player, round, tick, elapsed time, evidence fields, source and missing clip state. Use the current Pydantic models and their TypeScript mirrors. Reproduce any broken link before changing its owner. | Deliver the anonymised evidence record, observed API fields and matching replay timestamp. Reopen the saved review, seek forwards and backwards and confirm the same event. Run the focused setup/policy/media tests. |
| Coach and evaluation · Aleksander · RR04/14–17/23/26 | Take the backend record. Explain the same event with templates and one local GGUF model in EN and PL. Use the scoped tool path. Capture a matching finding lookup and, when relevant, one retrieved passage. For each output record generation source, model/quantisation, tool backend, evidence, checker/repair, latency and human judgement. | Deliver one short redacted trace, paired outputs and a blind results sheet. With the model disabled, identify the template. For the rejection example label controlled test input as such. Report eligible cases, failures and actual denominators. |
| Studio and interaction · Paweł · RR18/19/22 | Use the existing player picker, Studio and coach components. Put one real finding, the shared clock, explanation source and feedback in view. Check pointer and keyboard citation seeking, focus on return, reduced motion, long Polish text, refresh and missing media. Record any point where the teacher loses the link from evidence to advice. | Deliver an annotated screenshot or short walkthrough, plus the smallest required interaction change. Show the intended player and event after a seek and again after reload. Review the design before porting anything from Match Room. |
| Rehearsal and recording · Paweł, independently checked by Aleksander · RR20/27/28 | Use the confirmed event to check the actual POV, round, event anchor and saved-file provenance. If the recorder database is offline, use checked footage already on disk or demonstrate radar. Exercise the classroom machine twice. Keep raw demos, player identifiers and private traces out of shared artifacts. | Deliver a six-minute run sheet, one offline recording and a list of the gates that passed. A labeller clip carries a labeller label. Each student can explain both a failure and a fallback. |

**Skills to use.** Paweł needs Python/FastAPI and Pydantic, demoparser2 and zstd, tick-to-round timing, SQLite, React/Next.js and TypeScript, accessible playback controls, Windows CS Demo Manager/FFmpeg, and integration testing. Aleksander needs llama.cpp/GGUF on the RTX 5080, MCP tool scoping and traces, hybrid retrieval, citation checking, bilingual assessment, paired experimental design and match-level split discipline. Both need CS2 decision review, independent annotation and short demonstrations for a non-player audience. For December add deployment/HTTPS and private job storage on Paweł’s side, and PEFT/QLoRA, adapter reload and held-out evaluation on Aleksander’s side.

Use the repo’s [detector](../../.cursor/skills/rr-detector/SKILL.md), [coach agent](../../.cursor/skills/rr-coach-agent/SKILL.md), [evaluation](../../.cursor/skills/rr-eval/SKILL.md) and [accessibility](../../.cursor/skills/better-accessibility/SKILL.md) guides first. For a concrete layout change, consult [layout](../../.cursor/skills/better-layout/SKILL.md) and [design engineering](../../.cursor/skills/emil-design-eng/SKILL.md). The [Phase 1 guides](../reference/phase1/skills) cover parser, architecture, recording, access and deployment as historical references. The first prototype needs no additional skills installation.

## The pilot

Use the [collection and independent labelling protocol](ROUND-LABELLING-GUIDE.md#a-collection-plan-for-the-current-eighty-demos) to allocate the roughly 40 demos per map, select training rounds for calibration and reserve validation cases for the blind comparison.

**Proposed pilot.** Select four development situations, ideally two per target map. Use the same player, finding and question within each comparison. Four situations × two languages gives eight paired cases and 16 outputs. Capture the template separately because the model comparison runner enables inference. Shuffle A/B within each case, hide system names, and have both students select template/model/tie for a feasible, evidence-supported next action. Per language, report wins/losses/ties over eight judgements and exact agreement over four cases. Log unsupported claims, fallbacks and latency separately. Keep the system assignment even when the model falls back. Report a smaller pilot with its real counts if necessary. The Lab currently pairs agent-only traces, so an offline rating sheet is sufficient. [Comparison runner](../../eval/compare_models.py) · [Lab pairing](../../apps/api/app/services/evaluation.py)

## The 15-minute presentation

| Elapsed | Presenter | What to do |
|---|---|---|
| 0:00–2:00 | Paweł | Ask “Can a player check the advice a model gives about one decision?” Explain that a demo records a match and a flashbang can blind an opponent. Show the journey from a demo file to one selected player’s review. |
| 2:00–3:00 | Paweł | **Begin the live Studio segment.** Show the roster, Utility focus and English in a separate upload already paused at setup. Switch to the bookmarked, completed review of the same match and player. |
| 3:00–5:00 | Paweł | Open the unused-grenades moment and play the few seconds before the death. Click its finding citation and point out the round, clock and inventory. Use the actual reviewed player’s finding ID. |
| 5:00–8:00 | Aleksander | Submit the rehearsed Ask if it passed the timing check. While it runs, show the template and what evidence the parser had. At 30 seconds switch to the saved response if needed. Compare the advice, show its tool result and click the finding. End the six-minute Studio segment. |
| 8:00–10:00 | Paweł | Explain which work ran on the Mac and which ran on the RTX 5080. Walk through the matching trace from tool result to checked text. Show one measured latency and name the model. |
| 10:00–12:00 | Aleksander | Show the blind comparison with its actual case count if ready. Explain what the inventory establishes and why it takes a human watching the lead-up to judge whether a throw was feasible. |
| 12:00–15:00 | Both | Take questions. Ask which outcome the teachers would value more in December: spotting the right moment or helping the player choose a better next action. |

## Checks and work after the checkpoint

On 15 November the host preflight found Python/web dependencies, demoparser2 0.42.0, the recorder CLI and ffprobe. The recorder database answered on loopback. Database authentication and game capture require a recording session. **73 distinct focused tests passed** on disposable data: 16 for setup, detector policy and clip validation, plus 57 for mock coach jobs, verification and retrieval. The October runbook records a wider 299-pass/4-skip API run. A current browser-to-model-to-POV rehearsal on the presentation machine remains open.

The Windows-only development run remains available through `.\start-local.ps1 -Check` and `.\start-local.ps1`. For the presentation device follow the Mac setup above. The Mac build, private model link and timed classroom run still need verification on the presenters’ devices. [Windows runbook](../LOCAL-V1-RUNBOOK.md)

After the checkpoint, pursue the shared cloud API/parser with two isolated sessions and GPU workers disconnected, private storage and durable/recoverable jobs. Complete Ancient callouts and reviewed EN/PL knowledge, verify selected-player POV delivery through Studio, and reproduce the invited-user flow. For research, the repository targets 100 distinct matches, 150 independently sampled rounds including 30 double-labelled, independent top picks on 20 test matches, 150 bilingual questions, at least 300 accepted training conversations and a 5–10-player study. These are targets. Use unseen matches for the final comparisons and track detector precision/recall, top-six overlap/NDCG, retrieval hit rate/MRR, tool success, unsupported claims, human usefulness, latency and VRAM.

Two dependencies govern training. The labeller’s v2 exports capture human judgements and require conversion to reviewed tool-use conversations. The existing training exporter still uses a hash-based 80/10/10 split. Reconcile it to the agreed match manifest before training, keep all versions of a match together, then compare base versus adapter and verify reload. At the 25 November meeting, identify any December commitments that need re-scoping based on actual progress. [Labelling exports](../LABEL-TOOL.md) · [Dataset exporter](../../apps/api/app/services/dataset.py) · [Final milestones](FINAL-DELIVERY-PLAN.md)
