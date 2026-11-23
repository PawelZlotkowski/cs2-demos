# Coach model options other than Qwen (research, 27 Sep 2026)

Research first; the per-model sampling and the comparison script came after (see the last two sections). Question: which open-weight models could replace or be compared with Qwen3-14B for the coach, on the RTX 5080 (16 GB) now and the RTX Pro 6000 (96 GB) later?

What the coach needs, in order: reliable OpenAI-style tool calling through llama.cpp `--jinja`, JSON-schema output, staying grounded in finding IDs, good Polish and Dutch prose, a licence that allows use in the EU, and an easy QLoRA path back to GGUF.

## Recommendation

| GPU | Try first | Then | Why |
|---|---|---|---|
| RTX 5080 | **Gemma 4 12B** (Q4_K_M, or Q6_K) | Ministral 3 14B, then gpt-oss-20b | Best published agent score at this size (τ²-bench 69.0), 140 pre-training languages, Apache 2.0, uses the same `enable_thinking` switch our client already sends, and QLoRA fits roughly 16 GB |
| RTX Pro 6000 | **Gemma 4 31B** (Q8_0) | Mistral Small 4 (119B-A6.5B), gpt-oss-120b | Same family as the 5080 pick, so prompts, templates and the fine-tune pipeline carry over; τ²-bench 76.9, MMMLU 88.4; QLoRA needs about 22 GB, so the Pro 6000 can train it and use it as the self-distillation teacher |

For Polish specifically, **Bielik 11B v3** is the strongest Polish-first model, but it has no documented tool calling. If Gemma's Polish is still weak after evaluation, use it as a Polish writer only: the tool model gathers findings and drafts in English, Bielik rewrites into Polish, and the verifier still checks the result.

The research question in the plan stays the same with Gemma in place of Qwen: does a fine-tuned 12B at Q4 close the gap to the 31B? Keeping Qwen3-14B as the baseline gives a second model family for the evaluation table.

## Candidates

Numbers are from model cards and reports linked below. "Fits" assumes a 32k context with a q8_0 KV cache.

### RTX 5080 (16 GB)

| Model | Size | Licence | Tool calling | Polish / Dutch | Fits 16 GB | QLoRA on 16 GB |
|---|---|---|---|---|---|---|
| **Gemma 4 12B** (Jul 2026) | 12B dense, 256k ctx | Apache 2.0 | Native; τ²-bench 69.0 | 140 languages pre-trained, 35+ supported; MMMLU 83.4 | Yes: Q4_K_M 7.1 GB, Q6_K 9.8 GB, Q8_0 12.7 GB | Yes, about 14–16 GB at 1k sequence (estimate, not measured) |
| Ministral 3 14B (Dec 2025) | 14B dense, 256k ctx | Apache 2.0 | Native function calling and JSON | Dutch listed, Polish **not** listed | Yes, about 9 GB at Q4 | Likely, similar to Qwen3-14B |
| gpt-oss-20b (Aug 2025) | 21B MoE, 3.6B active | Apache 2.0 | Strong, but Harmony format; llama.cpp has a parser | Mostly English-trained; PL/NL not measured (inferred weak) | Yes, about 14 GB (MXFP4) | Yes, 14 GB with Unsloth; merge dequantises MXFP4 |
| Gemma 4 26B-A4B | 25B MoE, 3.8B active | Apache 2.0 | τ²-bench 68.2 | MMMLU 86.3 | Only with experts offloaded to CPU (Q4 is 16–18 GB) | No (LoRA needs over 40 GB) |
| Bielik 11B v3 (Dec 2025) | 11B dense, 32k ctx | Apache 2.0 | **None documented** | Best Polish open model at this size (Open PL LLM 65.9, Polish EQ-Bench 71.2); 32 EU languages | Yes | Yes |

### RTX Pro 6000 (96 GB)

