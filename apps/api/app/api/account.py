"""A user's own matches beyond the review itself (docs 27 and 30).

Rename and delete (A08, A12), review progress and Ask history (A09),
feedback on explanations and answers (A10), the signed-in player's progress
(A11), earlier review versions (AD09) and read-only share links (A14).
Ownership of every ``{match_id}`` here is checked by ``guard``.
"""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from fastapi.responses import FileResponse

from app.admin.services import delete_match_everything
from app.auth.deps import audit, current_user
from app.auth.store import users
from app.core.config import settings
from app.models.contracts import (
    FeedbackRequest,
    MatchPatch,
    ProgressResponse,
    ReviewProgressRequest,
)
from app.repositories.extras import extras
from app.repositories.matches import repo

router = APIRouter()


def _match(match_id: str) -> dict[str, Any]:
    record = repo.get(match_id)
    if not record:
        raise HTTPException(status_code=404, detail="Match not found.")
    return record


@router.patch("/matches/{match_id}")
def rename_match(match_id: str, body: MatchPatch, request: Request) -> dict[str, Any]:
    _match(match_id)
    title = (body.title or "").strip() or None
    users().set_title(match_id, title)
    audit(request, "match.rename", match_id, {"title": title})
    return {"id": match_id, "title": title}


@router.delete("/matches/{match_id}", status_code=204)
def delete_match(match_id: str, request: Request) -> Response:
    record = _match(match_id)
    if record.get("is_sample"):
        raise HTTPException(status_code=400, detail="The sample match cannot be deleted.")
    delete_match_everything(match_id)
    audit(request, "match.delete", match_id)
    return Response(status_code=204)


# --- review progress and Ask history (A09) ---


@router.get("/matches/{match_id}/progress")
def review_progress(match_id: str, user: dict = Depends(current_user)) -> list[dict[str, Any]]:
    _match(match_id)
    return users().progress(user["id"], match_id)


@router.post("/matches/{match_id}/progress", status_code=204)
def mark_seen(match_id: str, body: ReviewProgressRequest, user: dict = Depends(current_user)) -> Response:
    _match(match_id)
    users().mark_seen(user["id"], match_id, body.moment_id, body.t)
    return Response(status_code=204)


@router.get("/matches/{match_id}/ask-history")
def ask_history(match_id: str, user: dict = Depends(current_user)) -> list[dict[str, Any]]:
    _match(match_id)
    return users().asks(user["id"], match_id, limit=50)


@router.get("/players/{player_id}/ask-history")
def ask_history_across(player_id: str, user: dict = Depends(current_user)) -> list[dict[str, Any]]:
    return [a for a in users().asks(user["id"], limit=200) if a["matchId"] is None and a["playerId"] == player_id][-50:]


# --- feedback (A10) ---


@router.get("/matches/{match_id}/feedback")
def my_feedback(match_id: str, user: dict = Depends(current_user)) -> list[dict[str, Any]]:
    _match(match_id)
    return users().feedback(user["id"], match_id)


@router.post("/matches/{match_id}/feedback", status_code=204)
def give_feedback(match_id: str, body: FeedbackRequest, user: dict = Depends(current_user)) -> Response:
    _match(match_id)
    note = (body.note or "").strip() or None
    users().set_feedback(user["id"], match_id, body.target, body.kind, body.verdict, note)
    return Response(status_code=204)


# --- the signed-in player's progress (A11) ---


def my_player_id(user: dict[str, Any]) -> str | None:
    """The linked SteamID when it has analysed matches, else the most coached player."""
    coached = repo.analysis.coached_players()  # already limited to the user's matches
    steam_id = users().steam_id(user["id"]) if user["id"] != "local" else None
    if steam_id and any(pid == steam_id for pid, _ in coached):
        return steam_id
    if not coached:
        return None
    return max(coached, key=lambda row: len(row[1]))[0]


@router.get("/users/me/player")
def me_player(user: dict = Depends(current_user)) -> dict[str, Any]:
    return {"playerId": my_player_id(user), "steamId": users().steam_id(user["id"]) if user["id"] != "local" else None}


