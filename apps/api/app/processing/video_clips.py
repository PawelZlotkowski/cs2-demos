"""Gameplay clip storage and CS Demo Manager / stub recording."""

from __future__ import annotations

import json
import logging
import os
import shutil
import subprocess
import threading
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from app.core.config import settings
from app.models.contracts import ClipManifest, ClipStatus, RoundClip
from app.repositories.matches import MatchRepository, repo

logger = logging.getLogger(__name__)


def resolve_csdm_bin() -> str:
    """Resolve the CS:DM CLI so Windows `.cmd` shims are found by subprocess."""
    configured = (settings.csdm_bin or "csdm").strip()
    as_path = Path(configured)
    if as_path.is_file():
        return str(as_path)

    which = shutil.which(configured)
    if which:
        return which

    # shutil.which sometimes misses .cmd; try PATHEXT-aware lookup
    for name in (configured, f"{configured}.cmd", f"{configured}.exe", f"{configured}.bat"):
        which = shutil.which(name)
        if which:
            return which

    local = Path(os.environ.get("LOCALAPPDATA", "")) / "Programs" / "cs-demo-manager" / "csdm.cmd"
    if local.is_file():
        return str(local)

    return configured

# Tiny ftyp+free stub used when no fixture/ffmpeg is available (enough for Range/E2E plumbing).
_PLACEHOLDER_MP4 = (
    b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"
    b"\x00\x00\x00\x08free"
)


def clips_dir(match_id: str, repository: MatchRepository | None = None) -> Path:
    root = (repository or repo).matches_dir / match_id / "clips"
    root.mkdir(parents=True, exist_ok=True)
    return root


def manifest_path(match_id: str, repository: MatchRepository | None = None) -> Path:
    return (repository or repo).matches_dir / match_id / "clips.json"