| Model | Size | Licence | Tool calling | Polish / Dutch | Memory | QLoRA |
|---|---|---|---|---|---|---|
| **Gemma 4 31B** | 31B dense | Apache 2.0 | τ²-bench 76.9 (retail 86.4) | MMMLU 88.4 | Q8_0 about 34–38 GB | About 22 GB |
| Mistral Small 4 (Mar 2026) | 119B MoE, 6.5B active, 256k ctx | Apache 2.0 | Native, with `reasoning_effort` none/high | Dutch listed, Polish not listed | Q4 about 70 GB (inferred from size) | Heavy; LoRA on a 119B MoE is not a pilot task |
| gpt-oss-120b | 117B MoE, 5.1B active | Apache 2.0 | Strong | As gpt-oss-20b | About 63–66 GB | About 65 GB with Unsloth |
| Mistral Medium 3.5 | 128B dense | Modified MIT (revenue cap) | Native; τ³-Telecom 91.4 | Dutch listed | Q4 about 75 GB, slow because dense | No |

### Ruled out

- **Llama 4 (Scout, Maverick):** did well in a Polish human ranking, but the licence excludes EU-domiciled users from its multimodal models, and both are multimodal.
- **NVIDIA Nemotron 3 Nano 30B-A3B:** supports only EN, ES, FR, DE, JA and IT; BFCL v4 53.8.
- **GLM-4.7-Flash:** English and Chinese only, and it failed structured tasks in a 16 GB local test.
- **EuroLLM-22B:** very good at EU translation, but no tool calling, 32k context, and last place in a Polish human ranking of generation quality.
- **PLLuM:** Polish-only; the strong 8x7B is non-commercial, and no tool calling.

Newer Qwen models (Qwen3.5-9B, BFCL v4 66.1; Qwen3.6/3.8-27B for the Pro 6000) remain the in-family upgrade if Gemma loses the evaluation.

## Switching cost in our code

`apps/api/app/coach/llm_client.py` is already OpenAI-compatible and chosen by `RR_LLM_BASE_URL` / `RR_LLM_MODEL`.

- Gemma 4 uses the same `chat_template_kwargs.enable_thinking` switch in llama.cpp, so thinking on/off works unchanged.
- Sampling is per model family now (`SAMPLING_PROFILES` in `llm_client.py`): the profile follows `RR_LLM_MODEL` (`qwen3`, `gemma` at 1.0 / 0.95 / top_k 64, `ministral` at 0.05, `gpt-oss` at 1.0 / 1.0), or set `RR_LLM_SAMPLING`. `RR_LLM_TEMPERATURE`, `RR_LLM_TOP_P`, `RR_LLM_TOP_K` and `RR_LLM_MIN_P` override single values. Qwen3 keeps the values the 26 Sep baseline used.
- gpt-oss and Mistral Small 4 use `reasoning_effort` rather than `enable_thinking`, and gpt-oss returns reasoning in `reasoning_content`, which `split_thinking` already accepts.
- Serve Gemma 4 with a recent llama.cpp build (Gemma 4 chat template) and `--jinja`. One local test found the quant source mattered a lot (Unsloth quants did far better than others on structured output), so use Unsloth GGUFs.
- The fine-tune data (T50) is written in Qwen3's chat template. Store it as plain messages plus tool calls and render it with each model's own template, as Unsloth requires the correct Gemma 4 template.

## Running the comparison on the 5080

`eval/compare_models.py` runs moment selection, an explanation per moment and language, and three Ask questions per language on one processed match, then puts the stored moments back so each model explains the same moments. Results go to `eval/results/` (git-ignored).

```bash
# From the repo root, API venv active, the match already processed with a player picked.
# 1. Qwen3-14B baseline (llama-server as in AGENTS.md)
RR_LLM_MODEL=qwen3-14b-q4_k_m python -m eval.compare_models run --match-id <id> --label qwen3-14b

# 2. Stop it, then serve Gemma 4 12B (recent llama.cpp build, Unsloth quant)
llama-server -hf unsloth/gemma-4-12b-it-GGUF:Q6_K --jinja -c 32768 -ctk q8_0 -ctv q8_0 -ngl 99 --port 8080
RR_LLM_MODEL=gemma-4-12b-it-q6_k python -m eval.compare_models run --match-id <id> --label gemma-4-12b

# 3. Table and every text side by side
python -m eval.compare_models report eval/results/qwen3-14b.json eval/results/gemma-4-12b.json
```

