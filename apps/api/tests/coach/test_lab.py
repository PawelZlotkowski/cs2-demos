"""Doc 29 R01 (system status) and R03 (Lab, Runs: coach traces)."""

from __future__ import annotations

import hashlib
import json

import httpx
from fastapi.testclient import TestClient

from app.coach.agent import TraceWriter
from app.coach.backends import InProcessTools
from app.coach.jobs import CoachJobs
from app.coach.llm_client import ChatResult, MockLLMClient, call
from app.core.config import settings
from app.main import app
from app.models.contracts import DatasetExample, MomentPicks, SelectedMoment
from app.processing import pipeline as pipe_mod
from app.repositories.matches import repo
from app.services import dataset, labels, system

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


def _moment(i, rnd, t0, t1):
    return SelectedMoment.model_validate({"id": f"m{i}", "round": rnd, "t0": t0, "t1": t1, "kind": "mistake",
                                          "findingIds": ["F1"], "pickedBecause": "x", "source": "agent"})


def _picks(rows):
    return MomentPicks.model_validate({"matchId": "M", "playerId": "P", "labeller": "a",
                                       "picks": [{"round": r, "t0": t0, "t1": t1, "kind": "mistake"} for r, t0, t1 in rows]})


def test_moment_pick_scores_match_one_to_one():
    one_long = labels.score_picks(_picks([(5, 0, 60)]), [_moment(1, 5, 5, 15), _moment(2, 5, 30, 45)])
    assert (one_long["overlap"], one_long["ndcgAt6"]) == (1, 1.0)
    twice = labels.score_picks(_picks([(5, 10, 20), (5, 10, 20)]), [_moment(1, 5, 12, 18), _moment(2, 7, 1, 5)])
    assert (twice["humanPicks"], twice["overlap"], twice["ndcgAt6"]) == (1, 1, 1.0)
    # The long pick moves to the second coach pick, so the first keeps the short one
    both = labels.score_picks(_picks([(5, 0, 60), (5, 10, 12)]), [_moment(1, 5, 5, 15), _moment(2, 5, 30, 45)])
    assert (both["overlap"], both["ndcgAt6"]) == (2, 1.0)
    none = labels.score_picks(_picks([]), [_moment(1, 5, 12, 18)])
    assert none["overlapAt6"] is None and none["ndcgAt6"] is None


def test_lab_summary_reads_labeller_exports(tmp_path, monkeypatch):
    monkeypatch.setattr(settings, "lab_enabled", True)
    monkeypatch.setattr(settings, "labels_dir", tmp_path / "labels")
    monkeypatch.setattr(settings, "corpus_manifest", None)
    (tmp_path / "labels").mkdir()
    label = {"status": "complete", "verdict": "correct", "matchId": "demo-" + "a" * 64, "playerId": "7", "snapshotId": "s",
             "round": 3, "labeller": "ana", "finding": {"id": "F1", "detector": "dry_peek", "round": 3, "t": 20.0}, "footage": {}}
    export = {"format": "round-reviewer-notes-v1", "labeller": "ana", "exportedAt": "2026-11-20", "demos": {},
              "labels": [{"kind": "clip", "revision": 1, "savedAt": "2026-11-20T01:00", "label": label}]}
    (tmp_path / "labels" / "ana-notes.json").write_text(json.dumps(export), encoding="utf-8")
    body = client.get("/lab/labels/summary").json()
    assert body["labellers"] == {"ana": 1} and body["rounds"] == 1
    assert body["score"]["dry_peek"]["correct"] == 1 and "split unknown" in body["bySplit"]


def test_dataset_edit_numbers_and_manifest_split(analysed, tmp_path, monkeypatch):
    ex = DatasetExample(id="x", job="explain", split="train", prompt="Finding F14 at t:15.5, 3 alive", output="You died [F14].")
    assert dataset.edit_problem(ex, "You died with 3 alive [F14].") is None
    assert dataset.edit_problem(ex, "You died 4 times [F14].") and dataset.edit_problem(ex, "You died after 5 s [F14].")

    monkeypatch.setattr(settings, "lab_enabled", True)
    monkeypatch.setattr(settings, "traces_dir", tmp_path / "tr")
    monkeypatch.setattr(settings, "work_dir", tmp_path / "work")
    (tmp_path / "work").mkdir()
    (tmp_path / "work" / "m-man.dem").write_bytes(b"demo in the manifest")
    manifest = tmp_path / "manifest.csv"
    manifest.write_text(f"demoSha256,split\n{hashlib.sha256(b'demo in the manifest').hexdigest()},test\n", encoding="utf-8")
    monkeypatch.setattr(settings, "corpus_manifest", manifest)
    run = {"output": "Text [F1].", "messages": [{"role": "user", "content": "Explain"}, {"role": "assistant", "content": "Text [F1]."}]}
    (tmp_path / "tr").mkdir()
    (tmp_path / "tr" / "2026-11-23.jsonl").write_text("".join(
        json.dumps({"job": "explain", "matchId": m, "source": "agent", "runs": [run]}) + "\n" for m in ("m-man", "m-x")))
    split = {e.match_id: e.split for e, _m in dataset.examples()}
    assert split == {"m-man": "test", "m-x": dataset.split_of("m-x")}  # the hash would put m-man in train
    for trace_id in ("2026-11-23:1", "2026-11-23:2"):
        assert client.put(f"/lab/dataset/{trace_id}", json={"verdict": "accept"}).status_code == 204
    dataset.export(tmp_path / "ds")
    test_rows = [json.loads(x) for x in (tmp_path / "ds" / "test.jsonl").read_text().splitlines()]
    hashed = [json.loads(x) for s in ("train", "val") for x in (tmp_path / "ds" / f"{s}.jsonl").read_text().splitlines()]
    assert [r["id"] for r in test_rows] == ["2026-11-23:1"] and "splitByHash" not in test_rows[0]
    assert [r.get("splitByHash") for r in hashed] == [True]


def test_features_and_coached_players(analysed, monkeypatch):
    mid, pid = analysed
    monkeypatch.setattr(settings, "lab_enabled", True)
    assert client.get("/features").json()["lab"] is True
    players = client.get("/players").json()
    assert players[0]["id"] == pid and players[0]["matches"] == 1 and players[0]["name"] != pid
