"""T22: OpenAI-compatible client against a fake llama.cpp server (httpx MockTransport).

The live test at the bottom runs only with RR_LLM_LIVE=1 and a llama-server
listening at RR_LLM_BASE_URL.
"""

from __future__ import annotations

import json
import os

import httpx
import pytest

from app.coach.llm_client import LLMClient, LLMError, json_schema_format, sampling_profile, split_thinking


def fake_server(handler):
    seen: list[dict] = []

    def wrapped(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content or b"{}")
        seen.append({"path": request.url.path, "body": body})
        return handler(request, body)

    return seen, httpx.MockTransport(wrapped)


def completion(message: dict, finish: str = "stop") -> httpx.Response:
    return httpx.Response(
        200,
        json={"choices": [{"message": message, "finish_reason": finish}], "usage": {"prompt_tokens": 10, "completion_tokens": 5}},
    )


def test_chat_sends_tools_schema_and_thinking_switch():
    seen, transport = fake_server(lambda req, body: completion({"role": "assistant", "content": "ok"}))
    client = LLMClient(base_url="http://llm/v1", model="qwen3-14b", transport=transport)
    tools = [{"type": "function", "function": {"name": "x", "parameters": {"type": "object", "properties": {}}}}]
    fmt = json_schema_format("m", {"type": "object"})
    r = client.chat([{"role": "user", "content": "hi"}], tools=tools, response_format=fmt, thinking=False)
    body = seen[0]["body"]
    assert seen[0]["path"] == "/v1/chat/completions"
    assert body["model"] == "qwen3-14b" and body["tools"] == tools and body["response_format"] == fmt
    assert body["chat_template_kwargs"] == {"enable_thinking": False}
    assert body["temperature"] == 0.7
    assert r.content == "ok" and r.usage["completion_tokens"] == 5

    client.chat([{"role": "user", "content": "hi"}], thinking=True)
    assert seen[1]["body"]["chat_template_kwargs"] == {"enable_thinking": True}
    assert "tools" not in seen[1]["body"] and seen[1]["body"]["temperature"] == 0.6


def test_sampling_follows_the_model_family():
    seen, transport = fake_server(lambda req, body: completion({"role": "assistant", "content": "ok"}))
    gemma = LLMClient(base_url="http://llm/v1", model="gemma-4-12b-it-Q6_K", transport=transport, sampling_overrides={})
    assert gemma.sampling == "gemma"
    gemma.chat([{"role": "user", "content": "hi"}])
    body = seen[0]["body"]
    assert (body["temperature"], body["top_p"], body["top_k"]) == (1.0, 0.95, 64)

    qwen = LLMClient(base_url="http://llm/v1", model="qwen3-14b-q4_k_m", transport=transport, sampling_overrides={})
    assert qwen.sampling == "qwen3"
    qwen.chat([{"role": "user", "content": "hi"}])
    assert "top_k" not in seen[1]["body"] and seen[1]["body"]["top_p"] == 0.8

    assert sampling_profile("Ministral-3-14B-Instruct") == "ministral"
    assert sampling_profile("anything", "gemma") == "gemma"
    with pytest.raises(ValueError):
        sampling_profile("x", "nope")


def test_sampling_overrides_and_explicit_temperature_win():
    seen, transport = fake_server(lambda req, body: completion({"role": "assistant", "content": "ok"}))
    client = LLMClient(
        base_url="http://llm/v1", model="gemma-4-12b", transport=transport,
        sampling_overrides={"temperature": 0.3, "min_p": 0.05, "top_k": None},
    )
    client.chat([{"role": "user", "content": "hi"}], thinking=True)
    body = seen[0]["body"]
    assert (body["temperature"], body["min_p"], body["top_k"]) == (0.3, 0.05, 64)
    client.chat([{"role": "user", "content": "hi"}], temperature=0.0)
    assert seen[1]["body"]["temperature"] == 0.0


