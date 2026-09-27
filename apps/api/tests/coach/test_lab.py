"""Doc 29 R01 (system status) and R03 (Lab, Runs: coach traces)."""

from __future__ import annotations

import httpx
from fastapi.testclient import TestClient

from app.coach.agent import TraceWriter
from app.coach.backends import InProcessTools
from app.coach.jobs import CoachJobs
from app.coach.llm_client import ChatResult, MockLLMClient, call
from app.core.config import settings
from app.main import app
from app.processing import pipeline as pipe_mod
from app.repositories.matches import repo
from app.services import system

client = TestClient(app)


def models_response(*ids: str):
    return lambda url: httpx.Response(200, json={"data": [{"id": i} for i in ids]})


def test_llm_check_catches_the_wrong_model_on_the_port(monkeypatch):
    monkeypatch.setattr(settings, "llm_enabled", True)
    monkeypatch.setattr(settings, "llm_model", "gemma-4-12b-it-Q6_K")
    assert system.llm_check(system.served_models(models_response("gemma-4-12b-it-Q6_K.gguf"))).state == "ok"
    wrong = system.llm_check(system.served_models(models_response("Qwen3-14B-Q4_K_M.gguf")))
    assert wrong.state == "problem" and "Qwen3-14B" in wrong.detail
    down = system.llm_check(system.served_models(lambda url: (_ for _ in ()).throw(httpx.ConnectError("refused"))))
    assert down.state == "problem" and "llama-server" in down.detail


def test_system_route_with_the_model_off_lists_the_tools(monkeypatch, tmp_path):
    monkeypatch.setattr(settings, "llm_enabled", False)
    monkeypatch.setattr(settings, "csdm_enabled", False)
    monkeypatch.setattr(settings, "traces_dir", tmp_path / "traces")
    r = client.get("/system")
    assert r.status_code == 200
    body = r.json()
    checks = {c["name"]: c["state"] for c in body["checks"]}
    assert checks["llm"] == "off" and checks["csdm"] == "off" and checks["mcp"] == "ok"
    assert "get_player_history" in body["mcpTools"] and body["ok"] is True


def test_lab_is_off_by_default():
    assert client.get("/lab/traces").status_code == 404


def test_lab_lists_and_opens_an_ask_trace(analysed, tmp_path, monkeypatch):
    mid, pid = analysed
    good = next(f.id for f in repo.analysis.findings(mid, pid) if f.kind == "good")
    llm = MockLLMClient(
        [
            ChatResult(content="", tool_calls=[call("get_finding", {"finding_id": good})]),
            f"You opened round 2 in Mid with the ak47 [{good}].",
        ]
    )
    jobs = CoachJobs(repo, llm=llm, tools_factory=InProcessTools, traces=TraceWriter(tmp_path / "traces"))
    monkeypatch.setattr(pipe_mod, "coach_jobs", lambda _repo: jobs)
    monkeypatch.setattr(settings, "lab_enabled", True)
    client.post(f"/matches/{mid}/players/{pid}/ask", json={"question": "What went well?", "round": 2})

    page = client.get("/lab/traces", params={"job": "ask"}).json()
    assert page["total"] == 1
    row = page["items"][0]
    assert row["matchId"] == mid and row["source"] == "agent" and row["verifierOk"] is True and row["toolCalls"] == 1
    assert client.get("/lab/traces", params={"job": "explain"}).json()["total"] == 0

    detail = client.get(f"/lab/traces/{row['id']}").json()
    assert detail["steps"][0]["tool"] == "get_finding" and good in detail["output"]
    assert client.get("/lab/traces/2000-01-01:1").status_code == 404
    assert client.get("/lab/traces/../x:1").status_code == 404


def test_features_and_coached_players(analysed, monkeypatch):
    mid, pid = analysed
    monkeypatch.setattr(settings, "lab_enabled", True)
    assert client.get("/features").json()["lab"] is True
    players = client.get("/players").json()
    assert players[0]["id"] == pid and players[0]["matches"] == 1 and players[0]["name"] != pid
