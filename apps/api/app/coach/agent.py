"""Coach agent loop (AI Coach plan §6, T23).

One loop for every job: the model sees the system prompt, the job's user
message and the tools; it calls tools until it writes an answer or runs out
of steps (``RR_COACH_MAX_STEPS``, default 6), then it is asked to answer with
what it has. Tools are reached through a ``ToolBackend`` (MCP by default).

Context arguments (``match_id``, ``player_id``) are bound here and removed
from the schemas the model sees, so a 14B model cannot query another match.

Every run can be written as one JSONL line to ``data/traces/`` (see
``TraceWriter``): prompt version, model, tool calls with result sizes and
latency, raw output, verifier result. These feed evaluation and the
fine-tuning dataset.
"""

from __future__ import annotations

import json
import time
from collections.abc import Awaitable, Callable
from dataclasses import asdict, dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import anyio

from app.coach.backends import ToolBackend, ToolSpec, bind, openai_tools
from app.coach.llm_client import LLM, LLMClient, ChatResult
from app.core.config import settings

FINAL_NUDGE = "You have used all tool steps. Answer now with what you have, following the rules."

StepCallback = Callable[[dict[str, Any]], Awaitable[None] | None]


@dataclass
class ToolStep:
    tool: str
    args: dict[str, Any]
    result_bytes: int
    ms: float
    error: str | None = None


@dataclass
class AgentRun:
    job: str
    text: str
    model: str
    prompt_version: str
    thinking: bool
    tools_backend: str
    steps: list[ToolStep] = field(default_factory=list)
    messages: list[dict[str, Any]] = field(default_factory=list)
    reasoning: str | None = None
    finish: str = "answer"  # answer | max_steps
    llm_calls: int = 0
    latency_s: float = 0.0
    usage: dict[str, int] = field(default_factory=dict)


@dataclass
class AgentBudget:
    """Cumulative limits shared by model calls and repair runs in one job."""

    tool_calls: int = 0
    tool_bytes: int = 0
    output_tokens: int = 0


