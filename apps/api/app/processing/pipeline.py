"""Real demo processing: decompress → parse → normalise → (player) → detect."""

from __future__ import annotations

import logging
import threading
import time
from concurrent.futures import ThreadPoolExecutor, TimeoutError as FuturesTimeout
from pathlib import Path

from app.analysis.match_data import build_match_data
from app.analysis.run import analyse_player
from app.core.config import settings
from app.models.contracts import MatchStatus, ProcessingStage, StatusResponse
from app.processing.decompress import DecompressError, decompress_demo
from app.processing.normalize import normalize_parsed
from app.processing.parse_demo import ParseError, parse_demo_file
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
    MatchStatus.complete,
]

# Stages shown on the processing page, in order
VISIBLE_STAGES = [
    MatchStatus.decompressing,
    MatchStatus.decompressed,
    MatchStatus.parsing,
    MatchStatus.normalizing,
    MatchStatus.awaiting_player,
    MatchStatus.detecting,
]


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
            # Radar is ready; the coach waits for the user to choose a player
            self.repo.set_status(match_id, MatchStatus.awaiting_player)
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

    def select_player(self, match_id: str, player_id: str, *, run_async: bool = True) -> None:
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
            _executor.submit(self._analyse_safe, match_id, player_id)
        else:
            self._analyse_safe(match_id, player_id)

    def _analyse_safe(self, match_id: str, player_id: str) -> None:
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
            self.repo.set_status(match_id, MatchStatus.complete)
        except Exception:
            logger.exception("Analysis failed for %s / %s", match_id, player_id)
            # Radar stays usable: go back to player selection with an honest error
            self.repo.set_status(
                match_id,
                MatchStatus.awaiting_player,
                error="Could not analyse that player. Check the server log for details.",
            )

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
        return StatusResponse(
            id=match_id,
            status=status,
            stages=self._build_stages(record, status),
            error=record.get("error"),
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
        if current == MatchStatus.complete and (
            record.get("is_sample") or not self.repo.has_analysis_input(record["id"])
        ):
            # Sample match, or parsed before the coach milestone: replay stages only
            visible = visible[:4]
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
                else:
                    detail = "Done"
            if state == "active" and st == MatchStatus.awaiting_player:
                detail = record.get("error") or "Radar is ready. Choose a player to analyse."
            stages.append(
                ProcessingStage(
                    id=st,
                    label=STAGE_LABELS.get(st, st.value),
                    state=state,
                    detail=detail,
                )
            )
        return stages


def _player_name(record: dict, player_id: str) -> str:
    for p in record["match"].get("players") or []:
        if p["id"] == player_id:
            return p["name"]
    return player_id


pipeline = ProcessingPipeline()
