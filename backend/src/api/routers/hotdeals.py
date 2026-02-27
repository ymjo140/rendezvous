from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models

router = APIRouter()


def _first_non_empty(*values: Optional[str]) -> Optional[str]:
    for value in values:
        if value:
            return value
    return None


def _resolve_rule_title(rule: models.OfferRule) -> str:
    title = _first_non_empty(
        getattr(rule, "title", None),
        getattr(rule, "benefit_title", None),
        getattr(rule, "benefit", None),
        getattr(rule, "rule_name", None),
    )
    if title:
        return title
    base = getattr(rule, "base_benefit_json", None)
    if isinstance(base, dict):
        return (
            base.get("title")
            or base.get("name")
            or base.get("benefit_title")
            or base.get("benefit")
            or ""
        )
    return ""


def _resolve_rule_description(rule: models.OfferRule) -> str:
    description = _first_non_empty(
        getattr(rule, "description", None),
        getattr(rule, "benefit_value", None),
    )
    if description:
        return description
    base = getattr(rule, "base_benefit_json", None)
    if isinstance(base, dict):
        return base.get("description") or base.get("value") or ""
    return ""


def _serialize_end_time(rule: models.OfferRule) -> Optional[str]:
    value = _first_non_empty(
        getattr(rule, "end_date", None),
        getattr(rule, "end_time", None),
    )
    if isinstance(value, datetime):
        return value.isoformat()
    if isinstance(value, str) and value:
        return value
    return None


def _resolve_place_image(place: models.Place) -> Optional[str]:
    return _first_non_empty(getattr(place, "image_url", None))


@router.get("/api/hotdeals")
def get_hot_deals(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    rows = (
        db.query(models.OfferRule, models.Place)
        .join(models.Place, models.OfferRule.place_id == models.Place.id)
        .filter(models.OfferRule.enabled == True)
        .all()
    )

    deals: List[Dict[str, Any]] = []
    for rule, place in rows:
        deals.append(
            {
                "deal_id": rule.id,
                "benefit_title": _resolve_rule_title(rule),
                "description": _resolve_rule_description(rule),
                "end_time": _serialize_end_time(rule),
                "store_id": place.id,
                "store_name": place.name,
                "image_url": _resolve_place_image(place),
            }
        )

    return deals
