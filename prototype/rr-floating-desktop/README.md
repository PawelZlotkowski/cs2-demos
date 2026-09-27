# Round Reviewer — floating desktop prototype (experimental)

A runnable prototype of Round Reviewer as a light macOS-style desktop: every player surface from the roadmap branch (PR #22) is a floating window with frosted chrome, traffic lights, drag, focus and a dock. Mock data only; nothing calls the API or a model.

This folder is isolated. It does not replace `apps/web`, the Night ops layouts or `prototype/analysis-studio.html`.

## Run it

```bash
cd prototype/rr-floating-desktop
npm install
npm run dev
```

Open **http://localhost:5173**. `npm run build` type-checks and builds to `dist/`.

The radar images and callout polygons come from the main app (`apps/web/public/maps`, `apps/api/app/maps/zones`), so run it from inside this repo.

## Happy path

1. **Matches** opens on start (or click the first dock icon). Each row shows the map, score, player, moments and the model that wrote the review, with “1 earlier review kept”.
2. Click **Re-run the coach** on a row, then **Re-run**: the row steps through Picking moments and Writing the review, the earlier review is kept, and a notification offers **Open in Studio**.
3. Click **Mirage 13–9**. The **Studio** opens on the **Match brief**: rounds strip, summary with citations, **Review moment 1**.
4. Click **Review moment 1**. The stage shows the **clip large** with the **radar peeking** top right; the rail lists the six moments (POV tag, reason) and every round.
5. Click the radar peek (or **Enlarge**): radar and clip swap with a 300 ms ease. Click the clip peek to swap back. `V` does the same, and the **Gameplay | Radar** control follows.
6. Press **Play** (or `Space`). The clip, radar, alive count and timeline follow one clock. Scrub the timeline, click a finding marker, `,` and `.` step events, `N` goes to the next moment.
7. Inspector tabs:
   - **Analysis**: finding, why it was picked, the coach explanation (`[F3]` jumps, `[t:34.0]` seeks, `[K1]` opens the passage), **Show a round where you did this well**, stats, findings and events. The last moment's **Done** opens the **Debrief**.
   - **Ask**: match-scoped questions with suggestions; answers cite findings and times.
   - **Round**: facts, duels, utility thrown, buy; no model.
   - **Notes**: save a note at the current time, then **Ask about this** for the 10 seconds around it.
   - **Download** in the clip caption shows the file name the app would save (map, player, round, finding, time).
8. **Coach** (dock): **Ask** across matches; click a `[M4:F1]` citation to open that match in the Studio at that finding. **Plan**: three repeated mistakes with evidence, a drill each and a **Practised** tick; **Write a new plan**. **Knowledge**: click a callout on the radar or in the list, search, **Flag as wrong**.
9. **Progress** (dock): detector counts per match, oldest first, with the recent trend; **Where you die** shades callouts by deaths, and each `M#:F#` opens the Studio.
10. **Settings** (dock, or Round Reviewer › Settings…): System checks with **Check again**, **Connect another app** with copyable MCP commands and the LM Studio block.
11. **Lab** is owner-only and hidden. Turn it on with the **Lab** switch in Settings, or open **http://localhost:5173/?lab=1**. It then appears in the dock and the View menu: **Runs** (click a row for tool calls and the verifier), **Labels**, **Evaluation** (blind A/B vote) and **Dataset**. With the Lab on, Knowledge shows **Add a note (admin)** and the coach text links **How this was written**.
12. **Add match** (Matches toolbar or File menu): drop a demo, choose a file or **Use the sample demo**; the pipeline runs, you pick the player, and the new match opens in the Studio.
13. Window manager: drag by the title bar, click to focus, double-click the title bar or the green light to zoom, drag an edge to resize, yellow minimises into the dock (click the tile to restore), red closes and the dock reopens the same window. Several windows can overlap; the inactive ones grey their traffic lights and selection.

To check the whole path in a browser (fails on any console error):

```bash
pip install playwright && python -m playwright install chromium
python qa/happy_path.py http://localhost:5173/ qa/out
```

`CHROME_PATH=/path/to/chrome` uses an installed Chrome instead. Screenshots land in `qa/out/`, including `15-overlapping-windows.png`.

## What maps to PR #22

| Window | PR #22 surface |
|---|---|
| Matches, Add match | `/matches`, `/upload`, processing and the player picker |
| Studio | `/studio/[matchId]`: moment rail, POV clip over the radar, transport, timeline, Analysis / Ask / Round / Notes, Done well, Debrief |
| Progress | `/progress` |
| Coach | `/coach`: Ask, Plan, Knowledge |
| Settings | `/settings`: System, Connect another app |
| Lab (flag) | `/lab`: Runs, Labels, Evaluation, Dataset |

## Look

Light macOS materials: a quiet grey wallpaper, a translucent menu bar and dock, windows with `backdrop-filter` blur on the chrome and sidebars, and near-opaque content so text stays legible. System faces (`-apple-system`, Segoe UI) with Hanken Grotesk only where no system face exists; system blue `#007AFF` as the one accent; an orange triangle for a mistake and a blue circle for a good play. The media stage stays dark, like a video well. Motion is limited to window open and close, minimise, zoom, the segmented pill and the PiP swap, and `prefers-reduced-motion` turns it off.

## Files

```
src/
  main.tsx, state/store.tsx       window manager and shared state
  desktop/                        Desktop, MenuBar, Dock, WindowFrame, Notices
  windows/                        Matches, AddMatch, Studio, Progress, Coach, Settings, Lab
  studio/                         Stage (PiP), ClipView, Radar, Timeline, Rail, AnalysisPanel, SidePanels, useClock
  ui/                             CoachText (citations), Segmented, icons, time
  mock/                           world (matches, findings, moments, passages), replay (rounds, tracks), coach, lab, maps
  styles/                         tokens, desktop, windows, studio
qa/happy_path.py                  browser check of the path above
```

## Limits

- The clip is a placeholder scene that follows the clock; there is no recorded video.
- Player tracks are generated between callout centres, so they cross walls.
- Coach text is written ahead of time from the mock findings; the language picker changes the label, not the text.
- Nothing persists except the Lab switch (`localStorage`).
