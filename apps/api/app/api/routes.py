import asyncio
import json
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, Query, UploadFile
from fastapi.responses import FileResponse, StreamingResponse

from app.core.config import settings
from app.core.validation import UPLOAD_REJECT_MESSAGE, is_allowed_demo_filename
from app.models.contracts import (
    REPLAY_READY_STATUSES,
    AskRequest,
    CoachAskRequest,
    CoachLanguage,
    ClipManifest,
    CoachRequest,
    CoachResponse,
    EventsPage,
    ExplainRequest,
    Finding,
    Match,
    MatchStatus,
    Moment,
    MomentClip,
    MomentExplanation,
    ReviewWrapUp,
    PatternsResponse,
    PlayerSelectRequest,
    ReplayEvent,
    RoundClip,
    RoundReplay,
    RoundStats,
    RoundSummary,
    SelectedMoment,
    StatusResponse,
    UploadResponse,
)
from app.processing import pipeline as pipeline_module
from app.processing.pipeline import PlayerSelectionError, pipeline
from app.processing.moment_clips import list_moment_clips, moment_clip_file, moment_recorder
from app.processing.video_clips import clip_file, find_clip, get_or_init_manifest
from app.coach.tools import player_match_refs
from app.repositories.matches import repo
from app.services.coach import coach_service
from app.services.patterns import patterns_from_record

router = APIRouter()


def _replay_ready(record: dict) -> bool:
    return bool(record.get("is_sample")) or record["status"] in REPLAY_READY_STATUSES


def _attach_clip(match_id: str, summary: RoundSummary) -> RoundSummary:
    clip = find_clip(match_id, summary.id)
    if clip is None:
        return summary
    return summary.model_copy(update={"clip": clip})


def _attach_replay_clip(match_id: str, replay: RoundReplay) -> RoundReplay:
    clip = find_clip(match_id, replay.round_id)
    if clip is None:
        return replay
    return replay.model_copy(update={"clip": clip})


