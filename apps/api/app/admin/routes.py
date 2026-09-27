"""The admin panel's API (doc 30 §5). Every route here is admin-only (``guard``'s role rules).

Changes are written to the audit log with who made them.
"""

from __future__ import annotations

from typing import Any, Literal

from fastapi import APIRouter, File, HTTPException, Query, Request, Response, UploadFile
from fastapi.responses import PlainTextResponse
from pydantic import Field

from app.admin import services
from app.auth.deps import audit, current_user
from app.auth.routes import user_out
from app.auth.store import users
from app.core.config import settings
from app.models.contracts import CamelModel, MatchStatus
from app.services.gpu import gpu

router = APIRouter(prefix="/admin")


# --- overview ---


@router.get("/overview")
async def overview() -> dict[str, Any]:
    from app.repositories.matches import repo
    from app.services.system import system_status

    system = await system_status()
    matches = [repo.get(mid) or {} for mid in repo.list_ids()]
    real = [m for m in matches if not m.get("is_sample")]
    jobs = services.jobs()
    store_rows = services.storage()
    _, recent = users().audit_rows(limit=8)
    return {
        "system": system.model_dump(by_alias=True),
        "counts": {
            "users": users().count_users(),
            "matches": len(real),
            "reviewed": sum(1 for m in real if m.get("status") == MatchStatus.complete),
            "failed": sum(1 for m in real if m.get("status") == MatchStatus.failed),
            "processing": sum(1 for m in real if m.get("status") in services.PROCESSING),
            "gpuWaiting": len(jobs["gpu"]["waiting"]),
            "gpuRunning": len(jobs["gpu"]["running"]),
            "clipsFailed": sum(1 for c in jobs["clips"] if c["status"] == "failed"),
        },
        "storage": store_rows,
        "authEnabled": settings.auth_enabled,
        "recent": recent,
    }


# --- users and invites ---


class UserPatch(CamelModel):
    role: Literal["admin", "labeller", "player"] | None = None
    disabled: bool | None = None
    display_name: str | None = Field(None, alias="displayName", min_length=1, max_length=40)


@router.get("/users")
def list_users() -> list[dict[str, Any]]:
    from app.repositories.matches import repo

    store = users()
    ids = [m for m in repo.list_ids() if not (repo.get(m) or {}).get("is_sample")]
    out = []
    for u in store.users():
        owned = store.owned_match_ids(u["id"], ids)
        out.append(
            {
                **user_out(u).model_dump(by_alias=True),
                "matches": len(owned),
                "bytes": sum(services.match_size(m) for m in owned),
                "sessions": len(store.sessions(u["id"])),
            }
        )
    return out


def _user_or_404(user_id: str) -> dict[str, Any]:
    user = users().user(user_id)
    if user is None:
        raise HTTPException(status_code=404, detail="User not found.")
    return user


def _keep_an_admin(user: dict[str, Any], losing: bool) -> None:
    if losing and user["role"] == "admin" and not user["disabled_at"] and users().admin_count() <= 1:
        raise HTTPException(status_code=400, detail="That is the only admin. Make someone else admin first.")


@router.patch("/users/{user_id}")
def patch_user(user_id: str, body: UserPatch, request: Request) -> dict[str, Any]:
    from app.auth.store import iso

    user = _user_or_404(user_id)
    changes: dict[str, Any] = {}
    if body.role and body.role != user["role"]:
        _keep_an_admin(user, body.role != "admin")
        changes["role"] = body.role
    if body.disabled is not None and body.disabled != bool(user["disabled_at"]):
        _keep_an_admin(user, body.disabled)
        changes["disabled_at"] = iso() if body.disabled else None
    if body.display_name:
        changes["display_name"] = body.display_name.strip()
    updated = users().update_user(user_id, **changes)
    if changes.get("disabled_at"):
        users().delete_sessions_of(user_id)
    audit(request, "admin.user_update", user_id, {k: v for k, v in changes.items()})
    return user_out(updated or user).model_dump(by_alias=True)


