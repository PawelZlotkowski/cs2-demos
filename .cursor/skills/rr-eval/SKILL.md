---
name: rr-eval
description: Run or extend the Round Reviewer evaluation (detectors, moment selection, grounding, RAG, model comparison, fine-tuning) and report results reproducibly. Use for eval/, ml/finetune/ and data/labels/.
---

# Round Reviewer evaluation

Read first: `docs/coach/AI-COACH-PLAN.md` §10–§12.

## Principles

- **Split by match** (see `data/manifest.csv`). Never tune prompts, thresholds or fine-tuning on test matches.
- **Humans are the primary quality signal.** A local LLM judge from a different model family is secondary and is always reported with its agreement with human ratings. No hosted models as judges.
- **Every number is reproducible:** it comes from `python -m eval.run --config eval/configs/<name>.yaml`, and the report states config, commit, model file (GGUF name + quant) and date.

## Metrics (plan §12)

Detectors: precision/recall per detector. Moment selection: overlap@6, NDCG vs human picks, human–human agreement as ceiling. Grounding: valid-citation rate, number-match rate, unsupported-claim rate, fallback rate. Agent: tool-choice accuracy, steps, task success. RAG: hit@k, MRR (dense vs hybrid vs reranker). Models: add tokens/s, latency p50/p95, peak VRAM. Report per language (en/pl/nl).

## Adding a model or config

1. Add `eval/configs/<model>.yaml` (base URL, model id, quant, context, thinking on/off, prompt versions).
2. Start llama.cpp with the settings in the config; record the exact command in the config file.
3. Run the eval; outputs go to `eval/reports/<date>-<config>/` (tables as CSV + a short `README.md`).

## Fine-tuning data

- Build from verifier-passed traces only (`ml/finetune/build_dataset.py`), with train/val/test by match.
- Keep a dataset card: counts per job and language, rejection rate, how many were human-reviewed.
- Export fine-tuned models to GGUF Q4_K_M so they run under the same llama.cpp settings as the base model.

## Don'ts

- Don't commit raw demos or traces with player names beyond what the labels need.
- Don't report a number you didn't run in this session; say what is missing instead.