The table covers verified explanations (per language) and Ask answers, repairs, citations the verifier had to add, runs that hit the tool-step limit, tool calls without error, median latency and peak VRAM (from `nvidia-smi`). Gemma samples at temperature 1.0, so add `--repeat 3` before drawing conclusions from a gap of one or two answers. Polish and Dutch quality still needs a native read of the texts in `comparison.md`.

## First results (27 Sep 2026, RTX 5080)

Both of Pawel's matches, coaching pawcio_, `--repeat 2`, EN/PL/NL; Gemma 4 12B Q6_K from Unsloth on llama.cpp b11205 (no template changes needed).

| | Qwen3-14B Q4_K_M | Gemma 4 12B Q6_K |
|---|---|---|
| Explanations verified (Mirage + Anubis) | 66/72 (pl 21/24) | 71/72 (pl 24/24) |
| Ask answers verified | 36/36 | 36/36 |
| Tool calls without error | 66/66 | 34/35 |
| Moment selection time (Mirage / Anubis) | 38 s / 24 s | 108 s / 131 s |
| Explanation median time | 2.1–2.2 s | 2.0 s |
| Peak VRAM | 12.7 GB | 12.2 GB |

Qwen's failures were Cyrillic letters in PL/NL (3), invented knowledge ids (2) and one number not in the findings. Gemma's one fallback was an uncited closing sentence, and its one tool error was an invalid `kind` it recovered from. Gemma calls about half as many tools. Its moment selection (thinking on) is 3–5× slower. The Polish and Dutch texts still need a native read before calling the language quality.

## Sources

- Gemma 4 model card: https://ai.google.dev/gemma/docs/core/model_card_4
- Gemma 4 31B card: https://huggingface.co/google/gemma-4-31B
- Gemma 4 technical report: https://arxiv.org/html/2607.02770v1
- Gemma 4 12B GGUF sizes: https://huggingface.co/unsloth/gemma-4-12b-it-GGUF
- Unsloth Gemma 4 run guide (thinking switch, memory): https://unsloth.ai/docs/models/gemma-4
- Unsloth Gemma 4 fine-tuning: https://unsloth.ai/docs/models/gemma-4/train
- Gemma 4 12B QLoRA estimate: https://markaicode.com/howto/how-to-fine-tune-gemma-4/
- Ministral 3 14B: https://huggingface.co/mistralai/Ministral-3-14B-Instruct-2512
- Mistral Small 4: https://huggingface.co/mistralai/Mistral-Small-4-119B-2603
- Mistral Medium 3.5: https://huggingface.co/mistralai/Mistral-Medium-3.5-128B
- Mistral open models: https://mistral.ai/models/
- gpt-oss run and fine-tune: https://unsloth.ai/docs/models/gpt-oss-how-to-run-and-fine-tune
- Bielik 11B v3: https://huggingface.co/speakleash/Bielik-11B-v3.0-Instruct
- Bielik v3 paper: https://arxiv.org/html/2604.10799
- Polish leaderboard summary: https://www.codesota.com/polish-llm
- Polish human ranking (Feb 2026): https://jelesnianski.com/artificial-intelligence/llm-ranking-report-2026-on-content-generation-in-the-polish-language/
- EuroLLM-22B: https://huggingface.co/utter-project/EuroLLM-22B-Instruct-2512
- Nemotron 3 Nano: https://docs.api.nvidia.com/nim/reference/nvidia-nemotron-3-nano-30b-a3b
- GLM-4.7-Flash: https://huggingface.co/zai-org/GLM-4.7-Flash
- Llama 4 EU restriction: https://www.llama.com/llama4/use-policy/
- BFCL v4 scores: https://llm-stats.com/benchmarks/bfcl-v4
- 16 GB local model test: https://www.glukhov.org/ai-devtools/opencode/llms-comparison/
- Qwen lineup: https://codersera.com/blog/qwen-3-5-complete-guide-2026/

Caveats: no Dutch leaderboard numbers could be read (EuroEval renders with JavaScript), and no benchmark compares Gemma 4 with Qwen3-14B on the same tool test, so the ranking above must be confirmed by our own evaluation.

