"""An analysed synthetic match (no demo, no model) for the coach tests."""

from __future__ import annotations

import pytest

from app.coach import tools
from app.core.config import settings
from app.processing import pipeline as pipe_mod
from app.processing.normalize import normalize_parsed
from app.repositories.analysis import AnalysisRepository
from app.repositories.matches import repo
from tests.analysis import synthetic_demo as sd

PLAYER = sd.sid(sd.T_IDS[0])


@pytest.fixture()
def analysed(tmp_path, monkeypatch):
    """(match_id, player_id) with findings, round stats and ranker moments stored."""
    # Own analysis DB, so player history only sees this test's match
    data_dir = tmp_path / "data"
    data_dir.mkdir()
    monkeypatch.setattr(repo, "analysis", AnalysisRepository(data_dir / "matches.db"))
    monkeypatch.setattr(repo, "upload_dir", tmp_path / "uploads")
    monkeypatch.setattr(repo, "matches_dir", tmp_path / "matches")
    repo.upload_dir.mkdir(parents=True, exist_ok=True)
    repo.matches_dir.mkdir(parents=True, exist_ok=True)
    monkeypatch.setattr(pipe_mod._executor, "submit", lambda fn, *a: fn(*a))
    monkeypatch.setattr(settings, "llm_enabled", False)
    monkeypatch.setattr(settings, "traces_dir", tmp_path / "traces")
    record = repo.create_upload("synthetic.dem", b"PBDEMS2\x00")
    mid = record["id"]
    normalised = normalize_parsed(mid, sd.build())
    normalised["perf"] = {}
    repo.persist_replay(mid, normalised)
    repo.set_status(mid, pipe_mod.MatchStatus.awaiting_player)
    pipe_mod.pipeline.select_player(mid, PLAYER, run_async=False)
    tools.use_repository(repo)
    return mid, PLAYER
