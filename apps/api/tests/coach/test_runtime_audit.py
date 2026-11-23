"""Coach runtime fixes from the 23 Nov 2026 code audit (findings 13, 16-19 and the trace record)."""

from __future__ import annotations

import asyncio
import inspect
import json

import httpx
import pytest

from app.analysis.policy import policy_description
from app.analysis.ranker import MIN_EACH, MIN_GAP_S
from app.auth.scope import visible_matches
from app.coach import tools
from app.coach.agent import TraceWriter
from app.coach.backends import InProcessTools
from app.coach.jobs import CoachJobs, parse_json_object
from app.coach.llm_client import ChatResult, LLMClient, LLMError, call, parse_completion, split_thinking
from app.core.config import settings
from app.models.contracts import AskRequest
from app.repositories.matches import repo
from tests.coach.test_jobs import good_text, jobs_with, picks_json, traces


def tool_call_body(raw) -> dict:
    return {"choices": [{"finish_reason": "tool_calls", "message": {"content": "", "tool_calls": [
        {"id": "c1", "type": "function", "function": {"name": "list_findings", "arguments": raw}}]}}]}


@pytest.mark.parametrize("raw", ["null", "[]", '"round 1"', [1, 2]])
def test_tool_arguments_that_are_not_an_object_are_invalid(analysed, tmp_path, raw):
    """Finding 17: these crashed the agent; now the model is told and the job ends with a trace."""
    mid, pid = analysed
    parsed = parse_completion(tool_call_body(raw))
    assert "__invalid_json__" in parsed.tool_calls[0].arguments
    jobs, llm = jobs_with([parsed, good_text(mid, pid)], tmp_path)
    out = asyncio.run(jobs.ask(mid, pid, AskRequest(question="Why?", round=1, language="en")))
    assert out.source == "agent"
    tool_msg = next(m["content"] for m in llm.requests[1]["messages"] if m.get("role") == "tool")
    assert "error" in json.loads(tool_msg)
    assert traces(tmp_path)[0]["runs"][0]["steps"][0]["error"]


def test_an_unexpected_error_still_falls_back_with_a_trace(analysed, tmp_path):
    mid, pid = analysed

    class Broken:
        model = "broken"

        def chat(self, messages, **kwargs):
            raise TypeError("'NoneType' object is not iterable")

    jobs = CoachJobs(repo, llm=Broken(), tools_factory=InProcessTools, traces=TraceWriter(tmp_path / "traces"))
    out = asyncio.run(jobs.ask(mid, pid, AskRequest(question="Why?", round=1, language="en")))
    assert out.source == "template" and out.answer
    t = traces(tmp_path)[0]
    assert t["source"] == "template" and t["verifier"]["ok"] is False and "TypeError" in t["verifier"]["errors"][0]


def test_round_bound_ask_cannot_read_or_cite_another_round(analysed, tmp_path):
    """Finding 18: asked about round 1, the model fetched and cited a round-2 finding."""
    mid, pid = analysed
    other = next(f for f in repo.analysis.findings(mid, pid) if f.round != 1)
    answer = f"Look at round {other.round} instead [{other.id}]."
    jobs, llm = jobs_with([ChatResult(content="", tool_calls=[call("get_finding", {"finding_id": other.id})]),
                           answer, answer], tmp_path)
    out = asyncio.run(jobs.ask(mid, pid, AskRequest(question="What about round 1?", round=1, language="en")))
    fetched = json.loads(next(m["content"] for m in llm.requests[1]["messages"] if m.get("role") == "tool"))
    assert "error" in fetched and "evidence" not in fetched
    assert out.source == "template" and other.id not in out.citations
    # The same finding is still readable when no round is bound
    direct = tools.TOOLS["get_finding"](match_id=mid, player_id=pid, finding_id=other.id)
    assert direct["round"] == other.round


def test_round_stats_and_totals_check_the_match_scope(analysed):
    mid, pid = analysed
    token = visible_matches.set(frozenset({"match-someone-else"}))
    try:
        stats = tools.TOOLS["get_round_stats"](match_id=mid, player_id=pid, round=1)
        totals = tools.TOOLS["get_match_totals"](match_id=mid, player_id=pid)
    finally:
        visible_matches.reset(token)
    assert "error" in stats and "error" in totals


def test_a_deleted_match_is_not_served_from_the_tool_cache(analysed):
    mid, _pid = analysed
    assert "error" not in tools.TOOLS["get_round_timeline"](match_id=mid, round=1)
    repo.delete(mid)
    assert "error" in tools.TOOLS["get_round_timeline"](match_id=mid, round=1)
    assert mid not in tools.data._cache


def test_select_moments_text_follows_the_ranker():
    """Finding 13: the tool said 2 of each while the ranker and checker need MIN_EACH."""
    fn = tools.TOOLS["select_moments"]
    for doc in (fn.__doc__, inspect.getdoc(inspect.unwrap(fn))):
        assert f"at least {MIN_EACH} mistakes and {MIN_EACH} good plays" in doc
        assert f"within {MIN_GAP_S:.0f} s" in doc


