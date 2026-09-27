"""Routes for the rest of the doc 29 roadmap: R07–R17.

Studio Notes and "done well" (R08, R15), the Coach page Plan and Knowledge
tabs (R09, R12), the Lab's Labels, Evaluation and Dataset tabs (R07, R10,
R11), and the Matches and Progress pages with re-runs (R13, R17). Lab routes
answer 404 unless ``RR_LAB_ENABLED`` is on, like the Runs tab.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, HTTPException, Query, Response

from app.api.lab import _require_lab
from app.coach.jobs import run_sync, window_target
from app.coach.tools import _map_key, cross_match_findings, player_match_refs
from app.models.contracts import (
    ABPair,
    ABRatingRequest,
    Bookmark,
    BookmarkRequest,
    CoachLanguage,
    DatasetPage,
    DatasetReviewRequest,
    EvalSummary,
    ExplainRequest,
    GoodExample,
    GoodExamples,
    KnowledgeFlagRequest,
    KnowledgeNoteRequest,
    KnowledgeRow,
    MapZone,
    MatchRow,
    MatchStatus,
    MomentExplanation,
    MomentPicks,
    PlanTickRequest,
    PracticePlan,
    ProgressResponse,
    RerunRequest,
    RoundLabel,
    StatusResponse,
)
from app.processing import pipeline as pipeline_module
from app.processing.moment_clips import moment_recorder
from app.processing.pipeline import PlayerSelectionError, pipeline
from app.repositories.extras import extras
from app.repositories.matches import repo
from app.services import dataset, evaluation, knowledge, labels, progress

router = APIRouter()

WINDOW_BEFORE_S = 6.0  # a bookmark's window: from 6 s before the mark ...
WINDOW_AFTER_S = 4.0  # ... to 4 s after it


def _match(match_id: str) -> dict[str, Any]:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    return record


def _analysed(match_id: str, player_id: str) -> None:
    _match(match_id)
    if not repo.analysis.has_analysis(match_id, player_id):
        raise HTTPException(status_code=404, detail="No analysis for that player yet.")


# --- Studio Notes (R08) ---


@router.get("/matches/{match_id}/bookmarks", response_model=list[Bookmark])
def list_bookmarks(match_id: str) -> list[Bookmark]:
    _match(match_id)
    return [Bookmark.model_validate(b) for b in extras().bookmarks(match_id)]


@router.post("/matches/{match_id}/bookmarks", response_model=Bookmark)
def add_bookmark(match_id: str, body: BookmarkRequest) -> Bookmark:
    record = _match(match_id)
    if not any(r.get("number") == body.round for r in record.get("rounds") or []):
        raise HTTPException(status_code=404, detail="Round not found.")
    return Bookmark.model_validate(extras().add_bookmark(match_id, body.round, body.t, body.note.strip()))


@router.delete("/matches/{match_id}/bookmarks/{bookmark_id}", status_code=204)
def delete_bookmark(match_id: str, bookmark_id: str) -> Response:
    _match(match_id)
    if not extras().delete_bookmark(match_id, bookmark_id):
        raise HTTPException(status_code=404, detail="Note not found.")
    return Response(status_code=204)


@router.post(
    "/matches/{match_id}/players/{player_id}/bookmarks/{bookmark_id}/explain", response_model=MomentExplanation
)
def explain_bookmark(
    match_id: str, player_id: str, bookmark_id: str, body: ExplainRequest | None = None
) -> MomentExplanation:
    """Ask about this: the coach explains the note's window, and its clip is queued (plan §3 step 9)."""
    _analysed(match_id, player_id)
    mark = next((b for b in extras().bookmarks(match_id) if b["id"] == bookmark_id), None)
    if mark is None:
        raise HTTPException(status_code=404, detail="Note not found.")
    lang = (body or ExplainRequest()).language
    t0, t1 = round(max(0.0, mark["t"] - WINDOW_BEFORE_S), 1), round(mark["t"] + WINDOW_AFTER_S, 1)
    repo.analysis.queue_clip(match_id, player_id, mark["round"], t0, t1)
    moment_recorder.enqueue(match_id, player_id)
    target = window_target(mark["round"], t0, t1)
    stored = repo.analysis.explanation(match_id, player_id, target, lang)
    return stored or run_sync(pipeline_module.coach_jobs(repo).explain(match_id, player_id, target, lang))


