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


@router.post("/verify-business")
def verify_business(payload: Dict[str, Any], db: Session = Depends(get_db)):
    """사업자등록번호 진위확인(국세청 상태조회, 공공데이터포털).
    가입 전 호출이라 인증 불요. 키는 서버 env(NTS_API_KEY)에만 — 브라우저 노출 금지.
    외부 API 장애 시 status='unavailable' 반환(가입 자체를 막지 않도록 FE가 폴백)."""
    from core.config import settings

    bizno = "".join(ch for ch in str(payload.get("business_number") or "") if ch.isdigit())
    if len(bizno) != 10:
        raise HTTPException(status_code=400, detail="사업자등록번호는 10자리여야 합니다.")

    if not settings.NTS_API_KEY:
        return {"valid": None, "status": "unavailable", "message": "진위확인 서비스가 설정되지 않았습니다."}

    try:
        import requests as _rq
        res = _rq.post(
            f"https://api.odcloud.kr/api/nts-businessman/v1/status?serviceKey={settings.NTS_API_KEY}",
            json={"b_no": [bizno]},
            timeout=10,
        )
        if res.status_code != 200:
            print(f"[verify-business] NTS API {res.status_code}")
            return {"valid": None, "status": "unavailable", "message": "진위확인 서비스 응답 오류"}
        data = (res.json() or {}).get("data") or []
        if not data:
            return {"valid": None, "status": "unavailable", "message": "진위확인 결과 없음"}
        item = data[0]
        stt_cd = item.get("b_stt_cd") or ""
        stt = item.get("b_stt") or ""
        if not stt_cd:
            # 국세청에 등록되지 않은 번호
            return {"valid": False, "status": "unregistered", "message": "국세청에 등록되지 않은 사업자등록번호예요."}
        if stt_cd == "03":
            return {"valid": False, "status": "closed", "message": "폐업 처리된 사업자등록번호예요."}
        # 01=계속사업자, 02=휴업자 → 통과(휴업은 재개 준비 가능)
        return {"valid": True, "status": stt_cd, "message": f"확인 완료 ({stt})"}
    except Exception as exc:
        print(f"[verify-business] 실패: {exc}")
        return {"valid": None, "status": "unavailable", "message": "진위확인 서비스 연결 실패"}


@router.get("/stores/{store_id}/pulse")
def store_pulse(store_id: int, days: int = 7, db: Session = Depends(get_db)):
    """가게 수요 펄스: B2C 행동로그(노출/클릭/저장) 집계 + 앱 예약 정산.
    ⚠️ 데모: 소유권 검증은 추후(RLS 보류 정책과 동일). 읽기 전용 집계만 제공."""
    days = max(1, min(int(days or 7), 30))
    sid = str(store_id)

    impressions = clicks = saves = 0
    daily: list = []
    try:
        rows = db.execute(
            text(
                """
                SELECT to_char(created_at, 'YYYY-MM-DD') AS d, action_type, COUNT(*)
                FROM action_logs
                WHERE entity_type = 'place' AND entity_id = :sid
                  AND created_at >= NOW() - (:days || ' days')::interval
                GROUP BY 1, 2
                """
            ),
            {"sid": sid, "days": days},
        ).fetchall()
        imp_types = {"impression", "offer_impression", "view"}
        click_types = {"click", "detail_view", "offer_click", "reserve_click"}
        save_types = {"save", "like"}
        by_day: Dict[str, Dict[str, int]] = {}
        for d, at, cnt in rows:
            cnt = int(cnt)
            bucket = by_day.setdefault(d, {"impressions": 0, "clicks": 0})
            if at in imp_types:
                impressions += cnt
                bucket["impressions"] += cnt
            elif at in click_types:
                clicks += cnt
                bucket["clicks"] += cnt
            elif at in save_types:
                saves += cnt
        daily = [{"date": d, **v} for d, v in sorted(by_day.items())]
    except Exception as exc:
        print(f"[pulse] action_logs 집계 실패: {exc}")

    week_reservations = 0
    deposit_week = deposit_month = 0
    pending = 0
    try:
        row = db.execute(
            text(
                """
                SELECT
                  COUNT(*) FILTER (WHERE date >= to_char(date_trunc('week', NOW()), 'YYYY-MM-DD')
                                     AND status IN ('confirmed','completed'))      AS week_cnt,
                  COALESCE(SUM(deposit_amount) FILTER (
                      WHERE date >= to_char(date_trunc('week', NOW()), 'YYYY-MM-DD')
                        AND status IN ('confirmed','completed')), 0)               AS week_deposit,
                  COALESCE(SUM(deposit_amount) FILTER (
                      WHERE date >= to_char(date_trunc('month', NOW()), 'YYYY-MM-DD')
                        AND status IN ('confirmed','completed')), 0)               AS month_deposit,
                  COUNT(*) FILTER (WHERE status = 'confirmed'
                                     AND date >= to_char(NOW(), 'YYYY-MM-DD'))     AS pending_cnt
                FROM user_reservations
                WHERE place_id = :pid
                """
            ),
            {"pid": store_id},
        ).fetchone()
        if row:
            week_reservations = int(row[0] or 0)
            deposit_week = int(row[1] or 0)
            deposit_month = int(row[2] or 0)
            pending = int(row[3] or 0)
    except Exception as exc:
        print(f"[pulse] 예약 정산 집계 실패: {exc}")

    return {
        "store_id": store_id,
        "days": days,
        "impressions": impressions,
        "clicks": clicks,
        "saves": saves,
        "ctr": round(clicks / impressions, 4) if impressions else None,
        "daily": daily,
        "week_reservations": week_reservations,
        "deposit_week": deposit_week,
        "deposit_month": deposit_month,
        "pending_reservations": pending,
    }


