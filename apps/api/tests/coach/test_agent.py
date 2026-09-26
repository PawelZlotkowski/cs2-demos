"""T23: agent loop with a scripted model, over MCP and in-process tools."""

from __future__ import annotations

import asyncio
import json

import pytest

from app.coach.agent import CoachAgent, TraceWriter, run_record
from app.coach.backends import InProcessTools, MCPTools
from app.coach.llm_client import ChatResult, MockLLMClient, call
from app.coach.mcp_server import build_server


def backends():
    return [
        pytest.param(lambda: MCPTools(build_server()), "mcp", id="mcp"),
        pytest.param(InProcessTools, "inprocess", id="inprocess"),
    ]


def run_agent(llm, make_tools, mid, pid, **kw):
    async def main():
        async with make_tools() as tools:
            agent = CoachAgent(llm, tools, max_steps=kw.pop("max_steps", 6))
            return await agent.run(
                job="ask",
                prompt_version="answer_question.v1",
                messages=[{"role": "system", "content": "sys"}, {"role": "user", "content": "Why did I die?"}],
                bound={"match_id": mid, "player_id": pid},
                **kw,
            )

    return asyncio.run(main())


@pytest.mark.parametrize("make_tools,kind", backends())
def test_tool_call_then_answer(analysed, make_tools, kind):
    mid, pid = analysed
    llm = MockLLMClient(
        [
            ChatResult(content="", tool_calls=[call("list_findings", {"round": 1, "kind": "mistake"})]),
            ChatResult(content="", tool_calls=[call("get_round_timeline", {"round": 1})]),
            "You died in Mid [F3].",
        ]
    )
    run = run_agent(llm, make_tools, mid, pid)
    assert run.text == "You died in Mid [F3]." and run.finish == "answer"
    assert [s.tool for s in run.steps] == ["list_findings", "get_round_timeline"]
    assert all(s.error is None and s.result_bytes > 0 for s in run.steps)
    assert run.tools_backend == kind

    # The model never sees or sets the bound context arguments
    tools_sent = llm.requests[0]["tools"]
    for t in tools_sent:
        assert "match_id" not in t["function"]["parameters"]["properties"]
        assert "player_id" not in t["function"]["parameters"]["properties"]
    # Tool results went back to the model with the call ids
    second = llm.requests[1]["messages"]
    assert second[-1]["role"] == "tool" and json.loads(second[-1]["content"])["count"] >= 1


def test_model_cannot_override_bound_match(analysed):
    mid, pid = analysed
    llm = MockLLMClient([ChatResult(content="", tool_calls=[call("list_rounds", {"match_id": "other"})]), "done"])
    run = run_agent(llm, InProcessTools, mid, pid)
    tool_msg = llm.requests[1]["messages"][-1]
    assert json.loads(tool_msg["content"])["map"] == "de_mirage"
    assert run.steps[0].error is None


def test_unknown_and_disallowed_tools_are_reported_to_the_model(analysed):
    mid, pid = analysed
    llm = MockLLMClient(
        [
            ChatResult(content="", tool_calls=[call("rm_rf", {}), call("select_moments", {"moments": []})]),
            "ok",
        ]
    )
    run = run_agent(llm, InProcessTools, mid, pid, allow_tools={"list_findings", "get_finding"})
    assert [s.error is not None for s in run.steps] == [True, True]
    assert "Unknown tool" in run.steps[0].error
    assert [t["function"]["name"] for t in llm.requests[0]["tools"]] == ["list_findings", "get_finding"]


def test_bad_arguments_come_back_as_errors(analysed):
    mid, pid = analysed
    llm = MockLLMClient([ChatResult(content="", tool_calls=[call("get_finding", {"finding_id": "twelve"})]), "ok"])
    run = run_agent(llm, InProcessTools, mid, pid)
    assert "Invalid arguments" in run.steps[0].error


def test_max_steps_forces_an_answer(analysed):
    mid, pid = analysed
    loop = ChatResult(content="", tool_calls=[call("list_rounds", {})])
    llm = MockLLMClient([loop, loop, "final answer"])
    run = run_agent(llm, InProcessTools, mid, pid, max_steps=2)
    assert run.finish == "max_steps" and run.text == "final answer" and len(run.steps) == 2
    last = llm.requests[-1]
    assert last["tools"] is None and "used all tool steps" in last["messages"][-1]["content"]


def test_step_callback_and_trace(analysed, tmp_path):
    mid, pid = analysed
    seen = []
    llm = MockLLMClient([ChatResult(content="", tool_calls=[call("list_rounds", {})]), "<think>hmm</think>answer"])
    run = run_agent(llm, InProcessTools, mid, pid, on_step=seen.append)
    assert [s["tool"] for s in seen] == ["list_rounds"]
    assert run.reasoning == "hmm" and run.text == "answer"

    path = TraceWriter(tmp_path).write({**run_record(run), "verifier": {"ok": True}})
    line = json.loads(path.read_text().splitlines()[0])
    assert line["promptVersion"] == "answer_question.v1" and line["model"] == "mock"
    assert line["steps"][0]["tool"] == "list_rounds" and line["reasoningChars"] == 3
