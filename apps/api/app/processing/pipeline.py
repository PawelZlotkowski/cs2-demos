"""Real demo processing: decompress → parse → normalise → (player) → detect, plus optional video clips."""

from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from pathlib import Path

from app.analysis.match_data import build_match_data
from app.analysis.run import analyse_player
from app.core.config import settings
from app.models.contracts import (
    REPLAY_READY_STATUSES,
    ClipStatus,
    MatchStatus,
    ProcessingStage,
    StatusResponse,
)
from app.processing.decompress import DecompressError, decompress_demo
from app.processing.normalize import normalize_parsed
from app.processing.parse_demo import ParseError, parse_demo_file
from app.processing.moment_clips import list_moment_clips, moment_recorder, queue_moment_clips
from app.processing.video_clips import get_or_init_manifest, load_manifest, video_worker
from app.repositories.matches import STAGE_LABELS, MatchRepository, repo

logger = logging.getLogger(__name__)

REPLAY_PIPELINE: list[MatchStatus] = [
    MatchStatus.uploaded,
    MatchStatus.decompressing,
    MatchStatus.decompressed,
    MatchStatus.parsing,
    MatchStatus.normalizing,
    MatchStatus.awaiting_player,
    MatchStatus.detecting,
    MatchStatus.selecting,
    MatchStatus.recording,
    MatchStatus.explaining,
    MatchStatus.complete,
]

# Stages shown on the processing page, in order
# (decompressing and decompressed read as one "Unpack demo" line, so only the first is listed)
VISIBLE_STAGES = [
    MatchStatus.decompressing,
    MatchStatus.parsing,
    MatchStatus.normalizing,
    MatchStatus.awaiting_player,
    MatchStatus.detecting,
]
# Shown only when the coach model is on (RR_LLM_ENABLED)
COACH_STAGES = [MatchStatus.selecting, MatchStatus.explaining]
# Shown when gameplay recording is on (RR_CSDM_ENABLED); runs before the explanations
RECORD_STAGE = MatchStatus.recording


