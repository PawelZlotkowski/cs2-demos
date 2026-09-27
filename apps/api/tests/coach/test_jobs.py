"""T25–T27: selection, explanation and Ask jobs with a scripted model (no GPU)."""

from __future__ import annotations

import asyncio
import json

import pytest

from app.coach.agent import TraceWriter
from app.coach.backends import InProcessTools, MCPTools
from app.coach.jobs import CoachJobs, parse_json_object
from app.coach.llm_client import ChatResult, LLMError, MockLLMClient, call
from app.coach.mcp_server import build_server
from app.core.config import settings
from app.models.contracts import AskRequest, MatchStatus
from app.processing import pipeline as pipe_mod
from app.repositories.matches import repo


def ids(mid, pid) -> dict[str, str]:
    return {f.detector: f.id for f in repo.analysis.findings(mid, pid) if f.kind in ("mistake", "good")}


def picks_json(mid, pid) -> str:
    i = ids(mid, pid)
    return json.dumps(
        {
            "moments": [
                {"round": 1, "t0": 10.5, "t1": 18.6, "findingIds": [i["dry_peek"], i["shot_while_moving"]],
                 "kind": "mistake", "pickedBecause": f"[{i['dry_peek']}] Peeked Mid without a flash."},
                {"round": 2, "t0": 10.6, "t1": 18.6, "findingIds": [i["good_plays"]], "kind": "good",
                 "pickedBecause": f"[{i['good_plays']}] Opened the round in Mid."},
            ]
        }
    )


def good_text(mid, pid) -> str:
    i = ids(mid, pid)
    return (
        f"You fired 1 of 1 shots with the ak47 while moving at 206 u/s in Mid [{i['shot_while_moving']}]. "
        f"You died 0.16 s after first contact with no flash from the team, so wait for support next time [{i['dry_peek']}]."
    )


def jobs_with(responses, tmp_path, tools="inprocess") -> tuple[CoachJobs, MockLLMClient]:
    llm = MockLLMClient(responses)
    factory = InProcessTools if tools == "inprocess" else (lambda: MCPTools(build_server()))
    return CoachJobs(repo, llm=llm, tools_factory=factory, traces=TraceWriter(tmp_path / "traces")), llm


def traces(tmp_path) -> list[dict]:
    return [json.loads(line) for p in (tmp_path / "traces").glob("*.jsonl") for line in p.read_text().splitlines()]


# --- selection ---


@pytest.mark.parametrize("tools", ["inprocess", "mcp"])
def test_selection_stores_agent_moments(analysed, tmp_path, tools):
    mid, pid = analysed
    jobs, llm = jobs_with([f"<think>weighing</think>{picks_json(mid, pid)}"], tmp_path, tools)
    out = asyncio.run(jobs.select_moments(mid, pid))
    assert out.source == "agent" and not out.errors
    assert [m.source for m in repo.analysis.moments(mid, pid)] == ["agent", "agent"]
    req = llm.requests[0]
    assert req["thinking"] is True and req["response_format"]["type"] == "json_schema"
    assert "id | kind | detector" in req["messages"][1]["content"]
    t = traces(tmp_path)[0]
    assert t["job"] == "select_moments" and t["source"] == "agent" and t["promptVersion"] == "select_moments.v1"
    assert t["attempts"][0]["reasoningChars"] == len("weighing")


def test_selection_repairs_once(analysed, tmp_path):
    mid, pid = analysed
    wrong = json.loads(picks_json(mid, pid))
    wrong["moments"][0]["findingIds"] = ["F99"]
    jobs, llm = jobs_with([json.dumps(wrong), picks_json(mid, pid)], tmp_path)
    out = asyncio.run(jobs.select_moments(mid, pid))
    assert out.source == "agent"
    repair = llm.requests[1]["messages"][-1]["content"]
    assert "failed these checks" in repair and "F99" in repair


def test_selection_falls_back_to_the_ranker(analysed, tmp_path):
    mid, pid = analysed
    before = repo.analysis.moments(mid, pid)
    jobs, _ = jobs_with(["not json", "still not json"], tmp_path)
    out = asyncio.run(jobs.select_moments(mid, pid))
    assert out.source == "ranker" and out.errors
    assert repo.analysis.moments(mid, pid) == before
    assert traces(tmp_path)[0]["source"] == "ranker"


def test_selection_survives_a_dead_server(analysed, tmp_path):
    mid, pid = analysed

    class Down(MockLLMClient):
        def chat(self, messages, **kw):
            raise LLMError("Model server unreachable")

    jobs = CoachJobs(repo, llm=Down([]), tools_factory=InProcessTools, traces=TraceWriter(tmp_path / "traces"))
    out = asyncio.run(jobs.select_moments(mid, pid))
    assert out.source == "ranker" and "unreachable" in out.errors[0]


def test_parse_json_object():
    assert parse_json_object('```json\n{"a": 1}\n```') == {"a": 1}
    assert parse_json_object('Sure: {"a": {"b": 2}} done') == {"a": {"b": 2}}
    assert parse_json_object("no") is None


# --- explanations ---


def test_explain_moment_with_tools(analysed, tmp_path):
    mid, pid = analysed
    i = ids(mid, pid)
    jobs, llm = jobs_with(
        [ChatResult(content="", tool_calls=[call("get_finding", {"finding_id": i["dry_peek"]})]), good_text(mid, pid)],
        tmp_path,
    )
    expl = asyncio.run(jobs.explain(mid, pid, "m1", "en"))
    assert expl.source == "agent" and expl.verifier_errors == []
    assert i["dry_peek"] in expl.finding_ids and expl.prompt_version == "explain_moment.v3"
    assert repo.analysis.explanation(mid, pid, "m1", "en") == expl
    assert llm.requests[0]["thinking"] is False
    t = traces(tmp_path)[0]
    assert t["verifier"]["ok"] and t["runs"][0]["steps"][0]["tool"] == "get_finding"