# --- "Show a round where you did this well" (R15) ---


@router.get(
    "/matches/{match_id}/players/{player_id}/findings/{finding_id}/done-well", response_model=GoodExamples
)
def done_well(match_id: str, player_id: str, finding_id: str, limit: int = Query(3, ge=1, le=10)) -> GoodExamples:
    """D10 good plays of the same player in the same zone of the same map, newest match first."""
    _analysed(match_id, player_id)
    finding = next((f for f in repo.analysis.findings(match_id, player_id) if f.id == finding_id), None)
    if finding is None:
        raise HTTPException(status_code=404, detail="Finding not found.")
    if not finding.zone:
        return GoodExamples(zone=None, items=[])
    map_name = (_match(match_id).get("match") or {}).get("map")
    refs = player_match_refs(player_id)
    found = []
    for ref, _record, f in cross_match_findings(player_id, map=map_name, kind="good", zone=finding.zone):
        mid, fid = refs[ref], f.id.split(":", 1)[1]
        if mid == match_id and f.round == finding.round:
            continue
        found.append((f.severity, GoodExample(
            id=f.id, match_id=mid, finding_id=fid, round=f.round, t=f.t, zone=f.zone, summary=f.summary,
            same_match=mid == match_id,
        )))
    # The best play first; equal ones keep cross_match_findings' newest-match-first order
    items = [g for _sev, g in sorted(found, key=lambda x: -x[0])]
    return GoodExamples(zone=finding.zone, items=items[:limit])


# --- Coach page, Plan (R09) ---


def _with_ticks(plan: PracticePlan) -> PracticePlan:
    ticks = extras().ticks(plan.player_id)
    items = [i.model_copy(update={"done": i.detector in ticks, "done_at": ticks.get(i.detector)}) for i in plan.items]
    return plan.model_copy(update={"items": items})


def _require_player(player_id: str) -> None:
    if not player_match_refs(player_id):
        raise HTTPException(status_code=404, detail="This player has no analysed matches yet.")


@router.get("/players/{player_id}/plan", response_model=PracticePlan)
def get_plan(player_id: str, lang: CoachLanguage = "en") -> PracticePlan:
    """The stored plan, or a new one written now."""
    _require_player(player_id)
    stored = extras().plan(player_id, lang)
    if stored:
        return _with_ticks(PracticePlan.model_validate(stored))
    return new_plan(player_id, lang)


@router.post("/players/{player_id}/plan", response_model=PracticePlan)
def new_plan(player_id: str, lang: CoachLanguage = "en") -> PracticePlan:
    """Write a fresh plan from the matches analysed so far (after ticking drills off, say)."""
    _require_player(player_id)
    plan = run_sync(pipeline_module.coach_jobs(repo).practice_plan(player_id, lang))
    extras().save_plan(player_id, lang, plan.model_dump(by_alias=True))
    return plan


@router.put("/players/{player_id}/plan/{detector}", response_model=PracticePlan)
def tick_plan_item(player_id: str, detector: str, body: PlanTickRequest, lang: CoachLanguage = "en") -> PracticePlan:
    stored = extras().plan(player_id, lang)
    if not stored or not any(i["detector"] == detector for i in stored["items"]):
        raise HTTPException(status_code=404, detail="That item is not in the plan.")
    extras().set_tick(player_id, detector, body.done)
    return _with_ticks(PracticePlan.model_validate(stored))


# --- Coach page, Knowledge (R12) ---


