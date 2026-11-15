"""First-person clips of the coached player for the coach's moments (plan §3 step 6, T40).

The coach queues clip jobs (``clip_jobs`` in the analysis DB): one per selected
moment, one per on-demand round, and any ``request_clip`` call. This recorder
turns each job's round clock window into demo ticks and records it from the
player's view with CS Demo Manager, one job at a time on the same worker as the
whole-round clips (CS2 can only record one thing at once).

Files live at ``data/matches/{matchId}/clips/moments/{clipJobId}.mp4``.
"""

from __future__ import annotations

import logging
import os
import tempfile
import threading
from pathlib import Path

from app.core.config import settings
from app.models.contracts import ClipStatus, MomentClip, SelectedMoment
from app.processing.bounded_executor import QueueFullError
from app.processing.video_clips import (
    _video_executor,
    csdm_analyze,
    csdm_record,
    friendly_error,
    validate_recording,
)
from app.repositories.matches import MatchRepository, repo

logger = logging.getLogger(__name__)

MAX_CLIP_SECONDS = 60.0
# Shown in the Studio; the setup (RR_CSDM_ENABLED=1 on the Windows host) is in docs/replay/csdm-video.md
DISABLED = "Clips are off on this computer, so the radar is shown instead."

_lock = threading.Lock()
_running: set[tuple[str, str]] = set()


def moment_clip_file(match_id: str, clip_job_id: str, repository: MatchRepository | None = None) -> Path:
    return (repository or repo).matches_dir / match_id / "clips" / "moments" / f"{clip_job_id}.mp4"


def moment_clip_url(match_id: str, player_id: str, clip_job_id: str) -> str:
    return f"/matches/{match_id}/players/{player_id}/clips/{clip_job_id}.mp4"


def moment_window(moment: SelectedMoment, duration: float | None) -> tuple[float, float]:
    """The window the coach picked (plus optional padding), inside the round, at most 60 s."""
    upper = max(0.0, float(duration)) if duration is not None else None
    t0 = max(0.0, moment.t0 - settings.csdm_moment_pad_before)
    t1 = moment.t1 + settings.csdm_moment_pad_after
    if upper is not None:
        t0 = min(t0, upper)
        t1 = min(t1, upper)
    t1 = min(t1, t0 + MAX_CLIP_SECONDS)
    if t1 <= t0 and upper is None:
        t1 = t0 + 1.0
    return round(t0, 1), round(t1, 1)


def _round_row(record: dict, round_no: int) -> dict | None:
    return next((r for r in record.get("rounds") or [] if int(r.get("number", -1)) == round_no), None)


def queue_moment_clips(match_id: str, player_id: str, repository: MatchRepository | None = None) -> int:
    """Queue a clip for each stored moment of the player (idempotent); returns how many."""
    repository = repository or repo
    record = repository.get(match_id)
    if not record:
        return 0
    moments = repository.analysis.moments(match_id, player_id)
    repository.analysis.unlink_moment_clips(match_id, player_id)
    for m in moments:
        row = _round_row(record, m.round)
        t0, t1 = moment_window(m, float(row["durationSec"]) if row else None)
        repository.analysis.queue_clip(match_id, player_id, m.round, t0, t1, moment_id=m.id)
    return len(moments)


def list_moment_clips(match_id: str, player_id: str, repository: MatchRepository | None = None) -> list[MomentClip]:
    """Clip jobs as the Studio sees them; queued jobs read as skipped while recording is off."""
    repository = repository or repo
    out: list[MomentClip] = []
    for job in repository.analysis.clip_jobs(match_id, player_id):
        status = ClipStatus(job["status"])
        error = job.get("error")
        if status == ClipStatus.queued and not settings.csdm_enabled:
            status, error = ClipStatus.skipped, DISABLED
        provenance = job.get("provenance")
        path = moment_clip_file(match_id, job["clipJobId"], repository)
        ready = status == ClipStatus.ready and provenance == "real" and path.is_file() and path.stat().st_size > 0
        if status == ClipStatus.ready and provenance != "real":
            status = ClipStatus.failed
            error = "This older clip has no verified capture provenance; re-record it before playback."
            repository.analysis.set_clip_status(job["clipJobId"], "failed", error)
            provenance = None
        elif status == ClipStatus.ready and not ready:
            status, error, provenance = ClipStatus.failed, "The validated clip file is missing; re-record it.", None
            repository.analysis.set_clip_status(job["clipJobId"], "failed", error)
        if error and error.startswith("Synthetic stub"):
            provenance = "synthetic"
        out.append(
            MomentClip(
                id=job["clipJobId"],
                playerId=player_id,
                round=job["round"],
                t0=job["t0"],
                t1=job["t1"],
                momentId=job.get("momentId"),
                status=status,
                provenance=provenance,
                url=moment_clip_url(match_id, player_id, job["clipJobId"]) if ready else None,
                error=error,
            )
        )
    return out