@router.get("/stores/{store_id}/offer-performance")
def offer_performance(store_id: int, db: Session = Depends(get_db)):
    """핫딜(오퍼룰)별 성과 귀속: 노출 → 클릭 → 예약 → 예약금.
    사장님 설득용 '이 핫딜이 만든 매출' 리포트. ⚠️ 데모: 소유권 검증 추후."""
    rules = (
        db.query(models.OfferRule)
        .filter(models.OfferRule.place_id == store_id)
        .order_by(models.OfferRule.id.asc())
        .all()
    )
    if not rules:
        return {"store_id": store_id, "rules": []}

    rule_ids = [str(r.id) for r in rules]

    # 1) 노출/클릭 (B2C action_logs, entity_type='offer')
    funnel: Dict[str, Dict[str, int]] = {}
    try:
        rows = db.execute(
            text(
                """
                SELECT entity_id, action_type, COUNT(*)
                FROM action_logs
                WHERE entity_type = 'offer' AND entity_id = ANY(:ids)
                GROUP BY 1, 2
                """
            ),
            {"ids": rule_ids},
        ).fetchall()
        for eid, at, cnt in rows:
            bucket = funnel.setdefault(str(eid), {"impressions": 0, "clicks": 0})
            if at in ("offer_impression", "impression", "view"):
                bucket["impressions"] += int(cnt)
            elif at in ("offer_click", "click", "reserve_click"):
                bucket["clicks"] += int(cnt)
    except Exception as exc:
        print(f"[offer-perf] action_logs 집계 실패: {exc}")

    # 2) 예약/예약금 귀속 (user_reservations.offer_rule_id)
    booking: Dict[int, Dict[str, int]] = {}
    try:
        rows = db.execute(
            text(
                """
                SELECT offer_rule_id,
                       COUNT(*) FILTER (WHERE status NOT IN ('cancelled','no_show')) AS cnt,
                       COALESCE(SUM(deposit_amount) FILTER (
                           WHERE status NOT IN ('cancelled','no_show')), 0)          AS deposit
                FROM user_reservations
                WHERE place_id = :pid AND offer_rule_id IS NOT NULL
                GROUP BY 1
                """
            ),
            {"pid": store_id},
        ).fetchall()
        for rid, cnt, deposit in rows:
            booking[int(rid)] = {"reservations": int(cnt or 0), "deposit": int(deposit or 0)}
    except Exception as exc:
        print(f"[offer-perf] 예약 귀속 집계 실패: {exc}")

    out = []
    for r in rules:
        base = r.base_benefit_json if isinstance(r.base_benefit_json, dict) else {}
        f = funnel.get(str(r.id), {"impressions": 0, "clicks": 0})
        b = booking.get(r.id, {"reservations": 0, "deposit": 0})
        cap = r.inventory_cap or 0
        out.append({
            "rule_id": r.id,
            "name": r.rule_name or base.get("title") or "핫딜",
            "benefit_title": base.get("title") or "",
            "enabled": bool(r.enabled),
            "impressions": f["impressions"],
            "clicks": f["clicks"],
            "reservations": b["reservations"],
            "deposit_sum": b["deposit"],
            "inventory_cap": cap,
            "inventory_used": r.inventory_used or 0,
            "remaining": (max(0, cap - (r.inventory_used or 0)) if cap > 0 else None),
            "ctr": round(f["clicks"] / f["impressions"], 4) if f["impressions"] else None,
            "conversion": round(b["reservations"] / f["clicks"], 4) if f["clicks"] else None,
        })

    totals = {
        "impressions": sum(x["impressions"] for x in out),
        "clicks": sum(x["clicks"] for x in out),
        "reservations": sum(x["reservations"] for x in out),
        "deposit_sum": sum(x["deposit_sum"] for x in out),
    }
    return {"store_id": store_id, "rules": out, "totals": totals}


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