@router.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/matches/upload", response_model=UploadResponse)
async def upload_match(file: UploadFile = File(...)) -> UploadResponse:
    filename = file.filename or ""
    if not is_allowed_demo_filename(filename):
        raise HTTPException(status_code=400, detail=UPLOAD_REJECT_MESSAGE)
    raw = await file.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty file. Choose a demo file to upload.")
    if len(raw) > settings.max_upload_bytes:
        raise HTTPException(
            status_code=400,
            detail=f"File is too large. Maximum upload size is {settings.max_upload_bytes // (1024 * 1024)} MB.",
        )
    try:
        record = repo.create_upload(filename, raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    pipeline.enqueue(record["id"])
    return UploadResponse(
        id=record["id"],
        status=MatchStatus.uploaded,
        filename=filename,
        message="Upload accepted. Processing has started.",
    )


@router.get("/matches/{match_id}", response_model=Match)
def get_match(match_id: str) -> Match:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    return Match.model_validate(record["match"])


@router.get("/matches/{match_id}/status", response_model=StatusResponse)
def get_status(match_id: str) -> StatusResponse:
    if not repo.get(match_id):
        raise HTTPException(status_code=404, detail="Match not found.")
    return pipeline.status_response(match_id)


@router.get("/matches/{match_id}/clips", response_model=ClipManifest)
def get_clips(match_id: str) -> ClipManifest:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    if not _replay_ready(record):
        raise HTTPException(status_code=409, detail="Match is still processing.")
    manifest = get_or_init_manifest(match_id)
    if not manifest:
        raise HTTPException(status_code=404, detail="No clip manifest for this match.")
    return manifest


@router.get("/matches/{match_id}/clips/{round_id}.mp4")
def stream_round_clip(match_id: str, round_id: str) -> FileResponse:
    """Serve the MP4 before the metadata route so `r1.mp4` is not captured as round_id."""
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    path: Path = clip_file(match_id, round_id)
    if not path.exists() or path.stat().st_size == 0:
        raise HTTPException(status_code=404, detail="Clip file not found.")
    return FileResponse(
        path,
        media_type="video/mp4",
        filename=f"{round_id}.mp4",
        headers={"Accept-Ranges": "bytes", "Cache-Control": "public, max-age=3600"},
    )


@router.get("/matches/{match_id}/clips/{round_id}", response_model=RoundClip)
def get_round_clip(match_id: str, round_id: str) -> RoundClip:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    clip = find_clip(match_id, round_id)
    if not clip:
        raise HTTPException(status_code=404, detail="Clip not found.")
    return clip


@router.get("/matches/{match_id}/rounds", response_model=list[RoundSummary])
def list_rounds(match_id: str) -> list[RoundSummary]:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    if not _replay_ready(record):
        return []
    # Ensure clip metadata exists for Studio polling
    get_or_init_manifest(match_id)
    return [
        _attach_clip(match_id, RoundSummary.model_validate(r))
        for r in (record.get("rounds") or [])
    ]


@router.get("/matches/{match_id}/rounds/{round_id}", response_model=RoundSummary)
def get_round(match_id: str, round_id: str) -> RoundSummary:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    round_row = next((r for r in (record.get("rounds") or []) if r["id"] == round_id), None)
    if not round_row:
        raise HTTPException(status_code=404, detail="Round not found.")
    return _attach_clip(match_id, RoundSummary.model_validate(round_row))


@router.get("/matches/{match_id}/rounds/{round_id}/replay", response_model=RoundReplay)
def get_round_replay(match_id: str, round_id: str) -> RoundReplay:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    if not _replay_ready(record):
        raise HTTPException(status_code=409, detail="Match is still processing.")
    replay = repo.get_round_replay(match_id, round_id)
    if not replay:
        raise HTTPException(status_code=404, detail="Round replay not found.")
    return _attach_replay_clip(match_id, RoundReplay.model_validate(replay))


@router.get("/matches/{match_id}/events", response_model=EventsPage)
def list_events(
    match_id: str,
    from_tick: int | None = Query(None, alias="fromTick"),
    to_tick: int | None = Query(None, alias="toTick"),
    offset: int = Query(0, ge=0),
    limit: int = Query(200, ge=1, le=2000),
) -> EventsPage:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    events = list(record.get("events") or [])
    if from_tick is not None:
        events = [e for e in events if e["tick"] >= from_tick]
    if to_tick is not None:
        events = [e for e in events if e["tick"] <= to_tick]
    total = len(events)
    page = events[offset : offset + limit]
    return EventsPage(
        matchId=match_id,
        events=[ReplayEvent.model_validate(e) for e in page],
        total=total,
    )


# --- Coach analysis (AI Coach plan §3, tasks T12–T13) ---


@router.post("/matches/{match_id}/player", response_model=StatusResponse)
def select_player(match_id: str, body: PlayerSelectRequest) -> StatusResponse:
    """Choose the player to coach; runs the detectors for them."""
    try:
        pipeline.select_player(match_id, body.player_id, language=body.language)
    except PlayerSelectionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return pipeline.status_response(match_id)


def _require_analysis(match_id: str, player_id: str) -> None:
    if not repo.get(match_id):
        raise HTTPException(status_code=404, detail="Match not found.")
    if not repo.analysis.has_analysis(match_id, player_id):
        raise HTTPException(status_code=404, detail="No analysis for that player yet.")


@router.get("/matches/{match_id}/players/{player_id}/findings", response_model=list[Finding])
def list_findings(
    match_id: str,
    player_id: str,
    round_no: int | None = Query(None, alias="round"),
    kind: str | None = None,
    detector: str | None = None,
) -> list[Finding]:
    _require_analysis(match_id, player_id)
    return repo.analysis.findings(match_id, player_id, round_no=round_no, kind=kind, detector=detector)


@router.get("/matches/{match_id}/players/{player_id}/round-stats", response_model=list[RoundStats])
def list_round_stats(match_id: str, player_id: str) -> list[RoundStats]:
    _require_analysis(match_id, player_id)
    return repo.analysis.round_stats(match_id, player_id)


@router.get("/matches/{match_id}/players/{player_id}/moments", response_model=list[SelectedMoment])
def list_player_moments(match_id: str, player_id: str) -> list[SelectedMoment]:
    _require_analysis(match_id, player_id)
    return repo.analysis.moments(match_id, player_id)


# --- Coach agent (AI Coach plan §6.2, tasks T25–T27) ---


@router.get(
    "/matches/{match_id}/players/{player_id}/moments/{moment_id}/explanation",
    response_model=MomentExplanation,
)
def get_moment_explanation(
    match_id: str, player_id: str, moment_id: str, lang: CoachLanguage = "en"
) -> MomentExplanation:
    """Analysis-tab text for a moment: stored, or written now (model or templates)."""
    from app.coach.jobs import run_sync

    _require_analysis(match_id, player_id)
    stored = repo.analysis.explanation(match_id, player_id, moment_id, lang)
    if stored:
        return stored
    if not any(m.id == moment_id for m in repo.analysis.moments(match_id, player_id)):
        raise HTTPException(status_code=404, detail="Moment not found.")
    return run_sync(pipeline_module.coach_jobs(repo).explain(match_id, player_id, moment_id, lang))


@router.post(
    "/matches/{match_id}/players/{player_id}/rounds/{round_no}/explain",
    response_model=MomentExplanation,
)
def explain_round(
    match_id: str, player_id: str, round_no: int, body: ExplainRequest | None = None, refresh: bool = False
) -> MomentExplanation:
    """On-demand analysis of any round (plan §3 step 9). Cached per language."""
    from app.coach.jobs import run_sync

    _require_analysis(match_id, player_id)
    lang = (body or ExplainRequest()).language
    if not any(s.round == round_no for s in repo.analysis.round_stats(match_id, player_id)):
        raise HTTPException(status_code=404, detail="Round not found for that player.")
    target = f"r{round_no}"
    # Plan §3 step 9: queue a clip of the round's main finding (the recorder picks it up later)
    in_round = repo.analysis.findings(match_id, player_id, round_no=round_no)
    if in_round:
        lead = max(in_round, key=lambda f: f.severity)
        repo.analysis.queue_clip(match_id, player_id, round_no, round(max(0.0, lead.t - 5), 1), round(lead.t + 3, 1))
        moment_recorder.enqueue(match_id, player_id)
    stored = None if refresh else repo.analysis.explanation(match_id, player_id, target, lang)
    return stored or run_sync(pipeline_module.coach_jobs(repo).explain(match_id, player_id, target, lang))


@router.get("/matches/{match_id}/players/{player_id}/review/summary", response_model=MomentExplanation)
def get_review_summary(match_id: str, player_id: str, lang: CoachLanguage = "en") -> MomentExplanation:
    """The overview's summary of the picked moments (design plan item 2): stored, or written now."""
    from app.coach.jobs import run_sync

    _require_analysis(match_id, player_id)
    stored = repo.analysis.explanation(match_id, player_id, "summary", lang)
    return stored or run_sync(pipeline_module.coach_jobs(repo).review(match_id, player_id, "summary", lang))


@router.get("/matches/{match_id}/players/{player_id}/review/wrapup", response_model=ReviewWrapUp)
def get_review_wrapup(match_id: str, player_id: str, lang: CoachLanguage = "en") -> ReviewWrapUp:
    """End of the review (design plan item 3): what went well, what to fix, one drill per mistake type."""
    from app.coach.jobs import run_sync
    from app.coach.review import practice_drills

    _require_analysis(match_id, player_id)
    stored = repo.analysis.explanation(match_id, player_id, "wrapup", lang)
    text = stored or run_sync(pipeline_module.coach_jobs(repo).review(match_id, player_id, "wrapup", lang))
    a = repo.analysis
    return ReviewWrapUp(
        explanation=text,
        drills=practice_drills(a.moments(match_id, player_id), a.findings(match_id, player_id)),
    )


@router.get("/matches/{match_id}/players/{player_id}/clips", response_model=list[MomentClip])
def list_player_clips(match_id: str, player_id: str) -> list[MomentClip]:
    """First-person clips of the player: the coach's moments, on-demand rounds and agent requests."""
    _require_analysis(match_id, player_id)
    clips = list_moment_clips(match_id, player_id)
    if any(c.status in ("queued", "recording") for c in clips):
        # Picks up jobs left behind by a restart; a no-op while one is running
        moment_recorder.enqueue(match_id, player_id)
    return clips


@router.get("/matches/{match_id}/players/{player_id}/clips/{clip_id}.mp4")
def stream_player_clip(match_id: str, player_id: str, clip_id: str) -> FileResponse:
    _require_analysis(match_id, player_id)
    clip = next((c for c in list_moment_clips(match_id, player_id) if c.id == clip_id), None)
    if not clip or clip.status != "ready":
        raise HTTPException(status_code=404, detail="Clip not found.")
    return FileResponse(
        moment_clip_file(match_id, clip_id),
        media_type="video/mp4",
        filename=f"{match_id}-{clip_id}.mp4",
    )


@router.post("/matches/{match_id}/players/{player_id}/clips/{clip_id}/retry", response_model=MomentClip)
def retry_player_clip(match_id: str, player_id: str, clip_id: str) -> MomentClip:
    """Record a failed clip again (for example after starting Steam)."""
    _require_analysis(match_id, player_id)
    if not any(c.id == clip_id for c in list_moment_clips(match_id, player_id)):
        raise HTTPException(status_code=404, detail="Clip not found.")
    repo.analysis.set_clip_status(clip_id, "queued")
    moment_recorder.enqueue(match_id, player_id)
    return next(c for c in list_moment_clips(match_id, player_id) if c.id == clip_id)


@router.get("/knowledge/{passage_id}")
def get_knowledge(passage_id: str) -> dict:
    """One knowledge passage, for [K..] citation tokens in the Studio."""
    from app.rag.index import default_index

    passage = default_index().get(passage_id)
    if passage is None:
        raise HTTPException(status_code=404, detail="Passage not found.")
    return {"id": passage.id, "title": passage.title, "map": passage.map, "source": passage.source, "text": passage.text}


def _sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/matches/{match_id}/players/{player_id}/ask")
async def ask_coach(match_id: str, player_id: str, body: AskRequest) -> StreamingResponse:
    """Ask tab over server-sent events.

    ``step`` events report each tool call while the coach looks things up;
    one ``answer`` event carries the verified answer (or the template
    fallback, ``source: "template"``). Unverified text is never streamed.
    """
    _require_analysis(match_id, player_id)
    return _ask_stream(
        lambda on_step: pipeline_module.coach_jobs(repo).ask(match_id, player_id, body, on_step=on_step),
        f"{match_id} / {player_id}",
    )


@router.post("/players/{player_id}/ask")
async def ask_coach_across(player_id: str, body: CoachAskRequest) -> StreamingResponse:
    """Coach page Ask across all the player's analysed matches (doc 29 R05).

    Same events as the Ask tab. Findings are cited as ``M2:F3``; the answer
    event's ``matches`` maps each ref it cites to its match id, so the page can
    open that match in the Studio.
    """
    refs = player_match_refs(player_id)
    if not refs:
        raise HTTPException(status_code=404, detail="This player has no analysed matches yet.")

    def extra(outcome) -> dict:
        cited = {c.split(":", 1)[0] for c in outcome.citations if ":F" in c}
        return {"matches": {ref: refs[ref] for ref in sorted(cited) if ref in refs}}

    return _ask_stream(
        lambda on_step: pipeline_module.coach_jobs(repo).ask_across(player_id, body, on_step=on_step),
        player_id,
        extra,
    )


def _ask_stream(run, label: str, extra=None) -> StreamingResponse:
    queue: asyncio.Queue[str | None] = asyncio.Queue()

    async def on_step(step: dict) -> None:
        await queue.put(_sse("step", {"tool": step["tool"], "ms": step["ms"], "error": step["error"]}))

    async def work() -> None:
        try:
            outcome = await run(on_step)
            await queue.put(
                _sse(
                    "answer",
                    {
                        "answer": outcome.answer,
                        "citations": outcome.citations,
                        "source": outcome.source,
                        "verified": outcome.source == "agent",
                        **(extra(outcome) if extra else {}),
                    },
                )
            )
        except Exception:  # pragma: no cover - logged, reported to the client
            import logging

            logging.getLogger(__name__).exception("Ask failed for %s", label)
            await queue.put(_sse("error", {"detail": "The coach could not answer. Check the server log."}))
        finally:
            await queue.put(None)

    async def events():
        task = asyncio.create_task(work())
        try:
            while (item := await queue.get()) is not None:
                yield item
        finally:
            await task

    return StreamingResponse(events(), media_type="text/event-stream", headers={"Cache-Control": "no-cache"})


# --- Legacy coaching stubs (unused by replay MVP) ---


@router.get("/matches/{match_id}/moments", response_model=list[Moment])
def list_moments(match_id: str) -> list[Moment]:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    if not _replay_ready(record):
        return []
    return [Moment.model_validate(m) for m in record.get("moments") or []]


@router.get("/matches/{match_id}/moments/{moment_id}", response_model=Moment)
def get_moment(match_id: str, moment_id: str) -> Moment:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    moment = next((m for m in (record.get("moments") or []) if m["id"] == moment_id), None)
    if not moment:
        raise HTTPException(status_code=404, detail="Moment not found.")
    return Moment.model_validate(moment)


@router.post("/matches/{match_id}/coach", response_model=CoachResponse)
def coach(match_id: str, body: CoachRequest) -> CoachResponse:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    return coach_service.answer(record, body)


@router.get("/users/me/patterns", response_model=PatternsResponse)
def my_patterns() -> PatternsResponse:
    record = repo.get(repo.sample_id())
    assert record is not None
    return patterns_from_record(record)


@router.get("/users/{user_id}/patterns", response_model=PatternsResponse)
def user_patterns(user_id: str) -> PatternsResponse:
    _ = user_id
    return my_patterns()
