---
name: rr-parser
description: Improve or compare CS2 demo extraction with demoparser2, Awpy and demoinfocs while preserving Round Reviewer telemetry contracts.
---

# CS2 parser extraction

Start from `apps/api/app/processing/parse_demo.py`, normalization, extraction and their consumers. Keep demoparser2 unless measurements demonstrate a reason to change. Awpy shares that parser and is not an independent decoder cross-check.

Define the real-demo corpus and required events/properties before benchmarking. Compare round boundaries, side switches, player identity, event counts, tick ranges and field semantics. Include overtime, disconnects, malformed/truncated inputs and supported game builds when available. Synthetic tests cannot establish current game-patch compatibility.

Benchmark compatible batched event queries and sparse full-match properties plus dense selected windows. Preserve each event's extra-property semantics. Track input/output bytes, elapsed time and peak process memory. Retain the normalized contract or make a versioned migration.

Record parser/build versions and feature capability flags. A missing event/property is unknown data, not zero occurrences. Detectors requiring absent features must abstain. Do not promise subtick accuracy without verified fields and actual alignment.

Run native decoding inside an enforceably bounded process. Cache by demo hash, parser version and schema; do not feed full tick tables to the model. Evaluate demoinfocs as an independent reference when useful, and browser WASM only with explicit memory/worker tests.