class CoachAgent:
    def __init__(
        self,
        llm: LLM,
        tools: ToolBackend,
        *,
        max_steps: int = 6,
        max_tool_calls: int | None = None,
        max_tool_bytes: int | None = None,
        max_output_tokens: int | None = None,
    ) -> None:
        self.llm = llm
        self.tools = tools
        self.max_steps = max_steps
        self.max_tool_calls = max_tool_calls or settings.coach_max_tool_calls
        self.max_tool_bytes = max_tool_bytes or settings.coach_max_tool_bytes
        self.max_output_tokens = max_output_tokens or settings.coach_max_output_tokens
        self._specs: list[ToolSpec] | None = None

    async def specs(self) -> list[ToolSpec]:
        if self._specs is None:
            self._specs = await self.tools.list_tools()
        return self._specs

    async def _chat(
        self, messages: list[dict[str, Any]], *, deadline: float, max_tokens: int, **kwargs: Any
    ) -> ChatResult:
        remaining = _remaining(deadline)
        call_kwargs = {**kwargs, "max_tokens": max_tokens}
        if isinstance(self.llm, LLMClient):
            call_kwargs["timeout_s"] = remaining
        with anyio.fail_after(remaining):
            return await anyio.to_thread.run_sync(
                lambda: self.llm.chat(messages, **call_kwargs), abandon_on_cancel=True
            )

    async def run(
        self,
        *,
        job: str,
        prompt_version: str,
        messages: list[dict[str, Any]],
        bound: dict[str, Any],
        thinking: bool = False,
        allow_tools: set[str] | None = None,
        max_steps: int | None = None,
        on_step: StepCallback | None = None,
        deadline: float | None = None,
        budget: AgentBudget | None = None,
    ) -> AgentRun:
        """Run the tool loop from ``messages`` (system + user, or a longer history for a repair)."""
        t_start = time.perf_counter()
        deadline = deadline or (time.monotonic() + settings.coach_job_timeout_seconds)
        budget = budget or AgentBudget()
        calls_at_start, bytes_at_start, tokens_at_start = budget.tool_calls, budget.tool_bytes, budget.output_tokens
        specs = {s.name: s for s in await _within_deadline(self.specs(), deadline)}
        schema = openai_tools(list(specs.values()), bound, allow_tools)
        allowed = {t["function"]["name"] for t in schema}
        messages = [dict(m) for m in messages]
        run = AgentRun(
            job=job,
            text="",
            model=getattr(self.llm, "model", "unknown"),
            prompt_version=prompt_version,
            thinking=thinking,
            tools_backend=getattr(self.tools, "kind", "unknown"),
        )
        steps_left = self.max_steps if max_steps is None else max_steps
        while True:
            reserve = min(256, self.max_output_tokens // 4)
            call_token_cap = self.max_output_tokens - budget.output_tokens
            use_tools = (
                schema
                if steps_left > 0
                and schema
                and budget.tool_calls < self.max_tool_calls
                and call_token_cap > reserve
                else None
            )
            if use_tools is not None:
                call_token_cap -= reserve
            if call_token_cap <= 0:
                run.finish = "max_output_tokens"
                break
            result = await self._chat(
                messages, deadline=deadline, max_tokens=call_token_cap, tools=use_tools, thinking=thinking
            )
            budget.output_tokens += _completion_tokens(result)
            if budget.output_tokens > self.max_output_tokens:
                run.finish = "max_output_tokens"
                break
            run.llm_calls += 1
            _add_usage(run.usage, result.usage)
            if result.reasoning:
                run.reasoning = ((run.reasoning or "") + "\n" + result.reasoning).strip()
            messages.append(result.assistant_message())
            if not result.tool_calls or use_tools is None:
                run.text = result.content
                break
            for call in result.tool_calls:
                t0 = time.perf_counter()
                error = None
                if budget.tool_calls >= self.max_tool_calls:
                    out = json.dumps({"error": "Total tool-call budget reached. Answer with what you have."})
                    error = "Total tool-call budget reached."
                else:
                    budget.tool_calls += 1
                    if call.name not in allowed:
                        out = json.dumps({"error": f"Unknown tool {call.name!r}. Use one of: {', '.join(sorted(allowed))}."})
                    elif "__invalid_json__" in call.arguments:
                        out = json.dumps({"error": "Arguments were not valid JSON."})
                    else:
                        args = bind(specs[call.name].parameters, call.arguments, bound)
                        out = await _within_deadline(self.tools.call(call.name, args), deadline)
                remaining_bytes = self.max_tool_bytes - budget.tool_bytes
                if len(out.encode("utf-8")) > remaining_bytes:
                    marker = b"Tool result omitted: total result-byte budget reached."
                    out = marker[: max(0, remaining_bytes)].decode("ascii")
                budget.tool_bytes += len(out.encode("utf-8"))
                if out.startswith('{"error"'):
                    error = json.loads(out).get("error") if _is_json(out) else out
                step = ToolStep(
                    tool=call.name,
                    args=call.arguments,
                    result_bytes=len(out.encode("utf-8")),
                    ms=round((time.perf_counter() - t0) * 1000, 1),
                    error=error,
                )
                run.steps.append(step)
                messages.append({"role": "tool", "tool_call_id": call.id, "content": out})
                if on_step is not None:
                    maybe = on_step(asdict(step))
                    if maybe is not None:
                        await _within_deadline(maybe, deadline)
            steps_left -= 1
            if steps_left <= 0:
                run.finish = "max_steps"
                messages.append({"role": "user", "content": FINAL_NUDGE})
        run.messages = messages
        run.latency_s = round(time.perf_counter() - t_start, 3)
        run.usage["tool_result_bytes"] = budget.tool_bytes - bytes_at_start
        run.usage["completion_tokens_estimated"] = budget.output_tokens - tokens_at_start
        run.usage["tool_calls"] = budget.tool_calls - calls_at_start
        return run


def _remaining(deadline: float) -> float:
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimeoutError("Coach job deadline exceeded.")
    return remaining


async def _within_deadline(awaitable: Awaitable[Any], deadline: float) -> Any:
    with anyio.fail_after(_remaining(deadline)):
        return await awaitable


def _completion_tokens(result: ChatResult) -> int:
    reported = result.usage.get("completion_tokens")
    if isinstance(reported, int) and reported >= 0:
        return reported
    # Deterministic conservative fallback for injected/offline model adapters
    # that omit usage; include tool-call JSON because it is generated output.
    output = result.assistant_message()
    chars = len(json.dumps(output, ensure_ascii=False)) + len(result.reasoning or "")
    return (chars + 2) // 3


def _is_json(text: str) -> bool:
    try:
        json.loads(text)
        return True
    except json.JSONDecodeError:
        return False


def _add_usage(total: dict[str, int], usage: dict[str, Any]) -> None:
    for k, v in (usage or {}).items():
        if isinstance(v, int):
            total[k] = total.get(k, 0) + v


class TraceWriter:
    """Appends one JSON line per job run to ``<dir>/<date>.jsonl``."""

    def __init__(self, directory: Path | None) -> None:
        self.directory = directory

    def write(self, record: dict[str, Any]) -> Path | None:
        if self.directory is None:
            return None
        self.directory.mkdir(parents=True, exist_ok=True)
        now = datetime.now(UTC)
        path = self.directory / f"{now:%Y-%m-%d}.jsonl"
        line = json.dumps({"ts": now.isoformat(), **record}, ensure_ascii=False, default=str)
        with path.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")
        return path


def run_record(run: AgentRun) -> dict[str, Any]:
    """The trace fields of an ``AgentRun`` (the jobs add verifier results and ids)."""
    return {
        "job": run.job,
        "model": run.model,
        "promptVersion": run.prompt_version,
        "thinking": run.thinking,
        "toolsBackend": run.tools_backend,
        "steps": [asdict(s) for s in run.steps],
        "finish": run.finish,
        "llmCalls": run.llm_calls,
        "latencyS": run.latency_s,
        "usage": run.usage,
        "output": run.text,
        "reasoningChars": len(run.reasoning or ""),
        "messages": run.messages,
    }