@router.get("/knowledge", response_model=list[KnowledgeRow])
def browse_knowledge(
    map_name: str | None = Query(None, alias="map"), zone: str | None = None, q: str | None = None
) -> list[KnowledgeRow]:
    return knowledge.list_knowledge(map_name, zone, q)


@router.get("/maps/{map_name}/zones", response_model=list[MapZone])
def zones(map_name: str) -> list[MapZone]:
    found = knowledge.map_zones(f"de_{_map_key(map_name)}")
    if not found:
        raise HTTPException(status_code=404, detail="No zones for that map.")
    return found


@router.post("/knowledge/notes", response_model=KnowledgeRow)
def add_knowledge_note(body: KnowledgeNoteRequest) -> KnowledgeRow:
    """Admin only (the Lab switch until accounts): adds a passage and re-indexes."""
    _require_lab()
    return knowledge.add_note(body)


@router.post("/knowledge/{passage_id}/flag", status_code=204)
def flag_passage(passage_id: str, body: KnowledgeFlagRequest) -> Response:
    if not any(r.id == passage_id for r in knowledge.list_knowledge()):
        raise HTTPException(status_code=404, detail="Passage not found.")
    extras().flag_passage(passage_id, body.note.strip())
    return Response(status_code=204)


# --- Matches and Progress (R13, R17) ---


@router.get("/matches", response_model=list[MatchRow])
def list_matches() -> list[MatchRow]:
    return progress.match_rows()


@router.post("/matches/{match_id}/rerun", response_model=StatusResponse)
def rerun_coach(match_id: str, body: RerunRequest | None = None) -> StatusResponse:
    """Review the match again with the model llama-server serves now; the old review is kept.

    Only one model fits on the GPU, so "choosing" the model means starting
    llama-server with it (Settings, System shows which one is served).
    """
    _match(match_id)
    player_id = repo.analysis.get_player(match_id)
    if not player_id or not repo.analysis.has_analysis(match_id, player_id):
        raise HTTPException(status_code=409, detail="Pick a player for this match first.")
    a = repo.analysis
    old = {
        "moments": [m.model_dump(by_alias=True) for m in a.moments(match_id, player_id)],
        "explanations": [e.model_dump(by_alias=True) for e in a.explanations(match_id, player_id)],
    }
    lang = (body or RerunRequest()).language
    try:
        # Checks the match state before anything is changed
        if repo.get(match_id)["status"] not in (MatchStatus.awaiting_player, MatchStatus.complete):
            raise PlayerSelectionError("The match is still being processed.", 409)
        extras().save_version(match_id, player_id, progress.review_model(match_id, player_id) or "templates", old)
        a.clear_explanations(match_id, player_id)
        pipeline.select_player(match_id, player_id, language=lang)
    except PlayerSelectionError as exc:
        raise HTTPException(status_code=exc.status_code, detail=str(exc)) from exc
    return pipeline.status_response(match_id)


@router.get("/matches/{match_id}/versions")
def review_versions(match_id: str) -> list[dict[str, Any]]:
    """Earlier reviews of the match kept by re-runs, oldest first."""
    _match(match_id)
    player_id = repo.analysis.get_player(match_id)
    return extras().versions(match_id, player_id) if player_id else []


@router.get("/players/{player_id}/progress", response_model=ProgressResponse)
def player_progress(player_id: str) -> ProgressResponse:
    out = progress.progress(player_id)
    if out is None:
        raise HTTPException(status_code=404, detail="This player has no analysed matches yet.")
    return out


# --- Lab, Labels (R07) ---


def _name(labeller: str) -> str:
    try:
        return labels.check_name(labeller)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/lab/labels/summary")
def labels_summary(a: str | None = None, b: str | None = None) -> dict[str, Any]:
    _require_lab()
    return labels.summary(_name(a) if a else None, _name(b) if b else None)


