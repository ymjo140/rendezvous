"""Shared crew/list read policy. Unknown visibility fails closed.

list_only exposes the crew profile and published lists, never its membership or
visit activity. A folder's public flag cannot override its crew's visibility.
"""
from fastapi import HTTPException
from sqlalchemy import and_, or_, select

from domain import models

VISIBLE = ("list_only", "public", "open")
ALLOWED_VIS = ("private", *VISIBLE)


def members(crew):
    return list(dict.fromkeys(([crew.host_id] if crew.host_id else []) + list(crew.member_ids or [])))


def is_member(crew, user):
    return bool(crew and user and user.id in members(crew))


def can_view_activity(crew, user):
    return bool(crew and (crew.visibility in ("public", "open") or is_member(crew, user)))


def require_crew(crew, user, *, activity=False):
    allowed = can_view_activity(crew, user) if activity else bool(
        crew and (crew.visibility in VISIBLE or is_member(crew, user))
    )
    if not allowed:
        raise HTTPException(status_code=404, detail="모임을 찾을 수 없어요.")
    return crew


def public_folder_clause(*, identify_owner=False):
    """SQL predicate for discovery; personal curator views must omit list_only."""
    visibility = ("public", "open") if identify_owner else VISIBLE
    crew_is_visible = select(models.Community.id).where(
        models.Community.id == models.SaveFolder.community_id,
        models.Community.visibility.in_(visibility),
    ).exists()
    return and_(models.SaveFolder.is_public.is_(True), or_(
        models.SaveFolder.community_id.is_(None), crew_is_visible,
    ))


def require_folder(db, folder, user):
    if folder:
        if folder.community_id:
            crew = db.get(models.Community, folder.community_id)
            if is_member(crew, user):
                return folder
            if crew and crew.visibility in VISIBLE and folder.is_public:
                return folder
        elif folder.is_public or (user and folder.user_id == user.id):
            return folder
    raise HTTPException(status_code=404, detail="리스트를 찾을 수 없어요.")


def can_identify_owner(db, folder, user):
    if not folder.community_id:
        return True
    return can_view_activity(db.get(models.Community, folder.community_id), user)