def test_search_knowledge_defaults_to_the_match_map(analysed, tmp_path):
    """Finding 16: with the map left out, a question about another map's callouts came back."""
    mid, pid = analysed
    query = "Anubis canals water mid"
    unscoped = tools.TOOLS["search_knowledge"](query=query, k=6)
    assert any(p["map"] == "de_anubis" for p in unscoped["passages"])  # the test can tell the difference
    scoped = tools.TOOLS["search_knowledge"](query=query, k=6, match_id=mid)
    assert scoped["passages"] and all(p["map"] in ("all", "de_mirage") for p in scoped["passages"])
    # The agent binds the match id, so the model never has to pass it
    jobs, llm = jobs_with([ChatResult(content="", tool_calls=[call("search_knowledge", {"query": query, "k": 6})]),
                           good_text(mid, pid)], tmp_path)
    asyncio.run(jobs.ask(mid, pid, AskRequest(question="Why?", round=1, language="en")))
    offered = {t["function"]["name"]: t["function"]["parameters"] for t in llm.requests[0]["tools"]}
    assert "match_id" not in offered["search_knowledge"]["properties"]
    found = json.loads(next(m["content"] for m in llm.requests[1]["messages"] if m.get("role") == "tool"))
    assert all(p["map"] in ("all", "de_mirage") for p in found["passages"])


def test_reasoning_without_an_opening_tag_is_dropped():
    """The chat template opens <think> itself, so only the closing tag reaches the content."""
    content, reasoning = split_thinking('Draft: {"moments": [1]} no wait</think>{"moments": []}')
    assert content == '{"moments": []}' and "Draft" in reasoning
    assert parse_json_object(content) == {"moments": []}


def test_autocited_only_when_a_citation_was_added(analysed, tmp_path):
    mid, pid = analysed
    jobs, _ = jobs_with([good_text(mid, pid).replace(". ", ".\n\n")], tmp_path)
    out = asyncio.run(jobs.ask(mid, pid, AskRequest(question="Why?", round=1, language="en")))
    assert out.source == "agent"
    assert traces(tmp_path)[0]["verifier"]["autocited"] is False


def fake_llama(seen: list[dict], content: str) -> httpx.MockTransport:
    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(json.loads(request.content))
        return httpx.Response(200, json={"choices": [{"message": {"content": content}, "finish_reason": "stop"}]})

    return httpx.MockTransport(handler)


def test_seed_is_sent_unless_switched_off(monkeypatch):
    seen: list[dict] = []
    client = LLMClient(base_url="http://llm/v1", model="qwen3-14b", transport=fake_llama(seen, "ok"), sampling_overrides={})
    client.chat([{"role": "user", "content": "hi"}])
    assert seen[0]["seed"] == settings.llm_seed == 20261125
    monkeypatch.setattr(settings, "llm_seed", None)
    LLMClient(base_url="http://llm/v1", model="qwen3-14b", transport=fake_llama(seen, "ok")).chat([{"role": "user", "content": "hi"}])
    assert "seed" not in seen[1]


def test_traces_record_what_a_run_depends_on(analysed, tmp_path, monkeypatch):
    mid, pid = analysed
    monkeypatch.setattr(settings, "llm_enabled", True)
    seen: list[dict] = []
    llm = LLMClient(base_url="http://llm/v1", model="qwen3-14b", sampling_overrides={},
                    transport=fake_llama(seen, good_text(mid, pid)))
    jobs = CoachJobs(repo, llm=llm, tools_factory=InProcessTools, traces=TraceWriter(tmp_path / "traces"))
    asyncio.run(jobs.ask(mid, pid, AskRequest(question="Why?", round=1, language="en")))
    t = traces(tmp_path)[0]
    sent = seen[0]
    assert t["sampling"] == {"profile": "qwen3", "temperature": sent["temperature"], "top_p": sent["top_p"], "seed": sent["seed"]}
    assert "get_finding" in t["tools"] and "get_match_totals" not in t["tools"]
    assert t["policyVersion"] == policy_description("all")["version"] and t["promptVersion"].startswith("answer_question.v")
    assert "gitSha" in t

    # Selection: no full prompt, but its hash and the candidate ids
    seen.clear()
    llm2 = LLMClient(base_url="http://llm/v1", model="qwen3-14b", sampling_overrides={},
                     transport=fake_llama(seen, picks_json(mid, pid)))
    jobs2 = CoachJobs(repo, llm=llm2, tools_factory=InProcessTools, traces=TraceWriter(tmp_path / "traces2"))
    asyncio.run(jobs2.select_moments(mid, pid))
    s = [json.loads(line) for p in (tmp_path / "traces2").glob("*.jsonl") for line in p.read_text().splitlines()][0]
    assert s["sampling"]["temperature"] == seen[0]["temperature"] == 0.6 and s["tools"] == ["select_moments"]
    assert len(s["promptHash"]) == 12 and s["candidateIds"] and s["candidateIds"][0].startswith("F")
    assert seen[0]["messages"][0]["content"] not in json.dumps(s)


def test_a_dead_server_still_traces_prompt_and_policy(analysed, tmp_path, monkeypatch):
    mid, pid = analysed

    class Dead:
        model = "dead"

        def chat(self, messages, **kwargs):
            raise LLMError("unreachable")

    jobs = CoachJobs(repo, llm=Dead(), tools_factory=InProcessTools, traces=TraceWriter(tmp_path / "traces"))
    asyncio.run(jobs.explain(mid, pid, "r1", "en", store=False))
    t = traces(tmp_path)[0]
    assert t["runs"] == [] and t["promptVersion"].startswith("explain_moment.v") and t["policyVersion"]
