from fastapi import APIRouter, File, HTTPException, Query, UploadFile

from app.core.config import settings
from app.core.validation import UPLOAD_REJECT_MESSAGE, is_allowed_demo_filename
from app.models.contracts import (
    CoachRequest,
    CoachResponse,
    EventsPage,
    Match,
    MatchStatus,
    Moment,
    PatternsResponse,
    ReplayEvent,
    RoundReplay,
    RoundSummary,
    StatusResponse,
    UploadResponse,
)
from app.processing.pipeline import pipeline
from app.repositories.matches import repo
from app.services.coach import coach_service
from app.services.patterns import patterns_from_record

router = APIRouter()


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


@router.get("/matches/{match_id}/rounds", response_model=list[RoundSummary])
def list_rounds(match_id: str) -> list[RoundSummary]:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    if record["status"] != MatchStatus.complete and not record.get("is_sample"):
        return []
    return [RoundSummary.model_validate(r) for r in record.get("rounds") or []]


@router.get("/matches/{match_id}/rounds/{round_id}", response_model=RoundSummary)
def get_round(match_id: str, round_id: str) -> RoundSummary:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    round_row = next((r for r in (record.get("rounds") or []) if r["id"] == round_id), None)
    if not round_row:
        raise HTTPException(status_code=404, detail="Round not found.")
    return RoundSummary.model_validate(round_row)


@router.get("/matches/{match_id}/rounds/{round_id}/replay", response_model=RoundReplay)
def get_round_replay(match_id: str, round_id: str) -> RoundReplay:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    if record["status"] != MatchStatus.complete and not record.get("is_sample"):
        raise HTTPException(status_code=409, detail="Match is still processing.")
    replay = repo.get_round_replay(match_id, round_id)
    if not replay:
        raise HTTPException(status_code=404, detail="Round replay not found.")
    return RoundReplay.model_validate(replay)


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


# --- Legacy coaching stubs (unused by replay MVP) ---


@router.get("/matches/{match_id}/moments", response_model=list[Moment])
def list_moments(match_id: str) -> list[Moment]:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    if record["status"] != MatchStatus.complete and not record.get("is_sample"):
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
