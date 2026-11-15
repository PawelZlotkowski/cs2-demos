"""T40: POV clips of the coached player's moments, recorded with a stubbed CS Demo Manager."""

from __future__ import annotations

from concurrent.futures import Future
from pathlib import Path
import sqlite3

import pytest
from fastapi.testclient import TestClient

from app.core.config import settings
from app.main import app
from app.processing import moment_clips
from app.processing.moment_clips import MomentClipRecorder, moment_window, queue_moment_clips
from app.processing.bounded_executor import QueueFullError
from app.repositories.matches import repo
from app.repositories.analysis import AnalysisRepository

client = TestClient(app, base_url="http://localhost:8000", client=("127.0.0.1", 50000))


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
    monkeypatch.setattr(moment_clips, "validate_recording", lambda *_a, **_kw: {"durationSec": 10.0})
    # Run the background worker inline
    def inline(fn, *a):
        done: Future = Future()
        done.set_result(fn(*a))
        return done

    monkeypatch.setattr(moment_clips._video_executor, "submit", inline)
    return calls


def test_every_moment_gets_its_window_with_a_margin(analysed):
    mid, pid = analysed
    moments = repo.analysis.moments(mid, pid)
    assert moments
    clips = client.get(f"{base(mid, pid)}/clips").json()
    by_moment = {c["momentId"]: c for c in clips}
    assert set(by_moment) == {m.id for m in moments}
    for m in moments:
        c = by_moment[m.id]
        assert c["round"] == m.round
        # The picked window plus 1 s before and 3 s after, so the play is not cut at the edges
        assert c["t0"] == round(max(0.0, m.t0 - 1.0), 1)
        assert round(m.t1, 1) < c["t1"] <= round(m.t1 + 3.0, 1)
    # Recording is off by default: queued jobs read as skipped with a reason, never as ready
    assert all(c["status"] == "skipped" and c["error"] == moment_clips.DISABLED for c in clips)


def test_queueing_again_does_not_duplicate(analysed):
    mid, pid = analysed
    n = len(client.get(f"{base(mid, pid)}/clips").json())
    queue_moment_clips(mid, pid)
    assert len(client.get(f"{base(mid, pid)}/clips").json()) == n


def test_window_is_clamped_to_the_round_and_sixty_seconds(monkeypatch):
    from app.models.contracts import SelectedMoment

    monkeypatch.setattr(settings, "csdm_moment_pad_before", 3.0)
    m = SelectedMoment(id="m1", round=1, t0=1.0, t1=90.0, findingIds=[], kind="good", pickedBecause="x")
    assert moment_window(m, 100.0) == (0.0, 60.0)
    assert moment_window(m, 50.0) == (0.0, 50.0)
    short = SelectedMoment(id="m2", round=1, t0=10.0, t1=18.0, findingIds=[], kind="good", pickedBecause="x")
    assert moment_window(short, 100.0) == (7.0, 21.0)
    assert moment_window(short, 0.0) == (0.0, 0.0)


def test_recorder_records_from_the_players_view_and_serves_the_file(recording, analysed):
    mid, pid = analysed
    MomentClipRecorder(repo).process(mid, pid)
    clips = client.get(f"{base(mid, pid)}/clips").json()
    assert clips and all(c["status"] == "ready" for c in clips)
    assert all(c["provenance"] == "real" for c in clips)
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
    assert r.json()["provenance"] == "real"


def test_missing_demo_fails_honestly(recording, analysed, tmp_path):
    mid, pid = analysed
    (tmp_path / "work" / f"{mid}.dem").unlink()
    MomentClipRecorder(repo).process(mid, pid)
    clips = client.get(f"{base(mid, pid)}/clips").json()
    assert all(c["status"] == "failed" and "missing" in c["error"] for c in clips)


