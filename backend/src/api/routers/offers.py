from datetime import datetime
from typing import Optional, Dict, Any, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session
import json

from core.database import get_db
from domain import models
from api.dependencies import get_current_user

router = APIRouter()


class OfferQueryRequest(BaseModel):
    request_id: Optional[str] = None
    decision_cell: Optional[Dict[str, Any]] = None


def _to_minutes(value: str) -> Optional[int]:
    if not value or ":" not in value:
        return None
    try:
        hours, minutes = value.split(":")
        return int(hours) * 60 + int(minutes)
    except ValueError:
        return None


def _time_blocks_overlap(block: Dict[str, str], target: Dict[str, str]) -> bool:
    start = _to_minutes(block.get("start"))
    end = _to_minutes(block.get("end"))
    target_start = _to_minutes(target.get("start"))
    target_end = _to_minutes(target.get("end"))
    if start is None or end is None or target_start is None or target_end is None:
        return True
    return not (end <= target_start or start >= target_end)


def _offer_matches(offer: models.Offer, decision_cell: Dict[str, Any]) -> bool:
    conditions = offer.conditions_json or {}
    if not conditions:
        return True

    day_of_week = decision_cell.get("day_of_week")
    if day_of_week is not None:
        allowed_days = conditions.get("day_of_week")
        if isinstance(allowed_days, list) and day_of_week not in allowed_days:
            return False

    party_size = decision_cell.get("party_size")
    min_size = conditions.get("party_size_min")
    max_size = conditions.get("party_size_max")
    if party_size and min_size and party_size < min_size:
        return False
    if party_size and max_size and party_size > max_size:
        return False

    time_block = decision_cell.get("time_block") or {}
    time_blocks = conditions.get("time_blocks")
    if isinstance(time_blocks, list) and time_block:
        if not any(_time_blocks_overlap(block, time_block) for block in time_blocks):
            return False

    return True


def _serialize_offer(offer: models.Offer) -> Dict[str, Any]:
    conditions = offer.conditions_json or {}
    return {
        "id": offer.id,
        "place_id": offer.place_id,
        "image": conditions.get("image", ""),
        "title": offer.title or "",
        "restaurant": conditions.get("restaurant", offer.title or "Offer"),
        "rating": conditions.get("rating", 0),
        "location": conditions.get("location", ""),
        "tags": conditions.get("tags", []),
        "liked": False
    }


@router.post("/api/offers/query")
def query_offers(
    req: OfferQueryRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    now = datetime.now()
    decision_cell = req.decision_cell or {}

    offers = (
        db.query(models.Offer)
        .filter(models.Offer.status == "active")
        .filter((models.Offer.valid_from == None) | (models.Offer.valid_from <= now))
        .filter((models.Offer.valid_to == None) | (models.Offer.valid_to >= now))
        .all()
    )

    filtered = [offer for offer in offers if _offer_matches(offer, decision_cell)]
    return [_serialize_offer(offer) for offer in filtered]


@router.get("/api/offers/query")
def query_offers_get(
    request_id: Optional[str] = None,
    decision_cell: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user)
):
    payload = None
    if decision_cell:
        try:
            payload = json.loads(decision_cell)
        except json.JSONDecodeError:
            payload = None
    req = OfferQueryRequest(request_id=request_id, decision_cell=payload)
    return query_offers(req, db, current_user)
