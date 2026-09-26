"""OpenAI-compatible chat client for the self-hosted model (plan §6.1, T22).

Talks to llama.cpp ``llama-server --jinja`` (or any OpenAI-compatible local
server) at ``RR_LLM_BASE_URL``. No hosted provider SDK and no API key: the
system is self-hosted by decision.

- Tools: OpenAI ``tools`` / ``tool_calls`` (llama.cpp needs ``--jinja``).
- Structured output: ``response_format={"type": "json_schema", ...}``, which
  llama.cpp turns into a grammar.
- Qwen3 thinking: ``chat_template_kwargs.enable_thinking`` (llama.cpp passes
  it to the Jinja template). Reasoning comes back as ``reasoning_content``
  when the server runs with ``--reasoning-format deepseek``, or inline as
  ``<think>...</think>``; both are split off here.
- Streaming: ``stream_chat`` yields text deltas (Ask tab over SSE).

``MockLLMClient`` replays scripted responses so tests need no GPU.
"""

from __future__ import annotations

import json
import re
import time
from collections.abc import Iterator
from dataclasses import dataclass, field
from typing import Any, Protocol

import httpx

from app.core.config import settings

THINK_RE = re.compile(r"<think>(.*?)</think>", re.DOTALL)


class LLMError(RuntimeError):
    """The model server is unreachable or answered with something unusable."""


@dataclass
class ToolCall:
    id: str
    name: str
    arguments: dict[str, Any]
    raw_arguments: str = ""


@dataclass
class ChatResult:
    content: str
    tool_calls: list[ToolCall] = field(default_factory=list)
    reasoning: str | None = None
    finish_reason: str | None = None
    usage: dict[str, int] = field(default_factory=dict)
    latency_s: float = 0.0

    def assistant_message(self) -> dict[str, Any]:
        """The message to append to the conversation before tool results."""
        msg: dict[str, Any] = {"role": "assistant", "content": self.content or ""}
        if self.tool_calls:
            msg["tool_calls"] = [
                {
                    "id": c.id,
                    "type": "function",
                    "function": {"name": c.name, "arguments": c.raw_arguments or json.dumps(c.arguments)},
                }
                for c in self.tool_calls
            ]
        return msg


