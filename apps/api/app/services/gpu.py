"""One queue for the GPU (docs 27 §4 and 30 AD06).

llama-server holds one model on one GPU, so coach work runs one job at a
time, first come first served: moment selection and explanations from the
pipeline, and Ask from the Studio and the Coach page. Each user may have one
Ask waiting or running. The admin panel lists the jobs and can cancel one
that has not started.
"""

from __future__ import annotations

import asyncio
import itertools
import threading
import time
from collections.abc import AsyncIterator, Iterator
from contextlib import asynccontextmanager, contextmanager
from dataclasses import asdict, dataclass, field

HISTORY = 100  # finished jobs kept for the admin panel


class JobCancelled(RuntimeError):
    pass


class QueueFull(RuntimeError):
    pass


@dataclass
class GpuJob:
    id: str
    kind: str  # select | explain | review | ask | ask_across | plan | explain_round
    match_id: str | None = None
    player_id: str | None = None
    user_id: str | None = None
    state: str = "queued"  # queued | running | done | failed | cancelled
    created_at: float = field(default_factory=time.time)
    started_at: float | None = None
    ended_at: float | None = None
    error: str | None = None

    def public(self) -> dict:
        d = asdict(self)
        return {
            "id": d["id"],
            "kind": d["kind"],
            "matchId": d["match_id"],
            "playerId": d["player_id"],
            "userId": d["user_id"],
            "state": d["state"],
            "createdAt": d["created_at"],
            "startedAt": d["started_at"],
            "endedAt": d["ended_at"],
            "error": d["error"],
        }


class GpuQueue:
    def __init__(self) -> None:
        self._cond = threading.Condition()
        self._ids = itertools.count(1)
        self._waiting: list[GpuJob] = []
        self._running: GpuJob | None = None
        self._done: list[GpuJob] = []

    # --- queue ---------------------------------------------------------------

    def _enqueue(self, kind: str, match_id: str | None, player_id: str | None, user_id: str | None) -> GpuJob:
        with self._cond:
            if kind in ("ask", "ask_across") and user_id is not None:
                mine = [j for j in self._waiting if j.user_id == user_id and j.kind in ("ask", "ask_across")]
                if self._running and self._running.user_id == user_id and self._running.kind in ("ask", "ask_across"):
                    mine.append(self._running)
                if mine:
                    raise QueueFull("The coach is still answering your last question.")
            job = GpuJob(f"g{next(self._ids)}", kind, match_id, player_id, user_id)
            self._waiting.append(job)
            return job

    def _try_start(self, job: GpuJob) -> bool:
        """Under the lock: start the job if it is first in line and the GPU is free."""
        if job.state == "cancelled":
            raise JobCancelled("Cancelled before it started.")
        if self._running is None and self._waiting and self._waiting[0] is job:
            self._waiting.pop(0)
            job.state = "running"
            job.started_at = time.time()
            self._running = job
            return True
        return False

    def _finish(self, job: GpuJob, error: BaseException | None) -> None:
        with self._cond:
            if job.state == "cancelled":
                pass
            elif error is None:
                job.state = "done"
            else:
                job.state = "failed"
                job.error = str(error) or type(error).__name__
            job.ended_at = time.time()
            if self._running is job:
                self._running = None
            if job in self._waiting:
                self._waiting.remove(job)
            self._done.append(job)
            del self._done[:-HISTORY]
            self._cond.notify_all()

    @contextmanager
    def slot(self, kind: str, *, match_id: str | None = None, player_id: str | None = None,
             user_id: str | None = None) -> Iterator[GpuJob]:
        """Blocking: wait for the GPU in a worker thread."""
        job = self._enqueue(kind, match_id, player_id, user_id)
        try:
            with self._cond:
                while not self._try_start(job):
                    self._cond.wait(timeout=1.0)
        except JobCancelled as exc:
            self._finish(job, exc)
            raise
        error: BaseException | None = None
        try:
            yield job
        except BaseException as exc:
            error = exc
            raise
        finally:
            self._finish(job, error)

    @asynccontextmanager
    async def aslot(self, kind: str, *, match_id: str | None = None, player_id: str | None = None,
                    user_id: str | None = None) -> AsyncIterator[GpuJob]:
        """The same, for the event loop: waits without blocking other requests."""
        job = self._enqueue(kind, match_id, player_id, user_id)
        try:
            while True:
                with self._cond:
                    if self._try_start(job):
                        break
                await asyncio.sleep(0.2)
        except (JobCancelled, asyncio.CancelledError) as exc:
            with self._cond:
                if job.state == "queued":
                    job.state = "cancelled"
            self._finish(job, exc)
            raise
        error: BaseException | None = None
        try:
            yield job
        except BaseException as exc:
            error = exc
            raise
        finally:
            self._finish(job, error)

    def has_ask(self, user_id: str) -> bool:
        with self._cond:
            jobs = [*self._waiting, *([self._running] if self._running else [])]
            return any(j.user_id == user_id and j.kind in ("ask", "ask_across") for j in jobs)

    # --- admin ---------------------------------------------------------------

    def cancel(self, job_id: str) -> bool:
        with self._cond:
            for job in self._waiting:
                if job.id == job_id:
                    job.state = "cancelled"
                    self._cond.notify_all()
                    return True
        return False

    def snapshot(self) -> dict[str, list[dict]]:
        with self._cond:
            running = [self._running.public()] if self._running else []
            waiting = [j.public() for j in self._waiting]
            done = [j.public() for j in reversed(self._done)]
        return {"running": running, "waiting": waiting, "finished": done}

    def position(self, job_id: str) -> int | None:
        with self._cond:
            for i, job in enumerate(self._waiting):
                if job.id == job_id:
                    return i + (1 if self._running else 0)
        return None


gpu = GpuQueue()
