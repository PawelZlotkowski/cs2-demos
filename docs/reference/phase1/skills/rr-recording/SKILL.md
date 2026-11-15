---
name: rr-recording
description: Improve the Windows CS Demo Manager recording worker for model-selected CS2 moments, media validation and tick alignment.
---

# Selected-moment recording

Preserve selection before recording. Use validated numeric windows/player IDs as inputs; the model cannot supply shell commands or local executable paths. Inspect moment and whole-round recording paths because their output isolation currently differs.

Preflight Steam, CS2, CS:DM, HLAE/encoder availability, disk and an appropriate desktop session. Confirm current CLI/config options from official CS:DM docs or exported settings. Batch sequences when it reduces startup overhead, retaining per-moment mapping and camera focus.

Use a durable single-recording lease across processes, idempotency keys and recoverable attempts. Create a fresh directory per attempt. Reject success without a newly produced artifact; never rename an arbitrary old MP4. Probe duration, streams, FPS and dimensions, then publish atomically. Synthetic/stub output must have distinct provenance.

Retain requested and actual tick bounds, preroll, first-frame clock offset and recorder profile/version. Validate timing against visible known events and clamp windows to rounds. Handle child-process-tree cleanup on timeout and retry only failed work.

Expose numerical/radar review while clips arrive. Benchmark preview versus aim-review quality and GPU contention on the RTX 5080 16 GB. Prefer one GPU phase at a time until measurements justify overlap. Do not change user context/memory or claim a real recording when only mocked tests ran.
