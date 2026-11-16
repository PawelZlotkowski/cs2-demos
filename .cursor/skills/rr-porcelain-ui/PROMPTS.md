# Prompts for ChatGPT / Codex

Use one fresh Codex task (or ChatGPT conversation with the repo connected) per phase. Paste the **primer** first, then the phase prompt. Attach the reference images from `docs/design/porcelain/` when the tool accepts images.

---

## Primer (paste at the start of every task)

```text
You are working on Round Reviewer, a CS2 demo-review web app (Next.js 15 App Router + React 19 in apps/web, plain CSS files in apps/web/src/styles, GSAP 3.15 installed, FastAPI in apps/api). Read AGENTS.md for the data and contract rules, then read .cursor/skills/rr-porcelain-ui/SKILL.md and the reference files it names. The owner chose the Porcelain design on 15 Nov 2026; it overrides the older design notes in AGENTS.md and docs/handoff (Tactical Desk, Hanken Grotesk/Archivo/Newsreader, the 6px radius limit, light/dark themes). Design work is no longer paused.

The visual reference is prototype/glass/g1-porcelain.html (Studio) and prototype/glass/g4-library.html (match library); screenshots are in docs/design/porcelain/. They hold sample data only: build the real screens from apps/web/src/lib/contracts and never hard-code their names or numbers.

Rules: use only the tokens in .cursor/skills/rr-porcelain-ui/references/tokens.css; glass only on floating chrome; the radar is a dark game screen with Counter-Strike side colours (T yellow, CT blue) and flat player dots; pink only for "you" and selection in the chrome; no dividers, no all-caps labels, no "A · B · C" strings, no invented numbers. Also follow .cursor/skills/apple-design, better-ui and avoid-ai-design.

Before you write code, tell me in a short list which files you will change and which contract fields feed each new element. After coding, run: cd apps/web && npm run typecheck && npm run build, and node .cursor/skills/avoid-ai-design/scripts/detect.mjs apps/web/src. Report the results honestly, including anything you could not check. Do not commit or push unless I ask. British spelling in all copy.
```

---

## P0 Foundations (Mon 16)

```text
Phase P0 of .cursor/skills/rr-porcelain-ui/references/build-plan.md.
1. Replace the token blocks in apps/web/src/styles/tokens.css with references/tokens.css. Keep existing variable names working. Delete the dark-theme blocks and the light/dark switching; Porcelain is light only.
2. Swap fonts in app/layout.tsx: install @fontsource-variable/mona-sans, import the file that carries the wdth axis (check node_modules for wdth.css or full.css), remove the Hanken Grotesk and Newsreader imports, keep Archivo until nothing uses it.
3. Rebuild the header as floating capsules (components.md §1): nav capsule with a sliding white bubble, score capsule placeholder, ink Add match pill, account bead. Remove ThemeSelect from the bar.
4. Restyle buttons, pills, segmented controls and inputs to components.md §13, and the focus ring to tokens.css.
5. Replace hard-coded px font sizes in styles/studio.css and pages.css with the --fs-* tokens wherever the value matches.
Show me screenshots (or describe exactly) of /, /matches and a Studio page at 1440 wide before and after.
```

## P1 Stage and radar (Tue 17)

```text
Phase P1. Follow components.md §4, §5 and §6 and the Studio layout in screens.md.
1. Change the Studio grid to the three regions in screens.md (moment stack 276, stage, coach sheet 380, gaps 16, gutters 20, top 80).
2. Make .stage-wrap the dark stage (radius 28, padding 12, --shadow-stage) and size the radar square so it never sits under the HUD or the dock.
3. In components/replay/RadarView.tsx: full-colour map image, players coloured by side from RoundReplay.players[].team, dot radius 13 radar units with a facing tick from yaw, white ring and "You" label on the coached player, labels only for players in the current moment, dotted 4-second path, smoke and molotov areas. Keep the existing camera and path animation code.
4. Add components/replay/TeamHud.tsx (§5) above the radar, fed by the current interpolated sample.
Check it on a real Anubis or Ancient match while scrubbing and playing: health and alive state must match the samples.
```

