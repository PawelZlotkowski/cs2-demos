"""T40: POV clips of the coached player's moments, recorded with a stubbed CS Demo Manager."""

from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.processing import moment_clips
from app.processing.moment_clips import MomentClipRecorder, moment_window, queue_moment_clips
from app.repositories.matches import repo

client = TestClient(app)


def base(mid, pid) -> str:
    return f"/matches/{mid}/players/{pid}"


@pytest.fixture()
def recording(analysed, tmp_path, monkeypatch):
    """Recording on, with the CS:DM CLI replaced by a recorder that writes a file per call."""
    monkeypatch.setattr(settings, "csdm_enabled", True)
    monkeypatch.setattr(settings, "csdm_mode", "csdm")
    monkeypatch.setattr(settings, "work_dir", tmp_path / "work")
    mid, _pid = analysed
    (tmp_path / "work").mkdir(exist_ok=True)
    (tmp_path / "work" / f"{mid}.dem").write_bytes(b"PBDEMS2\x00")
    calls: list[tuple] = []

    def fake_record(dem: Path, start: int, end: int, focus: str | None, out: Path) -> None:
        calls.append((start, end, focus))
        out.parent.mkdir(parents=True, exist_ok=True)
        # CS:DM names its own output; the recorder must still find it
        (out.parent / "csdm-output.mp4").write_bytes(b"\x00\x00\x00\x18ftypmp42")
        (out.parent / "csdm-output.mp4").rename(out)

    monkeypatch.setattr(moment_clips, "csdm_analyze", lambda dem: calls.append(("analyze",)))
    monkeypatch.setattr(moment_clips, "csdm_record", fake_record)
    # Run the background worker inline
    monkeypatch.setattr(moment_clips._video_executor, "submit", lambda fn, *a: fn(*a))
    return calls


def test_every_moment_gets_a_padded_window(analysed):
    mid, pid = analysed
    moments = repo.analysis.moments(mid, pid)
    assert moments
    clips = client.get(f"{base(mid, pid)}/clips").json()
    by_moment = {c["momentId"]: c for c in clips}
    assert set(by_moment) == {m.id for m in moments}
    for m in moments:
        c = by_moment[m.id]
        assert c["round"] == m.round
        assert c["t0"] <= m.t0 and c["t1"] >= min(m.t1, c["t1"]) and c["t1"] - c["t0"] <= 60
    # Recording is off by default: queued jobs read as skipped with a reason, never as ready
    assert all(c["status"] == "skipped" and "RR_CSDM_ENABLED" in c["error"] for c in clips)


def test_queueing_again_does_not_duplicate(analysed):
    mid, pid = analysed
    n = len(client.get(f"{base(mid, pid)}/clips").json())
    queue_moment_clips(mid, pid)
    assert len(client.get(f"{base(mid, pid)}/clips").json()) == n


def test_window_is_clamped_to_the_round_and_sixty_seconds():
    from app.models.contracts import SelectedMoment

    m = SelectedMoment(id="m1", round=1, t0=1.0, t1=90.0, findingIds=[], kind="good", pickedBecause="x")
    assert moment_window(m, 100.0) == (0.0, 60.0)
    assert moment_window(m, 50.0) == (0.0, 50.0)


def test_recorder_records_from_the_players_view_and_serves_the_file(recording, analysed):
    mid, pid = analysed
    MomentClipRecorder(repo).process(mid, pid)
    clips = client.get(f"{base(mid, pid)}/clips").json()
    assert clips and all(c["status"] == "ready" for c in clips)
    assert recording[0] == ("analyze",)
    record = repo.get(mid)
    rate = record["match"]["tickRate"]
    first = clips[0]
    row = next(r for r in record["rounds"] if r["number"] == first["round"])
    start, end, focus = recording[1]
    assert focus == pid
    assert start == row["startTick"] + int(first["t0"] * rate)
    assert end == row["startTick"] + int(first["t1"] * rate)

    r = client.get(first["url"])
    assert r.status_code == 200 and r.headers["content-type"].startswith("video/mp4")
    assert client.get(f"{base(mid, pid)}/clips/c999.mp4").status_code == 404


def test_failed_clip_reports_why_and_can_be_retried(recording, analysed, monkeypatch):
    mid, pid = analysed

    def broken(*_a):
        raise RuntimeError("Steam is not running. Start Steam (signed in), then retry recording.")

    monkeypatch.setattr(moment_clips, "csdm_record", broken)
    MomentClipRecorder(repo).process(mid, pid)
    clips = client.get(f"{base(mid, pid)}/clips").json()
    assert all(c["status"] == "failed" and "Steam" in c["error"] and c["url"] is None for c in clips)

    def works(dem, start, end, focus, out: Path) -> None:
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_bytes(b"mp4data")

    monkeypatch.setattr(moment_clips, "csdm_record", works)
    r = client.post(f"{base(mid, pid)}/clips/{clips[0]['id']}/retry")
    assert r.status_code == 200 and r.json()["status"] == "ready"


def test_missing_demo_fails_honestly(recording, analysed, tmp_path):
    mid, pid = analysed
    (tmp_path / "work" / f"{mid}.dem").unlink()
    MomentClipRecorder(repo).process(mid, pid)
    clips = client.get(f"{base(mid, pid)}/clips").json()
    assert all(c["status"] == "failed" and "missing" in c["error"] for c in clips)


def test_selecting_a_player_with_recording_on_records_the_moments(recording, analysed):
    mid, pid = analysed
    from app.processing import pipeline as pipe_mod

    pipe_mod.pipeline.select_player(mid, pid, run_async=False)
    clips = client.get(f"{base(mid, pid)}/clips").json()
    assert clips and all(c["status"] == "ready" for c in clips if c["momentId"])
