# CS2 telemetry to Three.js: implementation research

Research snapshot: 13 October 2026. This is an implementation plan for adding an optional tactical 3D reconstruction to Round Reviewer. It preserves the existing numerical analysis, model-selected moments, radar, shared playback clock, and external CS Demo Manager/HLAE recording path. No map assets were exported or downloaded for this research.

## Recommendation

Build a third replay view as a derived visualization of demo telemetry. Start with generic capsules on a simple floor, prove tick alignment and the source-to-render transform, and only then load a versioned Source 2 Viewer map export. Keep the current radar as the reliable overview and accessibility fallback. The first implementation is an omniscient tactical reconstruction, not an in-game first-person recording.

The repository already has useful foundations: replay samples carry absolute ticks and round-relative seconds; player positions are sampled at 8 Hz; `usePlaybackClock` is the shared clock for the radar, video, timeline, and inspector; `interpolateAt` handles player positions, shortest-path yaw, health, and death events. The API parser also keeps full-rate `dense_ticks` for only the three seconds before each death. A 3D panel can reuse this model, but it needs a separate, versioned telemetry product for camera angles and movement state.

## What the current replay contains

The source of truth is the replay contract in `apps/api/app/models/contracts.py` (`SamplePlayerState`, `ReplaySample`, `ReplayEvent`, `RoundReplay`) and the matching TypeScript interfaces in `apps/web/src/lib/contracts/index.ts`. Samples have absolute `tick`, round-relative `t`, player `x/y/z`, `yaw`, `health`, `alive`, and optional radar `rx/ry`. They do not currently carry `pitch`, stance, active weapon, velocity, or camera origin.

`apps/api/app/processing/parse_demo.py` requests `X/Y/Z`, `yaw`, `health`, `team_num`, `is_alive`, and `name` at `SAMPLE_HZ = 8`. It separately requests `DENSE_PROPS` around kills. That dense list contains `velocity_X/Y`, `yaw`, `pitch`, `health`, `is_alive`, `active_weapon_name`, `inventory`, and `flash_duration`; it is not full-round telemetry. `apps/api/app/analysis/extract.py` serializes only the pre-kill windows and currently retains x/y, vx/vy, yaw, and pitch there.

