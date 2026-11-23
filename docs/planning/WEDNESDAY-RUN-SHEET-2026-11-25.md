# Wednesday 25 November — run sheet

How to make the teacher presentation work, and what to say. Based on checks run on 22 November on Paweł's PC (RTX 5080). It replaces the "Run the demo on the Mac" part of [TEACHER-PROTOTYPE-2026-11-25](TEACHER-PROTOTYPE-2026-11-25.md) as the first choice. That document's Mac route stays as route B below. The [project audit](../PROJECT-AUDIT-2026-11-22.md) has the full findings.

Keep player names, Steam IDs, match IDs and tailnet host names out of this file: the repository is public.

## 1 What was fixed and checked on 22 November

| Fixed | Where | Checked how |
|---|---|---|
| Studio uploads were cut at 10 MB, so every real demo failed with "API not reachable" | `apps/web/src/middleware.ts`; labeller-mode 404 moved into `api/matches/upload/route.ts` | A 118 MB demo through the Studio: 502 before the fix, 200 after, all bytes received |
| Playback jumped ahead after switching browser tabs | `apps/web/src/lib/replay/usePlaybackClock.ts` (frame step capped at 0.1 s) | Typecheck |
| 49 API tests failed on the PC because they read the personal `apps/api/.env` | `apps/api/tests/conftest.py`, `RR_ENV_FILE` in `apps/api/app/core/config.py` | Full suite with no overrides: 346 passed, 3 skipped. Labeller suite: 114 passed |
| Coach text read "against 1 enemies, with 1 kills" | `{n:kill|kills}` forms in `apps/api/app/coach/templates/`; two Polish lines reworded | New test. A fresh review now reads "1 unused grenade", "to 1 enemy" |

**Measured with Qwen3-14B Q4_K_M** (llama.cpp, 32k context, q8_0 KV cache, all layers on the GPU, one run each):

| What | Result |
|---|---|
| GPU memory | 13.2 of 16.3 GB |
| Full review of an already-parsed 22-round Anubis match, one player, Utility focus | 71 s total: detectors 3 s, moment selection by the model 54 s, explanations 13 s. 5 moments picked |
| Ask about the moment ("Which grenades was I holding…") | 1.3 s of model time in the trace; on screen within about 13 s. Cited the right finding; verifier passed; **no tool call**, because the moment's evidence is already in the prompt |
| Ask "Does this happen in other rounds too?" | 1.4 s of model time; on screen within 10 s. **One MCP tool call**, `get_player_history`, which returned 11 unused-utility findings in 21 rounds. The answer used exactly those numbers and the verifier passed |

Weak spot seen live: the cross-round answer cites the moment's finding (F-number) for a whole-match fact. The verifier accepts it. Use this as your honest example on stage.

## 2 Which setup to use

**Changes on the evening of 22 November:**

- **Full backend.** The home PC now also records clips on demand, with the model loaded: 16k context, measured peak 15.9 of 16.3 GB VRAM.
- **3 + 3 reviews.** A review picks 3 good plays and 3 mistakes, with at most 2 moments of one type.
- **Rating line.** The moment list shows an HLTV 2.0-style rating computed in code.
- **Per-round Ask.** Each round has its own Ask chat, and its tools are limited to that round.
- **Clips.** They are re-muxed to AAC so Safari plays them.
- **The review.** It was rebuilt with the Overall focus; see the private case record.

**Chosen on 22 November: route A.**

- **The home PC runs everything:** Qwen3-14B on the RTX 5080, the API, the Studio as a production build, and the CS2 clip recordings (made before Wednesday).
- **The school Mac is only a browser** on the tailnet.
- **One script starts it all:** `.local/teacher-demo-2026-11-25/start-showcase.ps1` (private) starts the model, then the production Studio with the model on, then shares it on the tailnet on port 8443. Keep its window open: it keeps the PC awake and restarts the model or the Studio after three failed one-minute checks. A restart was tested on 22 Nov and took 183 s.
- **Production mode** (`start-local.ps1 -Prod`) sends about 150 KB of compressed JavaScript per Studio page and has no Next.js dev badge.

