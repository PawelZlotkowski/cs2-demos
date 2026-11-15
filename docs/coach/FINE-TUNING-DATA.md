# Fine-tuning: what data we actually need

29 October 2026. Answers the question: *do we need labelled demos for fine-tuning, or is reviewing the model's output (correct / wrong / "what else could be spotted") enough?* Builds on [AI-COACH-PLAN §10](AI-COACH-PLAN.md), the [label tool](../LABEL-TOOL.md) and `apps/api/app/services/dataset.py`.

## Short answer

Keep working the way you are. Reviewing what the system produced is the right method, but it feeds **three different targets**, and only one of them is the LLM. The LLM never learns to *spot* things in a demo. By project rule, every fact comes from a detector or from `RoundStats`, and the LLM only chooses, explains and answers. So:

| What you do now | What it trains or measures | Feeds the LLM? |
|---|---|---|
| Detector clip verdict: correct / wrong / unsure | Detector **precision**; later a small false-positive filter | No |
| Independent full-round pass and `missedDetector` ("what else could be spotted") | Detector **recall**, plus the backlog for new detectors (D11+) and threshold changes | No. It becomes new findings first |
| Your top 6 moments vs the model's picks | Moment selection (preference pairs) | Yes (selection job) |
| Accept / Edit on coach outputs in the Lab | **SFT** examples (`build_dataset.py`) | Yes |
| Reject, and the original before your edit | **DPO/KTO** negatives. *Currently thrown away; keep them* | Yes, once kept |

You don't need a second, large set of "labelled demos" for the LLM. You need:
1. **Enough processed matches** to generate inputs. The ~100 matches in the plan are fine.
2. **Reviewed outputs** on the train split. At least 300 human-checked (already T51) plus verifier-passed bulk.
3. **A small, honestly labelled test set.** The independent full-round reviews (not candidate-first) on held-out matches, so recall and the final evaluation aren't measured on data you trained on.

## Why "what else can be spotted" must not go straight into the LLM

If the model is trained on text that mentions things no detector found ("he should have jiggled the angle"), it learns to state facts the verifier can't check. On a 14B model at Q4 that shows up as confident hallucination. Route those notes through the detectors instead:

1. Your note is stored as `Moment.missedDetector` / `reason` in the label tool.
2. Count recurring missed patterns per category. Anything seen in three or more rounds is a candidate detector, or a threshold change to an existing one.
3. Once a detector emits it as a `Finding`, the LLM can talk about it, with a citation.

## Changes to the review loop (small, high value)

1. **Keep rejected and pre-edit outputs.** `dataset.export()` writes only Accept and Edit. Also write `pairs.jsonl` with `{prompt, chosen, rejected}`, where:
   - chosen is your edit or an accepted sample
   - rejected is the original before your edit, a rejected sample, or a verifier-failed sample for the same prompt

   Verifier-failed vs verifier-passed samples for the same input give pairs **without any human time**.
2. **Tag why something was rejected:** wrong citation, unsupported number, wrong moment, unhelpful advice, wrong tone, poor Polish/English. Two clicks, and they double as the evaluation's error taxonomy.
3. **Rate per claim, not only per answer.** One bad sentence shouldn't throw away four good ones. Let Edit delete the bad claim; `edit_problem()` already blocks edits that add citations or numbers.
4. **Record your own top 6** for each match you review (plan §11). Each "I picked X, the model picked Y" is a selection preference pair.
5. **Use thumbs where an edit is too much work.** KTO (in TRL) trains on unpaired good/bad labels, so a quick 👍/👎 in the Ask tab is still usable data.

## Training recipe

1. **Generate (train split only).** Run the agent 4–8 times per input (temperature around 0.7, thinking on) for all three jobs (selection, explanation, Ask) and both delivery languages. The verifier filters, and failures are kept as negatives.
2. **Review** in the Lab: Accept / Edit / Reject, plus a tag. Both students share the same 30 examples to report agreement.
3. **SFT, QLoRA (Unsloth or PEFT+TRL).** Qwen3-14B, rank 16–32, alpha around 2× rank, lr 1e-4 to 2e-4, 2–3 epochs, max sequence 4k, loss on assistant turns only, and tool-call traces in Qwen3's chat template. Batch 1 with gradient accumulation and gradient checkpointing on the 5080; fall back to Qwen3-8B for the pilot if 14B doesn't fit (T52).
4. **Preference stage: DPO, or KTO for unpaired thumbs.** Start from the SFT adapter, beta around 0.1, lr 5e-6 to 1e-5, one epoch. This is where "don't say things the data doesn't support" gets reinforced.
5. **Evaluate on unseen test matches.** Compare base vs SFT vs SFT+DPO on verifier pass rate, citation accuracy, moment overlap with human picks, human rating and Polish quality (plan §8). Thinking on and off is a separate axis.
6. **Export.** Merge the adapter, convert to GGUF, quantise to Q4_K_M and serve from llama.cpp, the same way as the base model.

Rules that still apply: split by match, never by example; no hosted model as teacher (decision #16), so on the Pro 6000 the larger self-hosted model becomes the teacher; derived datasets stay out of git.

## Rough volumes

| Data | Minimum to see an effect | Target |
|---|---|---|
| SFT examples (verifier-passed, reviewed or accepted) | ~300 | 1,500+ (plan) |
| Preference pairs (human and verifier) | ~200 | 1,000+ |
| Selection preferences (your top 6 vs the model's) | 20 matches | 40+ matches |
| Detector precision labels (clip verdicts) | 30 per detector | 100 per detector |
| Independent full-round reviews (recall, test set) | 30 rounds (κ set) | 150 rounds (plan) |

These are planning numbers, not guarantees. The pilot (T52) shows whether the gain justifies the larger run.