class PlayerSelectionError(Exception):
    """User-facing reason a player cannot be analysed (status code attached)."""

    def __init__(self, message: str, status_code: int = 400) -> None:
        super().__init__(message)
        self.status_code = status_code

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
        if record["status"] not in (
            MatchStatus.uploaded,
            MatchStatus.decompressing,
            MatchStatus.decompressed,
            MatchStatus.parsing,
            MatchStatus.normalizing,
        ):
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
            # Radar is ready; the coach waits for the user to choose a player.
            # Gameplay clips fill in asynchronously (no-op unless CS:DM is enabled).
            self.repo.set_status(match_id, MatchStatus.awaiting_player)
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

    # --- coach analysis (AI Coach plan §3 steps 3–4) ---

    def select_player(
        self, match_id: str, player_id: str, *, language: str = "en", run_async: bool = True
    ) -> None:
        """Store the chosen player and run the detectors for them."""
        record = self.repo.get(match_id)
        if not record:
            raise PlayerSelectionError("Match not found.", 404)
        if record.get("is_sample") or not self.repo.has_analysis_input(match_id):
            raise PlayerSelectionError(
                "This match was processed before the coach existed. Upload the demo again to analyse it.",
                409,
            )
        if record["status"] not in (MatchStatus.awaiting_player, MatchStatus.complete):
            raise PlayerSelectionError("Match is not ready for player selection yet.", 409)
        roster = {p["id"] for p in record["match"].get("players") or []}
        if player_id not in roster:
            raise PlayerSelectionError("That player is not in this match.", 400)

        self.repo.set_selected_player(match_id, player_id)
        self.repo.set_status(match_id, MatchStatus.detecting)
        if run_async:
            _executor.submit(self._analyse_safe, match_id, player_id, language)
        else:
            self._analyse_safe(match_id, player_id, language)

    def _analyse_safe(self, match_id: str, player_id: str, language: str = "en") -> None:
        try:
            t0 = time.perf_counter()
            analysis_json, replays = self.repo.load_analysis_input(match_id)
            match = build_match_data(analysis_json, replays)
            result = analyse_player(match, player_id)
            self.repo.analysis.save(result)
            logger.info(
                "Analysed %s for %s: %d findings, %d moments in %.2f s",
                match_id,
                player_id,
                len(result.findings),
                len(result.moments),
                time.perf_counter() - t0,
            )
        except Exception:
            logger.exception("Analysis failed for %s / %s", match_id, player_id)
            # Radar stays usable: go back to player selection with an honest error
            self.repo.set_status(
                match_id,
                MatchStatus.awaiting_player,
                error="Could not analyse that player. Check the server log for details.",
            )
            return
        if settings.llm_enabled:
            self._select_safe(match_id, player_id)
        # Clips of the final moments (the coach's, or the ranker's when the model is
        # off or failed) are recorded before the analysis opens.
        self._record_moments(match_id, player_id)
        if settings.llm_enabled:
            self._explain_safe(match_id, player_id, language)
        self.repo.set_status(match_id, MatchStatus.complete)

    def _record_moments(self, match_id: str, player_id: str) -> None:
        """Record the POV clip of each moment and wait for them (plan §3 step 6).

        A clip that fails keeps its reason for the Studio; the analysis still opens.
        """
        try:
            queue_moment_clips(match_id, player_id, self.repo)
            if not settings.csdm_enabled:
                return
            self.repo.set_status(match_id, MatchStatus.recording)
            t0 = time.perf_counter()
            moment_recorder.record_now(match_id, player_id)
            logger.info("Moment clips for %s in %.1f s", match_id, time.perf_counter() - t0)
        except Exception:
            logger.exception("Recording moment clips failed for %s / %s", match_id, player_id)

    def _select_safe(self, match_id: str, player_id: str) -> None:
        """Moment selection by the coach (plan §3 step 5).

        The ranker's moments are already stored, so a failure here still leaves
        a complete analysis; the job traces record why.
        """
        from app.coach.jobs import run_sync

        try:
            self.repo.set_status(match_id, MatchStatus.selecting)
            t0 = time.perf_counter()
            outcome = run_sync(coach_jobs(self.repo).select_moments(match_id, player_id))
            logger.info(
                "Moments for %s by %s in %.1f s", match_id, outcome.source, time.perf_counter() - t0
            )
        except Exception:
            logger.exception("Moment selection failed for %s / %s; keeping the ranker's moments", match_id, player_id)

    def _explain_safe(self, match_id: str, player_id: str, language: str) -> None:
        """Explanations of the moments (plan §3 step 7)."""
        from app.coach.jobs import run_sync

        try:
            self.repo.set_status(match_id, MatchStatus.explaining)
            t0 = time.perf_counter()
            run_sync(coach_jobs(self.repo).explain_all_moments(match_id, player_id, language))
            logger.info("Explanations for %s in %.1f s", match_id, time.perf_counter() - t0)
        except Exception:
            logger.exception("Explanations failed for %s / %s", match_id, player_id)
        # The overview summary and the closing wrap-up (design plan items 2 and 3)
        for part in ("summary", "wrapup"):
            try:
                run_sync(coach_jobs(self.repo).review(match_id, player_id, part, language))
            except Exception:
                logger.exception("Review %s failed for %s / %s", part, match_id, player_id)

    def _recording_progress(self, match_id: str, player_id: str, state: str) -> tuple[dict[str, int] | None, str]:
        clips = [c for c in list_moment_clips(match_id, player_id, self.repo) if c.moment_id]
        ready = sum(1 for c in clips if c.status == ClipStatus.ready)
        failed = sum(1 for c in clips if c.status == ClipStatus.failed)
        if state == "active":
            return {"done": ready + failed, "total": len(clips)}, "Recording the player's view of each moment in CS2"
        if not clips:
            return None, "No moments to record"
        detail = f"{ready} of {len(clips)} clips recorded"
        return None, detail + (f", {failed} failed" if failed else "")

    def _selection_detail(self, match_id: str, player_id: str) -> str:
        moments = self.repo.analysis.moments(match_id, player_id)
        by = "the coach" if any(m.source == "agent" for m in moments) else "code (coach model unavailable)"
        return f"{len(moments)} moments picked by {by}"

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
        if status in REPLAY_READY_STATUSES:
            clips = get_or_init_manifest(match_id, self.repo)
            if (
                settings.csdm_enabled
                and settings.csdm_round_clips
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

        visible = list(VISIBLE_STAGES)
        if settings.llm_enabled or current in COACH_STAGES:
            visible += COACH_STAGES
        if settings.csdm_enabled or current == RECORD_STAGE:
            # Recording sits between moment selection and the explanations
            at = visible.index(MatchStatus.explaining) if MatchStatus.explaining in visible else len(visible)
            visible.insert(at, RECORD_STAGE)
        if current == MatchStatus.complete and (
            record.get("is_sample") or not self.repo.has_analysis_input(record["id"])
        ):
            # Sample match, or parsed before the coach milestone: replay stages only
            visible = visible[:3]
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
                elif st == MatchStatus.awaiting_player and record["match"].get("selectedPlayerId"):
                    detail = _player_name(record, record["match"]["selectedPlayerId"])
                elif st == MatchStatus.selecting and record["match"].get("selectedPlayerId"):
                    detail = self._selection_detail(record["id"], record["match"]["selectedPlayerId"])
                else:
                    detail = "Done"
            if state == "active" and st == MatchStatus.awaiting_player:
                detail = record.get("error") or "Radar is ready. Choose a player to analyse."
            progress = None
            pid = record["match"].get("selectedPlayerId")
            if st == RECORD_STAGE and state != "pending" and pid:
                progress, detail = self._recording_progress(record["id"], pid, state)
            stages.append(
                ProcessingStage(
                    id=st,
                    label=STAGE_LABELS.get(st, st.value),
                    state=state,
                    detail=detail,
                    progress=progress,
                )
            )
        return stages


def coach_jobs(repository: MatchRepository):  # noqa: ANN201 - lazy import keeps the replay path light
    """The coach jobs for a repository (tests replace this)."""
    from app.coach.jobs import CoachJobs

    return CoachJobs(repository)


def _player_name(record: dict, player_id: str) -> str:
    for p in record["match"].get("players") or []:
        if p["id"] == player_id:
            return p["name"]
    return player_id


pipeline = ProcessingPipeline()