## P2 Lens, kill feed, moment stack (Wed 18)

```text
Phase P2. Build components.md §7 RadarLens (focus from the moment camera box, 168px, 1.8×, only the involved players and the line of fire, L toggles it, reduced motion shows it instantly), §8 KillFeed from ReplayEvent kills in the last 5 seconds, and extract the moment rail from app/studio/[matchId]/page.tsx into components/review/MomentStack.tsx following §3, including the expanding active row with SelectedMoment.pickedBecause and the radar thumbnail. Keep keyboard navigation between moments working (N and arrows) and make keyboard changes instant.
```

## P3 Playback dock and clip view (Thu 19)

```text
Phase P3. Restyle the transport and components/replay/ReplayTimeline.tsx into the playback dock of components.md §9: transport row, coach lane with the moment pill and finding glyphs, mirrored alive graph in --side-t and --side-ct with bomb diamonds, axis, playhead with a hover handle. Fold the separate Bomb and Utility lanes into the graph and the radar. Then restyle GameplayView/PovClip as §10, including the recorder-off message with a Show radar pill. Radar/Clip uses the segmented control with the sliding bubble.
```

## P4 Coach sheet (Fri 20)

```text
Phase P4. Rebuild the Studio coach column as components.md §11 and §12: tab pill; Analysis with meta line, title, prose through CoachText with citation chips as real buttons; 2×2 evidence tiles from Moment.ev ([label, value, findingId, clipTime]); the verifier tile driven only by MomentExplanation.source, verifierErrors and model; practise row from PracticeDrill (and Pattern.occurrences only if present); Ask composer pill. Hovering or focusing a chip highlights the matching tile, timeline glyph and lens; clicking seeks to the time minus 3 seconds and pauses. Ask tab: no bubbles, live tool steps from AskEvent step events, answers materialising block by block, a verifier line per answer, Stop. Add components/StatusIsland.tsx (§2) and show coach activity in it.
```

## P5 Matches, Home, Upload, Processing (Sat 21)

```text
Phase P5. Build components/MatchFolder.tsx (components.md §14, with a scalable SVG clipPath for the folder tab) and use it on /matches and Home as screens.md describes, including the processing, failed, unsupported-map and New match states. Restyle /upload as the drop folder and hand progress to the status island. Restyle /processing/[id] with the island, the player sheet (§15: side columns, pill rows, focus pills, language segmented, Start review) and the run log with real timings only.
```

## P6 Responsive and states (Sun 22)

```text
Phase P6. Implement the tablet and phone layouts in screens.md (moment pill strip, coach drawer, coach bottom sheet with the collapsed state, compact HUD, 16px inputs) and every state in components.md §16. Test at 1440×900, 1024×768 and 390×844, with prefers-reduced-motion and prefers-reduced-transparency turned on.
```

## P7 QA (Mon 23)

```text
Phase P7, quality only, no new features. Run avoid-ai-design detect (only K3 and SD6 may remain), the impeccable detector if present, and review against .cursor/skills/better-accessibility: contrast of every text and glyph pair against tokens.css, full keyboard path through upload, processing, Studio, Ask and matches, visible focus everywhere, aria-labels on icon buttons and HUD slots. Fix what you find. Check there are no console errors and no layout shift when the coach answers. List anything still open.
```

---

## Review prompt (any time)

```text
Review the current diff against .cursor/skills/rr-porcelain-ui/SKILL.md and the reference prototype/glass/g1-porcelain.html. List, most important first: spacing that differs from the reference, any hex colour or px size outside tokens.css, glass used on reading content, anything overlapping the radar, invented or hard-coded numbers, and any AI tells from .cursor/skills/avoid-ai-design. Do not change code; give file:line and the fix.
```
