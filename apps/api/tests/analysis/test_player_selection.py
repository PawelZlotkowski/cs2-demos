"""T13: awaiting_player state, POST /matches/{id}/player, findings routes."""

from __future__ import annotations

import pytest
from fastapi.testclient import TestClient

from app.main import app
from app.processing import pipeline as pipe_mod
from app.processing.normalize import normalize_parsed
from app.repositories.matches import repo
from tests.analysis import synthetic_demo as sd


@pytest.fixture()
def parsed_match(tmp_path, monkeypatch):
    monkeypatch.setattr(repo, "upload_dir", tmp_path / "uploads")
    monkeypatch.setattr(repo, "matches_dir", tmp_path / "matches")
    repo.upload_dir.mkdir(parents=True, exist_ok=True)
    repo.matches_dir.mkdir(parents=True, exist_ok=True)
    # Run background jobs inline so the test sees the final state
    monkeypatch.setattr(pipe_mod._executor, "submit", lambda fn, *a: fn(*a))
    record = repo.create_upload("synthetic.dem", b"PBDEMS2\x00")
    mid = record["id"]
    normalised = normalize_parsed(mid, sd.build())
    normalised["perf"] = {}
    repo.persist_replay(mid, normalised)
    repo.set_status(mid, pipe_mod.MatchStatus.awaiting_player)
    return TestClient(app), mid


def test_radar_loads_before_player_selection(parsed_match):
    client, mid = parsed_match
    status = client.get(f"/matches/{mid}/status").json()
    assert status["status"] == "awaiting_player"
    active = [s for s in status["stages"] if s["state"] == "active"]
    assert [s["id"] for s in active] == ["awaiting_player"]
    rounds = client.get(f"/matches/{mid}/rounds").json()
    assert len(rounds) == 2
    replay = client.get(f"/matches/{mid}/rounds/r1/replay")
    assert replay.status_code == 200


def test_analysis_perf_is_recorded(parsed_match):
    _, mid = parsed_match
    perf = repo.get(mid)["perf"]
    assert perf["analysisBytes"] > 0 and perf["replayBytes"] > 0


def test_unknown_player_is_rejected(parsed_match):
    client, mid = parsed_match
    r = client.post(f"/matches/{mid}/player", json={"playerId": "123"})
    assert r.status_code == 400
    assert client.get(f"/matches/{mid}/status").json()["status"] == "awaiting_player"


def test_choose_player_runs_detectors(parsed_match):
    client, mid = parsed_match
    pid = sd.sid(sd.T_IDS[0])
    assert client.get(f"/matches/{mid}/players/{pid}/findings").status_code == 404

    r = client.post(f"/matches/{mid}/player", json={"playerId": pid})
    assert r.status_code == 200
    assert r.json()["status"] == "complete"
    assert client.get(f"/matches/{mid}").json()["selectedPlayerId"] == pid

    findings = client.get(f"/matches/{mid}/players/{pid}/findings").json()
    assert findings and findings[0]["id"] == "F1"
    assert {"id", "detector", "kind", "round", "t", "tick", "playerId", "otherIds", "zone", "severity", "evidence", "summary", "template"} == set(findings[0])
    r1 = client.get(f"/matches/{mid}/players/{pid}/findings", params={"round": 1, "kind": "mistake"}).json()
    assert r1 and all(f["round"] == 1 and f["kind"] == "mistake" for f in r1)
    stats = client.get(f"/matches/{mid}/players/{pid}/round-stats").json()
    assert [s["round"] for s in stats] == [1, 2]
    moments = client.get(f"/matches/{mid}/players/{pid}/moments").json()
    assert moments and moments[0]["source"] == "ranker"

    # A second player can be chosen later; rounds keep loading throughout
    other = sd.sid(sd.CT_IDS[0])
    assert client.post(f"/matches/{mid}/player", json={"playerId": other}).json()["status"] == "complete"
    assert client.get(f"/matches/{mid}/players/{other}/round-stats").status_code == 200
    assert len(client.get(f"/matches/{mid}/rounds").json()) == 2


def test_analysis_failure_returns_to_player_selection(parsed_match, monkeypatch):
    client, mid = parsed_match

    def boom(*_a, **_k):
        raise RuntimeError("detector bug")

    monkeypatch.setattr(pipe_mod, "analyse_player", boom)
    body = client.post(f"/matches/{mid}/player", json={"playerId": sd.sid(sd.T_IDS[0])}).json()
    assert body["status"] == "awaiting_player"
    assert "Could not analyse" in (body["error"] or "")
    assert client.get(f"/matches/{mid}/rounds/r1/replay").status_code == 200


def test_sample_match_cannot_be_analysed(parsed_match):
    client, _ = parsed_match
    r = client.post(f"/matches/{repo.sample_id()}/player", json={"playerId": "x"})
    assert r.status_code == 409


def test_restored_status_after_restart(parsed_match):
    _, mid = parsed_match
    match_dir = repo.matches_dir / mid
    assert repo._restored_status(match_dir, mid).value == "awaiting_player"
    pipe_mod.pipeline.select_player(mid, sd.sid(sd.T_IDS[0]), run_async=False)
    assert repo._restored_status(match_dir, mid).value == "complete"
    (match_dir / "analysis.json").unlink()
    assert repo._restored_status(match_dir, mid).value == "complete"  # legacy match