def test_explain_repairs_then_falls_back_to_templates(analysed, tmp_path):
    mid, pid = analysed
    bad = "You died 40 m from your team in Mid."
    jobs, llm = jobs_with([bad, bad], tmp_path)
    expl = asyncio.run(jobs.explain(mid, pid, "m1", "pl"))
    assert expl.source == "template"
    assert any("40" in e for e in expl.verifier_errors)
    assert "Śmierć" in expl.text or "strzałów" in expl.text  # Polish templates
    assert "failed these checks" in llm.requests[1]["messages"][-1]["content"]
    assert traces(tmp_path)[0]["repaired"] is True


def test_explain_round_on_demand(analysed, tmp_path):
    mid, pid = analysed
    jobs, _ = jobs_with([good_text(mid, pid)], tmp_path)
    expl = asyncio.run(jobs.explain(mid, pid, "r1", "en"))
    assert expl.target == "r1" and expl.source == "agent"


def test_explain_without_model_uses_templates(analysed, tmp_path):
    mid, pid = analysed
    jobs = CoachJobs(repo, traces=TraceWriter(tmp_path / "traces"))  # real client, RR_LLM_ENABLED off
    expl = asyncio.run(jobs.explain(mid, pid, "m2", "nl"))
    assert expl.source == "template" and expl.citations


# --- Ask ---


def test_ask_reports_steps_and_verifies(analysed, tmp_path):
    mid, pid = analysed
    i = ids(mid, pid)
    answer = f"You opened round 2 by killing P6 in Mid with the ak47 [{i['good_plays']}]."
    jobs, _ = jobs_with([ChatResult(content="", tool_calls=[call("list_findings", {"round": 2})]), answer], tmp_path)
    steps: list[dict] = []
    out = asyncio.run(
        jobs.ask(mid, pid, AskRequest(question="What went well in round 2?", round=2, language="en"), on_step=steps.append)
    )
    assert out.source == "agent" and out.answer == answer
    assert [s["tool"] for s in steps] == ["list_findings"]


def test_ask_falls_back_with_findings_in_view(analysed, tmp_path):
    mid, pid = analysed
    jobs, _ = jobs_with(["Made up 99 kills.", "Still 99."], tmp_path)
    out = asyncio.run(jobs.ask(mid, pid, AskRequest(question="Why?", momentId="m1", language="en")))
    assert out.source == "template" and out.citations


# --- pipeline with the coach on ---


def test_pipeline_runs_selecting_and_explaining(analysed, tmp_path, monkeypatch):
    mid, pid = analysed
    monkeypatch.setattr(settings, "llm_enabled", True)
    seen_status: list[str] = []
    real_set = repo.set_status

    def spy(match_id, status, **kw):
        seen_status.append(getattr(status, "value", status))
        return real_set(match_id, status, **kw)

    monkeypatch.setattr(repo, "set_status", spy)
    jobs, _ = jobs_with([picks_json(mid, pid), good_text(mid, pid), good_text(mid, pid)], tmp_path)
    monkeypatch.setattr(pipe_mod, "coach_jobs", lambda _repo: jobs)

    pipe_mod.pipeline.select_player(mid, pid, language="en", run_async=False)
    assert seen_status == ["detecting", "selecting", "explaining", "complete"]
    assert [m.source for m in repo.analysis.moments(mid, pid)] == ["agent", "agent"]
    assert repo.analysis.explanation(mid, pid, "m1", "en").source == "agent"
    stages = {s.id: s for s in pipe_mod.pipeline.status_response(mid).stages}
    assert stages[MatchStatus.selecting].detail == "2 moments picked by the coach"
    assert stages[MatchStatus.explaining].state == "done"


def test_pipeline_without_model_hides_coach_stages(analysed):
    mid, _ = analysed
    ids_ = [s.id for s in pipe_mod.pipeline.status_response(mid).stages]
    assert MatchStatus.selecting not in ids_ and ids_[-1] == MatchStatus.detecting


def test_explanation_can_cite_knowledge_it_looked_up(analysed, tmp_path):
    mid, pid = analysed
    from app.rag.index import default_index

    passage = default_index().search("moving while shooting", k=1)[0]
    i = ids(mid, pid)
    text = (
        f"You fired 1 of 1 shots while moving at 206 u/s in Mid [{i['shot_while_moving']}]. "
        f"Stop before you shoot, because running shots spread widely [{passage.id}]."
    )
    jobs, _ = jobs_with(
        [ChatResult(content="", tool_calls=[call("search_knowledge", {"query": "moving while shooting", "k": 1})]), text],
        tmp_path,
    )
    expl = asyncio.run(jobs.explain(mid, pid, "m1", "en"))
    assert expl.source == "agent", expl.verifier_errors
    assert passage.id in expl.citations


def test_citing_knowledge_that_was_not_looked_up_fails(analysed, tmp_path):
    mid, pid = analysed
    i = ids(mid, pid)
    text = f"You fired while moving in Mid [{i['shot_while_moving']}]. Stop first [K3]."
    jobs, _ = jobs_with([text, text], tmp_path)
    expl = asyncio.run(jobs.explain(mid, pid, "m1", "en"))
    assert expl.source == "template" and any("K3" in e for e in expl.verifier_errors)
