---
name: rr-porcelain-ui
description: Round Reviewer's Porcelain visual direction, chosen by the owner on 15 Nov 2026 for the 25 Nov showcase. Use for any work on the look, layout, components or motion of apps/web (Studio, matches, processing, upload, coach, sign-in). Bone porcelain chrome with floating glass, a dark game-screen radar with Counter-Strike side colours, pink for "you", Mona Sans, concentric soft corners and critically damped springs. Overrides the older design notes in AGENTS.md and docs/handoff (Tactical Desk, Film Room, Hanken/Archivo/Newsreader, max 6px radius).
---

# Porcelain: the Round Reviewer look

The radar is a dark game screen, the chrome around it is bone porcelain, and everything that floats (navigation, moment stack, playback dock, status island) is frosted glass. Reading content sits on solid sheets. Colour means something: Counter-Strike yellow and blue for the sides, pink for you and your selection, red for a mistake, green for a good play.

Visual references (open them in a browser; sample data only):
- `prototype/glass/g1-porcelain.html`: the Studio. This is the source of truth for layout and spacing.
- `prototype/glass/g4-library.html`: the match library as glass folders.
- `prototype/glass/r3-ideas.html`: research behind the direction and the components to use.

Serve the repo root to open them: `apps/api/.venv/Scripts/python.exe -m http.server 18791 --bind 127.0.0.1`, then `http://127.0.0.1:18791/prototype/glass/g1-porcelain.html`.

## Read before you start

1. `AGENTS.md`: data, contract and model rules still apply. This skill replaces only its design notes.
2. `references/tokens.css`: paste into `apps/web/src/styles/tokens.css` first; every component uses these names.
3. `references/components.md` for the component you are building, `references/screens.md` for the route.
4. `references/build-plan.md` for the order of work and what "done" means each day.
5. Load alongside: `.cursor/skills/apple-design` (materials, springs), `better-ui` (concentric radius, shadows), `avoid-ai-design` (tells and scanner), `emil-design-eng`, `gsap-react`, `better-accessibility`.

## Non-negotiables

1. **Glass only floats.** Nav capsule, moment stack, playback dock, status island, small labels over the map. Coach text, tables and forms sit on the solid `.sheet`. Never put glass on glass.
2. **The radar is a game screen.** Dark stage `--stage`, the real radar image at full readability (no plaster, no heavy filters), flat player dots with a facing tick, a dark outline, Counter-Strike side colours. No gradients, gloss, glow or drop shadows on players.
3. **Side colours are the game's.** T is `--side-t` (yellow), CT is `--side-ct` (blue), on the radar, the HUD slots, the alive graph and the round history. Use the `*-text` variants on light chrome.
4. **You are marked twice, never recoloured.** Your dot keeps your side colour and gets a white ring and a "You" label. In the chrome, your selection (active moment, selected chip) uses `--accent` pink. Pink never appears on the radar.
5. **Nothing overlaps the map.** The stage has its own column. Floating panels sit beside it, never on top of player positions. The only things on the map are players, utility, your recent path, the lens and one kill-feed plate.
6. **One signature: the lens.** A small circular magnifier (168px, 1.8×) over the current moment's fight. It shows only the players involved and the line of fire. No caption under it.
7. **Concentric corners, no dividers.** Sheets 28px, tiles and rows 16px, controls are pills. Separate with spacing (`--sp-*`) and tinted tiles (`--tint-1`), never with 1px lines.
8. **Numbers come from data.** Every value on screen comes from the API contracts (`apps/web/src/lib/contracts`). No invented percentages, no placeholder stats, no count-up animations.
9. **Copy:** sentence case, British spelling, no all-caps labels, no "A · B · C" meta strings, no arrows on buttons, verb-first buttons.
10. **Motion:** `--ease-spring` with `--dur-spring` or `--dur-spring-quick`; bounce only after a drag or flick. Keyboard actions and reduced motion jump instantly. Glass materialises (blur and scale together), it never just fades.

## Studio layout (1440 × 900)

```
 20 ┌─ nav capsule ─┐        ┌─ score + round history ─┐       [Add match] (P)   ← header, top 16, height 48
 80 ┌ moment stack ┐ 16 ┌──────────── stage (dark, r28) ────────────┐ 16 ┌ coach sheet ┐
    │ glass, 276w  │    │ HUD: 5 T slots · score · 5 CT slots   12  │    │ solid, 380w │
    │ rows 40h     │    │ kill feed plate (top right)               │    │ tab pill    │
    │ active row   │    │            radar 572 × 572                │    │ title       │
    │ expands      │    │          lens over the fight              │    │ prose+chips │
    │              │    │ ┌ dock: play · clock · Radar/Clip · 1× ─┐ │    │ 2×2 tiles   │
    │ Debrief pill │    │ │ coach lane · alive graph · axis       │ │    │ Checked     │
    └──────────────┘    │ └───────────────────────────────────────┘ │    │ Ask capsule │
                        └───────────────────────────────────────────┘    └─────────────┘ 20
```

Stage left = 20 + 276 + 16 = 312; stage right edge = 1440 − 20 − 380 − 16. Everything snaps to `--sp-*`.

## Workflow for every task

1. Say which screen and components you are changing and which contract fields feed them.
2. Build with the tokens; no new hex values or px font sizes outside `tokens.css`.
3. Check:
   - `cd apps/web && npm run typecheck && npm run build`
   - `node .cursor/skills/avoid-ai-design/scripts/detect.mjs apps/web/src`: the only accepted findings are K3 (glass on floating chrome) and SD6 (moment numbers).
   - `.cursor/skills/impeccable/scripts/impeccable detect --json apps/web/src` (on Windows: `.cursor\skills\impeccable\scripts\impeccable.cmd detect --json apps/web/src`).
   - Screenshots at 1440 × 900, 1024 × 768 and 390 × 844, plus one with reduced motion and one with reduced transparency.
4. Compare against `prototype/glass/g1-porcelain.html` side by side. Fix spacing first.
5. Do not commit or push unless the owner asks (AGENTS.md).

## Done means

- The screen matches the reference at 1440 × 900, with the same spacing.
- Keyboard: every control reachable, visible focus ring, Escape closes overlays, the replay shortcuts still work.
- Contrast: text 4.5:1, glyphs and control edges 3:1 (values in `tokens.css` comments).
- Empty, loading, error and model-or-recorder-off states are designed and honest.
- No console errors; typecheck and build pass.