class LLM(Protocol):
    model: str

    def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        response_format: dict[str, Any] | None = None,
        thinking: bool = False,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> ChatResult: ...

    def stream_chat(
        self,
        messages: list[dict[str, Any]],
        *,
        thinking: bool = False,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> Iterator[str]: ...


def json_schema_format(name: str, schema: dict[str, Any]) -> dict[str, Any]:
    return {"type": "json_schema", "json_schema": {"name": name, "schema": schema, "strict": True}}


def split_thinking(content: str | None, reasoning: str | None = None) -> tuple[str, str | None]:
    """Remove ``<think>`` blocks from content; return (answer, reasoning)."""
    content = content or ""
    found = THINK_RE.findall(content)
    if found:
        reasoning = (reasoning or "") + "\n".join(found)
        content = THINK_RE.sub("", content)
    # An unterminated think block (cut off by max_tokens) leaves no answer
    if "<think>" in content:
        head, _, tail = content.partition("<think>")
        reasoning = (reasoning or "") + tail
        content = head
    return content.strip(), (reasoning.strip() if reasoning else None)


class LLMClient:
    """Synchronous client; the jobs run in worker threads."""

    def __init__(
        self,
        base_url: str | None = None,
        model: str | None = None,
        timeout_s: float | None = None,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.base_url = (base_url or settings.llm_base_url).rstrip("/")
        self.model = model or settings.llm_model
        self._http = httpx.Client(timeout=timeout_s or settings.llm_timeout_seconds, transport=transport)

    def close(self) -> None:
        self._http.close()

    def available(self, timeout_s: float = 2.0) -> bool:
        """True when the server answers ``/models`` (used to skip straight to fallbacks)."""
        try:
            r = self._http.get(f"{self.base_url}/models", timeout=timeout_s)
            return r.status_code == 200
        except httpx.HTTPError:
            return False

    def _payload(
        self,
        messages: list[dict[str, Any]],
        *,
        thinking: bool,
        temperature: float | None,
        max_tokens: int | None,
        **extra: Any,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "model": self.model,
            "messages": messages,
            "chat_template_kwargs": {"enable_thinking": thinking},
            # Qwen3 recommended sampling: thinking 0.6 / 0.95, non-thinking 0.7 / 0.8
            "temperature": temperature if temperature is not None else (0.6 if thinking else 0.7),
            "top_p": 0.95 if thinking else 0.8,
        }
        if max_tokens:
            payload["max_tokens"] = max_tokens
        payload.update({k: v for k, v in extra.items() if v is not None})
        return payload

    def chat(
        self,
        messages: list[dict[str, Any]],
        *,
        tools: list[dict[str, Any]] | None = None,
        response_format: dict[str, Any] | None = None,
        thinking: bool = False,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> ChatResult:
        payload = self._payload(
            messages,
            thinking=thinking,
            temperature=temperature,
            max_tokens=max_tokens,
            tools=tools or None,
            response_format=response_format,
        )
        t0 = time.perf_counter()
        try:
            r = self._http.post(f"{self.base_url}/chat/completions", json=payload)
        except httpx.HTTPError as exc:
            raise LLMError(f"Model server unreachable at {self.base_url}: {exc}") from exc
        if r.status_code != 200:
            raise LLMError(f"Model server returned {r.status_code}: {r.text[:300]}")
        return parse_completion(r.json(), latency_s=time.perf_counter() - t0)

    def stream_chat(
        self,
        messages: list[dict[str, Any]],
        *,
        thinking: bool = False,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> Iterator[str]:
        payload = self._payload(
            messages, thinking=thinking, temperature=temperature, max_tokens=max_tokens, stream=True
        )
        try:
            with self._http.stream("POST", f"{self.base_url}/chat/completions", json=payload) as r:
                if r.status_code != 200:
                    raise LLMError(f"Model server returned {r.status_code}: {r.read()[:300]!r}")
                in_think = False
                for line in r.iter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[5:].strip()
                    if data == "[DONE]":
                        break
                    choices = json.loads(data).get("choices") or []
                    if not choices:
                        continue
                    piece = (choices[0].get("delta") or {}).get("content") or ""
                    # Drop inline thinking so only the answer streams to the user
                    while piece:
                        if in_think:
                            end = piece.find("</think>")
                            if end < 0:
                                piece = ""
                            else:
                                in_think, piece = False, piece[end + len("</think>") :]
                        else:
                            start = piece.find("<think>")
                            if start < 0:
                                yield piece
                                piece = ""
                            else:
                                if start:
                                    yield piece[:start]
                                in_think, piece = True, piece[start + len("<think>") :]
        except httpx.HTTPError as exc:
            raise LLMError(f"Model server unreachable at {self.base_url}: {exc}") from exc


def parse_completion(body: dict[str, Any], latency_s: float = 0.0) -> ChatResult:
    try:
        choice = body["choices"][0]
        msg = choice["message"]
    except (KeyError, IndexError, TypeError) as exc:
        raise LLMError(f"Unexpected completion shape: {str(body)[:300]}") from exc
    content, reasoning = split_thinking(msg.get("content"), msg.get("reasoning_content"))
    calls: list[ToolCall] = []
    for i, c in enumerate(msg.get("tool_calls") or []):
        fn = c.get("function") or {}
        raw = fn.get("arguments") or "{}"
        try:
            args = json.loads(raw) if isinstance(raw, str) else dict(raw)
        except json.JSONDecodeError:
            args = {"__invalid_json__": raw}
        calls.append(ToolCall(id=c.get("id") or f"call_{i}", name=fn.get("name") or "", arguments=args, raw_arguments=raw if isinstance(raw, str) else json.dumps(raw)))
    return ChatResult(
        content=content,
        tool_calls=calls,
        reasoning=reasoning,
        finish_reason=choice.get("finish_reason"),
        usage=body.get("usage") or {},
        latency_s=latency_s,
    )


class MockLLMClient:
    """Replays scripted ``ChatResult``s (or plain strings) in order; records every request."""

    def __init__(self, responses: list[ChatResult | str], model: str = "mock") -> None:
        self.responses = list(responses)
        self.model = model
        self.requests: list[dict[str, Any]] = []

    def available(self, timeout_s: float = 2.0) -> bool:
        return True

    def _next(self) -> ChatResult:
        if not self.responses:
            raise LLMError("MockLLMClient ran out of scripted responses.")
        r = self.responses.pop(0)
        if isinstance(r, str):
            content, reasoning = split_thinking(r)
            return ChatResult(content=content, reasoning=reasoning, finish_reason="stop")
        return r

    def chat(self, messages: list[dict[str, Any]], **kwargs: Any) -> ChatResult:
        self.requests.append({"messages": [dict(m) for m in messages], **kwargs})
        return self._next()

    def stream_chat(self, messages: list[dict[str, Any]], **kwargs: Any) -> Iterator[str]:
        self.requests.append({"messages": [dict(m) for m in messages], "stream": True, **kwargs})
        text = self._next().content
        for word in re.findall(r"\S+\s*", text):
            yield word


def call(name: str, arguments: dict[str, Any], call_id: str | None = None) -> ToolCall:
    """Shorthand for scripting a tool call in tests."""
    return ToolCall(id=call_id or f"call_{name}", name=name, arguments=arguments, raw_arguments=json.dumps(arguments))