def test_clips_are_recorded_before_the_analysis_opens(recording, analysed, monkeypatch):
    mid, pid = analysed
    from app.processing import pipeline as pipe_mod

    seen: list[tuple[str, list[str]]] = []
    real_set_status = repo.set_status

    def spy(match_id, status, **kw):
        # What the clips looked like when each stage started
        states = [c.status.value for c in moment_clips.list_moment_clips(match_id, pid) if c.moment_id]
        seen.append((status.value, states))
        return real_set_status(match_id, status, **kw)

    monkeypatch.setattr(repo, "set_status", spy)
    pipe_mod.pipeline.select_player(mid, pid, run_async=False)
    order = [s for s, _ in seen]
    assert order.index("recording") < order.index("complete")
    at_complete = dict(seen)["complete"]
    assert at_complete and all(s == "ready" for s in at_complete)

    status = client.get(f"/matches/{mid}/status").json()
    stage = next(s for s in status["stages"] if s["id"] == "recording")
    assert stage["state"] == "done" and stage["detail"].startswith(f"{len(at_complete)} of {len(at_complete)} clips")


def test_stub_clips_are_skipped_and_marked_synthetic(recording, analysed, monkeypatch):
    mid, pid = analysed
    monkeypatch.setattr(settings, "csdm_mode", "stub")
    MomentClipRecorder(repo).process(mid, pid)
    clips = client.get(f"{base(mid, pid)}/clips").json()
    assert clips and all(c["status"] == "skipped" for c in clips)
    assert all(c["provenance"] == "synthetic" and c["url"] is None for c in clips)


def test_legacy_ready_moment_without_capture_marker_is_failed(analysed):
    mid, pid = analysed
    job = repo.analysis.clip_jobs(mid, pid)[0]
    repo.analysis.set_clip_status(job["clipJobId"], "ready")
    out = moment_clips.moment_clip_file(mid, job["clipJobId"], repo)
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_bytes(b"old file with no durable capture marker")

    clip = next(c for c in moment_clips.list_moment_clips(mid, pid) if c.id == job["clipJobId"])

    assert clip.status == "failed"
    assert clip.provenance is None and clip.url is None
    assert "re-record" in clip.error
    refreshed = next(j for j in repo.analysis.clip_jobs(mid, pid) if j["clipJobId"] == job["clipJobId"])
    assert refreshed["status"] == "failed" and refreshed["provenance"] is None


def test_clip_job_provenance_column_migrates_and_round_trips(tmp_path):
    db_path = tmp_path / "old-analysis.sqlite"
    with sqlite3.connect(db_path) as conn:
        conn.execute(
            "CREATE TABLE clip_jobs (id INTEGER PRIMARY KEY AUTOINCREMENT, match_id TEXT NOT NULL, "
            "player_id TEXT NOT NULL, round INTEGER NOT NULL, t0 REAL NOT NULL, t1 REAL NOT NULL, "
            "status TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(match_id, player_id, round, t0, t1))"
        )

    analysis = AnalysisRepository(db_path)
    queued = analysis.queue_clip("match-a", "player-a", 2, 1.0, 4.0)
    analysis.set_clip_status(queued["clipJobId"], "ready", provenance="real")

    job = analysis.clip_jobs("match-a", "player-a")[0]
    assert job["provenance"] == "real"


def test_moment_executor_full_releases_claim_and_leaves_job_queued(recording, analysed, monkeypatch):
    mid, pid = analysed

    def full(*_args, **_kwargs):
        raise QueueFullError("Processing queue is full")

    monkeypatch.setattr(moment_clips._video_executor, "submit", full)
    MomentClipRecorder(repo).enqueue(mid, pid)

    assert (mid, pid) not in moment_clips._running
    assert all(job["status"] == "queued" for job in repo.analysis.clip_jobs(mid, pid))


def test_record_now_propagates_worker_errors(recording, analysed, monkeypatch):
    mid, pid = analysed
    recorder = MomentClipRecorder(repo)

    def fail(_match_id, _player_id):
        raise RuntimeError("record worker failed")

    monkeypatch.setattr(recorder, "process", fail)

    with pytest.raises(RuntimeError, match="record worker failed"):
        recorder.record_now(mid, pid)
    assert (mid, pid) not in moment_clips._running
