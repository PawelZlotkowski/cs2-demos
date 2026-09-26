# 07 Radar system

Related: [05 Analysis Studio](./05-ANALYSIS-STUDIO.md), [06 Overlays](./06-VIDEO-OVERLAY-SYSTEM.md), [11 Motion](./11-MOTION-SYSTEM.md)

Code: `drawMap()`, `buildScene()` (radar part), `renderRadar()`, `focusBox()`, `aspectBox()` and `setCamera()` in [`prototype/analysis-studio.html`](../../prototype/analysis-studio.html).

The radar is a temporal analytical view, not a static map widget.

## Map

- **Prototype:** a simplified set of rectangles (`AREAS`) approximating Mirage in 0 to 100 map units, captioned as a simplification. Status: mocked.
- **Planned:** real radar images, with world-to-radar coordinate transforms per map. Project history mentions MurkyYT radar images, and the `cs2coach` package already plots findings on real radars.
- **Labels:** only the zones listed in the moment's `zones` are readable. The others are nearly invisible. Labels are hidden when the radar is the PiP.

## What it shows (per moment, only what supports the lesson)

| Element | Rendering | Status |
|---|---|---|
| Player (you) | White dot with a blue ring, a travelled trail, a dashed planned route, and a view cone from movement direction | implemented |
| Teammates | Grey dots and faint trails. Only players marked `f:1` count towards camera framing | implemented |
| Enemies | Orange dots, shown only from the time they are spotted (`from`) | implemented |
| Deaths | An X at the death position; the player's group dims | implemented |
| Sightlines | Orange lines (blue for your own trade) | implemented |
| Zones | Dashed orange areas ("Left open", "Held angle", "Two Ts on site") | implemented |
| Utility | Smoke circles | implemented. Molotovs and flashes are planned |
| Relationships | A dashed line between two live players with a label ("Kuba 4.1 s away", "Max alone on A", "5 m behind") | implemented |
| Timing points | A ring on the path at the decision time ("Left at 0:44") | implemented |

## Storytelling recipes

- **Early rotation (moment 2):**
  1. the travelled route
  2. the mark where you left
  3. the "Left open" zone appears
  4. enemies appear as they are spotted entering it
  5. a link to the teammate left alone
- **Poor spacing or no trade (moment 1):** the players involved, the relationship line with the time or distance, and the angle that punished it.
- **Utility timing (moment 3):** the enemy's sightline before, the smoke landing, and the line gone after.

Do not show all of these at once. Each moment's `rov` lists only what it needs, sequenced by `t0` and `t1` like the gameplay overlays, on the same paused timeline.

## Camera

- **Moment focus (default):** `focusBox()` fits you, the enemies, overlays and flagged teammates with 7 units of padding, expanded to the stage's aspect ratio. The minimum width is 28 units.
- **Whole map:** a toggle (`#zoomBtn`) switches the framing to about the full map.
- **Camera moves:**
  - It tweens the SVG `viewBox` over 320ms (`power2.inOut`) when the moment changes or the zoom is toggled.
  - It is instant on resize, on view swap, from the keyboard, or with reduced motion.
- Sizes are constant on screen at any zoom:
  - strokes use `vector-effect: non-scaling-stroke`
  - dot radii, label sizes and offsets are divided by the current pixels-per-unit every frame
- A legend (You, Team, "Enemy, once seen") shows when the radar is the main view.