def test_tool_calls_and_reasoning_are_parsed():
    msg = {
        "role": "assistant",
        "content": "<think>check F12 first</think>",
        "tool_calls": [
            {"id": "c1", "type": "function", "function": {"name": "get_finding", "arguments": "{\"finding_id\": \"F12\"}"}},
            {"id": "c2", "type": "function", "function": {"name": "list_rounds", "arguments": "{not json"}},
        ],
    }
    _, transport = fake_server(lambda req, body: completion(msg, "tool_calls"))
    r = LLMClient(base_url="http://llm/v1", transport=transport).chat([{"role": "user", "content": "q"}])
    assert r.content == "" and r.reasoning == "check F12 first"
    assert r.tool_calls[0].name == "get_finding" and r.tool_calls[0].arguments == {"finding_id": "F12"}
    assert "__invalid_json__" in r.tool_calls[1].arguments
    replay = r.assistant_message()
    assert replay["tool_calls"][0]["function"]["arguments"] == "{\"finding_id\": \"F12\"}"


def test_reasoning_content_field():
    _, transport = fake_server(
        lambda req, body: completion({"role": "assistant", "content": "answer", "reasoning_content": "thoughts"})
    )
    r = LLMClient(base_url="http://llm/v1", transport=transport).chat([])
    assert (r.content, r.reasoning) == ("answer", "thoughts")


def test_split_thinking_cut_off():
    assert split_thinking("<think>unfinished") == ("", "unfinished")
    assert split_thinking("a <think>x</think> b") == ("a  b", "x")


def test_errors_become_llm_error():
    _, transport = fake_server(lambda req, body: httpx.Response(500, text="boom"))
    client = LLMClient(base_url="http://llm/v1", transport=transport)
    with pytest.raises(LLMError, match="500"):
        client.chat([])

    def refuse(request):
        raise httpx.ConnectError("refused", request=request)

    down = LLMClient(base_url="http://llm/v1", transport=httpx.MockTransport(refuse))
    with pytest.raises(LLMError, match="unreachable"):
        down.chat([])
    assert down.available() is False


def test_available():
    _, transport = fake_server(lambda req, body: httpx.Response(200, json={"data": [{"id": "qwen3-14b"}]}))
    assert LLMClient(base_url="http://llm/v1", transport=transport).available()


def test_stream_chat_drops_thinking():
    # llama.cpp emits <think> and </think> as single tokens, so markers arrive whole
    pieces = ["<think>hidden", " still</think>You ", "died alone ", "[F12]."]
    lines = [f"data: {json.dumps({'choices': [{'delta': {'content': p}}]})}" for p in pieces] + ["data: [DONE]"]

    def handler(request, body):
        assert body["stream"] is True
        return httpx.Response(200, text="\n\n".join(lines), headers={"content-type": "text/event-stream"})

    _, transport = fake_server(handler)
    out = "".join(LLMClient(base_url="http://llm/v1", transport=transport).stream_chat([{"role": "user", "content": "q"}]))
    assert out == "You died alone [F12]."


@pytest.mark.llm
@pytest.mark.skipif(os.environ.get("RR_LLM_LIVE") != "1", reason="needs a running llama-server (RR_LLM_LIVE=1)")
def test_live_llama_server_tool_call_and_json():  # pragma: no cover - manual check on the 5080
    client = LLMClient()
    assert client.available(), f"no server at {client.base_url}"
    tools = [{"type": "function", "function": {
        "name": "get_finding", "description": "Get a finding by id.",
        "parameters": {"type": "object", "properties": {"finding_id": {"type": "string"}}, "required": ["finding_id"]}}}]
    r = client.chat([{"role": "user", "content": "Look up finding F12."}], tools=tools)
    assert r.tool_calls and r.tool_calls[0].name == "get_finding"
    schema = {"type": "object", "properties": {"ok": {"type": "boolean"}}, "required": ["ok"]}
    r = client.chat([{"role": "user", "content": "Reply with ok true."}], response_format=json_schema_format("ok", schema))
    assert json.loads(r.content)["ok"] is True
