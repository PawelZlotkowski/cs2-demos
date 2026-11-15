from __future__ import annotations

from pathlib import Path
import sys
import threading
import time
import json
import sqlite3
import psutil

import pytest

from app.core.config import settings
from app.models.contracts import MatchStatus
from app.processing.bounded_executor import BoundedExecutor, QueueFullError
from app.processing.isolated_parse import run_bounded_process
from app.processing.parse_demo import ParseError
from app.repositories.matches import MatchRepository


@pytest.fixture
def repository(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> MatchRepository:
    monkeypatch.setattr(settings, "data_dir", tmp_path)
    monkeypatch.setattr(settings, "upload_dir", None)
    monkeypatch.setattr(settings, "matches_dir", None)
    monkeypatch.setattr(settings, "work_dir", None)
    return MatchRepository()


def test_uploaded_and_interrupted_records_survive_restart_and_get_returns_deep_copy(repository):
    match_id, source = repository.allocate_upload("restart.dem")
    source.write_bytes(b"tiny fixture bytes")
    original = repository.register_upload("restart.dem", source, match_id, owner_id="owner-1")
    assert original["status"] == MatchStatus.uploaded

    interrupted_id, interrupted_source = repository.allocate_upload("interrupted.dem")
    interrupted_source.write_bytes(b"interrupted source bytes")
    repository.register_upload("interrupted.dem", interrupted_source, interrupted_id, owner_id="owner-2")

    # Mutating nested data returned to a caller cannot mutate the stored record.
    repository._records[match_id]["match"]["won"] = [0, 1]
    snapshot = repository.get(match_id)
    snapshot["match"]["won"].append(1)
    assert repository.get(match_id)["match"]["won"] == [0, 1]

    repository.set_status(interrupted_id, MatchStatus.parsing)
    restarted = MatchRepository()
    uploaded = restarted.get(match_id)
    assert uploaded is not None
    assert uploaded["owner_id"] == "owner-1"
    assert uploaded["status"] == MatchStatus.uploaded
    assert uploaded["error"] is None
    assert Path(uploaded["path"]).read_bytes() == b"tiny fixture bytes"

    restored = restarted.get(interrupted_id)
    assert restored is not None
    assert restored["owner_id"] == "owner-2"
    assert restored["status"] == MatchStatus.uploaded
    assert restored["error"] == "Processing was interrupted; parsing will resume."
    assert Path(restored["path"]).read_bytes() == b"interrupted source bytes"


def test_native_worker_timeout_stops_child_with_bounded_delay(tmp_path: Path):
    error_file = tmp_path / "worker.err"
    started = time.monotonic()
    with pytest.raises(ParseError, match="timed out"):
        run_bounded_process(
            [sys.executable, "-c", "import time; time.sleep(10)"],
            timeout=0.2,
            memory_bytes=512 * 1024 * 1024,
            error_file=error_file,
        )
    assert time.monotonic() - started < 2.0
    assert error_file.exists()


def test_native_worker_enforces_aggregate_memory_limit(tmp_path: Path):
    error_file = tmp_path / "worker-memory.err"
    with pytest.raises(ParseError, match="memory limit"):
        run_bounded_process(
            [sys.executable, "-c", "import time; data=bytearray(128*1024*1024); time.sleep(10)"],
            timeout=3,
            memory_bytes=64 * 1024 * 1024,
            error_file=error_file,
        )


def test_bounded_executor_counts_active_and_queued_work():
    release = threading.Event()
    started = threading.Event()
    executor = BoundedExecutor(max_workers=1, limit=lambda: 2, name="phase1-test")

    def wait_for_release() -> None:
        started.set()
        assert release.wait(3)

    first = executor.submit(wait_for_release)
    try:
        assert started.wait(1)
        second = executor.submit(lambda: None)
        assert executor.pending == 2
        with pytest.raises(QueueFullError):
            executor.submit(lambda: None)
    finally:
        release.set()
        first.result(timeout=3)
        second.result(timeout=3)
        executor._pool.shutdown(wait=True)
    assert executor.pending == 0


def test_timeout_terminates_owned_descendants(tmp_path):
    pid_file = tmp_path / "pids.json"
    worker = tmp_path / "worker.py"
    worker.write_text(
        "import os, sys, json, subprocess, time\n"
        "child = subprocess.Popen([sys.executable, '-c', 'import time; time.sleep(30)'])\n"
        "with open(sys.argv[1], 'w') as output: json.dump([os.getpid(), child.pid], output)\n"
        "time.sleep(30)\n", encoding="utf-8")
    try:
        with pytest.raises(ParseError, match="timed out"):
            run_bounded_process([sys.executable, str(worker), str(pid_file)], timeout=1,
                                memory_bytes=512 * 1024**2, error_file=tmp_path / "descendants.err")
        pids = json.loads(pid_file.read_text(encoding="utf-8"))
        assert all(not psutil.pid_exists(pid) for pid in pids)
    finally:
        # Test cleanup is limited to the exact PIDs spawned by this fixture.
        if pid_file.exists():
            for pid in json.loads(pid_file.read_text(encoding="utf-8")):
                try:
                    psutil.Process(pid).kill()
                except psutil.NoSuchProcess:
                    pass


def test_interrupted_legacy_record_is_not_marked_complete(repository):
    match_id = "match-legacy"
    out = repository.matches_dir / match_id
    out.mkdir()
    metadata = {"match": {"id": match_id, "status": "complete"}, "rounds": []}
    (out / "match.json").write_text(json.dumps(metadata), encoding="utf-8")
    (out / "analysis.json").write_text("{}", encoding="utf-8")
    with sqlite3.connect(repository.db_path) as connection:
        connection.execute(
            "INSERT INTO matches (id, filename, status, created_at, error, meta_json, owner_id) VALUES (?, ?, ?, ?, ?, ?, ?)",
            (match_id, "legacy.dem", "recording", "2026-10-01", None, "{}", "legacy-owner"))
    restored = MatchRepository().get(match_id)
    assert restored["status"] == MatchStatus.awaiting_player
    assert restored["owner_id"] == "legacy-owner"
    assert restored["created_at"] == "2026-10-01"


def test_player_analysis_claim_is_atomic(repository):
    record = repository.create_upload("claim.dem", b"fixture")
    mid = record["id"]
    repository.set_status(mid, MatchStatus.awaiting_player)
    barrier = threading.Barrier(3)
    results = []
    def claim(player):
        barrier.wait()
        results.append(repository.claim_player_analysis(mid, player))
    threads = [threading.Thread(target=claim, args=(player,)) for player in ("p1", "p2")]
    for thread in threads:
        thread.start()
    barrier.wait()
    for thread in threads:
        thread.join(timeout=3)
    assert sorted(results) == [False, True]
    assert repository.get(mid)["status"] == MatchStatus.detecting


def test_replay_identifier_cannot_traverse_windows_directories(repository):
    record = repository.create_upload("round.dem", b"fixture")
    mid = record["id"]
    target = repository.matches_dir / mid
    target.mkdir()
    (target / "rounds").mkdir()
    (target / "private.json").write_text('{"secret":"outside-rounds"}', encoding="utf-8")
    repository._records[mid]["rounds"] = [{"id": "r1"}]
    (target / "rounds" / "r1.json").write_text('{"roundId":"r1"}', encoding="utf-8")
    assert repository.get_round_replay(mid, "r1") == {"roundId": "r1"}
    assert repository.get_round_replay(mid, "..\\private") is None
    assert repository.get_round_replay(mid, "../private") is None
    assert repository.get_round_replay(mid, "r2") is None