@router.post("/users/{user_id}/signout")
def signout_user(user_id: str, request: Request) -> dict[str, int]:
    _user_or_404(user_id)
    n = users().delete_sessions_of(user_id)
    audit(request, "admin.user_signout", user_id, {"sessions": n})
    return {"ended": n}


@router.post("/users/{user_id}/reset")
def reset_code(user_id: str, request: Request) -> dict[str, str]:
    """A one-time code (24 hours) the user types on the sign-in page to set a new password."""
    user = _user_or_404(user_id)
    if not user["username"]:
        raise HTTPException(status_code=400, detail="This account signs in with Steam only.")
    code = users().create_reset_code(user_id)
    audit(request, "admin.user_reset", user_id)
    return {"code": code, "link": f"/signin?reset={code}"}


@router.delete("/users/{user_id}", status_code=204)
def delete_user(user_id: str, request: Request) -> Response:
    user = _user_or_404(user_id)
    _keep_an_admin(user, True)
    if user_id == current_user(request)["id"]:
        raise HTTPException(status_code=400, detail="Delete your own account from Settings.")
    n = services.delete_user_everything(user_id)
    audit(request, "admin.user_delete", user_id, {"matches": n, "name": user["display_name"]})
    return Response(status_code=204)


class InviteRequest(CamelModel):
    count: int = Field(1, ge=1, le=50)
    role: Literal["labeller", "player"] = "player"
    days: int | None = Field(14, ge=1, le=365)


@router.get("/invites")
def list_invites() -> list[dict[str, Any]]:
    names = {u["id"]: u["display_name"] for u in users().users()}
    return [{**i, "usedByName": names.get(i["usedBy"])} for i in users().invites()]


@router.post("/invites")
def create_invites(body: InviteRequest, request: Request) -> list[dict[str, Any]]:
    """Codes are shown once; only a hint is kept."""
    uid = current_user(request)["id"]
    out = []
    for _ in range(body.count):
        code, invite = users().create_invite(uid, body.role, body.days)
        out.append({**invite, "code": code})
    audit(request, "admin.invites_create", None, {"count": body.count, "role": body.role})
    return out


@router.delete("/invites/{invite_id}", status_code=204)
def revoke_invite(invite_id: str, request: Request) -> Response:
    if not users().revoke_invite(invite_id):
        raise HTTPException(status_code=404, detail="No open invite with that id.")
    audit(request, "admin.invite_revoke", invite_id)
    return Response(status_code=204)


# --- matches ---


class OwnerRequest(CamelModel):
    owner_id: str = Field(alias="ownerId")


@router.get("/matches")
def list_matches() -> list[dict[str, Any]]:
    return services.admin_matches()


@router.put("/matches/{match_id}/owner")
def set_owner(match_id: str, body: OwnerRequest, request: Request) -> dict[str, str]:
    from app.repositories.matches import repo

    if not repo.get(match_id):
        raise HTTPException(status_code=404, detail="Match not found.")
    _user_or_404(body.owner_id)
    users().set_owner(match_id, body.owner_id)
    audit(request, "admin.match_owner", match_id, {"owner": body.owner_id})
    return {"ownerId": body.owner_id}


@router.delete("/matches/{match_id}", status_code=204)
def delete_match(match_id: str, request: Request) -> Response:
    if not services.delete_match_everything(match_id):
        raise HTTPException(status_code=404, detail="Match not found.")
    audit(request, "admin.match_delete", match_id)
    return Response(status_code=204)


@router.post("/matches/{match_id}/reprocess")
def reprocess(match_id: str, request: Request) -> dict[str, str]:
    """Parse a failed upload again from the start."""
    from app.processing.pipeline import pipeline
    from app.repositories.matches import repo

    record = repo.get(match_id)
    if not record or record.get("is_sample"):
        raise HTTPException(status_code=404, detail="Match not found.")
    if record["status"] != MatchStatus.failed:
        raise HTTPException(status_code=409, detail="Only a failed match can be processed again.")
    repo.set_status(match_id, MatchStatus.uploaded)
    pipeline.enqueue(match_id)
    audit(request, "admin.match_reprocess", match_id)
    return {"status": "uploaded"}