The upstream [demoparser2 property list](https://github.com/LaihoE/demoparser/blob/main/README.md) documents `X/Y/Z` as `m_vec + m_cell`, `pitch` as `m_angEyeAngles[0]`, `yaw` as `m_angEyeAngles[1]`, `health`, `is_alive`, `duck_amount`, `ducked`, `ducking`, `is_airborne`, `is_scoped`, `is_walking`, `player_state`, `active_weapon_name`, and velocity components. It also documents explicit-tick `parse_ticks` and user-command fields, including `usercmd_viewangle_x/y/z`. Treat `parse_ticks` results as state samples at requested server ticks, not as a guarantee that every subtick input or rendered camera adjustment is recoverable.

**Camera eye position is an unresolved input.** The current parser's documented properties do not include `m_vecViewOffset` or a final camera origin. Its pitch/yaw are useful look angles, but `X/Y/Z` are entity position, not proven eye position. Do not silently call the player origin “eye.” First test whether the pinned demoparser2 build can query the view offset or another camera-origin field in real demos. If not, show a stance-based camera-height approximation as approximate and keep camera POV disabled by default until checked against a known POV clip. Do not claim a faithful first-person camera from the current data.

## Source 2 Viewer map assets and their limits

[Source 2 Viewer’s map guide](https://s2v.app/ValveResourceFormat/guides/exporting-maps.html) describes exporting `.vmap_c` map resources as glTF, including map geometry, textures, placed props/models, and basic materials. The guide warns that a typical competitive map export can include hundreds of texture files; GLB export is limited to 2 GB. Its [format support and export fidelity guide](https://s2v.app/ValveResourceFormat/guides/format-support.html) is more important for product claims: only `light_environment` is exported as a light, point/spot lights are omitted, baked lightmaps/probes are not exported, and logic/camera/point entities without a model are skipped. Collision data can be a companion `_physics` file rather than part of the render mesh. The exported map is useful geometry and props, not a reproduction of CS2 lighting, visibility, game logic, or navigation.

Source 2 Viewer is a community parser/exporter based on reverse engineering; its own [repository README](https://github.com/ValveResourceFormat/ValveResourceFormat) says Valve does not provide Source 2 format documentation and not all formats are fully supported. Pin the exact exporter build and validate its output on a map before treating the export as a stable asset contract. Do not depend on entity names, point entities, baked lighting, or nav data surviving unless the validation fixture demonstrates it.

Use an operator-run asset build on a machine with the game files already available. The build should emit an app-owned, optimized asset package plus a manifest; the browser should never look inside Steam/VPK files. Record source map identity and a SHA-256 of the input map package. Since a demo's `map_name` alone may not identify an exact map build, record a nullable build identifier and report “map version unverified” where the demo cannot be matched to that asset hash. A matching map name is not proof of a matching geometry revision.

### glTF, compression, and runtime loading

Use glTF 2.0 / GLB as the runtime interchange format. The [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html) defines a right-handed, +Y-up coordinate frame; linear distances are specified in meters. Still record and validate the source-unit conversion and node transforms in the asset manifest. The [Three.js GLTFLoader docs](https://threejs.org/docs/pages/GLTFLoader.html) list support for Draco, meshopt, Basis/KTX2, instancing, and common material extensions, and explain which decoder helpers need to be registered. The [meshoptimizer gltfpack guide](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md) describes mesh optimization, quantization, meshopt compression, instancing, and KTX2/Basis texture conversion. Its optimizations can merge or prune nodes; use its keep-node/extras switches where the manifest, source names, or later chunking depends on them.

Proposed offline asset pass: export with Source 2 Viewer; inspect the scene graph and bounds; preserve a calibration report; then optimize with pinned `gltfpack` and KTX2/Basis settings. Build and serve a normal uncompressed GLB first. Add `EXT_meshopt_compression` and `KHR_texture_basisu` only after a browser fixture proves decoder paths and output fidelity. [Three.js KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html) must detect device support from the active renderer. Start with texture downscaling/mips and map LOD before pursuing every compression option.

For a first desktop experiment, one GLB per map is simplest. Do not make that the permanent mobile contract: the S2V output can be large and may not preserve spatially separable chunks. Inspect whether the exact export keeps useful world-node boundaries. If it does, produce area chunks with bounds and LODs. If it does not, create a separately validated low-detail overview mesh and/or a deliberate offline spatial split. Avoid assuming that a single full-map asset will fit mobile memory because its download is compressed; decoded textures and geometry occupy GPU/CPU memory too.

## Renderer and React integration

The patched lockfile currently resolves React `19.3.0` and does not depend on Three.js, R3F, or Drei. As of this research date, R3F’s stable docs are v9; the [v9 migration guide](https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide) calls v9 the React 19 compatibility release, and the project’s [release page](https://github.com/pmndrs/react-three-fiber/releases) lists the v9 line. The [v10 docs are explicitly alpha](https://r3f.docs.pmnd.rs/next/migration/v10); they describe a WebGPU-focused renderer and scheduler rewrite, require newer Three.js and currently tested React 19.0–19.3, and flag that matching Drei peer support is pending. Use pinned R3F `9.8.1` for the first integration; stable release notes confirm React 19.3 support was added in 9.8.0. Do not copy v10-only `renderer`, scheduler, or `useFrame` phase APIs into a v9 implementation.

Start with Three.js `WebGLRenderer` through R3F v9. Three.js documents that [WebGLRenderer requires WebGL 2](https://threejs.org/docs/pages/WebGLRenderer.html); R3F Canvas supports an explicit fallback, so the UI should detect renderer failure and retain radar/video. The Three.js [WebGPURenderer guide](https://threejs.org/manual/pages/webgpurenderer) says it can fall back to a WebGL 2 backend, but also describes it as experimental and notes that `ShaderMaterial`, `onBeforeCompile`, and EffectComposer paths are not supported there. It is not needed for this MVP. If WebGPU is explored later, use it as a measured opt-in after the WebGL 2 view is correct and test the actual production material and effects.

Load R3F client-side only from a lazy Next.js boundary; never instantiate a canvas during server rendering. Use one canvas for the 3D panel, and do not keep a hidden canvas rendering behind another tab. On pause, map inspection does not need a continuous redraw; use demand rendering where supported or invalidate on clock/camera/resize changes. During playback, mutate Three objects in `useFrame`; do not create React state updates for every player on every display frame. Keep the application’s `usePlaybackClock` as the sole timeline authority. The view reads its current `t` from a ref and evaluates replay state from that time; it must not create a second RAF clock.

Resource lifecycle needs explicit ownership. R3F v9 automatically calls `dispose()` on many unmounted objects, but its [Canvas docs](https://r3f.docs.pmnd.rs/api/canvas) distinguish renderer ownership, and [object docs](https://r3f.docs.pmnd.rs/api/objects) say primitives and cached shared assets require manual care (`dispose={null}` for retained shared trees). Three.js’s [disposal guide](https://threejs.org/manual/pages/how-to-dispose-of-objects.html) explains that geometry, materials, textures, render targets, skeletons, and `ImageBitmap` CPU resources have separate cleanup rules. Add an explicit map-cache owner and eviction hook; never dispose a material/texture still used by another scene. Use `renderer.info` to observe draw calls and allocated geometry/texture counts.

## Coordinate contract and test vectors

Source 2 Viewer’s [`EntityTransformHelper` API remarks](https://s2v.app/ValveResourceFormat/api/ValveResourceFormat.ResourceTypes.EntityTransformHelper.html) define Source 2 as right-handed, Z-up, with +X forward, +Y left, +Z up. The same page states QAngle pitch is positive down and yaw is positive left. The upstream `demoparser2` property list identifies `pitch`/`yaw` as the corresponding eye-angle components. The VRF repository's [glTF extraction tests](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/master/Tests/GltfExtractTest.cs) verify source-to-glTF length scaling of roughly 0.0254 (source inch to meter) on exported model/static-mesh fixtures. Verify this unit scale for the actual map-export path before fixing it in production; glTF specifies meters, so validate that this exporter path actually performs the Source-unit conversion.

**Candidate source-to-Three transform, to be confirmed against a pinned map export:** let `pS = (X,Y,Z)` be demo coordinates in Source units. If S2V's map export presents a normal glTF Y-up scene with the Source-to-glTF axis rotation baked into vertices/nodes, use the matching point transform:

```text
pThree = 0.0254 * M * pS

M = [ 1   0   0 ]
    [ 0   0   1 ]
    [ 0  -1   0 ]

(X, Y, Z) -> (X, Z, -Y)
```

This is the proper -90-degree rotation about Source X that makes Source +Z become Three/glTF +Y while preserving handedness; it retains Source +X as Three +X and maps Source +Y-left to Three -Z. It is a **candidate**, because the map guide promises glTF export but does not state the exact map-export axis bake or unit metadata. Inspect the exported GLB scene nodes and compare known points before selecting this matrix. Do not apply a second Y-up correction if the exported scene already contains an equivalent transform. Store the verified matrix, scale, and any translation in the map asset manifest; do not bury per-map transforms in render components.

Candidate test vectors (meters):

| Source input | Expected candidate output | Meaning |
| --- | --- | --- |
| `(0, 0, 0)` | `(0, 0, 0)` | Origin |
| `(39.3700787, 0, 0)` | `(1, 0, 0)` | +Source X forward stays +Three X |
| `(0, 39.3700787, 0)` | `(0, 0, -1)` | +Source Y left becomes -Three Z |
| `(0, 0, 39.3700787)` | `(0, 1, 0)` | +Source Z up becomes +Three Y |

Before shipping a map, run these matrix unit tests and a map alignment check: overlay telemetry from at least four non-collinear landmarks on the 3D export’s top-down projection and the existing radar using `worldToRadar` in `apps/web/src/lib/replay/maps.ts`. Fit only a proper rotation already justified by source-frame evidence (a reflection would contradict the stated right-handed frames), a uniform scale, and translation; use three points to solve and a held-out fourth to reject a bad fit. The expected map-to-radar residual is a proposed acceptance limit (≤ one world meter after scale calibration), not a benchmark result. If landmarks cannot be paired reliably, mark calibration unverified and keep the 3D map disabled for that map.

### Camera forward vector

Given Source `pitch` and `yaw` in degrees, the candidate forward vector in Source axes is:

```text
p = radians(pitch); y = radians(yaw)
fSource = (cos(p) * cos(y), cos(p) * sin(y), -sin(p))
fThree  = M * fSource
```

This formula is directly constrained by the VRF convention above: at `(pitch=0, yaw=0)` the player faces +Source X; positive yaw turns left toward +Source Y; positive pitch points down toward -Source Z. With the candidate matrix, `fThree = (cos(p)cos(y), -sin(p), -cos(p)sin(y))`. Give `PerspectiveCamera.lookAt(eyeThree + fThree)` and world up `(0,1,0)` rather than translating Source Euler angles directly into a Three.js Euler. Test forward vectors `(0,0)->(+1,0,0)`, `(0,+90)->(0,0,-1)`, `(+90,0)->(0,-1,0)`, and `(-90,0)->(0,+1,0)` in Three coordinates. These are candidate transform vectors; compare them with an actual known demo and S2V view before displaying a POV camera. Never flip pitch or yaw by visual guesswork.

## Replay timing, interpolation, and state correctness

Use the existing absolute tick clock. For a round with `startTick` and `tickRate`, define `roundSeconds = (tick - startTick) / tickRate`; convert requested time back with `roundTick = startTick + round(roundSeconds * tickRate)`. Keep absolute ticks in API chunks and preserve the current `RoundReplay.t` round-relative convention. This prevents float-time drift when seeking and anchors events and telemetry to the same tick. Respect the inclusive/exclusive convention used by the parser and round bounds; add tests at both endpoints.

Make render state a pure function of `(roundTick, telemetry, events)`. That makes direct seek, reverse playback, rate changes, and repeated seeks deterministic; do not mutate “currently alive” as a series of forward-only side effects. Interpolate continuous position/velocity and look angles only between valid bracketing samples. Interpolate yaw over the shortest angular path. Apply source-frame-to-render transform after interpolating the Source values, not partly before and partly after. Do not interpolate across a long missing-data gap, teleport/spawn boundary, player disappearance, round reset, or death/respawn discontinuity; hold/step the state or show a gap marker.

Keep health, alive, stance flags, weapon, scoped/defusing, and other enums discrete. Resolve `player_hurt`/death/round-end events by absolute tick so health and death switch at the event tick in either playback direction. Current `interpolateAt` already handles sampled health/alive as discrete and overlays kill events, but its per-call event scan is linear and it treats a kill as permanent for that round. A new world interpolator should pre-index events per player, binary-search the latest event at/before the target tick, and honor explicit respawn/life-state samples if a round format can contain them. Add regression vectors for exact event tick, just-before-event, direct seek after event, reverse seek before event, yaw wrap `179° -> -179°`, missing player frame, long gap, and round-end clamping.

At display refresh, update player `Object3D`s from the replay function with refs. A generic player can be an instanced capsule or a small group with a body capsule, head sphere, and a short forward marker; use duck amount/stance to change its silhouette and height. This is only a tactical marker. For the local player camera, use the parser’s pitch/yaw and a separately validated eye-height field; do not use body yaw as eye yaw. Add exact event labels/health in normal DOM elements rather than text baked into the 3D scene.

## Phased implementation

### Phase 0: prove data, axes, and clock with no map asset

Add a telemetry fixture from one synthetic/test replay and one operator-selected real demo already in the local workspace. Extend parser tick requests with pitch, stance, velocity, scoped/airborne and active weapon where the pinned parser confirms the property names. Keep 8 Hz across the round initially; include event ticks and selectively request denser windows around selected moments rather than storing 64 Hz for every player in every tick. Explicitly list absent fields in the response. Render generic capsules and a floor; bind the playback view to the existing shared clock.

Acceptance: field extraction is stable against the pinned demoparser2 build; absolute tick to `t` round-trips at both endpoints; the candidate coordinate and angle vectors pass; direct seek/reverse produces identical frame state; UI still works when no 3D data or WebGL context is available. Do not start a Source 2 Viewer export yet.

### Phase 1: versioned map export, calibration, and overview scene

Create an operator-run asset build for one map. Export through Source 2 Viewer, pin exporter version, inspect the root and node transforms, verify meter scaling and the candidate matrix, and make a map manifest. Optimize a copy, compare bounding boxes, representative pixels/materials and node names, and load it only after the unoptimized GLB path succeeds. Start with a fixed top-down/orbit overview and generic capsules; no collision simulation, smoke, dynamic light, or player models.

Acceptance: the asset manifest exactly identifies its map/export/hash; malformed/missing manifest or mismatched map identity returns the radar fallback; four map/radar calibration landmarks pass the declared residual; glTF decode reports no missing textures/decoder extensions; asset cleanup/unmount and switching maps do not grow renderer counts over a repeatable load/unload loop.

### Phase 2: tactical state and camera-quality improvements

Add true state transition events and exact per-event health/death changes. Add higher-rate telemetry only for the selected player or small selected moment window if visible quality needs it and the parse/storage cost is measured. Research/customize parser support for view offset/camera origin. Add team readability, selected-player focus, camera modes (overview, free, approximate POV), and event playback controls. Label approximate camera mode clearly.

Acceptance: interpolation test matrix passes in forward/reverse seek; event, radar, video, and world views agree on tick alignment; at least one known POV segment is overlaid and camera positional/angular error is recorded. Keep the approximate mode until a real camera origin is proven.

### Phase 3: quality and optional export

Only after map and data correctness, tune texture/mesh compression, LOD/chunks, shader/material simplification, optional shadows, and mobile settings. Consider browser export as an opt-in follow-on. A same-origin canvas can be captured with `captureStream()` and encoded with `MediaRecorder` ([W3C Media Capture from DOM Elements](https://www.w3.org/TR/mediacapture-fromelement/), [W3C MediaStream Recording](https://www.w3.org/TR/mediastream-recording/)); that produces a real-time capture, not a deterministic, frame-exact offline renderer. It can miss frame cadence under load and requires deliberate audio composition if POV video audio is included. Probe supported MIME types, gate on same-origin assets, and test browser behavior before exposing export. True offline output needs a separate frame scheduler/encoder path and is outside the first 3D implementation.

## Versioned contracts and asset pipeline

Keep 3D rendering optional and do not inflate every existing `RoundReplay` response with full-rate data. Add a small descriptor endpoint/reference and bounded chunk endpoint (or static immutable asset URLs) with explicit versions. Suggested shape:

```json
{
  "schema": "rr-world-replay/1",
  "matchId": "…",
  "roundId": "r3",
  "mapAssetId": "de_mirage:<sha256>",
  "startTick": 123456,
  "endTick": 128000,
  "tickRate": 64,
  "sampleStrideTicks": 8,
  "players": [{"id": "…", "team": "CT"}],
  "chunks": [{"url": "…", "startTick": 123456, "endTick": 124416, "sha256": "…"}],
  "fields": ["origin", "pitch", "yaw", "health", "alive", "duckAmount", "activeWeapon"]
}
```

Each referenced chunk should be independently decodable and carry its own version and bounds, for example:

```json
{
  "schema": "rr-world-replay-chunk/1",
  "replaySchema": "rr-world-replay/1",
  "startTick": 123456,
  "endTick": 124416,
  "coordinateSpace": "source2-z-up-units",
  "fields": ["origin", "pitch", "yaw", "health", "alive"],
  "missingFields": ["cameraOrigin"],
  "samples": [{"tick": 123456, "players": []}]
}
```

Every sample should keep absolute integer `tick`, Source-unit origin, field-presence flags, and discrete values; use a separate optional camera-origin field only when genuinely parsed. Specify whether bounds are inclusive in the schema; a practical convention is inclusive bounds with one shared boundary sample between adjacent chunks. That gives interpolation a bracket at a chunk edge without double-counting events. Carry events in a sorted list or include each exactly once under a documented ownership rule. Verify every sample tick is in bounds, strictly ordered per player, and integral; represent gaps explicitly rather than filling them with invented values. A 15-second chunk at 8 Hz is a starting proposal, not a measured optimum. If the payload later moves from JSON to a binary packed format, increment the schema and provide a decoder fixture. Never quantize coordinates until a round-trip error test establishes an allowed bound.

Suggested map manifest:

```json
{
  "schema": "rr-map-asset/1",
  "mapAssetId": "de_mirage:<sha256>",
  "mapName": "de_mirage",
  "sourcePackageSha256": "…",
  "sourceBuild": null,
  "exporter": {"name": "ValveResourceFormat", "version": "…"},
  "format": "glb",
  "assetSha256": "…",
  "unitsPerSourceUnit": 0.0254,
  "sourceToRender": [[1,0,0,0],[0,0,1,0],[0,-1,0,0],[0,0,0,1]],
  "calibration": {"status": "verified", "controlPointCount": 4, "maxResidualMeters": 0.0},
  "chunks": [{"id": "overview", "url": "…", "sha256": "…", "lod": 0, "bounds": [0,0,0,0,0,0]}]
}
```

Numbers above are schema examples only; the calibration residual must be computed and `sourceBuild` may remain null. Keep source hashes, exporter version, optimization tool version/flags, map output bounds, and validation results in build artifacts. The asset pipeline should fail on invalid glTF, missing buffer/texture dependencies, zero/NaN bounds, empty geometry, unrecognized compression extension, or a source-to-render test mismatch. The web loader should verify schema/hash and mapAssetId before it adds geometry; a mismatch becomes a visible “3D map unavailable/version unverified” state with the existing radar.

## Module ownership proposal

Keep responsibilities narrow so independent lower-cost implementation tasks do not overlap files:

| Task | Inputs | Exclusive files | Depends on | Acceptance |
| --- | --- | --- | --- | --- |
| API telemetry descriptor/chunks | Existing `RoundReplay` and parser output; schema examples above; synthetic fixture only | New `apps/api/app/processing/world_replay.py`; new `apps/api/tests/processing/test_world_replay.py` | None | Parser properties are explicit; chunks use absolute ticks and round-relative derivation; field omissions are surfaced; fixtures cover tick conversion and round limits. Do not rewrite the existing analysis or clip worker. |
| Replay contracts | Reviewed v1 schema fixture; current Python and TypeScript validation conventions | `apps/api/app/models/world_replay.py`; `apps/web/src/lib/contracts/worldReplay.ts`; new contract tests only | Agree on schema draft first | Python and TS validate the same v1 fixtures and reject unknown coordinate/schema versions cleanly. |
| Pure transform/interpolator | Synthetic coordinate/event fixtures; `maps.ts` radar convention | `apps/web/src/lib/replay/worldTransform.ts`; `apps/web/src/lib/replay/worldInterpolate.ts`; matching new unit-test files only | API fixture and contract | Source basis, candidate transform, angle vectors, tick interpolation, event/discrete state, reverse/direct seek cases pass with no renderer dependency. |
| Asset manifest validator | Hand-authored synthetic manifest and tiny non-game GLB fixture | New `apps/web/src/lib/replay/mapAssets.ts`; `apps/web/src/lib/replay/mapAssets.test.ts` | Confirmed manifest schema; no real game export required | Valid hash/schema/map match loads; mismatch/unsupported compression/bad bounds returns typed fallback reasons. Do not fetch/extract game files. |
| Lazy 3D scene | Synthetic replay fixture and tiny synthetic GLB; approved stable R3F v9 versions | `apps/web/src/components/replay/WorldReplayView.tsx`; `WorldPlayerMarkers.tsx`; `world-replay.css`; `apps/web/package.json` and lockfile | Transform module and fixture | One lazy client canvas, generic instanced capsules, camera uses shared clock, no per-frame React state, keyboard-visible controls and radar fallback. Package files are exclusive to this task. |
| Studio integration | Ready lazy scene; API descriptor; current studio view controls | `apps/web/src/app/studio/[matchId]/page.tsx` only | Lazy scene and API descriptor are available | Adds an explicit World view without breaking Radar/Gameplay; all three use the shared clock; no rendering work occurs when the 3D panel is closed. |

These are proposed bounded implementation tasks for lower-cost delegation after a human reviews the schema and each task prompt. They have narrow inputs, exclusive file ownership, and explicit acceptance checks; no task should be asked to rewrite the architecture, operate autonomously across the entire repository, start a paid deployment, or publish anything. They do not authorize asset extraction, Steam/CS2 launch, browser automation, or deployment. The map-build step remains an operator-run local workflow until the project has an approved asset provenance/distribution decision.

## Accuracy gaps and product language

The first 3D milestone is an omniscient reconstruction of sampled server state. It does not reproduce the player’s actual pixel view or visibility. In particular:

- S2V map exports omit key game lighting (baked lightmaps/probes and point/spot light sources) and some non-model logic entities.
- The current replay payload has no complete pitch/stance/camera stream, no proven eye offset, and only 8 Hz full-round position samples. Dense full-rate data currently exists only in small pre-kill windows.
- Generic capsules do not reproduce player models, skins, hitboxes, animation graphs, foot placement, weapon viewmodels, or pose state.
- Recoil/aim punch is a separate parser field and its exact contribution to rendered view angles must be checked; do not add it to `pitch` without confirming whether `m_angEyeAngles` already includes the visible effect.
- Weapon firing, spread, smoke/flash, recoil, occlusion, player vision, spectator rules, and local rendering effects are not reconstructed by position interpolation. A scene with every player visible is deliberately omniscient and should be labeled “Tactical replay.”
- Map collision, doors, breakables, navmesh, smoke volumes, and dynamic object state need their own parsed state and validated map data; do not imply static GLB geometry reproduces those gameplay mechanics.

Show the exact tick and event list in DOM, keep Radar one click away, let users pause/seek with the shared controls, and preserve a text explanation when 3D assets or WebGL2 are unavailable. Mark unverified maps and approximate camera position on screen. Do not market the view as demo playback or a POV substitute until scene and camera timing have been measured against external POV recordings.

## Mobile, accessibility, and performance budget

There are no project-specific GPU or mobile measurements yet. Do not claim a frame rate from the RTX 5080 or infer phone performance from compressed download size. Use this as an initial measurement plan:

- Load the 3D code and map assets only after the user opens World; keep the radar path immediate and independent.
- Set a capped pixel ratio (start at 1–1.5 on mobile, 2 on desktop as a trial), no default shadow maps on mobile, simple PBR/unlit materials, instanced markers, and one active canvas.
- Keep at most the current map and one prefetched map in an explicit cache. Bound downloaded chunks and decoded texture sizes in the asset manifest. Budget limits should be selected from measured low-tier hardware and an approved map fixture, not guessed globally.
- Collect: first-world-visible latency; bytes downloaded before first frame; asset decode time; p50/p95 frame time during 60 seconds; p95 seek-to-correct-frame latency; active triangles, draw calls, geometries, textures and approximate texture bytes (`renderer.info` where available); GPU/context loss; long tasks and memory growth after 10 map switches. Compare desktop, integrated GPU, and at least one low-tier supported phone.
- Proposed acceptance gates after measurements: no initial-route bundle regression from Three/R3F; 3D disabled when WebGL2 init fails; no monotonic resource growth after repeated mount/unmount; stable tick alignment under 0.5x/1x/2x/4x playback and reverse; agree a mobile frame-time target from actual supported devices before release. Treat these as release criteria to measure, not existing results.

Accessibility: expose Radar, World, and Gameplay as labeled controls; maintain keyboard play/pause/seek and focus; make selected-player, team, health, death, map mismatch, and approximate-camera state available in text; honor reduced motion by preferring paused static overview; never require color alone for team distinction; and keep a keyboard-usable 2D radar fallback. Use a perspective map camera only as an alternative representation, not as the only way to understand a play.

## Primary sources

- Repository snapshot reviewed: `apps/api/app/models/contracts.py`, `apps/api/app/processing/parse_demo.py`, `apps/api/app/analysis/extract.py`, `apps/web/src/lib/contracts/index.ts`, `apps/web/src/lib/replay/interpolate.ts`, `apps/web/src/lib/replay/usePlaybackClock.ts`, `apps/web/src/components/replay/GameplayView.tsx`, `apps/web/src/lib/replay/maps.ts`, and `apps/web/package.json`.
- [demoparser2 README and supported properties](https://github.com/LaihoE/demoparser/blob/main/README.md)
- [Source 2 Viewer map export guide](https://s2v.app/ValveResourceFormat/guides/exporting-maps.html)
- [Source 2 Viewer export fidelity](https://s2v.app/ValveResourceFormat/guides/format-support.html)
- [Source 2 Viewer EntityTransformHelper axes and QAngle signs](https://s2v.app/ValveResourceFormat/api/ValveResourceFormat.ResourceTypes.EntityTransformHelper.html)
- [ValveResourceFormat GLTF extraction tests for source-unit scale](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/master/Tests/GltfExtractTest.cs)
- [Khronos glTF 2.0 specification](https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html)
- [Three.js GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [DRACOLoader](https://threejs.org/docs/pages/DRACOLoader.html), [KTX2Loader](https://threejs.org/docs/pages/KTX2Loader.html), [WebGLRenderer](https://threejs.org/docs/pages/WebGLRenderer.html), [WebGPURenderer guide](https://threejs.org/manual/pages/webgpurenderer), and [resource disposal guide](https://threejs.org/manual/pages/how-to-dispose-of-objects.html)
- [React Three Fiber stable v9 migration guide](https://r3f.docs.pmnd.rs/tutorials/v9-migration-guide), [v9 Canvas lifecycle](https://r3f.docs.pmnd.rs/api/canvas), [R3F object disposal behavior](https://r3f.docs.pmnd.rs/api/objects), [v10 alpha migration guide](https://r3f.docs.pmnd.rs/next/migration/v10), and [R3F releases](https://github.com/pmndrs/react-three-fiber/releases)
- [meshoptimizer gltfpack](https://github.com/zeux/meshoptimizer/blob/master/gltf/README.md)
- [Khronos KTX-Software](https://github.com/KhronosGroup/KTX-Software)
- [W3C Media Capture from DOM Elements](https://www.w3.org/TR/mediacapture-fromelement/) and [W3C MediaStream Recording](https://www.w3.org/TR/mediastream-recording/)
