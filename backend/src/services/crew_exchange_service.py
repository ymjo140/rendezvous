"""Crew-to-crew exchange history derived from public list-copy provenance.

ListCopyEvent is the server-owned record of a crew member carrying a public
crew list into another crew. This service exposes only current public crews and
public source lists; it never exposes the copying user.
"""
from typing import Any

from sqlalchemy import func
from sqlalchemy.orm import Session, aliased

from core import visit_time as clock
from domain import models
from services.crew_access import VISIBLE

MAX_ITEMS = 6


def _empty(*, visible: bool, can_borrow: bool = False) -> dict[str, Any]:
    return {
        "visible": visible,
        "observed": False,
        "status": "collecting",
        "can_borrow": can_borrow,
        "summary": {
            "incoming_crews": 0,
            "outgoing_crews": 0,
            "incoming_places": 0,
            "outgoing_places": 0,
        },
        "incoming": [],
        "outgoing": [],
    }


def _created_at(value) -> str:
    return clock.as_utc(value).isoformat() if value else ""


def _item(event, folder, crew) -> dict[str, Any]:
    return {
        "id": event.id,
        "crew_id": str(crew.id),
        "crew_title": crew.title or "이름 없는 크루",
        "crew_icon": crew.icon or "🍽️",
        "list_id": int(folder.id),
        "list_name": folder.name or "공개 리스트",
        "added_count": int(event.added_count or 0),
        "created_at": _created_at(event.created_at),
    }


def _aggregate(query, crew_alias):
    row = query.with_entities(
        func.count(models.ListCopyEvent.id),
        func.coalesce(func.sum(models.ListCopyEvent.added_count), 0),
        func.count(func.distinct(crew_alias.id)),
    ).first()
    return tuple(row or (0, 0, 0))


def _incoming_query(db: Session, community_id: str):
    source_folder = aliased(models.SaveFolder)
    source_crew = aliased(models.Community)
    query = (
        db.query(models.ListCopyEvent, source_folder, source_crew)
        .join(source_folder, source_folder.id == models.ListCopyEvent.source_folder_id)
        .join(source_crew, source_crew.id == models.ListCopyEvent.source_community_id)
        .filter(
            models.ListCopyEvent.destination_community_id == str(community_id),
            models.ListCopyEvent.source_community_id.isnot(None),
            models.ListCopyEvent.source_community_id != str(community_id),
            models.ListCopyEvent.creditable.is_(True),
            source_folder.community_id == source_crew.id,
            source_folder.is_public.is_(True),
            source_crew.visibility.in_(VISIBLE),
        )
    )
    return query, source_crew


def _outgoing_query(db: Session, community_id: str):
    source_folder = aliased(models.SaveFolder)
    destination_folder = aliased(models.SaveFolder)
    destination_crew = aliased(models.Community)
    query = (
        db.query(models.ListCopyEvent, source_folder, destination_crew)
        .join(source_folder, source_folder.id == models.ListCopyEvent.source_folder_id)
        .join(destination_folder, destination_folder.id == models.ListCopyEvent.destination_folder_id)
        .join(destination_crew, destination_crew.id == models.ListCopyEvent.destination_community_id)
        .filter(
            models.ListCopyEvent.source_community_id == str(community_id),
            models.ListCopyEvent.destination_community_id.isnot(None),
            models.ListCopyEvent.destination_community_id != str(community_id),
            models.ListCopyEvent.creditable.is_(True),
            source_folder.community_id == str(community_id),
            source_folder.is_public.is_(True),
            destination_folder.community_id == destination_crew.id,
            destination_crew.visibility.in_(VISIBLE),
        )
    )
    return query, destination_crew


def get_exchange(
    db: Session,
    community_id: str,
    *,
    visible: bool = True,
    can_borrow: bool = False,
    limit: int = MAX_ITEMS,
) -> dict[str, Any]:
    """Return recent public inbound/outbound crew-list exchanges."""
    if not visible:
        return _empty(visible=False, can_borrow=can_borrow)

    try:
        limit = max(1, min(int(limit), MAX_ITEMS))
    except (TypeError, ValueError):
        limit = MAX_ITEMS

    incoming_query, incoming_crew = _incoming_query(db, str(community_id))
    outgoing_query, outgoing_crew = _outgoing_query(db, str(community_id))

    incoming_count, incoming_places, incoming_crews = _aggregate(incoming_query, incoming_crew)
    outgoing_count, outgoing_places, outgoing_crews = _aggregate(outgoing_query, outgoing_crew)

    incoming_rows = incoming_query.order_by(
        models.ListCopyEvent.created_at.desc(), models.ListCopyEvent.id.desc()
    ).limit(limit).all()
    outgoing_rows = outgoing_query.order_by(
        models.ListCopyEvent.created_at.desc(), models.ListCopyEvent.id.desc()
    ).limit(limit).all()

    incoming = [_item(event, folder, crew) for event, folder, crew in incoming_rows]
    outgoing = [_item(event, folder, crew) for event, folder, crew in outgoing_rows]
    observed = bool(incoming_count or outgoing_count)

    return {
        "visible": True,
        "observed": observed,
        "status": "observed" if observed else "collecting",
        "can_borrow": can_borrow,
        "summary": {
            "incoming_crews": int(incoming_crews),
            "outgoing_crews": int(outgoing_crews),
            "incoming_places": int(incoming_places),
            "outgoing_places": int(outgoing_places),
        },
        "incoming": incoming,
        "outgoing": outgoing,
    }