## Update, 22 November 2026: local rerun and newer models

### Local rerun on the RTX 5080

Both GGUFs already on the PC were run with `eval/compare_models.py` on one Anubis match: the same 5 stored moments, EN and PL, 2 repeats. Settings: 32k context, q8_0 KV cache, all layers on the GPU, the app's own prompts (v5) and verifier. The raw output is in `eval/results/2026-11-22-qwen-vs-gemma/` (git-ignored).

| | Qwen3-14B Q4_K_M | Gemma 4 12B Q6_K |
|---|---|---|
| Moment selection | 42 s | 54 s (was 108–131 s on 27 Sep) |
| Explanations passing the checker | 19/20 (EN 10/10, PL 9/10) | 20/20 |
| Ask answers passing the checker | 12/12 | 12/12 |
| Needed a repair | 4 | 1 |
| Tool calls without error | 13/15 | 8/10 |
| Median time per explanation / per Ask | 1.8 s / 1.2 s | 1.7 s / 1.7 s |
| Peak VRAM | 13.1 GB | 12.6 GB |

Reading all 40 texts (one reader, not blind) adds what the pass rates miss:

- **Polish:** Gemma is clearly better. Qwen wrote "granadami", "ginieś", "na rondzie 13" (a road roundabout), "na tarczy" and "rozstrzelając … o 50 punktów uszkodzeń". Gemma's slips were minor: "1 niewykorzystanej granatu", and "używki" for utility.
- **English explanations:** Qwen hedges more and cites the map notes (K113, K135, K155). Gemma asserts causes the data does not support: "This mistake meant you failed to…", and in Polish "uniemożliwił odparcie ataku".
- **Match-level Ask:** for "What should I work on next match?" Gemma cited 11 real findings and two callouts. Qwen gave uncited general advice, which the Ask check allows (audit risk 2).

### Newer models that fit 16 GB (web research, 22 Nov)

The figures are third-party or vendor numbers on full-precision models, so treat them as reasons to test, not as results.

