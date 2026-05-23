from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.database import get_db
from api.dependencies import get_current_user
from domain import models

router = APIRouter()


def _assert_store_owner(db: Session, store_id: int, current_user) -> models.Place:
    """JWT 사용자가 해당 store(=place)의 소유주인지 검증. 아니면 4xx."""
    if current_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")
    place = db.query(models.Place).filter(models.Place.id == store_id).first()
    if place is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
    if place.owner_id is None or str(place.owner_id) != str(current_user.id):
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Not your store")
    return place

DEFAULT_LAT = 37.5665
DEFAULT_LNG = 126.9780


class StoreCreate(BaseModel):
    place_id: str | int | None = None
    name: str | None = None
    category: str | None = None
    address: str | None = None


@router.get("/stores")
async def list_merchant_stores(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    stores = (
        db.query(models.Place)
        .filter(models.Place.owner_id == str(current_user.id))
        .order_by(models.Place.id.asc())
        .all()
    )

    return {
        "stores": [
            {
                "id": store.id,
                "name": store.name,
                "location": store.address,
                "owner_id": store.owner_id,
            }
            for store in stores
        ]
    }


@router.post("/stores")
async def create_merchant_store(
    payload: StoreCreate,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Unauthorized")

    if payload.place_id is not None:
        place_id_value = payload.place_id
        if isinstance(place_id_value, str) and place_id_value.isdigit():
            place_id_value = int(place_id_value)
        place = (
            db.query(models.Place)
            .filter(models.Place.id == place_id_value)
            .first()
        )
        if place is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")

        existing_owner = str(place.owner_id) if place.owner_id is not None else None
        current_owner = str(current_user.id)
        if existing_owner and existing_owner != current_owner:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="This store is already claimed by another user",
            )

        place.owner_id = current_owner
        db.commit()
        db.refresh(place)

        return {
            "store": {
                "id": place.id,
                "name": place.name,
                "location": place.address,
                "owner_id": place.owner_id,
            }
        }

    if not payload.name:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="place_id or name is required",
        )

    store = models.Place(
        name=payload.name,
        category=payload.category,
        address=payload.address,
        owner_id=str(current_user.id),
        lat=DEFAULT_LAT,
        lng=DEFAULT_LNG,
    )

    db.add(store)
    db.commit()
    db.refresh(store)

    return {
        "store": {
            "id": store.id,
            "name": store.name,
            "location": store.address,
            "owner_id": store.owner_id,
        }
    }


# =========================================================
# Offer Rules (안전 쓰기 경로: JWT 인증 + 소유권 검증 + service-role DB)
# 머천트 프론트는 supabase 직접 쓰기 대신 이 엔드포인트를 호출한다.
# =========================================================


class OfferRulePayload(BaseModel):
    rule_name: Optional[str] = None
    day_of_week_mask: Optional[int] = 0
    time_blocks_json: Optional[List[Dict[str, Any]]] = None
    party_size_min: Optional[int] = None
    party_size_max: Optional[int] = None
    lead_time_thresholds_json: Optional[Dict[str, Any]] = None
    base_benefit_json: Optional[Dict[str, Any]] = None
    enabled: Optional[bool] = True


def _serialize_rule(rule: models.OfferRule) -> Dict[str, Any]:
    return {
        "id": rule.id,
        "place_id": rule.place_id,
        "rule_name": rule.rule_name,
        "day_of_week_mask": rule.day_of_week_mask,
        "time_blocks_json": rule.time_blocks_json,
        "party_size_min": rule.party_size_min,
        "party_size_max": rule.party_size_max,
        "lead_time_thresholds_json": rule.lead_time_thresholds_json,
        "base_benefit_json": rule.base_benefit_json,
        "enabled": rule.enabled,
    }


