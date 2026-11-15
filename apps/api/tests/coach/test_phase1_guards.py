"""Regression boundaries for Phase 1; no live model or recorder."""
import sqlite3

from fastapi.testclient import TestClient

from app.coach import tools
from app.core.config import settings
from app.main import app
from app.models.contracts import MomentExplanation
from app.repositories.matches import repo

client = TestClient(app, base_url="http://localhost:8000", client=("127.0.0.1", 50000))


def test_disabled_freeform_rebuilds_cached_agent_explanation(analysed, monkeypatch):
    mid, pid = analysed
    repo.analysis.save_explanation(mid, pid, MomentExplanation(
        target="m1", lang="en", text="Unsupported old model claim.", citations=[], source="agent"))
    monkeypatch.setattr(settings, "coach_freeform_enabled", False)
    result = client.get(f"/matches/{mid}/players/{pid}/moments/m1/explanation")
    assert result.status_code == 200
    assert result.json()["source"] == "template"
    assert "Unsupported old model claim" not in result.json()["text"]
    assert repo.analysis.explanation(mid, pid, "m1", "en").source == "template"


def test_history_excludes_other_owners_with_same_steam_player(analysed):
    mid, pid = analysed
    other = repo.create_upload("private.dem", b"fixture", owner_id="another-owner")["id"]
    with sqlite3.connect(repo.analysis.db_path) as connection:
        connection.execute("INSERT INTO round_stats SELECT ?, player_id, round, json FROM round_stats WHERE match_id = ?",
                           (other, mid))
        connection.execute("INSERT INTO findings SELECT ?, player_id, finding_id, round, t, kind, detector, severity, json FROM findings WHERE match_id = ?",
                           (other, mid))
    assert len(repo.analysis.player_history(pid)) == 2
    assert tools.get_player_history(player_id=pid)["matches"] == 1
    assert tools.get_player_history(player_id=pid, match_id=mid)["matches"] == 0


def test_model_clip_request_cannot_go_past_round_end(analysed):
    mid, pid = analysed
    duration = tools.data.match(mid).round(1).duration
    result = tools.request_clip(match_id=mid, player_id=pid, round=1, t0=duration - 1, t1=duration + 1)
    assert "inside round" in result["error"]


def test_on_demand_explanation_clip_is_clamped_to_round(analysed, monkeypatch):
    mid, pid = analysed
    duration = repo.get(mid)["rounds"][0]["durationSec"]
    lead = repo.analysis.findings(mid, pid, round_no=1)[0].model_copy(update={"t": duration - 0.1, "severity": 1.0})
    original = repo.analysis.findings
    def findings(match_id, player_id, **filters):
        return [lead] if filters.get("round_no") == 1 else original(match_id, player_id, **filters)
    monkeypatch.setattr(repo.analysis, "findings", findings)
    result = client.post(f"/matches/{mid}/players/{pid}/rounds/1/explain", json={})
    assert result.status_code == 200
    last = repo.analysis.clip_jobs(mid, pid)[-1]
    assert 0 <= last["t0"] < last["t1"] <= duration
