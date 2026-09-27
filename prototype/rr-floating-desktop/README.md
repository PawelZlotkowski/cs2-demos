# Round Reviewer — Floating Desktop Prototype

A runnable hi-fi prototype of Round Reviewer's floating-window desktop interface. Built with Vite + React + TypeScript, following Night ops design tokens.

![Desktop with overlapping windows](./screenshot-placeholder.png)

## Quick Start

```bash
npm install
npm run dev
```

Then open **http://localhost:5173** (Vite's default port).

## Happy-Path Demo Script

This prototype implements a fully interactive window manager. Follow this script to test all features:

### 1. Launch the desktop
- Run `npm run dev`
- Open the URL in your browser
- You'll see the dark desktop with menu bar (top) and dock (bottom)

### 2. Open Matches window
- **Click "Matches" in the dock** (leftmost icon)
- A floating Matches window opens with 3 mock matches

### 3. Select a match → opens Analysis
- **Click any match row** (e.g. "Mirage vs. Tech United")
- Analysis window opens automatically, showing:
  - Score with cobalt last digit (e.g. 12-**8**)
  - List of 5 key problems

### 4. Select a problem → opens Problem with PiP
- **Click any problem row** (e.g. "R7 • Missed Exit Angle")
- Problem window opens with:
  - **Clip view (large)** — center stage with play placeholder
  - **Radar view (peek)** — top-right corner overlay

### 5. Test PiP swap
- **Click the Radar peek** (top-right corner)
- Views swap: Radar becomes large, Clip becomes peek
- **Click the Clip peek** (now in corner)
- Swaps back: Clip large, Radar peek
- Animation is ~300ms with cubic-bezier easing

### 6. Open Coach and Drills
- **Click "Coach" in the dock** → Coach window opens with messages
- **Click "Drills" in the dock** → Drills window opens with checklist
- Toggle drill completion by clicking checkboxes

### 7. Test window management
- **Drag any window** by its title bar
- **Click any window** to bring it to front (z-index)
- **Close a window** with the red traffic light
- **Minimize a window** with the yellow traffic light (hides it)
- **Reopen from dock** — focuses existing window instead of creating duplicate

### 8. Verify overlapping
- Open 2+ windows (e.g. Analysis + Problem + Coach)
- Drag them so they overlap
- Click different windows to test focus/stacking

## Features Implemented

- [x] Desktop WM: drag, focus, z-order, dock singletons
- [x] Analysis: calm single-column brief (not ops desk)
- [x] Problem PiP: Clip default large; swap works; shared timeline
- [x] Night ops tokens only; no banned slop
- [x] Labelling absent from dock
- [x] Match → Analysis → Problem flow
- [x] Coach and Drills windows functional

## Tech Stack

- **Vite** — Fast dev server and build
- **React 18** — Component-based UI
- **TypeScript** — Type safety
- **CSS Modules** — Scoped styling with Night ops tokens
- **No UI libraries** — Custom window manager, no Tailwind/shadcn

## Design Tokens (Night ops)

```css
--void: #050505      /* Desktop background */
--panel: #0A0A0A     /* Window backgrounds */
--ink: #F2F2F2       /* Primary text */
--muted: #666666     /* Secondary text */
--line: #1A1A1A      /* Borders/separators */
--accent: #3B6AE8    /* Cobalt (only accent) */
```

**Typography:**
- UI: Instrument Sans (Fontshare)
- Monospace: Fragment Mono (times, scores)

**Motion:**
- Duration: 300ms
- Easing: `cubic-bezier(0.32, 0.72, 0, 1)`
- Reduced motion: respects `prefers-reduced-motion`

## Anti-Slop Compliance

This prototype **avoids**:
- ❌ Purple/indigo gradients or pink-purple "AI" glow
- ❌ Lime/acid green (#C8F53C)
- ❌ Inter/Roboto as primary face
- ❌ Generic SaaS dashboard cards
- ❌ Nested glass stacks
- ❌ Emoji UI icons or sparkle badges
- ❌ "Elevate your workflow" marketing copy

This prototype **includes**:
- ✅ Cobalt (#3B6AE8) as sole accent
- ✅ Instrument Sans + Fragment Mono
- ✅ Calm Apple spatial hierarchy
- ✅ Floating windows with traffic lights
- ✅ Single-column Analysis brief
- ✅ Picture-in-picture evidence (one window)

## File Structure

```
prototype/rr-floating-desktop/
├── package.json
├── vite.config.ts
├── tsconfig.json
├── index.html
├── README.md
└── src/
    ├── main.tsx
    ├── App.tsx                    # App state & window management
    ├── styles/
    │   └── tokens.css             # Night ops design tokens
    ├── desktop/
    │   ├── Desktop.tsx            # Shell container
    │   ├── MenuBar.tsx            # Top bar
    │   ├── Dock.tsx               # Bottom dock
    │   ├── WindowManager.tsx      # Orchestrates all windows
    │   └── WindowFrame.tsx        # Draggable window chrome
    ├── windows/
    │   ├── MatchesWindow.tsx      # Match list + import
    │   ├── AnalysisWindow.tsx     # Score + problems
    │   ├── ProblemWindow.tsx      # PiP Clip/Radar + timeline
    │   ├── CoachWindow.tsx        # Coach messages
    │   └── DrillsWindow.tsx       # Practice checklist
    └── mock/
        └── data.ts                # Mock matches, problems, etc.
```

## Known Limitations (v1)

- Fixed window sizes (resize handles not implemented)
- No localStorage persistence of positions
- No keyboard shortcuts (Cmd+W, Cmd+`)
- Placeholder clip and radar (no real video/demo data)
- Menu bar items are non-functional stubs
- Import Match button is a stub

## Build for Production

```bash
npm run build
npm run preview
```

Static build outputs to `dist/`. Can be deployed to any static host.

## Notes

- This is an **isolated experimental prototype** on branch `feat/rr-floating-desktop`
- It does **not** replace the existing app or design prototypes
- Window manager is custom (~100 lines), not react-rnd
- PiP swap is pure CSS transitions + React state
- All interactions work without console errors
- Tested in Chrome/Firefox/Safari (desktop only)

## License

Part of the Round Reviewer project. See main repo for details.