@router.get("/stores/{store_id}/offer-rules")
async def list_offer_rules(
    store_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _assert_store_owner(db, store_id, current_user)
    rules = (
        db.query(models.OfferRule)
        .filter(models.OfferRule.place_id == store_id)
        .order_by(models.OfferRule.id.desc())
        .all()
    )
    return {"rules": [_serialize_rule(r) for r in rules]}


@router.post("/stores/{store_id}/offer-rules")
async def create_offer_rule(
    store_id: int,
    payload: OfferRulePayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _assert_store_owner(db, store_id, current_user)
    rule = models.OfferRule(
        place_id=store_id,  # 클라이언트 값 무시, 경로의 store_id 강제(소유권 검증된 값)
        rule_name=payload.rule_name,
        day_of_week_mask=payload.day_of_week_mask or 0,
        time_blocks_json=payload.time_blocks_json or [],
        party_size_min=payload.party_size_min,
        party_size_max=payload.party_size_max,
        lead_time_thresholds_json=payload.lead_time_thresholds_json or {},
        base_benefit_json=payload.base_benefit_json or {},
        enabled=payload.enabled if payload.enabled is not None else True,
    )
    db.add(rule)
    db.commit()
    db.refresh(rule)
    return {"rule": _serialize_rule(rule)}


@router.patch("/stores/{store_id}/offer-rules/{rule_id}")
async def update_offer_rule(
    store_id: int,
    rule_id: int,
    payload: OfferRulePayload,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _assert_store_owner(db, store_id, current_user)
    rule = (
        db.query(models.OfferRule)
        .filter(models.OfferRule.id == rule_id, models.OfferRule.place_id == store_id)
        .first()
    )
    if rule is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")

    data = payload.model_dump(exclude_unset=True)
    for field in (
        "rule_name",
        "day_of_week_mask",
        "time_blocks_json",
        "party_size_min",
        "party_size_max",
        "lead_time_thresholds_json",
        "base_benefit_json",
        "enabled",
    ):
        if field in data:
            setattr(rule, field, data[field])
    db.commit()
    db.refresh(rule)
    return {"rule": _serialize_rule(rule)}


@router.delete("/stores/{store_id}/offer-rules/{rule_id}")
async def delete_offer_rule(
    store_id: int,
    rule_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _assert_store_owner(db, store_id, current_user)
    deleted = (
        db.query(models.OfferRule)
        .filter(models.OfferRule.id == rule_id, models.OfferRule.place_id == store_id)
        .delete()
    )
    db.commit()
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Rule not found")
    return {"ok": True}


# =========================================================
# Generic merchant resources (store_id text 키 테이블)
# 컬럼 화이트리스트 기반 — 테이블/컬럼명은 코드 고정값, 값만 파라미터화(인젝션 안전).
# 머천트 프론트의 supabase 직접 쓰기를 대체.
# =========================================================

# 테이블별 허용 컬럼 (store_id는 항상 서버가 강제 주입)
_RESOURCE_COLS: Dict[str, set] = {
    "reservations": {"id", "guest_name", "guest_phone", "party_size", "date",
                     "status", "unit_id", "unit_index", "start_time", "end_time",
                     "notes", "source"},
    "table_units": {"id", "name", "min_capacity", "max_capacity", "quantity", "is_private"},
    "time_deals": {"id", "benefit_id", "title", "date", "start_time", "end_time"},
    "store_menus": {"id", "name", "price", "category", "image_url", "is_recommended"},
    "offer_benefits_catalog": {"id", "title", "category", "type", "value",
                               "is_active", "metadata"},
}


def _check_resource(resource: str) -> set:
    cols = _RESOURCE_COLS.get(resource)
    if cols is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Unknown resource")
    return cols


@router.post("/stores/{store_id}/r/{resource}")
async def create_resource(
    store_id: int,
    resource: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    allowed = _check_resource(resource)
    _assert_store_owner(db, store_id, current_user)

    data = {k: v for k, v in payload.items() if k in allowed}
    data["store_id"] = str(store_id)  # 클라이언트 값 무시, 소유권 검증된 store_id 강제
    cols = list(data.keys())
    collist = ", ".join(cols)
    placeholders = ", ".join(f":{c}" for c in cols)
    sql = text(f"INSERT INTO {resource} ({collist}) VALUES ({placeholders}) RETURNING id")
    new_id = db.execute(sql, data).scalar()
    db.commit()
    return {"id": new_id}


@router.patch("/stores/{store_id}/r/{resource}/{row_id}")
async def update_resource(
    store_id: int,
    resource: str,
    row_id: str,
    payload: Dict[str, Any],
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    allowed = _check_resource(resource)
    _assert_store_owner(db, store_id, current_user)

    data = {k: v for k, v in payload.items() if k in allowed and k != "id"}
    if not data:
        return {"ok": True}
    sets = ", ".join(f"{c} = :{c}" for c in data)
    params = dict(data)
    params["_rid"] = row_id
    params["_sid"] = str(store_id)
    sql = text(f"UPDATE {resource} SET {sets} WHERE id = :_rid AND store_id = :_sid")
    db.execute(sql, params)
    db.commit()
    return {"ok": True}


@router.delete("/stores/{store_id}/r/{resource}/{row_id}")
async def delete_resource(
    store_id: int,
    resource: str,
    row_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    _check_resource(resource)
    _assert_store_owner(db, store_id, current_user)
    sql = text(f"DELETE FROM {resource} WHERE id = :_rid AND store_id = :_sid")
    db.execute(sql, {"_rid": row_id, "_sid": str(store_id)})
    db.commit()
    return {"ok": True}
