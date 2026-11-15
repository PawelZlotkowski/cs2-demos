# Demo parsing models recording and deployment research

Recommendations checked on 13 October 2026 for your Ryzen 9 9950X, RTX 5080 16 GB, 64 GB RAM, personal-first workflow and EUR 30 monthly cloud testing budget. The implementation choices below are engineering recommendations, not measured performance on your machine.

## Demo parsing libraries

| Library | Best use here | Tradeoff | Recommendation |
|---|---|---|---|
| **demoparser2** | Query CS2 events/properties into Python tables; keep the existing parser | Native parser and property/schema changes still require isolation and a real-demo corpus | Keep as the primary parser |
| **Awpy** | Navigation distance, map-aware analysis and visibility experiments | Uses demoparser2 for parsing, so it is not an independent parser cross-check; geometry must match the map build | Add selected analysis helpers when they improve a detector |
| **demoinfocs-golang** | Independent event-driven validation and a potential Go parsing worker | Adds a second language/service and another contract to maintain | Research as a reference parser; migrate only if measured gaps justify it |
| **demoparser2 WASM** | Future personal/privacy-oriented browser parsing | Large demos and native-to-browser support need memory/performance validation | Explore later, in a Web Worker, after the server pipeline is stable |

demoparser2 does its heavy work in Rust and exposes Python, Node and WASM interfaces. It is the closest fit to the current Python code. Awpy explicitly uses it underneath; its navigation and visibility modules provide higher-level tools. The current demoinfocs repository documents v5 for CS2/CSTV+ and v3 for CS:GO; use a pinned tested release, not an old import copied from a tutorial. [demoparser2](https://github.com/LaihoE/demoparser), [Awpy parsing](https://awpy.readthedocs.io/en/latest/examples/parse_demo.html), [Awpy navigation](https://awpy.readthedocs.io/en/latest/examples/nav.html), [Awpy visibility](https://awpy.readthedocs.io/en/latest/modules/visibility.html), [demoinfocs](https://github.com/markus-wa/demoinfocs-golang).

The current app calls `parse_event` repeatedly, then parses sampled, economy and dense-window ticks. Benchmark grouping compatible event queries through `parse_events`; verify that extra properties and returned columns are unchanged before adopting it. Use few coarse full-match properties and full-rate properties in selected windows. Do not feed every tick into the model.

Retain pandas until profiling shows a bottleneck. PyArrow/Parquet is worth testing for cached analytical tables; Polars or DuckDB can be evaluated for heavier datasets. Those are storage/query choices, not substitutes for the demo decoder. A binary or compact chunked replay format should be tested separately from analytical storage.

Create a parser adapter returning a versioned contract and capability flags. Compare event counts, rounds, sides, tick ranges and supported properties on the same real demos before considering speed. The parser's open issue tracker includes demo/build-specific failures and missing subtick properties, so do not promise precise subtick movement analysis from a property name alone. [demoparser2 issues](https://github.com/LaihoE/demoparser/issues).

## Models beyond Qwen and Gemma

Start with **Ministral 3 8B Instruct**, then compare its 14B sibling if the quality gap is meaningful. Keep Qwen/Gemma as baselines. This app primarily needs structured selection, tool use and grounded short explanations; general coding/math benchmark scores do not determine coaching quality.

| Candidate | Why research it | Fit on your 16 GB GPU | Main evaluation question |
|---|---|---|---|
| **Ministral 3 8B Instruct 2512** | Native function calling/JSON; multilingual; Apache 2.0 | First trial: text-only Q4 or Q5 with a modest context | Can it reduce unsupported claims and improve PL/NL at useful latency? |
| **Ministral 3 14B Instruct 2512** | Larger variant of the same family | Quantized trial; FP8's published 24 GB configuration does not fit | Does its extra quality justify higher VRAM/load time? |
| **gpt-oss-20b** | Apache 2.0, tool use and structured reasoning | Borderline: official MXFP4 guidance is about 16 GB; test alone and cap context | Does better selection outweigh format/runtime complexity and less recording headroom? |
| **Phi-4-mini-instruct** | 3.8B model, multilingual coverage including Polish and Dutch | Small quantized baseline with substantially more headroom | Is it sufficient for explanations from approved evidence? |
| **Nemotron 3 Nano 4B** | Small agent/reasoning candidate | Research a supported quantized runtime before benchmarking | Does it improve English/tool efficiency? Published language support is English |
| **SmolLM3 3B** | Small independent baseline with tool/reasoning support | Low-memory trial | How much quality is lost when minimizing latency and cost? |
| **DeepSeek-R1-Distill-Llama-8B** | Reasoning-focused alternative based on Llama | Quantized experimental baseline | Can it follow the required schemas/tools and languages? Do not assume it can |

Mistral's 8B model card describes an 8.4B language model plus a vision encoder, with native tool/JSON capabilities; Dutch is named in its language list, but Polish still needs task-specific evaluation. The 14B card gives a 24 GB FP8 example. Quantizing text weights changes the memory requirement, so a GGUF file and short context must be benchmarked rather than equating parameter count with runtime VRAM. [Ministral 8B model card](https://huggingface.co/mistralai/Ministral-3-8B-Instruct-2512), [Ministral 14B model card](https://huggingface.co/mistralai/Ministral-3-14B-Instruct-2512).

OpenAI's official guide puts gpt-oss-20b at approximately 16 GB with MXFP4 and identifies RTX 50-series support. Its Harmony format and reasoning behavior need a compatible runtime/template. Treat it as an isolated experiment; that memory estimate is not a guarantee it can share your GPU with CS2. The app already has a gpt-oss sampling profile, but family-specific reasoning options should be handled by the serving adapter. [Official gpt-oss runtime guidance](https://developers.openai.com/cookbook/articles/gpt-oss/run-transformers).

Phi-4-mini publishes Polish and Dutch support. Nemotron 4B's card names English, so it is a lower-priority choice for multilingual coaching. SmolLM3 and DeepSeek are useful comparison candidates, not presumed replacements. Some DeepSeek distillations use Qwen underneath; the Llama variant is the distinct-base option in this list. [Phi model card](https://huggingface.co/microsoft/Phi-4-mini-instruct), [Nemotron model card](https://huggingface.co/nvidia/NVIDIA-Nemotron-3-Nano-4B-BF16), [SmolLM3](https://huggingface.co/HuggingFaceTB/SmolLM3-3B), [DeepSeek-R1](https://github.com/deepseek-ai/DeepSeek-R1).

A rough **weight-only** planning estimate for dense Q4 models is 2–3 GB for 3–4B, 5–6 GB for 8B, and 8–10 GB for 14B. These are approximate engineering estimates, not measured total allocations. Add KV cache, runtime buffers and display/other applications; multimodal encoders add more. MoE active-parameter counts describe compute, not the total weights that must be stored. In particular, Nemotron 30B-A3B is not a 3B-memory model.

Keep the existing llama.cpp architecture for the first comparisons: a CUDA build, correct chat template, native tool support, one active inference job and bounded context/output. Pin the binary and model-file hashes. Larger-scale Linux inference can later be evaluated independently; do not migrate serving infrastructure before proving a model improvement. [llama.cpp server documentation](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md).

## How to compare the models

Extend `eval/compare_models.py`, which already records model, language, tool success, repair/fallback, latency and sampled VRAM. Its current `verified` metric means the heuristic verifier accepted output; it does not establish evidence-supported correctness. Its VRAM sampling also is not a continuously measured peak.

Use at least 30–50 manually labeled review windows across good plays, mistakes, ambiguous cases and missing data. Split by match when separating tuning/evaluation so the same match does not leak across sets. Freeze parser/detector versions and candidates. Measure:

- Human-agreed useful picks and diversity, including appropriate abstention when there are few defensible moments.
- Factual claims supported by the specific cited evidence, and fabricated/contradictory claims.
- Schema validity, correct tool arguments, total tool calls, repairs and fallback rate.
- English, Polish and Dutch usefulness assessed by speakers; fluent wording is not a factual score.
- Median and p95 selection/explanation latency, total processing time and continuously sampled VRAM.

Choose the smallest passing model. Fine-tuning comes after collecting reliable labels and identifying a persistent failure that prompting, evidence quality and schema enforcement cannot solve.

## Improve recording selected moments

Continue using CS Demo Manager as the external recorder. It supports tick ranges and JSON configurations with sequences/player cameras; its documentation recommends exporting a config from the Video screen to inspect the exact schema. Batch a match's validated selected windows using that schema, with separate output clips and an explicit camera at each sequence's beginning. [CS:DM CLI](https://cs-demo-manager.com/docs/cli).

The current moment recorder already isolates its temporary output; extend that to every recording path and retry attempt. Give jobs an idempotency key from demo hash, player, tick range, camera profile and recorder version. Keep one recording lease across processes/hosts for the same CS2 session. Preflight the executable, Steam session, CS2, recorder dependencies, writable storage and queue state once per batch.

Recommended preview settings are 1280×720 at 30 FPS; test 1920×1080 at 60 FPS for fast aim review. Begin with H.264/AAC in MP4, `yuv420p` and a fast-start MP4 layout for browser playback. Compare a quality target around CRF 20–23 if using software x264; hardware encoders use different controls, so do not transfer CRF numbers blindly. Probe streams/duration with ffprobe, and measure frame/event alignment. [ffprobe](https://ffmpeg.org/ffprobe.html), [FFmpeg MP4 options](https://ffmpeg.org/ffmpeg-formats.html).

Make X-ray, HUD, audio/voice and spectator profile explicit. X-ray is helpful in a tactical explanation but changes what the player could see. Preserve that distinction in UI labels and evidence. Capture a separate preroll for settling after a seek; store the actual first-frame tick offset rather than assuming clip time zero equals the requested `t0`.

The current route/pipeline waits for all selected clips before marking analysis complete. Expose numerical review first and update clip readiness independently. Merge nearby windows when it reduces startup cost, while keeping a mapping from each original moment to the batch clip and its offset. Stop/clean the entire owned recorder process tree on timeout so a leftover game instance cannot interfere with the next job.

CS:DM's published matrix supports CS2 on **Windows and Linux**. HLAE's additional features are Windows-oriented; the project's current chosen recording path and host integration are Windows-based. A normal Linux API container is not equivalent to a configured GPU/Steam/CS2 recording environment. Keep the current Windows worker for this project rather than assuming all recording is impossible on Linux. [CS:DM video compatibility](https://cs-demo-manager.com/docs/guides/video).

If demo importing is added, implement it as a deterministic source adapter with allowed origins, download limits and content hashing. The LLM should never decide arbitrary download URLs or receive Steam credentials. Valve share-code downloading exists in CS:DM; its FACEIT download command is currently documented as disabled. Keep manual uploads as the reliable MVP input. [CS:DM downloads](https://cs-demo-manager.com/docs/cli).

## Can Three.js replace recording

**Yes for a tactical reconstruction. Not from the current data for game-identical first-person playback.** Three.js draws the scene you reconstruct; it does not execute the Source 2 demo. The present replay samples at 8 Hz can drive player markers/capsules and a free camera, but interpolation cannot recover unrecorded aim, recoil, smoke state or animation.

| Capability | Three.js reconstruction | CS2 recording |
|---|---|---|
| Player movement, rotation routes, distances, event markers | Strong fit | Visible but less interactive |
| Pause, free camera, annotations and alternative viewpoints | Strong fit | Requires recording/replaying each view |
| Exact crosshair, recoil, weapon animation and gameplay lighting | Requires substantial additional data and reconstruction | Uses the game renderer, subject to demo/spectator limitations |
| Exact smoke and visibility at the original instant | Requires matching geometry, dynamic state and validated algorithms | Better visual evidence, but spectator settings and demo fidelity still matter |
| Browser without Steam/CS2 installed | Supported by a web reconstruction | Can play previously recorded MP4s |
| Hosting cost | Client renders; server sends assets/state | Requires a game recording worker, then clip storage/delivery |

For the first prototype, use `three`, `@react-three/fiber` and optional `@react-three/drei` controls. Match React Three Fiber to the project's React version; current docs associate Fiber 9 with React 19. Load GLB/glTF geometry through GLTFLoader. Use `three-mesh-bvh` only where geometry ray queries become costly. [React Three Fiber](https://r3f.docs.pmnd.rs/getting-started/introduction), [GLTFLoader](https://threejs.org/docs/pages/GLTFLoader.html), [three-mesh-bvh](https://github.com/gkjohnson/three-mesh-bvh).

Source 2 Viewer/ValveResourceFormat can inspect and export supported Source 2 assets, including meshes/models as glTF. Asset export is a separate map-build pipeline; the demo parser does not supply a complete render-ready map. Use a simplified map and generic capsules first. Extraction capability alone does not settle permission to redistribute game assets; use assets you can distribute for the public prototype. [ValveResourceFormat export documentation](https://github.com/ValveResourceFormat/ValveResourceFormat/blob/master/docs/guides/command-line.md).

Add full-rate selected-window data for position, yaw/pitch and supported stance/camera/weapon fields. Drive discrete effects from event ticks and define one tested coordinate transform. Distinguish geometric visibility from what the player actually knew or saw. Dynamic doors, smoke, penetrable surfaces and geometry mismatches need explicit treatment before visibility informs coaching.

Use a shared clock, binary-searchable samples, typed buffers where profiling justifies them, cached map assets and controlled texture resolution. Update transforms in the render loop rather than React state each frame; render on demand when paused and use instancing for repeated markers. Keep the 2D radar fallback. [Fiber performance guidance](https://r3f.docs.pmnd.rs/next/advanced/scaling-performance), [Fiber update pitfalls](https://r3f.docs.pmnd.rs/next/advanced/pitfalls).

Recommended product direction: instant radar/tactical replay for all rounds, optional Three.js selected-window reconstruction, and actual POV video only for moments where it adds useful visual evidence.

## Local or cloud and which provider

**Use local compute now.** Your hardware is the best fit for the current CPU analysis, quantized models and Windows game recorder. Cloud is useful later for reachable web/API endpoints and shared storage; it does not need to replace every worker at once.

| Option | Decision for this project |
|---|---|
| Existing PC | Primary development, parsing, model comparison and recording |
| Hetzner EU x86 VPS | Preferred inexpensive hosted API/web control service for a limited beta |
| Cloudflare R2 | Optional private demo/replay/clip storage if remote workers and browser delivery need it |
| RunPod | Optional short Linux inference experiments; do not assume it supplies the Windows HLAE/Steam environment |
| AWS EC2 GPU/Windows | Research when fully hosted recording becomes necessary; extra setup/cost is not justified for the present testing budget |

Hetzner's published EU price adjustment lists CX23 at **EUR 5.49/month** and CX33 at **EUR 8.49/month**, excluding VAT and IPv4. Choose x86 for the first deployment to reduce native-wheel compatibility surprises. Verify the checkout price and actual memory specification; a small API host should offload large demos to the local worker until its memory use is measured. [Hetzner prices](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/), [server types](https://www.hetzner.com/cloud/cost-optimized/).

R2 Standard publishes 10 GB-month free storage, then **USD 0.015/GB-month**, separately billed operations and no internet egress fee. Set object expiration and application upload quotas. A 300 MB uploaded demo plus decompressed work, replay data and clips can multiply retained storage. Keep decompressed temporary files on workers where possible. [R2 pricing](https://developers.cloudflare.com/r2/pricing/).

RunPod's current price table lists an RTX 4090 Pod at **USD 0.89/hour**. At that rate, 10 GPU hours are USD 8.90 before storage/tax, while 730 hours are USD 649.70. These are calculations from that displayed rate, not a currency conversion or guaranteed checkout offer. Availability and Pod/serverless rates differ. [RunPod pricing](https://www.runpod.io/pricing). AWS documents NVIDIA driver support for Windows GPU instances, but this alone does not configure CS2 recording. [AWS GPU driver guidance](https://docs.aws.amazon.com/AWSEC2/latest/UserGuide/install-nvidia-driver.html).

Suggested monthly allocation, as an engineering budget rather than a provider quote:

| Item | Spend cap |
|---|---:|
| EU VPS including expected tax/IP/backup allowance | EUR 12 |
| Storage, domain amortization and small extra services | EUR 3 |
| Optional metered inference/model experiment | EUR 10 |
| Reserve | EUR 5 |
| **Total** | **EUR 30** |

For fully local testing, skip the VPS and GPU rental entirely. Electricity and existing hardware depreciation are outside this cloud allocation. For a hosted beta, workers should poll/claim jobs outbound over authenticated HTTPS, download scoped inputs and return artifacts. Keep the home machine off the public request path. Surface an explicit waiting state when it is offline. This is a limited beta with a local availability dependency, not a fully cloud-hosted public service.

Deploy nothing paid until the code's ownership checks, quotas, recovery and bounded work pass their release gates. Application-side spend/job limits are necessary; provider budget alerts alone do not promise a hard cap.