Route C is still required as the backup.

| Route | How it works | For | Against |
|---|---|---|---|
| **A (recommended)** | The PC runs everything: model, API and Studio. The presentation laptop only opens a browser to the PC over Tailscale | One machine, the exact setup checked on 22 Nov, nothing to install on the laptop | Needs the PC on at home and a network in class that lets Tailscale through (a phone hotspot works as a backup) |
| B | The Mac runs Studio and API with a copy of the data; only the model is reached over Tailscale ([Mac steps](TEACHER-PROTOTYPE-2026-11-25.md#run-the-demo-on-the-mac)) | Radar and saved reviews still work if the network fails | Python, Node, demoparser2 and a build on the Mac, plus copying data: more steps that can break in two days. Copy the 22 Nov fixes first |
| **C (always)** | A 3-minute screen recording of the full demo, played locally, plus screenshots of one trace | Works with no network and no GPU | Not live |

## 3 Preparation

### Monday 23 November: the review and route A

**Steps 1–5 were done on 22 November, and so was the clip recording** (six player-view clips for the review's moments, recorded before the presentation because CS2 and the model cannot share the GPU). The private case record `.local/teacher-demo-2026-11-25/evidence.md` has:

- the review and the moment to lead with;
- a backup taken before the re-run;
- the honest-limits example;
- the link to the paused setup upload, which survives a restart.

On Monday, start with step 6. Steps 1–2 are still the way to start the Studio on Wednesday.

1. **Start the model on the PC.** Use its own PowerShell window and leave it open:
   ```powershell
   & "$env:USERPROFILE\llama.cpp\llama-server.exe" -m "$env:USERPROFILE\models\Qwen3-14B-Q4_K_M.gguf" --alias qwen3-14b-q4_k_m --jinja -c 32768 -ctk q8_0 -ctv q8_0 -ngl 99 --host 127.0.0.1 --port 8080
   ```
2. **Start the Studio with the model on.** Use a second window. The two variables override the Gemma name in `apps/api/.env`, so the traces show the right model:
   ```powershell
   $env:RR_LLM_MODEL = 'qwen3-14b-q4_k_m'; $env:RR_LLM_BASE_URL = 'http://127.0.0.1:8080/v1'; .\start-local.ps1 -Llm
   ```
3. **Make the review you will show: your own player, Utility focus, English, made with the model on.**
   - The saved Anubis Utility review belongs to a friend. Use it only if they agree to it being projected.
   - Re-running the already-parsed Anubis match for your own player takes about 70 s, and the explanations are stored with "Written by qwen3-14b-q4_k_m". They stay there even if the model is off on Wednesday.
   - It also picks up the new grammar.
   - First list the matches and your player ID:
     ```powershell
     (Invoke-RestMethod http://127.0.0.1:8003/matches) | Select-Object id, mapName, status
     (Invoke-RestMethod http://127.0.0.1:8003/matches/<match-id>).players | Select-Object id, name, team
     ```
   - Then run the review:
     ```powershell
     Invoke-RestMethod -Method Post -Uri http://127.0.0.1:8003/matches/<match-id>/player -ContentType 'application/json' -Body '{"playerId":"<your-player-id>","focus":"utility","language":"en"}'
     ```
4. **Pick the moment.** Choose an unused-utility death with a named callout (for example Bridge or A main, not "an unnamed area"). Watch the 10 seconds before it on the radar and decide whether a throw was realistic. Bookmark the Studio URL.
5. **Leave a second upload paused at the setup screen.**
   - Upload any Anubis demo through the Studio (this works since the fix) and stop at "Set up your review".
   - Keep it for the "you choose the player before the expensive parse" point. Never upload live in class: 200 MB over a classroom network is too slow.
6. **Route A over Tailscale.**
   - Port 443 on the PC's tailnet address is already used by another mapping (to `127.0.0.1:8000`), so the Studio goes on 8443. Tailscale allows HTTPS only on 443, 8443 and 10000.
   - On the PC (tailnet-only; never `funnel`):
     ```powershell
     tailscale serve --bg --https=8443 http://127.0.0.1:3003
     ```
   - From the laptop's browser, open `https://<pc-name>.<tailnet>.ts.net:8443`. Check that the Matches page, the Studio, a radar seek, the coach panel, one Ask and one clip all work.
   - Run the test Ask on a moment you will not show, because answers stay in that moment's Ask history.
   - If something fails here, note it and use route B or C.
   - Turn the share off afterwards with `tailscale serve --https=8443 off`. Do not use `tailscale serve reset`: it would also remove the existing 443 mapping.
   - The Next dev server logs a "cross origin request" warning for the tailnet address. It is only a warning in Next 15.5.
7. **Record route C.** Make a 3-minute screen recording of the full demo sequence in section 5, steps 2–7. Also save screenshots of the Ask answers and of the matching trace lines from `.local/data/traces/<date>.jsonl` (tool name, arguments, result, `verifier.ok`, model, prompt version).

### Tuesday 24 November: rehearse and freeze

- **Two timed rehearsals from a cold start**, using the presentation laptop and the projector if you can. Cold start means: restart the PC, start the model, start the Studio, then open every page once, so nothing compiles in front of the class.
- Ask the two questions twice and write down how long each takes. If an answer is not on screen within 30 seconds, or it comes back as a template, plan to show the saved screenshot instead.
- Try one Polish Ask. Show Polish on Wednesday only if you would sign the wording yourself.
- **Freeze the code at Tuesday noon.** After that, change nothing except an actual blocker.
- Both presenters rehearse explaining the other person's half (see section 6).

### Before you leave home on Wednesday

- **Pause Windows Update for a week:** Settings → Windows Update → Pause. Set **Sleep to Never** on mains power. Close CS2, and any game that would use the GPU.
- **Start everything:**
  ```powershell
  powershell -ExecutionPolicy Bypass -File .local\teacher-demo-2026-11-25\start-showcase.ps1
  ```
  It prints the Mac links. Open one of them on your phone over Tailscale before you leave.
- **Optional, for recovery from school:** turn on Remote Desktop on the PC yourself (Windows 11 Pro), so the Mac can reach it over Tailscale with Microsoft's Windows App if something needs restarting.

### Wednesday morning: 60 minutes before

- PC: model window open, Studio running, `tailscale serve status` shows the share. Turn off sleep, Windows Update restarts and Steam/CS2 auto-start.
- Laptop: the bookmarked review open in one tab, the paused setup upload in a second tab, the slides in a third. The recording and screenshots open locally. Charger and hotspot ready.
- Open the review once and press play, so the first load is warm.

## 4 Fallback rules on the day

| If… | Then… |
|---|---|
| The laptop cannot reach the PC at the start | Route C: play the recording and talk over it. Say that it was recorded on 23–24 Nov from the same build |
| An Ask is not back within 30 s, or returns a template | Say "this is the template fallback, which the system uses when the model is not available", then show the saved model answer screenshot |
| The Studio shows an error | Switch to the recording at the same step. Do not debug live |
| A teacher asks for something not rehearsed | Answer from the slides; offer to show it after the session |

## 5 The 15 minutes

| Time | Who | What to do | What to say (short) |
|---|---|---|---|
| 0:00–1:30 | Paweł | Title slide, then the problem | "A demo records every tick of a match. Players are told to watch their demos, but nobody knows what to look for. Can a model on one gaming PC pick the moments that matter and explain them without making things up?" |
| 1:30–3:00 | Paweł | Architecture slide (the proposal's diagram) | "Code decides what happened, the model decides what matters. The model never sees raw coordinates. It gets findings with IDs through tools on our own MCP server, and a checker reads every answer before the player sees it." |
| 3:00–4:00 | Paweł | Studio: switch to the paused setup tab | "After upload we only read the roster. You pick one player, a focus and a language before the full parse." |
| 4:00–6:00 | Paweł | Studio: open the bookmarked review. Play the 5 s before the death. Point at the "You" ring and the grenade tiles. Open Analysis and click the finding citation; the radar seeks | "Finding F-n is measured by code: dead after X s with two unused grenades. The explanation was written by Qwen3-14B on our GPU and checked against that finding." |
| 6:00–8:30 | Aleksander | Ask the moment question, then click "Does this happen in other rounds too?" | "The first answer needs no tool, because the evidence is already in the prompt. The second makes the agent call `get_player_history` through MCP. The 11 and 21 come from the tool, not from the model." |
| 8:30–10:00 | Aleksander | Trace screenshot: tool, arguments, result, verifier ok, model, prompt version, latency | "Every run is saved like this. It is how we debug, evaluate, and later build fine-tuning data." |
| 10:00–11:30 | Aleksander | Limits slide: the checker accepts "a teammate traded your death" for an untraded death; the citation seen in the second Ask | "Passing the checker means the numbers and IDs exist, not that the advice is right. That is why our evaluation measures grounding by hand." |
| 11:30–13:00 | Paweł | Status and scope slide (section 6) | Scope changes, what is measured, what is not, the evaluation plan |
| 13:00–15:00 | Both | Questions, plus your two asks of the teachers | "Can we report the smaller evaluation numbers? Which matters more to you in December: finding the right moment, or helping the player choose a better action?" |

## 6 Slides content

**What works today (show, don't list):** upload, roster-first setup, parsing (100 of 102 training demos parse), radar replay, 10 detectors (6 on by default), ranker and model moment selection, explanations, Ask with an MCP tool call, the verifier with repair and template fallback, keyword retrieval over 158 map-note passages, and 85 recorded player-view clips checked by decoding every frame. The dataset is 146 match groups split by match (100 / 26 / 20), with a sealed test set.

**Measured so far:** the September pilot on 2 matches: verifier pass rate 66/72 for Qwen3-14B and 71/72 for Gemma 4 12B; selection took 24–38 s with Qwen and 108–131 s with Gemma. Plus the 22 November numbers in section 1. Call the September figures **checker pass rates**, not accuracy.

**22 November rerun on one Anubis match**, same moments, EN and PL, 2 repeats (`eval/results/2026-11-22-qwen-vs-gemma/`, not committed):

| | Qwen3-14B | Gemma 4 12B |
|---|---|---|
| Checker passes (explanations / Ask) | 19/20 and 12/12 | 20/20 and 12/12 |
| Needed a repair | 4 | 1 |
| Moment selection | 42 s | 54 s (it was 108–131 s in September) |
| Peak VRAM | 13.1 GB | 12.6 GB |

Reading the texts shows what the pass rates hide:

- **Polish:** Gemma is clearly better. Qwen produced "granadami", "na rondzie 13" and broken phrases.
- **English explanations:** Qwen hedges more and cites the map notes. Gemma asserts unsupported causes ("this mistake meant…").
- **"What should I work on next match?":** Gemma cited 11 real findings; Qwen gave uncited general advice.
- **The point to make:** a pass rate is not quality, which is why the December evaluation adds human ratings.

**Scope changes since the proposal:** Mirage → Ancient; Dutch dropped; split now 65 / 15 / 20 by match. Ancient has a radar but no callout zones or map notes yet; say so.

**Not done yet (say it plainly):** human labels, detector precision and recall, moment-pick comparison, retrieval evaluation, the question set, the template-versus-model table, fine-tuning and the user study. Then show the plan and the reduced numbers from the [improvement plan](IMPROVEMENT-PLAN-2026-11-22.md#4-what-to-ask-the-teachers-on-wednesday).

**What we fixed this week, and why it matters** (one slide, if asked about engineering): the upload cut at 10 MB, found by testing a real 118 MB demo; tests that depended on a personal settings file; the playback jump; singular and plural text. One line each. It shows that you test the real path, not only the unit tests.

**Who did what:** say it truthfully, including that you used AI coding agents (Claude Code, Codex) to write much of the code. Then show that each of you can explain the main path with the code open: upload → parse → detectors → agent → verifier.

## 7 Do not

- Do not upload a demo live, record with CS2 live, or open `/admin` or the Lab (they still use the old style).
- Do not say the advice is "verified correct", that the model is fine-tuned, that Ancient is fully supported, or that a cloud version exists.
- Do not change code after Tuesday noon.
