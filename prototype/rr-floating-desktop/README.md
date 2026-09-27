# Round Reviewer — floating desktop (experimental)

Round Reviewer as a light macOS-style desktop: every player surface from the roadmap (PR #22), plus sign-in, roles and the admin panel (PR #24, doc 30), is a floating window with frosted chrome, traffic lights, drag, focus and a dock. It runs on the **real FastAPI backend** in `apps/api`, the same API as `apps/web`, and reuses the web app's API client and contracts (`apps/web/src/lib`) through the `@/` alias, so there is one copy of each.

This folder does not replace `apps/web`, the Night ops layouts or `prototype/analysis-studio.html`.

## Run it

On Pawel's Windows PC with the model, clips, accounts and Admin on, follow [RUN-ON-PC.md](RUN-ON-PC.md).

Start the API as usual (see `docs/RUN-LOCALLY.md`), then:

```bash
cd prototype/rr-floating-desktop
npm install
npm run dev
```

Open **http://localhost:5173**. The dev server proxies `/api` to `http://127.0.0.1:8000`, so the API needs no extra CORS origin. For another API address set `RR_API_URL` (for example `RR_API_URL=http://127.0.0.1:8003 npm run dev`). `npm run build` type-checks and builds to `dist/`; `npm run preview` serves the build with the same proxy.

The coach model, CS Demo Manager clips and the Lab follow the API's `.env` exactly as in `apps/web`: with `RR_LLM_ENABLED` off the coach writes from the finding templates, with `RR_CSDM_ENABLED` off moments have no clip and the radar takes the stage, and the Lab (inside Admin) needs `RR_LAB_ENABLED=1`.

## Accounts

With `RR_AUTH_ENABLED` off (the default) the API answers as one local admin and the desktop opens straight away, as before. With it on:

- A signed-out browser gets a lock screen: sign in with a username and password or with Steam, create an account with an invite code, or set a new password with a reset code. The very first account becomes the admin.
- A new account gets a Setup Assistant over the desktop: coach language (saved on the account), linking Steam, and the study consent when `RR_STUDY_MODE` is on.
- The account menu at the right of the menu bar has Profile, Settings, Admin and Sign Out. Each account gets a fresh desktop, so no window or match of another user carries over.
- Roles: an admin sees the Admin window; a labeller sees it as "Lab" with only the Lab; a player sees neither.
- A share link (`RR_SHARE_LINKS=true`) opens one read-only review window without signing in.

The dev server keeps the browser's Host header when it proxies `/api`, so the sign-in cookie, the API's same-origin check on writes and Steam's return address all use the desktop's own address. Open it at `localhost`, not `127.0.0.1`.

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
| Matches row menu | `PATCH /matches/{id}` (rename), `POST/DELETE /matches/{id}/share`, `DELETE /matches/{id}`, Earlier Reviews from `GET /matches/{id}/versions` |
| Studio feedback | `GET/POST /matches/{id}/feedback` for Useful / Not right on the summary, each moment, each round, the wrap-up and each Ask answer; Ask history from `GET /matches/{id}/ask-history` |
| Settings | Profile (`PATCH /users/me`, password, Steam link and unlink), Coach and playback (`PUT /users/me/settings`), Signed in (sessions), Your data (export, delete account), System (`GET /system`, `GET /features`), Connect another app |
| Admin | Overview, Jobs (GPU queue, pipeline, clips), Model and services, runtime Settings, Users, Invites, Study, Matches (every owner), Knowledge, Lab, Storage and backup, Security, Audit log, all under `/admin/*` |
| Lab (in Admin) | traces, labels and picks, evaluation and blind A/B, dataset review and export (admin only) |
| Lock screen, Setup Assistant | `GET /auth/me`, sign in, sign up, reset, Steam start, consent |

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

`qa/accounts_path.py` does the same with accounts on (see its docstring for the API command, which needs an empty data folder): it creates the admin, walks the Setup Assistant and all 13 Admin sections, makes an invite, reviews a stub match, renames and shares it, gives feedback in the Studio, opens each Settings pane, signs up a player with the invite and checks they see no Admin and no matches, opens the share link signed out, and tries a wrong password.

## Window manager

Drag by the title bar, click to focus, double-click the title bar or the green light to zoom, drag an edge to resize, yellow minimises into the dock (click the tile to restore), red closes and the dock reopens the same window. Admin shows in the dock for an admin or labeller; Add Match and Earlier Reviews show there only while open. Admin and Settings are split windows like macOS System Settings, and sheets (rename, share, delete) drop from the title bar of their window.

## Look

Light macOS materials: a quiet grey wallpaper, a translucent menu bar and dock, windows with `backdrop-filter` blur on the chrome and sidebars, and near-opaque content so text stays legible. System faces (`-apple-system`, Segoe UI) with Hanken Grotesk only where no system face exists; system blue `#007AFF` as the one accent; an orange triangle for a mistake, a blue circle for a good play and a hollow circle for context such as an opening duel. The media stage stays dark, like a video well. Motion is limited to window open and close, minimise, zoom, the segmented pill and the PiP swap, and `prefers-reduced-motion` turns it off.

## Files

```
src/
  main.tsx                        who sees what: lock screen, Setup Assistant, desktop, shared review
  state/store.tsx, state/auth.tsx window manager, matches, system status, coached player; signed-in user and arrival from the API's redirects
  data/                           model.ts (API contracts to window shapes), useStudio.ts (Studio loading), maps, languages
  desktop/                        Desktop, MenuBar, Dock, WindowFrame, Notices
  screens/                        SignInScreen, WelcomeAssistant, SharedReview
  windows/                        Matches, AddMatch, Studio, Progress, Coach, Settings, Admin, LabPane, Reviews
  admin/                          Admin panes: Control (overview, jobs, model, settings), People, Data, Safety
  studio/                         Stage (PiP), ClipView, Radar, Timeline, Rail, AnalysisPanel, SidePanels, useClock
  ui/                             CoachText (citations), Segmented, Feedback, kit (panes, sheets, confirm), icons, time
  styles/                         tokens, desktop, windows, studio, accounts
qa/happy_path.py                  browser check of the main flows against the API
qa/accounts_path.py               browser check of accounts, roles and Admin
qa/dev_api.py                     the API with a scripted demo instead of demoparser2
```

## Limits

- With accounts off, Coach and Progress follow one coached player at a time (the picker shows when there are several). With accounts on, the linked Steam account picks the player.
- Real Steam sign-in and the admin panel against a real model have only been checked with the stub API here, not on Pawel's PC.
- The API's score is rounds won by the CT side first; the Studio's brief shows the coached player's own rounds won and lost.
- The API keeps no "sample demo", so Add match needs a real demo, or `qa/dev_api.py`.
