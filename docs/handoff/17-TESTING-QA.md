# 17 Testing and QA

Related: [13 Accessibility](./13-ACCESSIBILITY.md), [14 Responsive](./14-RESPONSIVE-BEHAVIOR.md), [18 Current state](./18-CURRENT-STATE.md)

## What exists today

| Tool | What it does | Status |
|---|---|---|
| [`tools/qa/screenshots.py`](../../tools/qa/screenshots.py) | Playwright. Opens the prototype at six sizes and captures Home, the Studio in gameplay, the radar, a Coach answer and processing. Reports JS page errors | implemented; ran clean on the 25 Sep continuation |
| [`tools/qa/overlay_sync.py`](../../tools/qa/overlay_sync.py) | Per-moment primary overlay visibility vs clip time, rapid seek, Gameplay↔Radar clock, empty moments, data-driven counts | implemented; passing |
| [`tools/qa/smoke.py`](../../tools/qa/smoke.py) | Home copy, `V` swap, invalid upload, tablet Analysis label, mobile sheet peek | implemented; passing |
| impeccable detector | Anti-pattern and contrast audit of the rendered page ([12](./12-SKILLS-AND-REFERENCES.md#impeccable)) | used manually; no script in the repo |
| `cs2coach` tests (main repo) | Full pipeline on a fake parser (per project history) | not inspected here |

### Commands

```bash
pip install playwright && python -m playwright install chromium
python tools/qa/screenshots.py prototype/analysis-studio.html qa-out/
python tools/qa/overlay_sync.py prototype/analysis-studio.html
python tools/qa/smoke.py
# offline: npm i gsap@3.12.5 && python tools/qa/screenshots.py prototype/analysis-studio.html qa-out/ --gsap-dir node_modules/gsap/dist
# custom browser: CHROME_PATH=/path/to/chrome python tools/qa/screenshots.py ...
```

The prototype exposes `window.__RR__` (`seek`, `selectMoment`, `setMode`, `overlaySnapshot`, `setMoments`, …) for Playwright assertions.
## Functional tests to write (planned)

- **Upload:**
  - `.dem.zst` and `.dem` are accepted
  - other files show the inline error with the fix
  - drag-over shows its state
- **Processing:**
  - the stages move in order
  - only real counts are shown
  - an error state appears on failure (not implemented yet)
  - the Studio opens when processing finishes
- **Moment switching:** from the rail, the match-strip glyphs, "Next moment", `[` and `]`, and Coach moment references. After each switch:
  - the correct panel, lanes, overlays and camera are shown
  - playback starts 5s before the key time and pauses at it
- **Gameplay and Radar:** swap with the control, the PiP and `V`. The time, active overlays, moment and Coach "Knows" line are all unchanged afterwards.
- **Timeline:**
  - click and drag to seek
  - click a marker (seeks and marks it selected)
  - clusters
  - previous and next event
  - the bracket
  - hidden empty lanes
- **Coach:**
  - suggested questions answer and then disappear
  - free text gets the fallback
  - `[F]`, `[t:]` and `[m]` tokens seek or switch
  - the Analysis tab and Esc return to the insight
- **Personalisation:** the dots match `last7`, and the occurrence list matches `LAST7`.

## Overlay synchronisation tests (highest priority)

For each moment, assert which overlays are visible (opacity above 0.5 for primaries) at these points:

- `t=0`
- `key-1`
- `key`
- `key+1`
- the end of the clip

Then also check:

- **Seek forward past a window:** the annotation is gone.
- **Seek backward into a window:** it is back.
- **Rapid seeks** (20 in 200ms): the final state matches a single seek to the same time.
- **Pause and resume:** nothing jumps.
- **Switch view mid-window:** the same state is shown in the other view.
- **Playback speed 0.25×:** the timing is still correct.

Implementation hint: expose `S` and `sceneTl` for tests, or port to React and test the store with Playwright assertions.

## Responsive sizes

The script already covers all of these:

| Class | Sizes |
|---|---|
| Desktop | 1440×900, 1920×1080 |
| Tablet | 1024×768, 834×1194 |
| Mobile | 390×844, 430×932 |

At each size, check:

- the stage is dominant with no dead gap
- nothing overflows or clips
- the drawer or sheet works
- touch targets are at least 24px (currently 22px markers, a known gap)

## Accessibility tests

- **Keyboard-only walkthrough:** Home → review → switch moments → seek with the slider → swap views → ask → return.
- **Focus:** visible everywhere, including on the stage, and focus returns after the panel, drawer or Coach closes.
- **Reduced motion** (emulate in Playwright): no movement animations, and overlays are still correct.
- **Zoom:** 200%.
- **Contrast:** check both themes (dark is untested).
- **Screen readers:** VoiceOver and NVDA on the slider, markers, tabs and live regions.

## Edge cases

| Case | Expected | Prototype today |
|---|---|---|
| No moments selected | An empty state explaining why, e.g. "No clear learning moments found in this demo" | **Implemented** (Studio empty state + Home adapts) |
| Fewer than 5 moments | Works; counts adapt | **Implemented** (data-driven copy) |
| More than 6 candidates | The ranker caps the selection | n/a (backend) |
| Missing metrics or findings | Hide the Evidence row; the Coach says the data is missing | Untested |
| Missing clip | Radar becomes the main view; the gameplay toggle is disabled with a reason | Not implemented |
| Long titles or labels | Truncate with the full text in the tooltip or accessible name | Rail truncates on tablet and mobile; stage annotations do not wrap |
| Long Coach answer | Thread scrolls; live region announces once | Scrolls; streaming announces fragments |
| No history | "First match analysed", no dots or trends | Not implemented |
| Extensive history | Still the last 7, with a link to the full history | Not implemented |
| Analysis failure | A processing error state saying which stage failed and what to try | Not implemented |
