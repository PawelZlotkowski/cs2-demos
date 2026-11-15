"""Admission control for active and queued local background work."""

from concurrent.futures import ThreadPoolExecutor
from threading import Lock
from typing import Callable


class QueueFullError(RuntimeError):
    pass


class BoundedExecutor:
    def __init__(self, *, max_workers: int, limit: Callable[[], int], name: str):
        self._pool = ThreadPoolExecutor(max_workers=max_workers, thread_name_prefix=name)
        self._limit = limit
        self._lock = Lock()
        self._pending = 0

    def submit(self, fn, *args, **kwargs):
        with self._lock:
            if self._pending >= self._limit():
                raise QueueFullError("Processing queue is full. Try again after a job finishes.")
            self._pending += 1
        try:
            future = self._pool.submit(fn, *args, **kwargs)
        except BaseException:
            self._release()
            raise
        future.add_done_callback(lambda _: self._release())
        return future

    def _release(self):
        with self._lock:
            self._pending -= 1

    @property
    def pending(self) -> int:
        with self._lock:
            return self._pending