# --- jobs ---


@router.get("/jobs")
def list_jobs() -> dict[str, Any]:
    return services.jobs()


@router.post("/jobs/{job_id}/cancel", status_code=204)
def cancel_job(job_id: str, request: Request) -> Response:
    if not gpu.cancel(job_id):
        raise HTTPException(status_code=409, detail="Only a job that has not started can be cancelled.")
    audit(request, "admin.job_cancel", job_id)
    return Response(status_code=204)


@router.post("/clips/{clip_id}/retry", status_code=204)
def retry_clip(clip_id: str, request: Request) -> Response:
    from app.processing.moment_clips import moment_recorder
    from app.repositories.matches import repo

    job = next((c for c in repo.analysis.all_clip_jobs(limit=100000) if f"c{c['id']}" == clip_id), None)
    if job is None:
        raise HTTPException(status_code=404, detail="Clip not found.")
    repo.analysis.set_clip_status(clip_id, "queued")
    moment_recorder.enqueue(job["matchId"], job["playerId"])
    audit(request, "admin.clip_retry", clip_id)
    return Response(status_code=204)


# --- model, settings ---


@router.get("/model")
async def model() -> dict[str, Any]:
    from app.services.system import system_status

    system = await system_status()
    return {
        "system": system.model_dump(by_alias=True),
        "stats": services.model_stats(),
        "command": services.llama_command(),
        "sampling": settings.llm_sampling,
        "maxSteps": settings.coach_max_steps,
    }


@router.get("/settings")
def get_settings() -> dict[str, Any]:
    return services.list_settings()


class SettingRequest(CamelModel):
    value: Any = None


@router.put("/settings/{key}")
def put_setting(key: str, body: SettingRequest, request: Request) -> dict[str, Any]:
    try:
        value = services.set_setting(key, body.value, current_user(request)["id"])
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    audit(request, "admin.setting", key, {"value": services._jsonable(value)})
    return {"key": key, "value": services._jsonable(value)}


@router.delete("/settings/{key}")
def reset_setting(key: str, request: Request) -> dict[str, Any]:
    try:
        value = services.reset_setting(key)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    audit(request, "admin.setting_reset", key)
    return {"key": key, "value": services._jsonable(value)}


# --- knowledge ---


class NoteEdit(CamelModel):
    title: str = Field(min_length=3, max_length=120)
    text: str = Field(min_length=20, max_length=3000)


@router.get("/knowledge")
def knowledge_admin() -> dict[str, Any]:
    from app.repositories.extras import extras
    from app.services.knowledge import list_knowledge, own_notes

    titles = {r.id: r.title for r in list_knowledge()}
    flags = [{**f, "title": titles.get(f["passageId"])} for f in extras().flags()]
    return {"notes": own_notes(), "flags": flags, "passages": len(titles)}


@router.put("/knowledge/notes/{map_name}/{index}", status_code=204)
def edit_note(map_name: str, index: int, body: NoteEdit, request: Request) -> Response:
    from app.services.knowledge import edit_note as edit

    try:
        edit(map_name, index, body.title, body.text)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Note not found.") from exc
    audit(request, "admin.note_edit", f"{map_name}/{index}", {"title": body.title})
    return Response(status_code=204)


@router.delete("/knowledge/notes/{map_name}/{index}", status_code=204)
def delete_note(map_name: str, index: int, request: Request) -> Response:
    from app.services.knowledge import delete_note as remove

    try:
        remove(map_name, index)
    except KeyError as exc:
        raise HTTPException(status_code=404, detail="Note not found.") from exc
    audit(request, "admin.note_delete", f"{map_name}/{index}")
    return Response(status_code=204)


@router.delete("/knowledge/flags/{flag_id}", status_code=204)
def resolve_flag(flag_id: int, request: Request) -> Response:
    from app.repositories.extras import extras

    if not extras().resolve_flag(flag_id):
        raise HTTPException(status_code=404, detail="Flag not found.")
    audit(request, "admin.flag_resolve", str(flag_id))
    return Response(status_code=204)


