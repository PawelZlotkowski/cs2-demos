"""Which matches the coach may read for the current request or job (A04).

``None`` means every match (accounts off, or the local admin). The coach
tools, the player history and the Coach page filter by it, so a player's
history never counts another user's match.
"""

from __future__ import annotations

from contextvars import ContextVar

visible_matches: ContextVar[frozenset[str] | None] = ContextVar("visible_matches", default=None)


def allowed(match_id: str) -> bool:
    scope = visible_matches.get()
    return scope is None or match_id in scope


def owner_scope(owner_id: str | None) -> frozenset[str] | None:
    """The matches a user owns, or None when accounts are off."""
    from app.auth.store import users
    from app.core.config import settings
    from app.repositories.matches import repo

    if not settings.auth_enabled or owner_id is None:
        return None
    return frozenset(users().owned_match_ids(owner_id, repo.list_ids()))


def scope_for_match(match_id: str) -> frozenset[str] | None:
    """Background jobs of a match see what its owner sees."""
    from app.auth.store import users
    from app.core.config import settings

    if not settings.auth_enabled:
        return None
    return owner_scope(users().owner(match_id))


# MCP clients with a read-only token may not call the two tools that write
can_write: ContextVar[bool] = ContextVar("can_write", default=True)
