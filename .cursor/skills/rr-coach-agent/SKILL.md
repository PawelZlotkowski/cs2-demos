---
name: rr-coach-agent
description: Work on the Round Reviewer coach agent - tools, the cs2-demo MCP server, llama.cpp LLM client, prompts, verifier, moment selection, explanations and Ask. Use for apps/api/app/coach/, apps/api/app/rag/ and apps/mcp/.
---

# Round Reviewer coach agent

Read first: `docs/coach/AI-COACH-PLAN.md` §5–§7, `docs/handoff/09-AI-COACH.md` (voice and citation tokens), `docs/handoff/19-DECISIONS.md` (#2, #5, #16–#20).

## Hard rules

- **Self-hosted only.** The LLM is reached through `coach/llm_client.py` at `RR_LLM_BASE_URL` (llama.cpp `llama-server --jinja`, OpenAI-compatible). Never import a hosted provider SDK or read a hosted API key.
- **Code decides, the model explains.** Numbers come from `Finding.evidence` or `RoundStats`. Every factual sentence cites `[F..]`, and may add `[t:..]`, `[m..]`, `[K..]`.
- **Everything through the verifier** (`coach/verify.py`): citations resolve, numbers match evidence, language matches the request. One repair attempt, then template fallback.
- **Tests need no GPU.** Use `MockLLMClient` with recorded responses; mark live-model tests `@pytest.mark.llm` (skipped by default).

## Tools and MCP

- Define each tool once in `coach/tools.py`: typed arguments (Pydantic), compact JSON result, docstring written for the model (what it returns, when to use it). Keep results small; the 14B model has a 32k context.
- `apps/mcp/` wraps those functions with the official `mcp` SDK (stdio + streamable HTTP). Don't put logic in the MCP layer.
- The agent is an MCP client by default; the in-process adapter exists for tests and latency comparison.

## Prompts and jobs

- Prompts live in `coach/prompts/*.md`, versioned by filename suffix (`select_moments.v2.md`); the version is logged with every trace.
- Moment selection: thinking on, JSON schema output (llama.cpp `response_format`/grammar), 5–6 moments, mixed good/bad, then verifier, then code-ranker fallback.
- Explanation and Ask: thinking off (`/no_think`), max 6 tool steps, 2–4 sentences (explanation) or 1–3 (Ask), in `en | pl | nl`. Voice from `09-AI-COACH.md`: second person, no greetings, no filler, British spelling in English.

## Traces

Write one JSONL line per run to `data/traces/` (gitignored): prompt version, model id, tool calls, raw output, verifier result, latency. These feed evaluation (`rr-eval`) and the fine-tuning dataset (`ml/finetune/`).

## Done when

- `cd apps/api && pytest` passes without a model running.
- If you changed behaviour visible to users, run one real match end to end on llama.cpp and note model, prompt version and latency in the agent log.
