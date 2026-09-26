# 11 Motion system

Related: [12 Skills](./12-SKILLS-AND-REFERENCES.md), [13 Accessibility](./13-ACCESSIBILITY.md), [06 Overlays](./06-VIDEO-OVERLAY-SYSTEM.md)

Motion must explain space, time, continuity, a relationship or a change of state. Otherwise, remove it. The rules come from Emil Kowalski's skills and the GSAP skills ([12](./12-SKILLS-AND-REFERENCES.md)).

## Inventory

This is every animation in the prototype.

| Animation | Tech | Duration and ease | Purpose |
|---|---|---|---|
| Overlay sequencing | GSAP paused timeline, driven by clip time | 0.24s in and out in clip time | Time: overlays appear at the right moment |
| Radar camera (`viewBox`) | GSAP tween | 320ms `power2.inOut` | Space: where the new moment is |
| Gameplay and Radar swap | GSAP Flip on both surfaces | 240ms `power2.inOut` | Continuity: the PiP becomes the stage |
| Rail selection indicator | GSAP Flip | 180ms `power2.inOut` | Relationship: which moment is selected |
| Moment switch, panel text | GSAP | 80ms out, 140ms in, opacity only | State change without a jump |
| Coach open and close | GSAP Flip (nested) | 220ms | Continuity of the panel body |
| Mobile sheet snap | GSAP (interruptible, `overwrite`) | 320ms `power3.out` | Follows the gesture |
| Segmented control pill | CSS transition | 200ms `cubic-bezier(.23,1,.32,1)` | State |
| Tablet drawer | CSS transform | 260ms `cubic-bezier(.32,.72,0,1)` | Where the panel came from |
| Button press | CSS `:active` | 140ms, `scale(.97)` | Feedback |
| Tooltip | CSS | 120ms. Instant when another is already open | Feedback without delay |
| Disclosure chevron | CSS | 180ms rotate | State |
| Processing bar | CSS keyframes, linear | 1.1s loop | Real in-progress status only |
| Coach answer text | JS interval | 2 words every 28ms | Imitates real SSE streaming |

## Rules

- **GSAP is for:** time-driven overlays, radar camera and paths, view continuity (Flip), gesture-driven sheets, and coordinated state changes.
- **GSAP is not for:** hover, button presses, simple opacity or colour changes, or decorative entrances. Use CSS for those.
- Use durations of 150 to 300ms for UI. Longer is allowed only for real gameplay movement or spatial camera moves.
- Use ease-out for entering and ease-in-out for movement. Never use ease-in for UI. Never animate from `scale(0)`.
- Animate only transforms and opacity. The `viewBox` tween is an SVG attribute, an accepted exception.
- **Keyboard actions are instant:** `[`, `]`, `V`, `/`, `,`, `.` and Esc. They repeat too often to animate.
- **Removed on purpose:** page and view fades, stage blur on moment switch, camera sway in the placeholder clip, upload drop fade.

## Reduced motion

- **CSS:** under `prefers-reduced-motion: reduce`, transitions are limited to opacity and colour properties, and keyframe animation is disabled.
- **JS:** `REDUCE` skips Flip, the camera tween, the sheet tween, the text crossfade and word streaming.
- Overlay visibility still follows playback time. That is content, not decoration.

## React port

The GSAP React skill applies to the planned React app. Use `useGSAP` with a `scope`, and `contextSafe` for handlers. Keep the sequencing timeline paused and driven by media time, and revert it on unmount.
