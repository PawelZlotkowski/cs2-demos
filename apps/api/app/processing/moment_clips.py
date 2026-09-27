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
import shutil
import threading
from pathlib import Path

from app.core.config import settings
from app.models.contracts import ClipStatus, MomentClip, SelectedMoment
from app.processing.video_clips import (
    _video_executor,
    csdm_analyze,
    csdm_record,
    friendly_error,
    write_placeholder_mp4,
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
    t0 = max(0.0, moment.t0 - settings.csdm_moment_pad_before)
    t1 = moment.t1 + settings.csdm_moment_pad_after
    if duration:
        t1 = min(t1, duration)
    t1 = min(t1, t0 + MAX_CLIP_SECONDS)
    if t1 <= t0:
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
        ready = status == ClipStatus.ready and moment_clip_file(match_id, job["clipJobId"], repository).exists()
        if status == ClipStatus.ready and not ready:
            status, error = ClipStatus.failed, "The clip file is missing; record it again."
        out.append(
            MomentClip(
                id=job["clipJobId"],
                playerId=player_id,
                round=job["round"],
                t0=job["t0"],
                t1=job["t1"],
                momentId=job.get("momentId"),
                status=status,
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
        _video_executor.submit(self._run_safe, match_id, player_id)

    def record_now(self, match_id: str, player_id: str) -> None:
        """Record the player's queued jobs and wait (the pipeline's ``recording`` stage).

        Runs on the shared CS:DM worker so it never overlaps other recordings.
        """
        if not settings.csdm_enabled:
            return
        key = (match_id, player_id)
        with _lock:
            _running.add(key)
        _video_executor.submit(self._run_safe, match_id, player_id).result()

    def _run_safe(self, match_id: str, player_id: str) -> None:
        try:
            self.process(match_id, player_id)
        except Exception:
            logger.exception("Moment clip recorder failed for %s / %s", match_id, player_id)
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
                start = int(row["startTick"]) + int(job["t0"] * tick_rate)
                end = int(row["startTick"]) + int(job["t1"] * tick_rate)
                if settings.csdm_mode == "stub":
                    write_placeholder_mp4(out)
                else:
                    # Own folder per job, so CS:DM's output name cannot clash with another clip
                    tmp = out.parent / f"{cid}.tmp"
                    shutil.rmtree(tmp, ignore_errors=True)
                    try:
                        csdm_record(dem, start, end, player_id, tmp / out.name)
                        shutil.move(str(tmp / out.name), str(out))
                    finally:
                        shutil.rmtree(tmp, ignore_errors=True)
                if not out.exists() or out.stat().st_size == 0:
                    raise RuntimeError("Recording produced an empty file.")
                analysis.set_clip_status(cid, "ready")
            except Exception as exc:
                logger.warning("Moment clip %s/%s failed: %s", match_id, cid, exc)
                analysis.set_clip_status(cid, "failed", friendly_error(exc))


moment_recorder = MomentClipRecorder()