@router.post("/knowledge/rebuild")
def rebuild(request: Request) -> dict[str, int]:
    from app.services.knowledge import rebuild_index

    n = rebuild_index()
    audit(request, "admin.knowledge_rebuild", None, {"passages": n})
    return {"passages": n}


# --- study ---


@router.get("/study")
def study() -> dict[str, Any]:
    return services.study_summary()


@router.get("/study/export.csv")
def study_export(request: Request) -> PlainTextResponse:
    audit(request, "admin.study_export")
    return PlainTextResponse(
        services.study_csv(),
        media_type="text/csv",
        headers={"Content-Disposition": 'attachment; filename="study-export.csv"'},
    )


# --- storage and backup ---


class CleanupRequest(CamelModel):
    work: bool = False
    traces_older_than_days: int | None = Field(None, alias="tracesOlderThanDays", ge=1, le=3650)
    failed: bool = False


@router.get("/storage")
def storage() -> dict[str, Any]:
    return services.storage()


@router.post("/storage/cleanup")
def cleanup(body: CleanupRequest, request: Request) -> dict[str, Any]:
    result = services.cleanup(work=body.work, traces_days=body.traces_older_than_days, failed=body.failed)
    audit(request, "admin.cleanup", None, result)
    return result


@router.get("/backup")
def backup(request: Request) -> Response:
    data, name = services.backup_zip()
    audit(request, "admin.backup", None, {"bytes": len(data)})
    return Response(data, media_type="application/zip", headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.post("/restore")
async def restore(request: Request, file: UploadFile = File(...)) -> dict[str, Any]:
    raw = await file.read(200 * 1024 * 1024 + 1)
    if len(raw) > 200 * 1024 * 1024:
        raise HTTPException(status_code=400, detail="That backup is larger than 200 MB.")
    try:
        restored = services.restore_zip(raw)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    audit(request, "admin.restore", None, restored)
    return {**restored, "restart": True}


# --- security ---


class TokenRequest(CamelModel):
    name: str = Field(min_length=1, max_length=60)
    scope: Literal["read", "write"] = "read"


@router.get("/security")
def security() -> dict[str, Any]:
    store = users()
    names = {u["id"]: u["display_name"] for u in store.users()}
    sessions = [{**s, "userName": names.get(s["userId"])} for s in store.sessions()]
    tokens = [{**t, "userName": names.get(t["userId"])} for t in store.tokens()]
    return {"sessions": sessions, "failedLogins": store.failed_logins(), "tokens": tokens, "authEnabled": settings.auth_enabled}


@router.delete("/sessions/{session_id}", status_code=204)
def end_session(session_id: str, request: Request) -> Response:
    if not users().delete_session(session_id):
        raise HTTPException(status_code=404, detail="Session not found.")
    audit(request, "admin.session_end", session_id)
    return Response(status_code=204)


@router.post("/tokens")
def create_token(body: TokenRequest, request: Request) -> dict[str, Any]:
    """A token for another app (an MCP client, a script). Shown once."""
    token, row = users().create_token(current_user(request)["id"], body.name.strip(), body.scope)
    audit(request, "admin.token_create", row["id"], {"name": row["name"], "scope": row["scope"]})
    return {**row, "token": token}


@router.delete("/tokens/{token_id}", status_code=204)
def revoke_token(token_id: str, request: Request) -> Response:
    if not users().revoke_token(token_id):
        raise HTTPException(status_code=404, detail="No live token with that id.")
    audit(request, "admin.token_revoke", token_id)
    return Response(status_code=204)


# --- audit log ---


@router.get("/audit")
def audit_log(
    action: str | None = None,
    limit: int = Query(100, ge=1, le=500),
    offset: int = Query(0, ge=0),
) -> dict[str, Any]:
    total, rows = users().audit_rows(action=action, limit=limit, offset=offset)
    return {"total": total, "items": rows}

