# Porcelain build plan: 16 to 25 November 2026

One phase per working day, each small enough for one ChatGPT/Codex task. The matching prompt for each phase is in `../PROMPTS.md`. Work on a `design/porcelain-ui` branch made from the current studio branch (the GitHub repo is public: never add `docs/university/*` or `prototype/fixtures/match-room.json`). The owner decides when to commit, push and merge.

Order matters: tokens before components, Studio before everything else, QA before polish. If a day slips, drop the optional items at the bottom, never the QA day.

| Day | Phase | Done when |
|---|---|---|
| Mon 16 | **P0 Foundations**: tokens, Mona Sans, header capsules, buttons, pills, focus ring, light only | Every page renders on the bone ground with the new type and capsules; typecheck and build pass; no dark-mode leftovers |
| Tue 17 | **P1 Stage and radar**: dark stage, side-coloured flat players, facing ticks, you ring and label, path, utility, team HUD | Round 12 of a real match reads like the in-game radar; HUD health matches the samples while scrubbing |
| Wed 18 | **P2 Lens, kill feed, moment stack** | The lens follows each moment's focus, the kill feed matches the events, the active moment expands with its real `pickedBecause` |
| Thu 19 | **P3 Playback dock and clip view** | Play, scrub, speed, Radar/Clip with a sliding bubble; coach lane and alive graph in side colours; recorder-off state is honest |
| Fri 20 | **P4 Coach sheet**: tab pill, title, prose and chips, evidence tiles, verifier tile, Ask with steps | Chips, tiles and timeline highlight together; the verifier tile matches `source` and `verifierErrors`; Ask shows live steps and checked answers |
| Sat 21 | **P5 Matches, Home, Upload, Processing**: folders, status island, player sheet | A new upload goes from drop to island to player sheet to Studio without a single old-style screen |
| Sun 22 | **P6 + P7 States and QA**: empty, loading, error, model-off and recorder-off states; laptop and projector widths (1280–1920); then the QA checks below | avoid-ai-design shows only K3 and SD6; contrast, keyboard, reduced motion and reduced transparency pass; no console errors; production build tested in the presentation Mac's browser |
| Mon 23 – Tue 24 | **Freeze**: no UI changes; the Mac build is frozen and rehearsed (see `docs/planning/TEACHER-PROTOTYPE-2026-11-25.md`) | Only reproduced blockers are fixed |
| Wed 25 | **Showcase** | |

Tablet and phone layouts (P6 in `screens.md`) move after the showcase unless P0–P5 finish early.

Optional, only if P0–P7 are done: the How it works page (`screens.md`, last section), a Night dark mode of Porcelain, a share card using DesignBookmark's Parallax ticket.

## Acceptance checks for every phase

- `cd apps/web && npm run typecheck && npm run build`
- `node .cursor/skills/avoid-ai-design/scripts/detect.mjs apps/web/src`
- Screens open next to `prototype/glass/g1-porcelain.html` at 1440 × 900 with matching spacing.
- No new hex colours or px font sizes outside `styles/tokens.css`.
- `cd apps/api && pytest` still passes if any API code was touched (it should not need to be).

## What the showcase needs from the UI

The authoritative running order is the 15-minute plan in `docs/planning/TEACHER-PROTOTYPE-2026-11-25.md`. It runs a production build on the presentation Mac at `http://127.0.0.1:3003`, with the model on the RTX 5080 over Tailscale. Its six-minute Studio segment needs these screens to be Porcelain and correct:

- the setup screen paused at the roster, with Utility focus and English selected;
- the completed review, the unused-grenades moment, and a citation click that lands on the right round and clock, forwards and backwards, and after a reload;
- an Ask answer whose source is visible (model or finding templates) with its verifier line, and the template answer when the model is off;
- the clip-unavailable state when no footage is shown.

Test these in the Mac's browser (Safari and Chrome both use `-webkit-backdrop-filter`) on the projector before the Monday freeze.

## Earlier demo sketch (superseded by the teacher plan above)

1. **Home (20 s).** The newest match folder: "This is one of my matches; the app already found six moments."
2. **Upload a second demo (40 s).** Drop it on the New match folder. The island shows the real upload percent and then the stages. Choose yourself in the player sheet, Overall, English. While it parses, say what is happening: demoparser2 reads every tick, ten detectors in plain code, then the local model.
3. **Studio on the prepared match (2 min).**
   - Open moment 02.
   - The radar plays like the game: T yellow, CT blue, health in the HUD, kills in the feed.
   - The lens magnifies the fight.
   - Click F07 in the coach text: the replay jumps 3 s before the moment and pauses, and the tile and timeline light up together.
   - Point at the verifier tile: the model may only say what the findings contain.
4. **Ask (1 min).** Ask in Polish: "Dlaczego to był błąd?". The island shows the tool calls live, and the answer arrives with citations and its own check.
5. **Clip (30 s).** Switch to Clip if the recorder ran; otherwise show the honest recorder-off message and stay on the radar.
6. **Phone width (20 s).** Resize the window: the coach becomes a bottom sheet.
7. **Close (30 s).** Everything runs on our own PC and GPU; no hosted AI sees a match.

## Fallbacks

- Model offline: the verifier tile shows the template state. Say so; it is a designed state, not a failure.
- Recorder offline: Clip shows the recorder-off message; stay on the radar.
- Backdrop blur slow on the projector laptop: macOS and Windows "reduce transparency" settings switch glass to solid automatically. Test on that laptop on Tuesday.
- Live upload too slow: skip step 2 and open a match already processed that morning.
