# 25 Frontend review — Demo Replay MVP

Date: 25 September 2026. Scope: `apps/web` (Next.js). Prototype is visual reference only.

Related: [03](./03-DESIGN-SYSTEM.md), [04](./04-ANTI-AI-DESIGN-RULES.md), [11](./11-MOTION-SYSTEM.md), [12](./12-SKILLS-AND-REFERENCES.md), [13](./13-ACCESSIBILITY.md), [18](./18-CURRENT-STATE.md).

## Skills installed (paths)

| Source | Vendor | Discoverable |
|---|---|---|
| [emilkowalski/skills](https://github.com/emilkowalski/skills) | `.cursor/vendor/emil-skills/` | `.cursor/skills/emil-design-eng`, `review-animations`, `find-animation-opportunities`, `improve-animations`, `animate`, `animation-vocabulary` |
| [greensock/gsap-skills](https://github.com/greensock/gsap-skills) | `.cursor/vendor/gsap-skills/` | `.cursor/skills/gsap-core`, `gsap-timeline`, `gsap-plugins`, `gsap-react`, `gsap-performance` (+ utils / scrolltrigger / frameworks) |

Frontend load guidance: see [12](./12-SKILLS-AND-REFERENCES.md) and `.cursor/skills/README.md`. Skills are agent docs, not runtime deps (no GSAP in `package.json` yet — CSS-only UI motion for this MVP).

## Audit table (pre-fix → addressed)

| Area | Problem | Severity | Reproduction | Proposed fix | Status |
|---|---|---|---|---|---|
| Dev server | Concurrent `next build` corrupted `.next` → all routes 500 (`Cannot find module './102.js'`) | blocker | Hit `/` while build + dev both ran | Clear `.next`, restart `npm run dev` only | Fixed (ops) |
| Home CTA | Linked to `match-sample-mirage` (no round replays) | high | Home → Review sample | Primary **Add demo**; copy clarifies fixture has no Radar | Fixed |
| Radar coords | Fell back to Mirage meta / world x,y for Anubis → wrong or off-canvas dots | high | Studio on `de_anubis` match | No Mirage fallback; show unavailable if no `rx/ry` and no map meta | Fixed |
| Processing poll | `setInterval` kept firing after complete/failed | medium | Leave processing page after fail | `setTimeout` chain; stop on terminal status | Fixed |
| Empty/loading | Stuck “Loading radar…” when rounds empty but no error | medium | Sample match studio | Explicit empty vs loading; rail empty copy | Fixed |
| A11y | No Space/arrows; markers without labels; no `aria-current` | medium | Keyboard / SR | Keys, marker `aria-label`, nav current, focus tokens | Fixed |
| Motion | No `prefers-reduced-motion`; button `transition: all`-ish risk | medium | OS reduced motion | Prototype-aligned reduce rule; ease-out tokens | Fixed |
| Visual | Chrome followed OS dark; Studio chrome looked like stage | medium | Dark OS + Studio | Default `data-theme="light"` for Analysis Studio light chrome | Fixed |
| Prototype parity | Transport used filled rate buttons; grid proportions differed | medium | Compare to prototype | Circular play, `t-opt` rates, rail 184px, stage-wrap, drop/stages | Fixed |
| Map coverage | `de_mirage` + `de_anubis` overview metadata | medium | Other Active Duty demos | Add overview metadata per map as needed | Partial (Anubis done) |
| Timeline lanes | Prototype multi-lane timeline not ported | low | Compare | Single scrubber + markers OK for MVP | Remaining |
| Gameplay / PiP | Not in replay MVP | — | — | Out of scope | N/A |
| Coach / moments | Stubbed | — | — | Graceful empty copy; not a bug | N/A |
| GSAP | Not in web app yet | low | — | CSS for UI; GSAP when overlays/camera need time scrub | Remaining |

## What’s good

- Real upload → status stages → Studio path; no fake progress percentages.
- Single shared `usePlaybackClock` drives clock, seek, rates, and (when coords exist) Radar interpolation.
- Stage-first three-column Studio; light chrome + dark stage after theme fix.
- Tokens/easing/`--r-ctl`/`--r-panel`, Hanken + Newsreader, restrained controls — aligned to prototype language without wholesale HTML copy.
- Anti-AI: no card grids, pills, glow, chat chrome, or coaching CTA as product path.
- Processing stops polling on terminal states; errors link back to upload.

## Issues by severity (remaining)

### Blocker

- None known after `.next` restart and Radar fallback fix.

### Should-fix

1. **Non-Mirage Radar (beyond Anubis)** — remaining Active Duty maps still need overview metadata; Anubis is covered.
2. **Production build vs dev** — do not run `next build` while `next dev` shares `.next` (document in QA).
3. **Range slider a11y** — native range is usable; prototype’s custom `role="slider"` + lane scrubber still richer.

### Polish

- Multi-lane timeline, round strip, legend polish vs prototype.
- Mobile sheet / tablet drawer behaviour from prototype not ported (responsive stacks columns).
- Font loading via Google Fonts CDN (prototype same); optional self-host later.
- Dark theme remains available via `data-theme="dark"` but unverified.

## Motion findings

- **Correct restraint:** no page fades, no staggered card entrances, no GSAP for hover/press.
- **Aligned:** press `scale(0.97)`, play `scale(0.94)`, custom `--ease-out`, reduced-motion strips transform transitions.
- **Missing (later):** GSAP paused timeline scrubbed by media time; Flip for PiP/rail — only when gameplay/overlays land.
- **Opportunity (gated):** subtle opacity on round switch only if it stays under 150ms and is not high-frequency.

## Anti-AI findings

- Cleared: sample “review journey” CTA, coaching-as-primary copy.
- Stage remains the richest surface; chrome is quiet.
- Watch: do not reintroduce pill chips, side-tab accents, or insight card grids when analysis milestone starts.

## Prototype alignment

### Aligned

- Colour tokens (incl. `--negative-soft`, stage set, ease curves).
- Top bar height/`--bar`, nav current chip, brand weight.
- Buttons (height 32, fill/line, press scale).
- Upload drop (dashed, panel fill, Choose file).
- Processing stage list with done/active indicators.
- Studio grid ~184 / flex / panel; rail header; round list selection surface.
- Transport: circular play, clock `b`+span, now-event ellipsis, `t-opt` rates.
- Timeline under transport; kill markers use `--negative`.
- Default light chrome + dark stage.

### Still divergent

- No multi-lane event timeline, bracket row, or round cells.
- No Gameplay surface / PiP / overlays / Coach panel body.
- No segmented Gameplay|Radar control (Radar-only MVP).
- Stage aspect/fit differs (flex fill vs fixed 640×360 prototype stage).
- Home is MVP-focused, not prototype Home patterns/history.

## Prioritised fix list (next)

1. Add verified map overview metadata for remaining Active Duty maps (Mirage + Anubis done).
2. Add a smoke script against Next Studio (not only prototype HTML).
3. Document “never concurrent next build + next dev”.
4. When analysis starts: wire moments to the same clock; keep Coach shell prototype-styled.
5. Optional: richer timeline lanes from prototype once events are lane-tagged.
6. Optional: self-host fonts; verify dark theme contrast.
7. Tablet/mobile sheet parity from [14](./14-RESPONSIVE-BEHAVIOR.md).
8. Playwright critical path: upload → processing → studio seek.

## Verification

| Check | Result |
|---|---|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass |
| `pytest` (api) | 17 passed |
| `npm run build` | Pass earlier in session; **do not re-run beside live `next dev`** |
| Browser Home / Upload | 200; light chrome; Add demo CTA |
| Browser Studio (`match-d03751f42266`) | 24 rounds; play advances clock; Anubis radar places players via overview meta; timeline markers + event list |
| Keyboard | Space toggles play (verified via Play→Pause) |
| Reduced motion CSS | Present in tokens |
| Console | No app errors observed after stabilise; Next Dev Tools present in dev |

## Code fixes made this pass

- Skills vendor + junctions; docs in AGENTS.md / 12 / this file.
- Tokens + Studio chrome aligned to prototype; `data-theme="light"` default.
- Home/Upload/Processing/Studio stabilise (poll, empty states, a11y, transport UI).
- Radar: no false Mirage transform; interpolate only with real radar coords or known meta.
- Playback `seekBy` + studio keyboard bindings.
