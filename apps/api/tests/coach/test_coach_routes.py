"""T26–T27 routes: moment explanation, on-demand round, Ask over SSE."""

from __future__ import annotations

import json

from fastapi.testclient import TestClient

from app.coach.agent import TraceWriter
from app.coach.backends import InProcessTools
from app.coach.jobs import CoachJobs
from app.coach.llm_client import ChatResult, MockLLMClient, call
from app.main import app
from app.processing import pipeline as pipe_mod
from app.repositories.matches import repo

client = TestClient(app)


def base(mid, pid) -> str:
    return f"/matches/{mid}/players/{pid}"


def sse(text: str) -> list[tuple[str, dict]]:
    events = []
    for block in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    return events


def test_moment_explanation_without_model_is_templated_and_cached(analysed):
    mid, pid = analysed
    r = client.get(f"{base(mid, pid)}/moments/m1/explanation", params={"lang": "pl"})
    assert r.status_code == 200
    body = r.json()
    assert body["source"] == "template" and body["lang"] == "pl" and body["citations"]
    assert repo.analysis.explanation(mid, pid, "m1", "pl") is not None
    assert client.get(f"{base(mid, pid)}/moments/m9/explanation").status_code == 404
    assert client.get(f"{base(mid, pid)}/moments/m1/explanation", params={"lang": "de"}).status_code == 422


def test_round_explanation(analysed):
    mid, pid = analysed
    r = client.post(f"{base(mid, pid)}/rounds/2/explain", json={"language": "nl"})
    assert r.status_code == 200 and r.json()["target"] == "r2" and r.json()["lang"] == "nl"
    assert client.post(f"{base(mid, pid)}/rounds/30/explain", json={}).status_code == 404


def test_ask_streams_steps_then_the_verified_answer(analysed, tmp_path, monkeypatch):
    mid, pid = analysed
    good = next(f.id for f in repo.analysis.findings(mid, pid) if f.kind == "good")
    llm = MockLLMClient(
        [
            ChatResult(content="", tool_calls=[call("get_finding", {"finding_id": good})]),
            f"You opened round 2 in Mid with the ak47 [{good}].",
        ]
    )
    jobs = CoachJobs(repo, llm=llm, tools_factory=InProcessTools, traces=TraceWriter(tmp_path))
    monkeypatch.setattr(pipe_mod, "coach_jobs", lambda _repo: jobs)
    r = client.post(f"{base(mid, pid)}/ask", json={"question": "What went well?", "round": 2, "language": "en"})
    assert r.status_code == 200 and r.headers["content-type"].startswith("text/event-stream")
    events = sse(r.text)
    assert [e for e, _ in events] == ["step", "answer"]
    assert events[0][1]["tool"] == "get_finding"
    answer = events[1][1]
    assert answer["verified"] is True and answer["citations"] == [good]


def test_ask_without_model_answers_from_templates(analysed):
    mid, pid = analysed
    r = client.post(f"{base(mid, pid)}/ask", json={"question": "Why did I die?", "momentId": "m1"})
    events = sse(r.text)
    assert events[-1][0] == "answer" and events[-1][1]["source"] == "template"


def test_select_player_takes_a_language(analysed):
    mid, pid = analysed
    r = client.post(f"/matches/{mid}/player", json={"playerId": pid, "language": "pl"})
    assert r.status_code == 200
    assert client.post(f"/matches/{mid}/player", json={"playerId": pid, "language": "de"}).status_code == 422


def test_round_explain_queues_a_clip_and_lists_it(analysed):
    mid, pid = analysed
    before = client.get(f"{base(mid, pid)}/clips").json()
    client.post(f"{base(mid, pid)}/rounds/1/explain", json={})
    jobs = client.get(f"{base(mid, pid)}/clips").json()
    assert len(jobs) == len(before) + 1
    extra = jobs[-1]
    # Recording is off in tests, so the queued job reads as skipped with a reason
    assert extra["round"] == 1 and extra["momentId"] is None and extra["status"] == "skipped" and extra["error"]


def test_knowledge_passage_route(analysed):
    r = client.get("/knowledge/K1")
    assert r.status_code == 200 and r.json()["id"] == "K1" and r.json()["text"]
    assert client.get("/knowledge/K999").status_code == 404
