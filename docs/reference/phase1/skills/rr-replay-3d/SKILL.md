---
name: rr-replay-3d
description: Build or assess a Three.js tactical reconstruction from CS2 telemetry with correct timing, coordinates and explicit fidelity limits.
---

Use `review/THREEJS-RESEARCH.md` for the researched coordinate, asset and renderer contracts, and `review/AGENTIC-IMPLEMENTATION-PLAN.md` tasks T1-T4 for bounded implementation prompts. Keep the shared tick clock, explicit map calibration, stable R3F compatibility and game-recording fallback. Delegate narrow independent tasks to a lower-cost model first; do not dispatch a whole-app rewrite.

# Three.js CS2 replay

Build a reconstruction from parsed telemetry; Three.js does not execute a Source 2 demo. Preserve radar and recorded POV paths. Start with one map, generic capsules, event markers and a free/follow camera before detailed assets.

Use Three.js with React Three Fiber matched to the project's React major version. Establish a tested world-to-render coordinate transform, units and clock. Verify known map coordinates, orientations, seek/reset and side switches before visual polish.

The current 8 Hz replay is suitable for coarse movement. Add supported dense selected-window aim/camera/stance/weapon fields if the requested view needs them. Never create gameplay facts from interpolated frames. Health/death/weapon changes occur at event ticks; interpolate only continuous state.

Use map geometry matching the game build. Geometric ray visibility differs from original player vision and knowledge; dynamic smoke/doors and missing state must be qualified. Asset export capability does not imply redistribution permission; generic distributable assets are appropriate for the first public prototype.

Update transforms in the render loop, cache geometry, control texture/DPR cost and render on demand when paused. Profile before introducing spatial acceleration or binary formats. Validate positions/ticks and report FPS/load time on target hardware. Describe a tactical reconstruction honestly; do not label approximated recoil, smoke or animation as exact POV.
