---
name: rr-eval
description: Compare Round Reviewer detectors and coaching models on frozen evidence with factual grounding, multilingual quality, latency and GPU measurements.
---

# CS2 evaluation

Extend the existing label and model-comparison tools where practical. Establish human-reviewed cases and freeze parser/detector versions, evidence and questions. Split tuning and evaluation by match. Restore stored selections safely after experiments; evaluation must not silently change live user artifacts.

Compare Qwen/Gemma baselines with requested alternatives such as Ministral 3 8B/14B, Phi-4-mini and optional gpt-oss-20b. Record model hash, quantization, runtime/template, sampling, context/output limits and hardware. Candidate selection quality and explanation quality need separate scores.

Measure supported claims, contradictions/fabricated events, useful moment picks, abstention, tool/schema success, total calls, repairs and fallback. Read EN/PL/NL outputs with language-competent reviewers. Verifier acceptance is a formatting/evidence-reference metric, not factual accuracy.

Report sample counts and precision/confidence intervals where applicable. Include ambiguous tactics, sparse rounds, missing features, injected names and wrong citations. Measure median/p95 latency and continuously sampled peak VRAM; a few snapshots are not a true peak.

Use repeated runs when stochastic differences matter. Prefer the smallest model meeting declared quality gates. Document unrun experiments and avoid inventing throughput from GPU specifications. Fine-tune only after labeled failures identify a problem not resolved by evidence quality or contracts. User context/memory remains unchanged.
