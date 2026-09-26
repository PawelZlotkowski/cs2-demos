# Project proposal: Round Reviewer, a self-hosted AI coach for Counter-Strike 2

*Generative AI, Howest MCTE. Team: Pawel Zlotkowski and [partner name]. Draft of 26 September 2026, due 4 October 2026.*

## 1. Problem

Every Counter-Strike 2 match can be saved as a demo file containing the full state of the game at 64 ticks per second. Players are told to "review their demos", but a 40-minute recording holds hundreds of events and most players don't know what to look for. Human coaches are expensive, and existing statistics sites give numbers (K/D, ADR) without explaining *why* a round was lost or *what* to do differently.

We want to build a coach that takes one player's demo, picks the five or six moments with the most learning value (both mistakes and good plays), shows each as a gameplay clip and a 2D radar replay, and explains in plain language what happened and what to change. The player can then ask follow-up questions about any moment or round. Explanations are available in English, Polish and Dutch.

Generative AI is essential here because the hard part is not measuring events but judging which of them matter and explaining them in context: relating a death to map knowledge (callouts, standard positions, utility), to the rest of the round, and to the player's habits across matches.

## 2. What already exists

A working prototype pipeline (built before this course): upload of `.dem` / `.dem.zst` files, parsing with the open-source `demoparser2` library, normalisation into per-round replay data, and a web "Analysis Studio" (Next.js + FastAPI) that replays rounds on a 2D radar for the maps Mirage and Anubis. A branch records gameplay clips with CS Demo Manager. There is no AI in it yet; the coach panel uses scripted sample answers.

## 3. AI approach

The system follows one rule: **code decides what happened, the language model chooses and explains.** Every number in an answer must come from the analysis code, and every claim must cite the finding it is based on.

1. **Deterministic analysis.** Detectors written in Python turn the parsed demo into *findings* with IDs, for example "F12: died untraded on A ramp, nearest teammate 18 m away, no trade within 5 s". Around ten detectors cover trading, shooting while moving, unused utility, dry peeks, team flashes, economy, rotations, repeated death spots, and good plays such as trades, entries and clutches.
2. **Agent with tool calling.** A local LLM agent gets tools to read round statistics, findings, player positions at a given time, the round timeline, the player's history, the knowledge base, and to request clip recordings. It uses them to (a) select the 5–6 moments to review, (b) write the explanation for each moment, and (c) answer the player's questions.
3. **Model Context Protocol (MCP).** The tools are exposed by our own MCP server (`cs2-demo`). The agent is an MCP client, so the boundary between model and data is standard and inspectable, other local MCP clients can use the same tools, and the clip recorder (which must run on a Windows machine with CS2) sits behind the same interface.
4. **Retrieval-augmented generation (RAG).** A knowledge base of map guides and CS2 fundamentals (our own notes plus openly licensed sources such as Liquipedia) and a memory of the player's past findings, indexed with a multilingual embedding model and hybrid BM25 + dense retrieval.
5. **Fine-tuning.** QLoRA fine-tuning of the model on our own verified outputs (self-distillation with rejection sampling: generate several answers, keep only those that pass the verifier, and review a sample by hand), to improve citation discipline, tool use and Polish/Dutch quality.
6. **Verification.** A code verifier checks every answer: each claim cites an existing finding, each number matches the finding's evidence, and the answer is in the requested language. Failing answers are repaired once or replaced by a templated sentence.

**Models and hardware.** Everything is self-hosted; no commercial API such as ChatGPT or Claude is used anywhere, including for data generation and evaluation. We start with **Qwen3-14B** (open weights, strong tool calling, multilingual) quantised to 4 bits (Q4_K_M, about 9 GB) and served with **llama.cpp** on an RTX 5080 (16 GB). If the pipeline works, we move to a larger open model on a rented RTX Pro 6000 (96 GB) and compare it with the fine-tuned 14B model.

## 4. Data

- About 100 demos of Mirage and Anubis: our own and friends' competitive matches, plus a few professional matches from HLTV as a reference. Demos are split by match into training, validation and test sets.
- Hand labels, kept small on purpose: about 150 rounds labelled for detector correctness (with 30 labelled by both of us to measure agreement), our own top-6 moment picks for 20 matches, and 150 test questions (50 per language).
- The knowledge base is written by us in Markdown with sources recorded.

## 5. Evaluation

- **Detectors:** precision and recall against the labelled rounds.
- **Moment selection:** overlap and ranking agreement (NDCG) between the agent's picks and ours, with our mutual agreement as the ceiling.
- **Grounding:** share of claims with a valid citation, share of numbers that match the evidence, unsupported-claim rate.
- **Answer quality:** blind human ratings (correctness, usefulness, specificity, language quality) per language.
- **Agent and RAG:** tool-choice accuracy and task success; retrieval hit@k and MRR, dense vs hybrid.
- **Model comparison:** a no-LLM template baseline vs Qwen3-14B vs the fine-tuned 14B vs the larger model, including latency and memory.
- **Small user study** with 5–10 players.

All results are reproducible from one evaluation command and committed configurations.

## 6. Technical plan

| Period | Work |
|---|---|
| Until 4 Oct | Proposal, collect demos |
| October | Extended parsing, map callout zones, detectors, player selection, local model serving, tools, MCP server, moment selection agent, verifier |
| Early November | RAG, clip recording per moment, Studio with Analysis and Ask tabs, first evaluation |
| 17 Nov | Intermediary defence: end-to-end demo on one match with first results |
| Late November | Remaining detectors, fine-tuning (pilot on the RTX 5080, then the RTX Pro 6000), larger model, multilingual evaluation, user study |
| Until 6 Dec | Final evaluation, report, demo |

## 7. Division of work

The work is split into about 40 small tasks across six areas: analysis and detectors, tools and MCP, the agent and verifier, RAG, clips and interface, and fine-tuning and evaluation. We assign them week by week so that each of us builds substantial parts of both the deterministic analysis and the AI components. Labelling, the evaluation question set and the report are done together. Each week we explain our own part to the other, so we can both defend the whole project.

## 8. Risks

- **Clip recording is slow** (CS2 has to replay the demo): we record only the selected moments and fall back to the radar.
- **14B model at 4 bits may be too weak for reliable tool use:** grammar-constrained JSON output, a verifier with repair, a template fallback, and fine-tuning address this; the bigger model is the upper bound.
- **Labelling effort:** labels are limited to what the evaluation needs.
- **Fine-tuning does not fit in 16 GB:** fall back to Qwen3-8B for the pilot, and use the RTX Pro 6000 for the full run.