@router.get("/lab/labels/{match_id}/{player_id}", response_model=list[RoundLabel])
def round_labels(match_id: str, player_id: str, labeller: str) -> list[RoundLabel]:
    _require_lab()
    _analysed(match_id, player_id)
    return labels.read_rounds(match_id, player_id, _name(labeller))


@router.put("/lab/labels", response_model=RoundLabel)
def save_round_label(body: RoundLabel) -> RoundLabel:
    _require_lab()
    _analysed(body.match_id, body.player_id)
    _name(body.labeller)
    known = {f.id for f in repo.analysis.findings(body.match_id, body.player_id, round_no=body.round)}
    unknown = [v.finding_id for v in body.findings if v.finding_id not in known]
    if unknown:
        raise HTTPException(status_code=400, detail=f"Not findings of round {body.round}: {', '.join(unknown)}.")
    return labels.save_round(body)


@router.get("/lab/picks/{match_id}/{player_id}")
def moment_picks(match_id: str, player_id: str, labeller: str) -> dict[str, Any]:
    """The labeller's own picks, and the score against the coach's only once they are saved (blind)."""
    _require_lab()
    _analysed(match_id, player_id)
    picks = labels.read_picks(match_id, player_id, _name(labeller))
    if picks is None:
        return {"picks": None, "score": None}
    return {
        "picks": picks.model_dump(by_alias=True),
        "score": labels.score_picks(picks, repo.analysis.moments(match_id, player_id)),
    }


@router.put("/lab/picks")
def save_moment_picks(body: MomentPicks) -> dict[str, Any]:
    _require_lab()
    _analysed(body.match_id, body.player_id)
    _name(body.labeller)
    labels.save_picks(body)
    return moment_picks(body.match_id, body.player_id, body.labeller)


@router.get("/lab/bookmarks")
def lab_bookmarks() -> list[dict[str, Any]]:
    """Every note players left: moments they cared about, for moment-selection evaluation."""
    _require_lab()
    return extras().all_bookmarks()


# --- Lab, Evaluation (R10) ---


@router.get("/lab/eval", response_model=EvalSummary)
def lab_eval() -> EvalSummary:
    _require_lab()
    return evaluation.eval_summary()


@router.get("/lab/eval/pair", response_model=ABPair | None)
def lab_eval_pair() -> ABPair | None:
    _require_lab()
    return evaluation.ab_pair()


@router.post("/lab/eval/rate", status_code=204)
def lab_eval_rate(body: ABRatingRequest) -> Response:
    _require_lab()
    extras().add_rating(body.a, body.b, body.winner, body.rater)
    return Response(status_code=204)


# --- Lab, Dataset (R11) ---


@router.get("/lab/dataset", response_model=DatasetPage)
def lab_dataset(
    job: str | None = None,
    pending: bool = False,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
) -> DatasetPage:
    _require_lab()
    return dataset.page(job=job, pending=pending, limit=limit, offset=offset)


@router.put("/lab/dataset/{example_id}", status_code=204)
def lab_review_example(example_id: str, body: DatasetReviewRequest) -> Response:
    _require_lab()
    if body.verdict == "edit" and not (body.text or "").strip():
        raise HTTPException(status_code=400, detail="An edit needs the new text.")
    ex = next((e for e, _m in dataset.examples() if e.id == example_id), None)
    if ex is None:
        raise HTTPException(status_code=404, detail="Example not found.")
    if body.verdict == "edit":
        problem = dataset.edit_problem(ex, body.text or "")
        if problem:
            raise HTTPException(status_code=400, detail=problem)
    extras().review_example(example_id, body.verdict, body.text if body.verdict == "edit" else None, body.reviewer)
    return Response(status_code=204)


@router.post("/lab/dataset/export")
def lab_export_dataset() -> dict[str, Any]:
    _require_lab()
    counts = dataset.export()
    return {"folder": str(dataset.dataset_dir()), "counts": counts}