class MomentClipRecorder:
    def __init__(self, repository: MatchRepository | None = None) -> None:
        self.repo = repository or repo

    def enqueue(self, match_id: str, player_id: str) -> None:
        """Record the player's queued jobs in the background (a no-op while recording is off)."""
        if not settings.csdm_enabled:
            return
        key = (match_id, player_id)
        with _lock:
            if key in _running:
                return
            _running.add(key)
        try:
            _video_executor.submit(self._run_safe, match_id, player_id)
        except QueueFullError:
            with _lock:
                _running.discard(key)
            logger.warning("Moment recording queue is busy; leaving %s / %s queued for retry", match_id, player_id)
        except BaseException:
            with _lock:
                _running.discard(key)
            raise

    def record_now(self, match_id: str, player_id: str) -> None:
        """Record the player's queued jobs and wait (the pipeline's ``recording`` stage).

        Runs on the shared CS:DM worker so it never overlaps other recordings.
        """
        if not settings.csdm_enabled:
            return
        key = (match_id, player_id)
        with _lock:
            _running.add(key)
        try:
            future = _video_executor.submit(self._run_safe, match_id, player_id, True)
        except BaseException:
            with _lock:
                _running.discard(key)
            raise
        future.result()

    def _run_safe(self, match_id: str, player_id: str, propagate_errors: bool = False) -> None:
        try:
            self.process(match_id, player_id)
        except Exception:
            logger.exception("Moment clip recorder failed for %s / %s", match_id, player_id)
            if propagate_errors:
                raise
        finally:
            with _lock:
                _running.discard((match_id, player_id))

    def process(self, match_id: str, player_id: str) -> None:
        record = self.repo.get(match_id)
        if not record or record.get("is_sample"):
            return
        analysis = self.repo.analysis
        # "recording" left over from a stopped server is picked up again
        jobs = [j for j in analysis.clip_jobs(match_id, player_id) if j["status"] in ("queued", "recording")]
        if not jobs:
            return
        tick_rate = int((record.get("match") or {}).get("tickRate") or 64)
        dem = settings.resolved_work_dir() / f"{match_id}.dem"
        if settings.csdm_mode == "csdm":
            try:
                if not dem.exists():
                    raise RuntimeError("Decompressed demo file is missing; re-upload the match.")
                csdm_analyze(dem)
            except Exception as exc:
                logger.warning("csdm analyze failed for %s: %s", match_id, exc)
                for job in jobs:
                    analysis.set_clip_status(job["clipJobId"], "failed", friendly_error(exc))
                return

        for job in jobs:
            cid = job["clipJobId"]
            analysis.set_clip_status(cid, "recording")
            out = moment_clip_file(match_id, cid, self.repo)
            try:
                row = _round_row(record, job["round"])
                if not row:
                    raise RuntimeError(f"Round {job['round']} is not in this match.")
                round_duration = float(row.get("durationSec") or 0.0)
                t0 = max(0.0, min(float(job["t0"]), round_duration))
                t1 = max(0.0, min(float(job["t1"]), round_duration))
                if t1 <= t0:
                    raise RuntimeError("Clip window is outside the round boundaries.")
                start = int(row["startTick"]) + int(t0 * tick_rate)
                end = min(int(row["endTick"]), int(row["startTick"]) + int(t1 * tick_rate))
                expected_duration = (end - start) / max(1, tick_rate)
                if settings.csdm_mode == "stub":
                    analysis.set_clip_status(
                        cid, "skipped", "Synthetic stub output; no gameplay was recorded.", provenance="synthetic"
                    )
                    continue
                else:
                    out.parent.mkdir(parents=True, exist_ok=True)
                    with tempfile.TemporaryDirectory(prefix=f"{cid}-attempt-", dir=out.parent) as attempt:
                        staged = Path(attempt) / out.name
                        csdm_record(dem, start, end, player_id, staged)
                        validate_recording(staged, expected_duration_sec=expected_duration)
                        os.replace(staged, out)
                analysis.set_clip_status(cid, "ready", provenance="real")
            except Exception as exc:
                logger.warning("Moment clip %s/%s failed: %s", match_id, cid, exc)
                analysis.set_clip_status(cid, "failed", friendly_error(exc))


moment_recorder = MomentClipRecorder()