@router.get("/users/me/progress", response_model=ProgressResponse)
def me_progress(user: dict = Depends(current_user)) -> ProgressResponse:
    from app.services import progress

    pid = my_player_id(user)
    result = progress.progress(pid) if pid else None
    if result is None:
        raise HTTPException(status_code=404, detail="No reviewed matches yet.")
    return result


# --- earlier reviews (AD09) ---


@router.get("/matches/{match_id}/versions/{version_id}")
def review_version(match_id: str, version_id: str) -> dict[str, Any]:
    _match(match_id)
    version = extras().version(match_id, version_id)
    if version is None:
        raise HTTPException(status_code=404, detail="Version not found.")
    return version


# --- share links (A14) ---


def _shares_on() -> None:
    if not settings.share_links:
        raise HTTPException(status_code=404, detail="Share links are off.")


@router.get("/matches/{match_id}/share")
def share_state(match_id: str) -> dict[str, Any]:
    _match(match_id)
    return {"enabled": settings.share_links, "active": users().share_active(match_id)}


@router.post("/matches/{match_id}/share")
def share(match_id: str, request: Request, user: dict = Depends(current_user)) -> dict[str, str]:
    _shares_on()
    record = _match(match_id)
    if record.get("is_sample") or not repo.analysis.get_player(match_id):
        raise HTTPException(status_code=409, detail="Review the match before sharing it.")
    token = users().create_share(match_id, user["id"])
    audit(request, "match.share", match_id)
    return {"token": token, "path": f"/r/{token}"}


@router.delete("/matches/{match_id}/share", status_code=204)
def unshare(match_id: str, request: Request) -> Response:
    _match(match_id)
    users().revoke_share(match_id)
    audit(request, "match.unshare", match_id)
    return Response(status_code=204)


def _shared(token: str) -> tuple[str, str]:
    _shares_on()
    match_id = users().shared_match(token)
    player_id = repo.analysis.get_player(match_id) if match_id else None
    if not match_id or not repo.get(match_id) or not player_id:
        raise HTTPException(status_code=404, detail="That link does not work any more.")
    return match_id, player_id


@router.get("/shared/{token}")
def shared_review(token: str) -> dict[str, Any]:
    """The coached player's moments, clips and explanations; names only, no SteamIDs, no Ask."""
    from app.processing.moment_clips import list_moment_clips

    match_id, player_id = _shared(token)
    match = (repo.get(match_id) or {}).get("match") or {}
    player = next((p for p in match.get("players") or [] if p.get("id") == player_id), {})
    explanations = repo.analysis.explanations(match_id, player_id)
    langs = [e.lang for e in explanations]
    lang = max(set(langs), key=langs.count) if langs else "en"
    clips = {
        c.moment_id: f"/shared/{token}/clips/{c.id}.mp4"
        for c in list_moment_clips(match_id, player_id)
        if c.status == "ready" and c.moment_id
    }
    return {
        "map": match.get("map"),
        "score": match.get("score"),
        "rounds": match.get("rounds"),
        "playerName": player.get("name"),
        "lang": lang,
        "moments": [
            {**m.model_dump(by_alias=True, include={"id", "round", "t0", "t1", "kind", "picked_because"}), "clip": clips.get(m.id)}
            for m in repo.analysis.moments(match_id, player_id)
        ],
        "explanations": {e.target: e.text for e in explanations if e.lang == lang},
    }


@router.get("/shared/{token}/clips/{clip_id}.mp4")
def shared_clip(token: str, clip_id: str) -> FileResponse:
    from app.processing.moment_clips import list_moment_clips, moment_clip_file

    match_id, player_id = _shared(token)
    clip = next((c for c in list_moment_clips(match_id, player_id) if c.id == clip_id and c.moment_id), None)
    if clip is None or clip.status != "ready":
        raise HTTPException(status_code=404, detail="Clip not found.")
    return FileResponse(moment_clip_file(match_id, clip_id), media_type="video/mp4", headers={"Cache-Control": "private, max-age=600"})