def write_placeholder_mp4(dest: Path) -> None:
    """Write a tiny placeholder file (not a polished encode; enough for URL/E2E plumbing)."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    # Prefer a richer fixture if present
    fixture = Path(__file__).resolve().parents[2] / "data" / "fixtures" / "placeholder-clip.mp4"
    if fixture.exists() and fixture.stat().st_size > 32:
        shutil.copyfile(fixture, dest)
        return
    dest.write_bytes(_PLACEHOLDER_MP4)


def load_manifest(match_id: str, repository: MatchRepository | None = None) -> ClipManifest | None:
    path = manifest_path(match_id, repository)
    if not path.exists():
        return None
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    return ClipManifest.model_validate(data)


def save_manifest(manifest: ClipManifest, repository: MatchRepository | None = None) -> None:
    path = manifest_path(manifest.match_id, repository)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        json.dumps(manifest.model_dump(by_alias=True, mode="json"), indent=2),
        encoding="utf-8",
    )


def clip_file(match_id: str, round_id: str, repository: MatchRepository | None = None) -> Path:
    return clips_dir(match_id, repository) / f"{round_id}.mp4"


def public_clip_url(match_id: str, round_id: str) -> str:
    return f"/matches/{match_id}/clips/{round_id}.mp4"


def choose_focus_steamid(record: dict[str, Any]) -> str | None:
    if settings.csdm_focus_steamid:
        return settings.csdm_focus_steamid
    players = (record.get("match") or {}).get("players") or []
    for p in players:
        if p.get("team") == "CT":
            return str(p.get("id"))
    if players:
        return str(players[0].get("id"))
    return None


def init_manifest_for_match(match_id: str, repository: MatchRepository | None = None) -> ClipManifest:
    repository = repository or repo
    record = repository.get(match_id)
    if not record:
        raise KeyError(match_id)
    focus = choose_focus_steamid(record)
    is_sample = bool(record.get("is_sample"))
    rounds = list(record.get("rounds") or [])
    if settings.csdm_max_rounds and settings.csdm_max_rounds > 0:
        rounds = rounds[: settings.csdm_max_rounds]
    clips: list[RoundClip] = []
    for r in rounds:
        rid = r["id"]
        path = clip_file(match_id, rid, repository)
        if path.exists() and path.stat().st_size > 0:
            status = ClipStatus.ready
            url = public_clip_url(match_id, rid)
            err = None
        elif is_sample:
            status = ClipStatus.skipped
            url = None
            err = "Sample match has no gameplay video."
        elif not settings.csdm_enabled:
            status = ClipStatus.skipped
            url = None
            err = "Gameplay recording is disabled on this server."
        else:
            status = ClipStatus.queued
            url = None
            err = None
        clips.append(
            RoundClip(
                roundId=rid,
                status=status,
                url=url,
                startTick=int(r["startTick"]),
                endTick=int(r["endTick"]),
                durationSec=float(r["durationSec"]),
                focusSteamid=focus,
                error=err,
            )
        )
    done = sum(1 for c in clips if c.status in (ClipStatus.ready, ClipStatus.failed, ClipStatus.skipped))
    manifest = ClipManifest(
        matchId=match_id,
        focusSteamid=focus,
        clips=clips,
        done=done,
        total=len(clips),
    )
    save_manifest(manifest, repository)
    return manifest


def get_or_init_manifest(match_id: str, repository: MatchRepository | None = None) -> ClipManifest | None:
    repository = repository or repo
    existing = load_manifest(match_id, repository)
    if existing:
        return existing
    record = repository.get(match_id)
    if not record:
        return None
    # Empty rounds → empty manifest (sample fixture has no round list)
    return init_manifest_for_match(match_id, repository)


def update_clip(
    match_id: str,
    round_id: str,
    *,
    status: ClipStatus,
    error: str | None = None,
    repository: MatchRepository | None = None,
) -> ClipManifest:
    repository = repository or repo
    manifest = get_or_init_manifest(match_id, repository)
    if not manifest:
        raise KeyError(match_id)
    clips: list[RoundClip] = []
    for c in manifest.clips:
        if c.round_id != round_id:
            clips.append(c)
            continue
        url = public_clip_url(match_id, round_id) if status == ClipStatus.ready else None
        clips.append(
            c.model_copy(
                update={
                    "status": status,
                    "url": url,
                    "error": error,
                }
            )
        )
    done = sum(1 for c in clips if c.status in (ClipStatus.ready, ClipStatus.failed, ClipStatus.skipped))
    updated = ClipManifest(
        matchId=match_id,
        focusSteamid=manifest.focus_steamid,
        clips=clips,
        done=done,
        total=len(clips),
    )
    save_manifest(updated, repository)
    return updated


def find_clip(match_id: str, round_id: str, repository: MatchRepository | None = None) -> RoundClip | None:
    manifest = get_or_init_manifest(match_id, repository)
    if not manifest:
        return None
    return next((c for c in manifest.clips if c.round_id == round_id), None)


_video_executor = ThreadPoolExecutor(max_workers=1, thread_name_prefix="csdm-video")
_video_lock = threading.Lock()
_video_running: set[str] = set()


class VideoWorker:
    def __init__(self, repository: MatchRepository | None = None) -> None:
        self.repo = repository or repo

    def enqueue(self, match_id: str) -> None:
        if not settings.csdm_enabled:
            # Still write skipped manifest so UI can explain
            try:
                init_manifest_for_match(match_id, self.repo)
            except KeyError:
                return
            return
        with _video_lock:
            if match_id in _video_running:
                return
            _video_running.add(match_id)
        _video_executor.submit(self._run_safe, match_id)

    def _run_safe(self, match_id: str) -> None:
        try:
            self.process(match_id)
        except Exception:
            logger.exception("Video worker failed for %s", match_id)
        finally:
            with _video_lock:
                _video_running.discard(match_id)

    def process(self, match_id: str) -> None:
        record = self.repo.get(match_id)
        if not record:
            return
        if record.get("is_sample"):
            init_manifest_for_match(match_id, self.repo)
            return
        manifest = init_manifest_for_match(match_id, self.repo)
        dem = settings.resolved_work_dir() / f"{match_id}.dem"
        if settings.csdm_mode == "csdm" and not dem.exists():
            for c in manifest.clips:
                if c.status == ClipStatus.queued:
                    update_clip(
                        match_id,
                        c.round_id,
                        status=ClipStatus.failed,
                        error="Decompressed demo file is missing; re-upload the match.",
                        repository=self.repo,
                    )
            return

        if settings.csdm_mode == "csdm":
            try:
                self._csdm_analyze(dem)
            except Exception as exc:
                logger.warning("csdm analyze failed for %s: %s", match_id, exc)
                for c in manifest.clips:
                    if c.status == ClipStatus.queued:
                        update_clip(
                            match_id,
                            c.round_id,
                            status=ClipStatus.failed,
                            error=str(exc),
                            repository=self.repo,
                        )
                return

        for clip in list(manifest.clips):
            if clip.status not in (ClipStatus.queued, ClipStatus.failed):
                continue
            update_clip(match_id, clip.round_id, status=ClipStatus.recording, repository=self.repo)
            try:
                out = clip_file(match_id, clip.round_id, self.repo)
                if settings.csdm_mode == "stub":
                    write_placeholder_mp4(out)
                else:
                    self._csdm_video(dem, clip, out)
                if not out.exists() or out.stat().st_size == 0:
                    raise RuntimeError("Recording produced an empty file.")
                update_clip(match_id, clip.round_id, status=ClipStatus.ready, repository=self.repo)
            except Exception as exc:
                logger.warning("Clip %s/%s failed: %s", match_id, clip.round_id, exc)
                update_clip(
                    match_id,
                    clip.round_id,
                    status=ClipStatus.failed,
                    error=_friendly_error(exc),
                    repository=self.repo,
                )

    def _csdm_analyze(self, dem: Path) -> None:
        cmd = [resolve_csdm_bin(), "analyze", str(dem)]
        self._run(cmd, timeout=settings.csdm_timeout_seconds)

    def _csdm_video(self, dem: Path, clip: RoundClip, out: Path) -> None:
        out_dir = out.parent
        cmd = [
            resolve_csdm_bin(),
            "video",
            str(dem),
            str(clip.start_tick),
            str(clip.end_tick),
            "--recording-system",
            settings.csdm_recording_system,
            "--encoder-software",
            "FFmpeg",
            "--framerate",
            str(settings.csdm_fps),
            "--width",
            str(settings.csdm_width),
            "--height",
            str(settings.csdm_height),
            "--ffmpeg-video-container",
            "mp4",
            "--output",
            str(out_dir),
        ]
        if clip.focus_steamid:
            cmd.extend(["--focus-player", clip.focus_steamid])
        self._run(cmd, timeout=settings.csdm_timeout_seconds)
        # CS:DM may name the file differently; normalize to rN.mp4
        if out.exists():
            return
        candidates = sorted(out_dir.glob("*.mp4"), key=lambda p: p.stat().st_mtime, reverse=True)
        for cand in candidates:
            if cand.resolve() == out.resolve():
                return
            # Prefer a file whose name contains the round id; else take the newest.
            if out.stem in cand.stem or cand == candidates[0]:
                if cand.resolve() != out.resolve():
                    shutil.move(str(cand), str(out))
                return
        raise RuntimeError("CS Demo Manager did not produce an MP4 in the output folder.")

    def _run(self, cmd: list[str], timeout: float) -> None:
        bin_path = cmd[0]
        # Windows: .cmd/.bat need cmd.exe — CreateProcess cannot launch them directly.
        if os.name == "nt" and bin_path.lower().endswith((".cmd", ".bat")):
            run_cmd = ["cmd.exe", "/c", *cmd]
        else:
            run_cmd = cmd
        try:
            completed = subprocess.run(
                run_cmd,
                capture_output=True,
                text=True,
                timeout=timeout,
                check=False,
            )
        except FileNotFoundError as exc:
            raise RuntimeError(
                "CS Demo Manager CLI was not found. Install CS:DM and add `csdm` to PATH."
            ) from exc
        except subprocess.TimeoutExpired as exc:
            raise RuntimeError("Gameplay recording timed out.") from exc
        if completed.returncode != 0:
            detail = (completed.stderr or completed.stdout or "").strip()
            raise RuntimeError(detail or f"Command failed: {' '.join(cmd)}")
        # CS:DM sometimes exits 0 while printing a fatal condition (e.g. Steam closed).
        combined = f"{completed.stdout or ''}\n{completed.stderr or ''}".strip()
        low = combined.lower()
        if "steam is not running" in low:
            raise RuntimeError("Steam is not running. Start Steam (signed in), then retry recording.")
        if "counter-strike" in low and "not found" in low:
            raise RuntimeError("Counter-Strike 2 was not found. Install CS2 via Steam, then retry.")


def _friendly_error(exc: Exception) -> str:
    msg = str(exc)
    low = msg.lower()
    if "not found" in low and "csdm" in low:
        return "CS Demo Manager is not installed or not on PATH."
    if "steam is not running" in low or ("steam" in low and "not running" in low):
        return "Steam is not running. Start Steam signed in, then retry."
    if "steam" in low:
        return "Steam login or CS2 is required to record gameplay."
    if "timed out" in low:
        return "Gameplay recording timed out."
    if "did not produce an mp4" in low:
        return "Recording finished without an MP4 — check Steam/CS2/HLAE and retry."
    return msg[:280] if msg else "Gameplay recording failed."


video_worker = VideoWorker()
