# Round Reviewer — floating desktop (experimental)

Round Reviewer as a light macOS-style desktop: every player surface from the roadmap (PR #22) is a floating window with frosted chrome, traffic lights, drag, focus and a dock. It runs on the **real FastAPI backend** in `apps/api`, the same API as `apps/web`, and reuses the web app's API client and contracts (`apps/web/src/lib`) through the `@/` alias, so there is one copy of each.

This folder does not replace `apps/web`, the Night ops layouts or `prototype/analysis-studio.html`.

## Run it

On Pawel's Windows PC with the model, clips and Lab on, follow [RUN-ON-PC.md](RUN-ON-PC.md).

Start the API as usual (see `docs/RUN-LOCALLY.md`), then:

```bash
cd prototype/rr-floating-desktop
npm install
npm run dev
```

Open **http://localhost:5173**. The dev server proxies `/api` to `http://127.0.0.1:8000`, so the API needs no extra CORS origin. For another API address set `RR_API_URL` (for example `RR_API_URL=http://127.0.0.1:8003 npm run dev`). `npm run build` type-checks and builds to `dist/`; `npm run preview` serves the build with the same proxy.

The coach model, CS Demo Manager clips and the Lab follow the API's `.env` exactly as in `apps/web`: with `RR_LLM_ENABLED` off the coach writes from the finding templates, with `RR_CSDM_ENABLED` off moments have no clip and the radar takes the stage, and the Lab window needs `RR_LAB_ENABLED=1`.

## Add Match

Add match opens a separate, fixed-size window that works like a macOS installer: the steps down the left (Introduction, Demo file, Reading the demo, Player, Coach review, Summary), one step on the right, Go Back and Continue at the bottom. The introduction shows which coach model and clip recorder the API will use. Reading and Coach review each have a progress bar driven by the API's stages (clip recording counts clip by clip) with the stage list under Show details. Closing the window never stops the work: Matches shows the progress, clicking a busy or waiting match reopens the installer on its step, and a notification says when a pick is waiting or a review is ready.

## What each window calls

| Window | API |
|---|---|
| Matches | `GET /matches` (polled while a match is processing), `POST /matches/{id}/rerun`, `GET /system` for the served model |
| Add Match (installer) | `POST /matches/upload` with progress, `GET /matches/{id}/status` stages for both progress bars, `GET /matches/{id}` roster with kills and deaths from `GET /matches/{id}/events`, `POST /matches/{id}/player` with the coach language, `GET …/clips` for the summary |
| Studio | match, rounds, round replays (one round at a time), findings, round stats, moments, moment clips (`.mp4` played on the shared clock, "Record again" on a failed one, downloads under the API's readable name), whole-round CS:DM clips when a round has no player clip, a clip queued when a round is explained on demand, summary, moment explanations, explain round, wrap-up and drills, done well, Ask (server-sent events), bookmarks and "Ask about this" |
| Coach | `POST /players/{id}/ask` (events, `[M2:F3]` citations open the Studio), plan `GET/POST/PUT /players/{id}/plan`, knowledge browse, flag and admin notes |
| Progress | `GET /players/{id}/progress` |
| Settings | `GET /system`, `GET /features` |
| Lab | traces, labels and picks, evaluation and blind A/B, dataset review and export |

Citations such as `[K7]` load the passage from `GET /knowledge/{id}` when clicked.

## Try it without a CS2 demo

`qa/dev_api.py` runs the real API with only demoparser2 replaced by a scripted 8-round Mirage match, so upload, player pick, detectors, moment selection, stub clips, explanations, Ask, Coach, Progress and the Lab can all be clicked through anywhere. It keeps its data in its own folder (`$TMPDIR/rr-dev-data`), not in `apps/api/data`.

```bash
cd apps/api
RR_LAB_ENABLED=1 RR_CSDM_ENABLED=1 RR_CSDM_MODE=stub .venv/bin/python ../../prototype/rr-floating-desktop/qa/dev_api.py
```

Then upload any file that starts with the demo magic, for example `printf 'PBDEMS2\0' > fake.dem`. The scripted parse waits 4 seconds so the installer's progress can be seen; `RR_DEV_PARSE_SEC` changes that.

## Check the main flows in a browser

```bash
pip install playwright && python -m playwright install chromium
python qa/happy_path.py http://localhost:5173/ qa/out [path/to/demo.dem]
```

It uploads the demo (a stub one if none is given, which only parses under `qa/dev_api.py`), picks the first player, then walks the Studio (brief, moment, playback, Ask, Round, Notes, Debrief), Coach (Ask, Plan, Knowledge), Progress, Settings, Lab and a re-run. It prints PASS or FAIL per step and fails on any console error. Screenshots land in `qa/out/`. `CHROME_PATH=/path/to/chrome` uses an installed Chrome.

## Window manager

Drag by the title bar, click to focus, double-click the title bar or the green light to zoom, drag an edge to resize, yellow minimises into the dock (click the tile to restore), red closes and the dock reopens the same window. The Lab shows in the dock when the API has it on, or with the switch in Settings or `?lab=1`.

## Look

Light macOS materials: a quiet grey wallpaper, a translucent menu bar and dock, windows with `backdrop-filter` blur on the chrome and sidebars, and near-opaque content so text stays legible. System faces (`-apple-system`, Segoe UI) with Hanken Grotesk only where no system face exists; system blue `#007AFF` as the one accent; an orange triangle for a mistake, a blue circle for a good play and a hollow circle for context such as an opening duel. The media stage stays dark, like a video well. Motion is limited to window open and close, minimise, zoom, the segmented pill and the PiP swap, and `prefers-reduced-motion` turns it off.

## Files

```
src/
  main.tsx, state/store.tsx       window manager, matches, system status, coached player
  data/                           model.ts (API contracts to window shapes), useStudio.ts (Studio loading), maps, languages
  desktop/                        Desktop, MenuBar, Dock, WindowFrame, Notices
  windows/                        Matches, AddMatch, Studio, Progress, Coach, Settings, Lab
  studio/                         Stage (PiP), ClipView, Radar, Timeline, Rail, AnalysisPanel, SidePanels, useClock
  ui/                             CoachText (citations), Segmented, icons, time
  styles/                         tokens, desktop, windows, studio
qa/happy_path.py                  browser check of the main flows against the API
qa/dev_api.py                     the API with a scripted demo instead of demoparser2
```

## Limits

- The API has no per-user accounts yet, so Coach and Progress follow one coached player at a time (the picker shows when there are several).
- The API's score is rounds won by the CT side first; the Studio's brief shows the coached player's own rounds won and lost.
- The API keeps no "sample demo", so Add match needs a real demo, or `qa/dev_api.py`.