| Model | GGUF that fits 32k context | τ²-bench airline (OpenRouter) | Hallucination (Vectara) | Notes |
|---|---|---|---|---|
| Qwen3-14B (current) | Q4_K_M | 44.0 | 5.4% | |
| Gemma 4 26B-A4B (MoE, 3.8B active) | `unsloth/gemma-4-26B-A4B-it-GGUF` UD-IQ4_XS, 13.6 GB; UD-Q3_K_M 12.7 GB as a fallback | 68.0 | 5.2% | Lowest hallucination found; same family as the stronger Polish writer. No QLoRA on 16 GB |
| Qwen3.8-27B | `unsloth/Qwen3.8-27B-GGUF` UD-Q3_K_XL, 13.1 GB | 76.7 | not listed (Qwen3.5-27B: 12.1%) | Thinking must be off for tool calls (llama.cpp #20837). Its default reasoning effort can overflow 32k. About half Qwen3-14B's speed |
| Bielik 11B v3.1 (10 Nov) | `speakleash/Bielik-11B-v3.1-Instruct-GGUF` Q6_K, 9.2 GB | not listed | not listed | Polish-first and now with tool calling, but llama.cpp parsing of it is untested. QLoRA fits 16 GB |
| Qwen3.5-9B | `unsloth/Qwen3.5-9B-GGUF` Q8_0, 9.5 GB | 75.0 | not listed | Weak Polish evidence |

**Ruled out:**

| Model | Reason |
|---|---|
| gpt-oss-20b | τ² 53.2, English-centric |
| Ministral 3 14B | 19.4% hallucination, no Polish listed |
| Nemotron 3.5 Lightning | No Polish data, a Q4 file does not fit |
| Granite 4.2 | No Polish |
| Qwen3.6-35B-A3B | Only 3-bit fits |

**Decision:**

- **25 November:** keep Qwen3-14B. The prepared review and every rehearsal use it.
- **The 6 December evaluation:** test Gemma 4 26B-A4B first, against Qwen3-14B, Gemma 4 12B and the template baseline, with `--repeat 3`, a native Polish read and blind ratings. Qwen3.8-27B is second.
- **Watch the VRAM:** about 1.9 GB of the card is already used by the Windows desktop and open apps. The 13.6 GB file plus about 0.5 GB of KV cache leaves almost no headroom, so close GPU-using apps or use the 12.7 GB quant.

Sources:

- OpenRouter τ²-bench airline: https://openrouter.ai/benchmarks/tau2-bench-airline
- Vectara hallucination leaderboard: https://github.com/vectara/hallucination-leaderboard
- Gemma 4 26B-A4B: https://huggingface.co/google/gemma-4-26B-A4B-it, https://huggingface.co/unsloth/gemma-4-26B-A4B-it-GGUF
- Qwen3.8-27B: https://huggingface.co/Qwen/Qwen3.8-27B, https://unsloth.ai/docs/models/qwen3.8-27b
- Bielik 11B v3.1: https://huggingface.co/speakleash/Bielik-11B-v3.1-Instruct
- llama.cpp issues: https://github.com/ggml-org/llama.cpp/issues/20837, /22384, /21383, /22786

Not verified: the speed of each new model on this RTX 5080, their Polish quality, and whether llama.cpp parses Bielik's tool calls.

## Gemma 4 26B-A4B tested on the RTX 5080 (22 November 2026, evening)

Same runner and match as above, but against the current review: the 6 stored moments of the Overall review (3 good, 3 to fix), prompt `select_moments.v3` with the variety rule, EN and PL, 2 repeats. Both models ran with 32k context, q8_0 KV cache, flash attention and all layers on the GPU. The raw output is private, in `.local/model-test-2026-11-22/`.

| | Qwen3-14B Q4_K_M | Gemma 4 26B-A4B UD-IQ4_XS |
|---|---|---|
| Moment selection passing the checker | yes, first attempt | yes, first attempt |
| Moment selection time | 45 s | 77 s |
| Explanations passing the checker | 20/24 (EN 12/12, PL 8/12) | **24/24** |
| Ask answers passing the checker | 11/12 | **12/12** |
| Needed a repair | 6 | 1 |
| Median time per explanation / per Ask | 1.7 s / 1.0 s | 1.1 s / 1.1 s |
| Peak VRAM | 12.1 GB | 15.0 GB of 16.3 |

What the pass rates miss, from reading the texts:

- **Polish:** Qwen put Cyrillic letters into 4 of its 12 Polish answers, and the checker replaced them with templates. Gemma's Polish passed every time and reads more naturally.
- **English:** Gemma wrote the Polish word "eliminacje" in 6 of its 18 English answers ("securing one eliminacja"). The checker did not catch it. The cause was the Polish kill-word rule, which sat in the shared prompts (`explain_moment.v5`, `answer_question.v5`, `answer_across.v2`) for every language. **Fixed the same evening:** `explain_moment.v6`, `answer_question.v6` and `answer_across.v3` drop the line, so the rule now reaches only Polish answers, through `LANGUAGE_NOTES` in `coach/jobs.py`. The MCP server prompts pass the same notes. An English rerun on Gemma gave 0 of 18 answers with Polish words, 12/12 explanations and 6/6 Ask answers passing, and no repairs. Saved Ask answers from older prompt versions are hidden, as for every prompt change.
- **Match-level Ask:** for "What should I work on next match?" Gemma cited 7 real unused-utility findings. Qwen answered that it had no data about the match.
- **Both models** still assert things the finding does not establish. Qwen wrote "contributing significantly to the round's outcome"; Gemma wrote "your death in Canal" for a self-flash finding that records no death.
- **Picks:** both chose 3 good and 3 to fix with no more than 2 of one type. Gemma added context findings (the opening duel) to its moments, and Qwen did not.

**Verdict:** Gemma 4 26B-A4B gives the better coach output, but it does not fit next to CS2 recording. At 15 GB it leaves about 1 GB, while a review with recording peaked at 15.9 GB on Qwen. Keep Qwen3-14B for 25 November. For 6 December, use Gemma for reviews that do not record, or record clips before the model starts. Not tested: Gemma at 16k context, blind ratings, `--repeat 3`.
