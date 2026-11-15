---
name: rr-detector
description: Create or improve deterministic CS2 coaching detectors with typed evidence, confidence and labeled false-positive evaluation.
---

# CS2 evidence detectors

Use numerical events and state to emit findings; keep an LLM out of the event-detection decision. Inspect `analysis/match_data.py`, the target detector, templates and labeled examples before changing semantics.

Write the observable signal, required features and intended coaching interpretation separately. Distinguish severity from confidence. An untraded death is observable; teammate intent or a deliberately held flank usually is not. Fast death without utility does not alone establish who peeked whom.

Use per-round sides and stable player/team identity. Distance and visibility must account for geometry when they affect the conclusion; a nearby player through a wall is not automatically available to trade. Match map/build versions and document approximations.

Emit evidence with units, round, event ticks, detector version and a missing-feature reason. Avoid turning unavailable velocity/flash/visibility into a negative observation. Add plain-language templates that preserve uncertainty in supported languages.

Validate positive, negative and ambiguous labeled cases, including missing properties and tactical saves/flanks. Report precision and false-positive categories on held-out matches, not only synthetic coverage. Preserve findings/ranker contracts or provide a migration; do not modify user-managed context or memory.
