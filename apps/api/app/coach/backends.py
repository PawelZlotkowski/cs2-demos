"""How the agent reaches the tools (AI Coach plan §5).

- ``MCPTools``: the default. An MCP client session to the ``cs2-demo`` server,
  either in-process (the server object, still over the MCP protocol), over
  stdio (``RR_MCP_COMMAND``) or over streamable HTTP (``RR_MCP_URL``).
- ``InProcessTools``: direct function calls, for unit tests and to measure
  what the MCP boundary costs in latency.

Both expose the same two calls, so the agent does not know which it has.
Context arguments (``match_id``, ``player_id``) are bound by the agent and
hidden from the model; see ``bind``.
"""

from __future__ import annotations

import inspect
import json
import shlex
from contextlib import AsyncExitStack
from dataclasses import dataclass
from typing import Any, Protocol, Self

from pydantic import ValidationError, create_model

from app.coach import tools as tool_module


@dataclass
class ToolSpec:
    name: str
    description: str
    parameters: dict[str, Any]  # JSON schema


class ToolBackend(Protocol):
    kind: str

    async def list_tools(self) -> list[ToolSpec]: ...

    async def call(self, name: str, arguments: dict[str, Any]) -> str: ...


# --- in-process ---------------------------------------------------------------


def _args_model(name: str, fn: Any) -> Any:
    sig = inspect.signature(fn, eval_str=True)
    fields = {
        p.name: (p.annotation, ... if p.default is inspect.Parameter.empty else p.default)
        for p in sig.parameters.values()
    }
    return create_model(f"{name}_args", **fields)  # type: ignore[call-overload]


class InProcessTools:
    kind = "inprocess"

    def __init__(self) -> None:
        self._models = {
            name: _args_model(name, inspect.unwrap(fn)) for name, fn in tool_module.TOOLS.items()
        }

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *exc: object) -> None:
        return None

    async def list_tools(self) -> list[ToolSpec]:
        return [
            ToolSpec(
                name=name,
                description=inspect.getdoc(inspect.unwrap(fn)) or "",
                parameters=self._models[name].model_json_schema(),
            )
            for name, fn in tool_module.TOOLS.items()
        ]

    async def call(self, name: str, arguments: dict[str, Any]) -> str:
        fn = tool_module.TOOLS.get(name)
        if fn is None:
            return tool_module.to_json({"error": f"Unknown tool {name!r}."})
        try:
            args = self._models[name].model_validate(arguments)
        except ValidationError as exc:
            return tool_module.to_json({"error": _validation_message(exc)})
        return tool_module.to_json(fn(**{k: getattr(args, k) for k in type(args).model_fields}))


def _validation_message(exc: ValidationError) -> str:
    parts = [f"{'.'.join(str(x) for x in e['loc'])}: {e['msg']}" for e in exc.errors()[:5]]
    return "Invalid arguments: " + "; ".join(parts)


# --- MCP ------------------------------------------------------------------------


class MCPTools:
    """MCP client to the cs2-demo server. Use as an async context manager."""

    kind = "mcp"

    def __init__(self, target: Any = None) -> None:
        # target: an MCPServer (in-process), a URL, or a StdioServerParameters
        self._target = target
        self._stack: AsyncExitStack | None = None
        self._client: Any = None

    @classmethod
    def from_settings(cls, url: str | None, command: str | None) -> MCPTools:
        if url:
            return cls(url)
        if command:
            from mcp import StdioServerParameters

            argv = shlex.split(command)
            return cls(StdioServerParameters(command=argv[0], args=argv[1:]))
        from app.coach.mcp_server import build_server

        return cls(build_server())

    async def __aenter__(self) -> Self:
        from mcp import Client

        self._stack = AsyncExitStack()
        self._client = await self._stack.enter_async_context(Client(self._target))
        return self

    async def __aexit__(self, *exc: object) -> None:
        if self._stack is not None:
            await self._stack.aclose()
        self._stack = None
        self._client = None

    async def list_tools(self) -> list[ToolSpec]:
        result = await self._client.list_tools()
        return [
            ToolSpec(name=t.name, description=t.description or "", parameters=dict(t.input_schema))
            for t in result.tools
        ]

    async def call(self, name: str, arguments: dict[str, Any]) -> str:
        result = await self._client.call_tool(name, arguments)
        text = "".join(getattr(c, "text", "") for c in result.content)
        if result.is_error:
            return tool_module.to_json({"error": text or "Tool failed."})
        if getattr(result, "structured_content", None):
            return tool_module.to_json(result.structured_content)
        # Re-serialise compactly so traces and sizes match the in-process adapter
        try:
            return tool_module.to_json(json.loads(text))
        except json.JSONDecodeError:
            return text


# --- schemas for the model ---------------------------------------------------------


def openai_tools(specs: list[ToolSpec], bound: dict[str, Any], allow: set[str] | None = None) -> list[dict[str, Any]]:
    """OpenAI ``tools`` for the model, with bound context arguments removed."""
    out = []
    for spec in specs:
        if allow is not None and spec.name not in allow:
            continue
        params = inline_refs(spec.parameters)
        props = {k: v for k, v in (params.get("properties") or {}).items() if k not in bound}
        required = [k for k in params.get("required") or [] if k not in bound]
        clean = {"type": "object", "properties": {k: _strip_titles(v) for k, v in props.items()}}
        if required:
            clean["required"] = required
        out.append(
            {"type": "function", "function": {"name": spec.name, "description": spec.description, "parameters": clean}}
        )
    return out


def bind(spec_params: dict[str, Any], arguments: dict[str, Any], bound: dict[str, Any]) -> dict[str, Any]:
    """Fill the context arguments this tool takes; the model never chooses them."""
    props = spec_params.get("properties") or {}
    merged = {k: v for k, v in arguments.items() if k not in bound}
    for k, v in bound.items():
        if k in props:
            merged[k] = v
    return merged


def inline_refs(schema: dict[str, Any]) -> dict[str, Any]:
    """Resolve ``$ref``/``$defs`` (llama.cpp's grammar builder prefers flat schemas)."""
    defs = schema.get("$defs") or {}

    def walk(node: Any) -> Any:
        if isinstance(node, dict):
            if "$ref" in node:
                target = defs[node["$ref"].split("/")[-1]]
                return walk({**target, **{k: v for k, v in node.items() if k != "$ref"}})
            return {k: walk(v) for k, v in node.items() if k != "$defs"}
        if isinstance(node, list):
            return [walk(v) for v in node]
        return node

    return walk(schema)


def _strip_titles(node: Any) -> Any:
    if isinstance(node, dict):
        return {k: _strip_titles(v) for k, v in node.items() if k != "title"}
    if isinstance(node, list):
        return [_strip_titles(v) for v in node]
    return node
