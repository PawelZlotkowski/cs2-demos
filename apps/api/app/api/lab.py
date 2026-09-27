"""System status, coached players and the admin Lab (doc 29: R01, R03, R05)."""

from fastapi import APIRouter, HTTPException, Query

from app.core.config import settings
from app.models.contracts import CoachedPlayer, SystemStatus, TraceDetail, TracePage
from app.repositories.matches import repo
from app.services.system import system_status
from app.services.traces import get_trace, list_traces

router = APIRouter()


@router.get("/system", response_model=SystemStatus)
async def get_system() -> SystemStatus:
    return await system_status()


@router.get("/features")
def features() -> dict[str, bool]:
    """Switches the web app needs before it draws the nav."""
    return {"lab": settings.lab_enabled}


@router.get("/players", response_model=list[CoachedPlayer])
def coached_players() -> list[CoachedPlayer]:
    """Players picked for review, most analysed first, for the Coach page."""
    out = []
    for pid, match_ids in repo.analysis.coached_players():
        name, maps = pid, []
        for mid in match_ids:
            match = (repo.get(mid) or {}).get("match") or {}
            for p in match.get("players") or []:
                if p.get("id") == pid:
                    name = p.get("name") or name
            if match.get("map") and match["map"] not in maps:
                maps.append(match["map"])
        out.append(CoachedPlayer(id=pid, name=name, matches=len(match_ids), maps=maps))
    return sorted(out, key=lambda p: -p.matches)


def _require_lab() -> None:
    if not settings.lab_enabled:
        raise HTTPException(status_code=404, detail="The Lab is off. Set RR_LAB_ENABLED=true and restart the API.")


@router.get("/lab/traces", response_model=TracePage)
def lab_traces(
    job: str | None = None,
    match_id: str | None = Query(None, alias="matchId"),
    source: str | None = None,
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
) -> TracePage:
    _require_lab()
    return list_traces(job=job, match_id=match_id, source=source, limit=limit, offset=offset)


@router.get("/lab/traces/{trace_id}", response_model=TraceDetail)
def lab_trace(trace_id: str) -> TraceDetail:
    _require_lab()
    trace = get_trace(trace_id)
    if trace is None:
        raise HTTPException(status_code=404, detail="Trace not found")
    return trace
