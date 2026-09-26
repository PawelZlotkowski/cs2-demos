"""Real demo processing: decompress → parse → normalise → optional video clips."""

from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from pathlib import Path

from app.core.config import settings
from app.models.contracts import ClipStatus, MatchStatus, ProcessingStage, StatusResponse
from app.processing.decompress import DecompressError, decompress_demo
from app.processing.normalize import normalize_parsed
from app.processing.parse_demo import ParseError, parse_demo_file
from app.processing.video_clips import get_or_init_manifest, load_manifest, video_worker
from app.repositories.matches import STAGE_LABELS, MatchRepository, repo

logger = logging.getLogger(__name__)

REPLAY_PIPELINE: list[MatchStatus] = [
    MatchStatus.uploaded,
    MatchStatus.decompressing,
    MatchStatus.decompressed,
    MatchStatus.parsing,
    MatchStatus.normalizing,
    MatchStatus.complete,
]

_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix="demo-parse")


class ProcessingPipeline:
    def __init__(self, repository: MatchRepository | None = None) -> None:
        self.repo = repository or repo
        self._lock = threading.Lock()
        self._running: set[str] = set()

    def enqueue(self, match_id: str) -> None:
        with self._lock:
            if match_id in self._running:
                return
            self._running.add(match_id)
        _executor.submit(self._run_safe, match_id)

    def _run_safe(self, match_id: str) -> None:
        try:
            self.process(match_id)
        except Exception:
            logger.exception("Unhandled processing error for %s", match_id)
            self.repo.set_status(match_id, MatchStatus.failed, error="Processing failed unexpectedly.")
        finally:
            with self._lock:
                self._running.discard(match_id)

    def process(self, match_id: str) -> None:
        record = self.repo.get(match_id)
        if not record or record.get("is_sample"):
            return
        if record["status"] in (MatchStatus.complete, MatchStatus.failed):
            return

        upload_path = Path(record["path"])
        work_dem = settings.resolved_work_dir() / f"{match_id}.dem"
        perf: dict[str, float | int] = {
            "uploadBytes": upload_path.stat().st_size if upload_path.exists() else 0,
        }

        try:
            self.repo.set_status(match_id, MatchStatus.decompressing)
            t0 = time.perf_counter()
            if str(upload_path).lower().endswith(".dem.zst") or upload_path.suffix.lower() == ".zst":
                written = decompress_demo(
                    upload_path,
                    work_dem,
                    max_output_bytes=settings.max_decompress_bytes,
                )
            else:
                written = decompress_demo(
                    upload_path,
                    work_dem,
                    max_output_bytes=settings.max_decompress_bytes,
                )
            perf["decompressSeconds"] = round(time.perf_counter() - t0, 3)
            perf["decompressedBytes"] = written
            self.repo.set_status(match_id, MatchStatus.decompressed)

            self.repo.set_status(match_id, MatchStatus.parsing)
            t1 = time.perf_counter()
            # Local pool avoids deadlock with the outer processing executor
            with ThreadPoolExecutor(max_workers=1) as parse_pool:
                future = parse_pool.submit(parse_demo_file, str(work_dem))
                try:
                    parsed = future.result(timeout=settings.parse_timeout_seconds)
                except FuturesTimeout as exc:
                    raise ParseError("Parsing timed out. Try a shorter demo.") from exc
            perf["parseSeconds"] = round(time.perf_counter() - t1, 3)

            self.repo.set_status(match_id, MatchStatus.normalizing)
            t2 = time.perf_counter()
            normalised = normalize_parsed(match_id, parsed)
            perf["normalizeSeconds"] = round(time.perf_counter() - t2, 3)
            normalised["perf"] = {**normalised.get("perf", {}), **perf}

            self.repo.persist_replay(match_id, normalised)
            self.repo.set_status(match_id, MatchStatus.complete)
            # Radar is ready; gameplay clips fill in asynchronously.
            video_worker.enqueue(match_id)
        except (DecompressError, ParseError) as exc:
            logger.warning("Processing failed for %s: %s", match_id, exc)
            self.repo.set_status(match_id, MatchStatus.failed, error=str(exc))
        except Exception as exc:
            logger.exception("Processing failed for %s", match_id)
            self.repo.set_status(
                match_id,
                MatchStatus.failed,
                error="Could not process that demo. Check the server log for details.",
            )
            raise exc

    def status_response(self, match_id: str) -> StatusResponse:
        record = self.repo.get(match_id)
        if not record:
            raise KeyError(match_id)
        # Kick processing if still uploaded
        if (
            not record.get("is_sample")
            and record["status"] == MatchStatus.uploaded
        ):
            self.enqueue(match_id)
        status: MatchStatus = record["status"]
        clips = None
        if status == MatchStatus.complete:
            clips = get_or_init_manifest(match_id, self.repo)
            if (
                settings.csdm_enabled
                and not record.get("is_sample")
                and clips
                and any(c.status == ClipStatus.queued for c in clips.clips)
            ):
                video_worker.enqueue(match_id)
                clips = load_manifest(match_id, self.repo) or clips
        else:
            clips = load_manifest(match_id, self.repo)
        return StatusResponse(
            id=match_id,
            status=status,
            stages=self._build_stages(record, status),
            error=record.get("error"),
            clips=clips,
        )

    def _build_stages(self, record: dict, current: MatchStatus) -> list[ProcessingStage]:
        if current == MatchStatus.failed:
            return [
                ProcessingStage(
                    id=MatchStatus.failed,
                    label=STAGE_LABELS[MatchStatus.failed],
                    state="error",
                    detail=record.get("error") or "Processing failed",
                )
            ]

        visible = [
            MatchStatus.decompressing,
            MatchStatus.decompressed,
            MatchStatus.parsing,
            MatchStatus.normalizing,
        ]
        try:
            cur_idx = REPLAY_PIPELINE.index(current)
        except ValueError:
            cur_idx = 0

        stages: list[ProcessingStage] = []
        for st in visible:
            st_idx = REPLAY_PIPELINE.index(st)
            if current == MatchStatus.complete or cur_idx > st_idx:
                state = "done"
            elif cur_idx == st_idx:
                state = "active"
            else:
                state = "pending"
            detail = None
            if state == "done":
                if st == MatchStatus.parsing and record.get("match", {}).get("rounds"):
                    detail = f"{record['match']['rounds']} rounds"
                elif st == MatchStatus.normalizing and record.get("rounds"):
                    detail = f"{len(record['rounds'])} rounds normalised"
                else:
                    detail = "Done"
            stages.append(
                ProcessingStage(
                    id=st,
                    label=STAGE_LABELS.get(st, st.value),
                    state=state,
                    detail=detail,
                )
            )
        return stages


pipeline = ProcessingPipeline()
