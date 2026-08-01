import math
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import func, text
from sqlalchemy.orm import Session

from core.database import get_db
from api.dependencies import get_current_user, get_current_merchant
from domain import models
from services import visit_service

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

def _assert_merchant_owns(db: Session, store_id: int, merchant_uid: str) -> models.Place:
    """머천트 Supabase 세션(UUID)이 해당 store 소유주인지 검증."""
    place = db.query(models.Place).filter(models.Place.id == store_id).first()
    if place is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Store not found")
    if str(place.owner_id or "") != str(merchant_uid):
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


# ─────────────────── 단골 관리(#1) ───────────────────

def _persona_label(party_size):
    n = int(party_size or 0)
    if n == 2:
        return ("커플·데이트", "💑")
    if 3 <= n <= 4:
        return ("소규모 모임", "👪")
    if n >= 5:
        return ("단체·회식", "🍻")
    return ("모임", "👥")


def _ago_text(dt):
    from datetime import datetime
    if not dt:
        return ""
    try:
        days = (datetime.utcnow() - dt).days
    except Exception:
        return ""
    if days <= 0:
        return "오늘"
    if days < 7:
        return f"{days}일 전"
    if days < 30:
        return f"{days // 7}주 전"
    return f"{days // 30}개월 전"


@router.get("/stores/{store_id}/regulars")
def store_regulars(store_id: int, db: Session = Depends(get_db)):
    """단골/재방문 관리 — 재방문 의사 손님, 재방문율, 뜸해진 단골, 4축 진단.
    데모 정책: 읽기 전용 집계(소유권 검증 보류)."""
    pid = store_id
    place = db.query(models.Place).filter(models.Place.id == pid).first()
    pname = place.name if place else ""

    # 재방문 의사(또갈래요) 손님 — 개인정보 없이 모임 유형으로
    intent = []
    intent_count = 0
    try:
        rows = db.execute(text(
            """
            SELECT f.user_id, MAX(f.created_at) AS last_at,
                   MAX(r.party_size) AS party
            FROM place_visit_feedback f
            LEFT JOIN user_reservations r ON r.id = f.reservation_id
            WHERE f.place_id = :pid AND (f.personal_revisit = TRUE OR f.group_revisit = TRUE)
            GROUP BY f.user_id
            ORDER BY last_at DESC
            """
        ), {"pid": pid}).fetchall()
        intent_count = len(rows)
        for uid, last_at, party in rows[:50]:
            label, emoji = _persona_label(party)
            intent.append({"persona": label, "emoji": emoji, "ago": _ago_text(last_at)})
    except Exception as exc:
        print(f"[regulars] intent skip: {exc}"); db.rollback()

    # 재방문율 + 단골 후보(2회+) + 뜸해진 단골(2회+, 21일 무방문)
    revisit_rate = None
    repeat_count = 0
    dormant_count = 0
    try:
        vr = db.execute(text(
            """
            WITH visits AS (
              SELECT user_id, COUNT(*) AS c, MAX(date) AS last_date
              FROM user_reservations
              WHERE place_id = :pid AND status IN ('confirmed','completed') AND user_id IS NOT NULL
              GROUP BY user_id
            )
            SELECT
              COUNT(*) AS total_visitors,
              COUNT(*) FILTER (WHERE c >= 2) AS repeat_visitors,
              COUNT(*) FILTER (WHERE c >= 2 AND last_date < to_char(NOW() - interval '21 days','YYYY-MM-DD')) AS dormant
            FROM visits
            """
        ), {"pid": pid}).fetchone()
        if vr and int(vr[0] or 0) > 0:
            total = int(vr[0]); repeat_count = int(vr[1] or 0); dormant_count = int(vr[2] or 0)
            revisit_rate = round(repeat_count / total * 100)
    except Exception as exc:
        print(f"[regulars] rate skip: {exc}"); db.rollback()

    # 4축 진단 — 리뷰 평균 중 가장 낮은 축
    diagnosis = None
    try:
        dr = db.execute(text(
            """
            SELECT AVG(score_taste), AVG(score_service), AVG(score_price), AVG(score_vibe), COUNT(*)
            FROM reviews WHERE place_name = :pn
              AND (score_taste IS NOT NULL OR score_price IS NOT NULL)
            """
        ), {"pn": pname}).fetchone()
        if dr and int(dr[4] or 0) >= 1:
            axes = {"맛": dr[0], "서비스": dr[1], "가격": dr[2], "분위기": dr[3]}
            axes = {k: float(v) for k, v in axes.items() if v is not None}
            if axes:
                low = min(axes, key=axes.get)
                diagnosis = {
                    "axes": {k: round(v, 1) for k, v in axes.items()},
                    "weak": low,
                    "hint": {
                        "가격": "런치 세트·재방문 할인으로 가격 부담 낮추기",
                        "맛": "대표 메뉴 강화 or 시그니처 개발",
                        "서비스": "응대·속도 점검",
                        "분위기": "좌석·조명·음악 손보기",
                    }.get(low, ""),
                    "review_count": int(dr[4]),
                }
    except Exception as exc:
        print(f"[regulars] diag skip: {exc}"); db.rollback()

    return {
        "store_id": pid,
        "revisit_intent_count": intent_count,
        "revisit_intent": intent,
        "revisit_rate": revisit_rate,
        "repeat_count": repeat_count,
        "dormant_count": dormant_count,
        "diagnosis": diagnosis,
    }


class ReengageBody(BaseModel):
    kind: str = "thanks"   # thanks | reminder
    message: Optional[str] = None
    discount_pct: Optional[int] = None


@router.post("/stores/{store_id}/regulars/reengage")
def reengage_regulars(store_id: int, body: ReengageBody, db: Session = Depends(get_db),
                      merchant: str = Depends(get_current_merchant)):
    """재방문 의사/뜸해진 단골에게 재초대 알림(푸시). 소유주만."""
    place = _assert_merchant_owns(db, store_id, merchant)
    # 대상 user_id 수집
    if body.kind == "reminder":
        rows = db.execute(text(
            """
            WITH visits AS (
              SELECT user_id, COUNT(*) c, MAX(date) last_date FROM user_reservations
              WHERE place_id=:pid AND status IN ('confirmed','completed') AND user_id IS NOT NULL
              GROUP BY user_id)
            SELECT user_id FROM visits
            WHERE c >= 2 AND last_date < to_char(NOW() - interval '21 days','YYYY-MM-DD')
            """
        ), {"pid": store_id}).fetchall()
    else:
        rows = db.execute(text(
            "SELECT DISTINCT user_id FROM place_visit_feedback "
            "WHERE place_id=:pid AND (personal_revisit=TRUE OR group_revisit=TRUE) AND user_id IS NOT NULL"
        ), {"pid": store_id}).fetchall()
    uids = [int(r[0]) for r in rows if r[0]]
    if not uids:
        return {"sent": 0, "message": "아직 대상 손님이 없어요."}
    title = f"{place.name}에서 초대해요"
    dc = f" · {body.discount_pct}% 할인" if body.discount_pct else ""
    msg = body.message or ("보고 싶어요! 다시 방문해주시면 감사하겠습니다" if body.kind == "reminder" else "또 찾아주셔서 감사해요")
    # 발송 로그(재방문 추적용)
    try:
        for uid in uids:
            db.execute(text("INSERT INTO merchant_reengage (store_id, user_id, kind) VALUES (:s,:u,:k)"),
                       {"s": store_id, "u": uid, "k": body.kind})
        db.commit()
    except Exception as exc:
        print(f"[reengage] log skip: {exc}"); db.rollback()
    try:
        from services import push_service
        push_service.notify_users_async(uids, title, msg + dc, data={"type": "reengage", "place_id": str(store_id)})
    except Exception as exc:
        print(f"[reengage] push skip: {exc}")
    return {"sent": len(uids), "kind": body.kind}


@router.get("/stores/{store_id}/reengage-stats")
def reengage_stats(store_id: int, days: int = 30, db: Session = Depends(get_db)):
    """재초대 성과 — 발송 대비 이후 재방문(예약)한 손님 수/전환율. 읽기 전용."""
    days = max(7, min(int(days or 30), 180))
    try:
        row = db.execute(text(
            """
            WITH sends AS (
              SELECT DISTINCT user_id, MIN(sent_at) AS first_sent
              FROM merchant_reengage
              WHERE store_id=:pid AND sent_at >= NOW() - (:days || ' days')::interval
              GROUP BY user_id
            )
            SELECT COUNT(*) AS sent,
                   COUNT(*) FILTER (WHERE EXISTS (
                     SELECT 1 FROM user_reservations r
                     WHERE r.place_id=:pid AND r.user_id=s.user_id
                       AND r.status IN ('confirmed','completed')
                       AND r.created_at > s.first_sent
                   )) AS returned
            FROM sends s
            """
        ), {"pid": store_id, "days": days}).fetchone()
        sent = int(row[0] or 0) if row else 0
        returned = int(row[1] or 0) if row else 0
        rate = round(returned / sent * 100) if sent else None
        return {"days": days, "sent": sent, "returned": returned, "rate": rate}
    except Exception as exc:
        print(f"[reengage-stats] skip: {exc}"); db.rollback()
        return {"days": days, "sent": 0, "returned": 0, "rate": None}


# ─────────────────── 손님 콘텐츠(#3) ───────────────────

def _first_img(image_urls):
    import json as _j
    if not image_urls:
        return None
    arr = image_urls if isinstance(image_urls, list) else (_j.loads(image_urls) if isinstance(image_urls, str) else [])
    for u in arr:
        if isinstance(u, str) and (u.startswith("http") or u.startswith("data:")):
            return u
    return None


@router.get("/stores/{store_id}/content")
def store_content(store_id: int, db: Session = Depends(get_db)):
    """손님이 만든 콘텐츠 집계 — 사진(게시물), 후기, 큐레이터 리스트 편입. 읽기 전용."""
    pid = store_id
    place = db.query(models.Place).filter(models.Place.id == pid).first()
    pname = place.name if place else ""
    hero = getattr(place, "hero_image", None) if place else None

    # 손님 사진(게시물)
    photos = []
    try:
        prows = (db.query(models.Post)
                 .filter(models.Post.place_id == pid, models.Post.image_urls.isnot(None))
                 .order_by(models.Post.created_at.desc()).limit(30).all())
        uids = {p.user_id for p in prows if getattr(p, "user_id", None)}
        umap = {u.id: u.name for u in db.query(models.User).filter(models.User.id.in_(uids)).all()} if uids else {}
        for p in prows:
            img = _first_img(p.image_urls)
            if img:
                photos.append({
                    "post_id": p.id, "image": img,
                    "user_name": umap.get(getattr(p, "user_id", None), "손님"),
                    "content": (p.content or "")[:40],
                })
    except Exception as exc:
        print(f"[content] photos skip: {exc}"); db.rollback()

    # 후기(사진/코멘트) + 베스트 후기
    reviews = []
    best = None
    try:
        rrows = (db.query(models.Review)
                 .filter(models.Review.place_name == pname)
                 .order_by(models.Review.rating.desc().nullslast(), models.Review.created_at.desc())
                 .limit(20).all())
        for r in rrows:
            item = {
                "id": r.id, "rating": r.rating,
                "comment": (r.comment or "")[:80],
                "image": _first_img(r.image_urls),
            }
            reviews.append(item)
            if best is None and r.comment:
                best = item
    except Exception as exc:
        print(f"[content] reviews skip: {exc}"); db.rollback()

    # 큐레이터 공개 리스트 편입
    curators = []
    try:
        crows = db.execute(text(
            """
            SELECT sf.id, sf.name, sf.icon,
                   COALESCE(c.title, u.name) AS owner,
                   (c.id IS NOT NULL) AS is_crew,
                   (SELECT COUNT(*) FROM list_likes ll WHERE ll.folder_id = sf.id) AS likes,
                   (SELECT COUNT(*) FROM list_saves ls WHERE ls.folder_id = sf.id) AS saves
            FROM saved_items si
            JOIN save_folders sf ON sf.id = si.folder_id AND sf.is_public = TRUE
            JOIN users u ON u.id = sf.user_id
            LEFT JOIN communities c ON c.id = sf.community_id
            WHERE si.place_id = :pid
            GROUP BY sf.id, sf.name, sf.icon, c.title, u.name, c.id
            ORDER BY saves DESC, likes DESC LIMIT 10
            """
        ), {"pid": pid}).fetchall()
        for cid, cname, cicon, owner, is_crew, likes, saves in crows:
            curators.append({
                "folder_id": cid, "name": cname, "icon": cicon or "📁", "owner": owner,
                "is_crew": bool(is_crew), "likes": int(likes or 0), "saves": int(saves or 0),
            })
    except Exception as exc:
        print(f"[content] curators skip: {exc}"); db.rollback()

    # 방문 인증(게시물로 방문 언급한 사람) 수
    visitor_count = 0
    try:
        visitor_count = db.execute(text(
            "SELECT COUNT(DISTINCT user_id) FROM posts WHERE place_id = :pid"
        ), {"pid": pid}).scalar() or 0
    except Exception:
        db.rollback()

    return {
        "store_id": pid,
        "hero_image": hero,
        "counts": {
            "photos": len(photos),
            "reviews": len(reviews),
            "curators": len(curators),
            "visitors": int(visitor_count),
        },
        "photos": photos,
        "reviews": reviews,
        "best_review": best,
        "curators": curators,
    }


class HeroBody(BaseModel):
    image: str


@router.post("/stores/{store_id}/hero-image")
def set_hero_image(store_id: int, body: HeroBody, db: Session = Depends(get_db),
                   merchant: str = Depends(get_current_merchant)):
    """가게 대표 이미지 지정 — 손님 사진을 가게 얼굴로. 소유주만."""
    place = _assert_merchant_owns(db, store_id, merchant)
    place.hero_image = body.image or None
    db.commit()
    return {"ok": True, "hero_image": place.hero_image}


# ─────────────────── 취향 리치 CRM (#1 카드 #2 리액티베이션 #3 그룹 #4 팔로업) ───────────────────

_CUISINE_KW = {
    "일식": ["일식","스시","초밥","라멘","우동","돈까스","돈가스","이자카야","텐동","일본"],
    "한식": ["한식","국밥","찌개","백반","냉면","곰탕","국수","불고기","족발","보쌈","분식","떡볶이"],
    "중식": ["중식","중국","짜장","짬뽕","마라","훠궈"],
    "양식": ["양식","이탈리","파스타","피자","스테이크","브런치","경양식"],
    "카페": ["카페","커피","디저트","베이커리","빵","케이크"],
    "술집": ["술","맥주","포차","호프","이자카야","와인","바"],
    "고기": ["고기","구이","삼겹","갈비","곱창","한우"],
    "해산물": ["해산물","회","횟집","해물","조개"],
    "아시안": ["아시안","베트남","태국","쌀국수","커리"],
}


def _canon_one(text_in) -> Optional[str]:
    blob = str(text_in or "")
    for label, kws in _CUISINE_KW.items():
        if any(k in blob for k in kws):
            return label
    return None


def _taste_tags(prefs) -> list:
    out = []
    if isinstance(prefs, dict):
        for k in ("foods", "vibes"):
            for v in (prefs.get(k) or []):
                for part in str(v).split("/"):
                    t = part.strip()
                    if t and t not in out:
                        out.append(t)
    return out[:4]


def _days_since(ymd) -> int:
    from datetime import datetime as _dt
    try:
        return (_dt.utcnow().date() - _dt.strptime(str(ymd)[:10], "%Y-%m-%d").date()).days
    except Exception:
        return 999


def _parse_ymd(v):
    from datetime import datetime as _dt
    if not v:
        return None
    try:
        return _dt.strptime(str(v)[:10], "%Y-%m-%d")
    except Exception:
        return None


@router.get("/stores/{store_id}/crm")
def store_crm(store_id: int, db: Session = Depends(get_db)):
    """취향 리치 손님/그룹 CRM. 취향·모임유형·재방문의사·크로스스토어 관심을 결합.
    데모: 읽기 전용 집계."""
    pid = store_id
    place = db.query(models.Place).filter(models.Place.id == pid).first()
    store_cuisine = _canon_one((place.cuisine_type if place else "") + " " + (place.category if place else "") + " " + (place.name if place else ""))

    from datetime import datetime, date as _date
    from collections import Counter

    # 방문 손님 집계(예약 기준) — user_id별 방문수/마지막/파티사이즈
    cust = {}
    try:
        for uid, party, dt, st in db.execute(text(
            "SELECT user_id, party_size, date, status FROM user_reservations "
            "WHERE place_id=:pid AND user_id IS NOT NULL AND status IN ('confirmed','completed')"
        ), {"pid": pid}).fetchall():
            c = cust.setdefault(int(uid), {"visits": 0, "last": None, "parties": []})
            c["visits"] += 1
            if party: c["parties"].append(int(party))
            if dt and (c["last"] is None or dt > c["last"]): c["last"] = dt
    except Exception as exc:
        print(f"[crm] visits skip: {exc}"); db.rollback()

    # 재방문 의사(또갈래요) 유저
    intent_uids = set()
    try:
        for (uid,) in db.execute(text(
            "SELECT DISTINCT user_id FROM place_visit_feedback "
            "WHERE place_id=:pid AND (personal_revisit=TRUE OR group_revisit=TRUE) AND user_id IS NOT NULL"
        ), {"pid": pid}).fetchall():
            intent_uids.add(int(uid))
            cust.setdefault(int(uid), {"visits": 0, "last": None, "parties": []})
    except Exception as exc:
        print(f"[crm] intent skip: {exc}"); db.rollback()

    uids = list(cust.keys())[:80]
    prefs_map = {}
    if uids:
        try:
            for u in db.query(models.User).filter(models.User.id.in_(uids)).all():
                prefs_map[u.id] = u.preferences if isinstance(u.preferences, dict) else {}
        except Exception:
            db.rollback()

    # 크로스-스토어 최근 관심: 최근 30일 이 손님이 저장한 다른 곳의 cuisine이 우리 카테고리와 일치하는 수
    recent_interest = {}
    if uids and store_cuisine:
        try:
            rows = db.execute(text(
                """
                SELECT si.user_id, p.cuisine_type, p.category, p.name
                FROM saved_items si JOIN places p ON p.id = si.place_id
                WHERE si.user_id = ANY(:uids) AND si.place_id <> :pid
                  AND si.created_at >= NOW() - interval '30 days'
                """
            ), {"uids": uids, "pid": pid}).fetchall()
            cnt = Counter()
            for uid, cz, cat, nm in rows:
                if _canon_one((cz or "") + " " + (cat or "") + " " + (nm or "")) == store_cuisine:
                    cnt[int(uid)] += 1
            recent_interest = dict(cnt)
        except Exception as exc:
            print(f"[crm] interest skip: {exc}"); db.rollback()

    def _persona(parties):
        if not parties:
            return ("모임", "👥")
        avg = round(sum(parties) / len(parties))
        return _persona_label(avg)

    def _tier(visits):
        return "VIP" if visits >= 4 else ("단골" if visits >= 2 else "신규")

    # 손님 카드(#1)
    customers = []
    for uid, c in sorted(cust.items(), key=lambda kv: (kv[1]["visits"], kv[1]["last"] or ""), reverse=True):
        label, emoji = _persona(c["parties"])
        customers.append({
            "uid": uid,
            "persona": label, "emoji": emoji,
            "taste": _taste_tags(prefs_map.get(uid)),
            "visits": c["visits"],
            "dormant": bool(c["last"] and (_days_since(c["last"]) >= 21)),
            "last": _ago_text(_parse_ymd(c["last"])) if c["last"] else "",
            "revisit_intent": uid in intent_uids,
            "recent_interest": recent_interest.get(uid, 0),
            "tier": _tier(c["visits"]),
        })
    customers = customers[:40]
    # 사장님 직접 지정 등급(override) 적용
    try:
        cu = [c["uid"] for c in customers]
        if cu:
            ov = {}
            for uid, t in db.execute(text(
                "SELECT user_id, tier_override FROM merchant_customer_memos "
                "WHERE store_id=:s AND user_id = ANY(:u) AND tier_override IS NOT NULL"
            ), {"s": pid, "u": cu}).fetchall():
                ov[int(uid)] = t
            for c in customers:
                if ov.get(c["uid"]):
                    c["tier"] = ov[c["uid"]]
                    c["tier_manual"] = True
    except Exception as exc:
        print(f"[crm] tier override skip: {exc}"); db.rollback()

    # 그룹 CRM(#3) — 방문 피드백을 남긴 모임(room) 단위
    groups = []
    try:
        grows = db.execute(text(
            """
            SELECT f.room_id, COUNT(*) c, MAX(f.created_at) last_at,
                   BOOL_OR(f.group_revisit) gr, MAX(r.party_size) party
            FROM place_visit_feedback f
            LEFT JOIN user_reservations r ON r.id = f.reservation_id
            WHERE f.place_id=:pid AND f.room_id IS NOT NULL
            GROUP BY f.room_id ORDER BY last_at DESC LIMIT 20
            """
        ), {"pid": pid}).fetchall()
        for rid, c, last_at, gr, party in grows:
            label, emoji = _persona_label(party)
            groups.append({
                "persona": label, "emoji": emoji, "visits": int(c),
                "last": _ago_text(last_at), "revisit_intent": bool(gr),
            })
    except Exception as exc:
        print(f"[crm] groups skip: {exc}"); db.rollback()

    # 리액티베이션(#2) — 뜸한데 최근 우리 카테고리 관심↑ = 재방문 타이밍
    reactivation = [
        {"persona": c["persona"], "emoji": c["emoji"], "taste": c["taste"],
         "interest": c["recent_interest"], "last": c["last"]}
        for c in customers
        if c["recent_interest"] >= 1 and (c["revisit_intent"] or c["visits"] >= 1)
    ][:10]

    # 자동 팔로업(#4) — 규칙기반 액션 + 메시지 초안
    sname = place.name if place else "가게"
    followups = []
    for c in customers:
        draft = None; reason = None
        if c["recent_interest"] >= 1:
            reason = f"최근 {store_cuisine or '우리 카테고리'} 관심↑ · 재방문 타이밍"
            draft = f"{sname}에 요즘 {c['taste'][0] if c['taste'] else store_cuisine or ''} 좋아하시는 분들 많이 오세요! 다시 모시고 싶어요 🙌"
        elif c["revisit_intent"]:
            reason = "또 오고 싶다고 표시함"
            draft = f"{sname} 다시 찾아주셔서 감사해요. 오시면 작은 서비스 준비할게요 😊"
        elif c["tier"] in ("단골", "VIP"):
            reason = f"{c['tier']} · {c['last']} 방문"
            draft = f"{sname} 단골 {c['persona']}님, 보고 싶어요! 이번 주 방문 어떠세요?"
        if draft:
            followups.append({"persona": c["persona"], "emoji": c["emoji"],
                              "reason": reason, "draft": draft, "tier": c["tier"]})
    followups = followups[:8]

    return {
        "store_id": pid,
        "store_cuisine": store_cuisine,
        "counts": {"customers": len(customers), "groups": len(groups),
                   "reactivation": len(reactivation), "vip": sum(1 for c in customers if c["tier"] == "VIP")},
        "customers": customers,
        "groups": groups,
        "reactivation": reactivation,
        "followups": followups,
    }


# ─────────────────── 예약 브리핑(A) + 손님 상세(B) ───────────────────

def _brief_line(persona, taste, tier, revisit, party, interest, cuisine):
    """규칙기반 접객 브리핑 한 줄."""
    bits = []
    if tier in ("VIP", "단골"):
        bits.append(f"{tier} · {persona}")
    else:
        bits.append(persona)
    if taste:
        bits.append(f"{'·'.join(taste[:2])} 선호")
    # 취향→접객 제안
    tset = set(taste or [])
    if "조용한" in tset:
        bits.append("안쪽 조용한 자리 추천")
    elif "감성적인" in tset or "뷰맛집" in tset:
        bits.append("창가·분위기 자리 추천")
    elif interest and interest >= 1:
        bits.append(f"요즘 {cuisine or '우리 카테고리'} 관심↑ · 신메뉴 권하기 좋음")
    elif revisit:
        bits.append("또 오고 싶어한 손님 · 작은 서비스 어떠세요")
    return " · ".join(bits)


def _customer_core(db, pid, uid, store_cuisine):
    """한 손님의 코어 집계(브리핑/상세 공통)."""
    from datetime import datetime
    from collections import Counter
    rows = db.execute(text(
        "SELECT date, party_size, status, id FROM user_reservations "
        "WHERE place_id=:pid AND user_id=:uid ORDER BY date DESC"
    ), {"pid": pid, "uid": uid}).fetchall()
    visits = [r for r in rows if r[2] in ("confirmed", "completed")]
    parties = [int(r[1]) for r in visits if r[1]]
    avg_party = round(sum(parties) / len(parties)) if parties else 0
    label, emoji = _persona_label(avg_party)
    n = len(visits)
    tier = "VIP" if n >= 4 else ("단골" if n >= 2 else "신규")
    last = _ago_text(_parse_ymd(visits[0][0])) if visits else ""
    # 취향
    u = db.query(models.User).filter(models.User.id == uid).first()
    taste = _taste_tags(u.preferences if (u and isinstance(u.preferences, dict)) else {})
    # 재방문 의사
    revisit = bool(db.execute(text(
        "SELECT 1 FROM place_visit_feedback WHERE place_id=:pid AND user_id=:uid "
        "AND (personal_revisit=TRUE OR group_revisit=TRUE) LIMIT 1"
    ), {"pid": pid, "uid": uid}).fetchone())
    # 크로스스토어 최근 관심
    interest = 0
    if store_cuisine:
        try:
            for (cz, cat, nm) in db.execute(text(
                "SELECT p.cuisine_type, p.category, p.name FROM saved_items si "
                "JOIN places p ON p.id=si.place_id WHERE si.user_id=:uid AND si.place_id<>:pid "
                "AND si.created_at >= NOW() - interval '30 days'"
            ), {"uid": uid, "pid": pid}).fetchall():
                if _canon_one((cz or "")+" "+(cat or "")+" "+(nm or "")) == store_cuisine:
                    interest += 1
        except Exception:
            db.rollback()
    return {
        "persona": label, "emoji": emoji, "tier": tier, "taste": taste,
        "visits": n, "last": last, "revisit_intent": revisit,
        "recent_interest": interest, "avg_party": avg_party, "_rows": rows,
    }


@router.post("/stores/{store_id}/customer-briefs")
def customer_briefs(store_id: int, body: dict, db: Session = Depends(get_db)):
    """예약 카드용 손님 브리핑(compact) — user_ids 배치."""
    pid = store_id
    place = db.query(models.Place).filter(models.Place.id == pid).first()
    cuisine = _canon_one((place.cuisine_type if place else "") + " " + (place.category if place else "") + " " + (place.name if place else ""))
    uids = [int(u) for u in (body.get("user_ids") or []) if u][:30]
    out = {}
    for uid in uids:
        try:
            c = _customer_core(db, pid, uid, cuisine)
            out[str(uid)] = {
                "persona": c["persona"], "emoji": c["emoji"], "tier": c["tier"],
                "taste": c["taste"], "visits": c["visits"], "last": c["last"],
                "revisit_intent": c["revisit_intent"], "recent_interest": c["recent_interest"],
                "brief": _brief_line(c["persona"], c["taste"], c["tier"], c["revisit_intent"],
                                     c["avg_party"], c["recent_interest"], cuisine),
                "returning": c["visits"] >= 2,
            }
        except Exception as exc:
            print(f"[brief] skip {uid}: {exc}"); db.rollback()
    return {"briefs": out}


@router.get("/stores/{store_id}/customer/{user_id}")
def customer_detail(store_id: int, user_id: int, db: Session = Depends(get_db)):
    """손님 상세 프로필(B) — 타임라인·후기·요즘관심·메모."""
    pid = store_id
    place = db.query(models.Place).filter(models.Place.id == pid).first()
    pname = place.name if place else ""
    cuisine = _canon_one((place.cuisine_type if place else "") + " " + (place.category if place else "") + " " + (place.name if place else ""))
    c = _customer_core(db, pid, user_id, cuisine)

    # 사장님 직접 지정 등급
    tier_manual = False
    try:
        row = db.execute(text("SELECT tier_override FROM merchant_customer_memos WHERE store_id=:s AND user_id=:u"),
                         {"s": pid, "u": user_id}).fetchone()
        if row and row[0]:
            c["tier"] = row[0]; tier_manual = True
    except Exception:
        db.rollback()

    # 재방문 의사가 있던 예약 id
    fb_resv = set()
    try:
        for (rid,) in db.execute(text(
            "SELECT reservation_id FROM place_visit_feedback WHERE place_id=:pid AND user_id=:uid "
            "AND (personal_revisit=TRUE OR group_revisit=TRUE)"
        ), {"pid": pid, "uid": user_id}).fetchall():
            if rid: fb_resv.add(rid)
    except Exception:
        db.rollback()

    timeline = []
    for i, (dt, party, st, rid) in enumerate(c["_rows"]):
        if st not in ("confirmed", "completed"):
            continue
        timeline.append({
            "ago": _ago_text(_parse_ymd(dt)), "party": int(party or 0),
            "revisit": rid in fb_resv, "first": (i == len(c["_rows"]) - 1),
        })

    reviews = []
    try:
        for r in (db.query(models.Review)
                  .filter(models.Review.place_name == pname, models.Review.user_id == user_id)
                  .order_by(models.Review.created_at.desc()).limit(5).all()):
            reviews.append({"rating": r.rating, "comment": (r.comment or "")[:100]})
    except Exception:
        db.rollback()

    memo = ""
    try:
        row = db.execute(text("SELECT memo FROM merchant_customer_memos WHERE store_id=:s AND user_id=:u"),
                         {"s": pid, "u": user_id}).fetchone()
        memo = (row[0] if row else "") or ""
    except Exception:
        db.rollback()

    return {
        "persona": c["persona"], "emoji": c["emoji"], "tier": c["tier"], "tier_manual": tier_manual,
        "taste": c["taste"],
        "visits": c["visits"], "last": c["last"], "revisit_intent": c["revisit_intent"],
        "recent_interest": c["recent_interest"], "store_cuisine": cuisine,
        "brief": _brief_line(c["persona"], c["taste"], c["tier"], c["revisit_intent"],
                             c["avg_party"], c["recent_interest"], cuisine),
        "timeline": timeline, "reviews": reviews, "memo": memo,
    }


class TierBody(BaseModel):
    tier: Optional[str] = None  # "VIP" | "단골" | None(자동)


@router.post("/stores/{store_id}/customer/{user_id}/tier")
def set_customer_tier(store_id: int, user_id: int, body: TierBody, db: Session = Depends(get_db),
                      merchant: str = Depends(get_current_merchant)):
    """사장님이 손님 등급 직접 지정(자동 계산 override). None이면 자동으로 복귀."""
    _assert_merchant_owns(db, store_id, merchant)
    t = body.tier if body.tier in ("VIP", "단골") else None
    db.execute(text(
        "INSERT INTO merchant_customer_memos (store_id, user_id, tier_override, updated_at) "
        "VALUES (:s,:u,:t,NOW()) ON CONFLICT (store_id, user_id) DO UPDATE SET tier_override=:t, updated_at=NOW()"
    ), {"s": store_id, "u": user_id, "t": t})
    db.commit()
    return {"ok": True, "tier": t}


@router.post("/stores/{store_id}/customer/{user_id}/memo")
def save_customer_memo(store_id: int, user_id: int, body: dict, db: Session = Depends(get_db),
                       merchant: str = Depends(get_current_merchant)):
    """사장님 손님 메모 저장. 소유주만."""
    _assert_merchant_owns(db, store_id, merchant)
    memo = (body.get("memo") or "").strip()[:500]
    db.execute(text(
        "INSERT INTO merchant_customer_memos (store_id, user_id, memo, updated_at) "
        "VALUES (:s,:u,:m,NOW()) ON CONFLICT (store_id, user_id) DO UPDATE SET memo=:m, updated_at=NOW()"
    ), {"s": store_id, "u": user_id, "m": memo})
    db.commit()
    return {"ok": True}


# ─────────────────────────────────────────────────────────────
# 🤝 크루 제휴 — 딜 발행/신청 검토/성과 (대학가 제휴의 플랫폼화)
# ─────────────────────────────────────────────────────────────

def _crew_snapshot(db: Session, cid: str) -> dict:
    """신청 검토용 크루 요약 — 인증·규모·활동 실적."""
    c = db.query(models.Community).filter(models.Community.id == cid).first()
    if not c:
        return {"id": cid, "title": "(삭제된 크루)", "icon": "👥", "members": 0}
    members = list(dict.fromkeys(([c.host_id] if c.host_id else []) + list(c.member_ids or [])))
    org_domain = getattr(c, "org_domain", None)
    verified = 0
    if org_domain and members:
        verified = (
            db.query(models.UserVerification)
            .filter(
                models.UserVerification.user_id.in_(members),
                models.UserVerification.domain == org_domain,
                models.UserVerification.status == "verified",
            ).count()
        )
    # 함께 방문 — 분담결제·QR 체크인·방문 피드백 통합(가게·날짜 중복 제거)
    from api.routers.home import _crew_visits
    visits = _crew_visits(db, cid)
    # 재방문율 — 멤버들이 남긴 방문 피드백 중 "또 갈래요" 비율 (판단 근거)
    revisit_rate = None
    if members:
        fb_total = (
            db.query(models.PlaceVisitFeedback)
            .filter(models.PlaceVisitFeedback.user_id.in_(members))
            .count()
        )
        if fb_total > 0:
            fb_yes = (
                db.query(models.PlaceVisitFeedback)
                .filter(
                    models.PlaceVisitFeedback.user_id.in_(members),
                    models.PlaceVisitFeedback.personal_revisit == True,  # noqa: E712
                ).count()
            )
            revisit_rate = round(fb_yes / fb_total * 100)
    return {
        "id": c.id, "title": c.title or "이름 없는 크루", "icon": c.icon or "👥",
        "members": len(members),
        "crew_type": getattr(c, "crew_type", None) or "friends",
        "org_name": getattr(c, "org_name", None),
        "verified_members": int(verified),
        "visits_total": int(visits),
        "revisit_rate": revisit_rate,
    }


@router.get("/stores/{store_id}/partnerships")
def list_partnerships(
    store_id: int,
    merchant_uid: str = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    place = _assert_merchant_owns(db, store_id, merchant_uid)
    deals = (
        db.query(models.CrewPartnership)
        .filter(models.CrewPartnership.place_id == place.id)
        .order_by(models.CrewPartnership.created_at.desc())
        .all()
    )
    deal_ids = [d.id for d in deals]
    apps = (
        db.query(models.CrewPartnershipApp)
        .filter(models.CrewPartnershipApp.partnership_id.in_(deal_ids))
        .order_by(models.CrewPartnershipApp.created_at.desc())
        .all()
    ) if deal_ids else []

    approved_cids = list({a.community_id for a in apps if a.status == "approved"})
    # 성과: 승인 크루가 "이 가게에서" 남긴 방문 — 분담결제·QR 체크인·방문 피드백을
    # 모두 인정한다(크루 화면과 같은 함수). 분담결제만 세면 밥만 먹고 간 모임이
    # 영원히 0으로 남아, 사장님 눈에는 제휴가 아무 효과 없는 것처럼 보인다.
    perf_visits = 0
    perf_amount = 0
    perf_revisits = 0
    perf_deal_uses = 0
    by_crew = []
    if approved_cids:
        # 제휴가 실제로 적용된 방문 — 사장님이 할인 원가를 가늠하는 숫자
        uses_by_app = visit_service.partnership_uses_by_app(db, [a.id for a in apps])
        app_by_cid: dict = {}
        for a in apps:
            if a.status == "approved":
                app_by_cid.setdefault(a.community_id, []).append(a.id)

        for cid in approved_cids:
            c = db.query(models.Community).filter(models.Community.id == cid).first()
            st = visit_service.crew_visit_stats(db, cid, place_id=place.id)
            mids = list((c.member_ids or [])) if c else []
            crew_revisits = 0
            if mids:
                crew_revisits = (
                    db.query(models.PlaceVisitFeedback)
                    .filter(
                        models.PlaceVisitFeedback.user_id.in_(mids),
                        models.PlaceVisitFeedback.place_id == place.id,
                        models.PlaceVisitFeedback.personal_revisit == True,  # noqa: E712
                    ).count()
                )
            deal_uses = sum(uses_by_app.get(aid, 0) for aid in app_by_cid.get(cid, []))
            perf_visits += st["visits"]
            perf_amount += st["amount"]
            perf_revisits += crew_revisits
            perf_deal_uses += deal_uses
            by_crew.append({
                "id": cid,
                "title": (c.title if c else "(삭제된 크루)") or "크루",
                "icon": (c.icon if c else "👥") or "👥",
                "visits": st["visits"],
                "amount": st["amount"],
                "revisits": int(crew_revisits),
                "deal_uses": int(deal_uses),
            })
        by_crew.sort(key=lambda x: (x["visits"], x["amount"]), reverse=True)

    apps_by_deal: dict = {}
    for a in apps:
        apps_by_deal.setdefault(a.partnership_id, []).append(a)

    # 딜마다 이번 달 몇 번 쓰였는지 — 한도가 그냥 저장된 숫자가 아니라 작동 중임을 보여준다
    _month = datetime.now().strftime("%Y-%m")
    _month_uses = visit_service.partnership_uses_by_app(db, [a.id for a in apps], _month)

    out_deals = []
    for d in deals:
        das = apps_by_deal.get(d.id, [])
        out_deals.append({
            "uses_this_month": sum(_month_uses.get(a.id, 0) for a in das if a.status == "approved"),
            "id": d.id, "title": d.title, "benefit": d.benefit, "discount_pct": d.discount_pct,
            "target": d.target, "conditions": d.conditions or {}, "status": d.status,
            "expires_at": d.expires_at.isoformat() if d.expires_at else None,
            # 대기 건수는 '크루가 낸 신청'만 — 내가 보낸 제안은 할 일이 아님
            "pending": sum(
                1 for a in das
                if a.status == "pending" and (getattr(a, "direction", None) or "crew_apply") == "crew_apply"
            ),
            "approved": sum(1 for a in das if a.status == "approved"),
            "applications": [
                {
                    "id": a.id, "status": a.status, "message": a.message or "",
                    "direction": getattr(a, "direction", None) or "crew_apply",
                    "created_at": a.created_at.isoformat() if a.created_at else None,
                    "crew": _crew_snapshot(db, a.community_id),
                }
                for a in das
            ],
        })

    return {
        "deals": out_deals,
        "performance": {
            "approved_crews": len(approved_cids),
            "visits": perf_visits,
            "amount": perf_amount,
            "revisits": perf_revisits,
            "by_crew": by_crew,
            "deal_uses": perf_deal_uses,
        },
    }


@router.post("/stores/{store_id}/partnerships")
def create_partnership(
    store_id: int,
    req: dict,
    merchant_uid: str = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    place = _assert_merchant_owns(db, store_id, merchant_uid)
    title = (req.get("title") or "").strip()
    benefit = (req.get("benefit") or "").strip()
    if not title or not benefit:
        raise HTTPException(status_code=400, detail="제목과 혜택을 입력해주세요.")
    target = req.get("target") or "all"
    if target not in ("all", "university", "company"):
        raise HTTPException(status_code=400, detail="대상이 올바르지 않아요.")

    # 기간 없는 제휴는 사실상 영구 할인이 된다 — 기본 3개월, 최대 12개월
    from datetime import timedelta
    months = req.get("duration_months")
    try:
        months = int(months) if months else 3
    except (TypeError, ValueError):
        months = 3
    months = max(1, min(12, months))
    expires_at = datetime.now() + timedelta(days=30 * months)

    # 사장님이 감당할 범위를 정할 수 있어야 한다(예측 가능성)
    conditions = dict(req.get("conditions") or {})
    for key in ("max_members", "monthly_uses"):
        v = req.get(key)
        if v:
            try:
                conditions[key] = max(1, int(v))
            except (TypeError, ValueError):
                pass

    d = models.CrewPartnership(
        place_id=place.id,
        title=title[:60],
        benefit=benefit[:120],
        discount_pct=req.get("discount_pct"),
        target=target,
        conditions=conditions,
        status="active",
        expires_at=expires_at,
    )
    db.add(d)
    db.commit()
    db.refresh(d)
    return {"id": d.id, "created": True}


@router.post("/partnerships/{pid}/status")
def set_partnership_status(
    pid: int,
    req: dict,
    merchant_uid: str = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    d = db.query(models.CrewPartnership).filter(models.CrewPartnership.id == pid).first()
    if not d:
        raise HTTPException(status_code=404, detail="딜을 찾을 수 없어요.")
    _assert_merchant_owns(db, d.place_id, merchant_uid)
    st = req.get("status")
    if st not in ("active", "paused", "ended"):
        raise HTTPException(status_code=400, detail="상태가 올바르지 않아요.")
    d.status = st
    db.commit()
    return {"id": d.id, "status": st}


@router.post("/partnership-apps/{aid}/decide")
def decide_partnership_app(
    aid: int,
    req: dict,
    merchant_uid: str = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    a = db.query(models.CrewPartnershipApp).filter(models.CrewPartnershipApp.id == aid).first()
    if not a:
        raise HTTPException(status_code=404, detail="신청을 찾을 수 없어요.")
    d = db.query(models.CrewPartnership).filter(models.CrewPartnership.id == a.partnership_id).first()
    _assert_merchant_owns(db, d.place_id, merchant_uid)
    approve = bool(req.get("approve"))
    a.status = "approved" if approve else "rejected"
    a.decided_at = datetime.now()
    if approve:
        a.terms_snapshot = _terms_of(d)
    db.commit()

    crew = db.query(models.Community).filter(models.Community.id == a.community_id).first()
    if crew is not None:
        place = db.query(models.Place).filter(models.Place.id == d.place_id).first()
        name = place.name if place else "가게"
        if approve:
            _notify_crew_members(
                crew, "🤝 제휴가 승인됐어요",
                "%s — %s. 이제 멤버 누구나 쓸 수 있어요." % (name, d.benefit),
                data={"type": "partnership_approved", "community_id": crew.id})
        else:
            _notify_crew_members(
                crew, "제휴 신청 결과",
                "%s 제휴가 이번엔 성사되지 않았어요." % name,
                data={"type": "partnership_rejected", "community_id": crew.id})
    return {"id": a.id, "status": a.status}


def _terms_of(d) -> dict:
    """수락 시점의 계약 내용 — 이후 딜이 수정돼도 이 사본이 기준이 된다."""
    return {
        "title": d.title,
        "benefit": d.benefit,
        "discount_pct": d.discount_pct,
        "conditions": d.conditions or {},
        "expires_at": d.expires_at.isoformat() if d.expires_at else None,
        "agreed_at": datetime.now().isoformat(),
    }


def _notify_crew_members(crew, title: str, body: str, data: dict = None):
    """크루 멤버 전원에게 푸시(사장님 액션 → 크루 통지)."""
    try:
        from services import push_service
        uids = list(dict.fromkeys(([crew.host_id] if crew.host_id else []) + list(crew.member_ids or [])))
        push_service.notify_users_async(uids, title, body, data=data or {})
    except Exception as exc:
        print("[partnership] merchant push skip: %s" % exc)


@router.get("/stores/{store_id}/crew-candidates")
def crew_candidates(
    store_id: int,
    partnership_id: Optional[int] = None,
    merchant_uid: str = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    """제안을 보낼 크루 후보 — 우리 가게에 온 적 있는 크루가 위로, 그다음 근처 활동 크루."""
    place = _assert_merchant_owns(db, store_id, merchant_uid)

    # 우리 가게 방문(분담결제 완료) 크루 집계
    visit_rows = (
        db.query(
            models.ChatSplitRequest.room_id,
            func.count(models.ChatSplitRequest.id),
            func.coalesce(func.sum(models.ChatSplitRequest.total_amount), 0),
            func.max(models.ChatSplitRequest.date),
        )
        .filter(
            models.ChatSplitRequest.place_id == place.id,
            models.ChatSplitRequest.status == "completed",
        )
        .group_by(models.ChatSplitRequest.room_id)
        .all()
    )
    visits = {r[0]: {"visits": int(r[1]), "amount": int(r[2] or 0), "last": r[3] or ""} for r in visit_rows}

    crews = db.query(models.Community).all()
    # 이미 관계가 있는 크루는 제외(같은 딜에 중복 제안 방지)
    taken: set = set()
    if partnership_id:
        taken = {
            a.community_id for a in db.query(models.CrewPartnershipApp)
            .filter(
                models.CrewPartnershipApp.partnership_id == partnership_id,
                models.CrewPartnershipApp.status.in_(("pending", "approved")),
            ).all()
        }

    items = []
    for c in crews:
        if c.id in taken:
            continue
        members = list(dict.fromkeys(([c.host_id] if c.host_id else []) + list(c.member_ids or [])))
        v = visits.get(c.id)
        # 방문 이력이 없고 멤버도 적은 크루는 제안 대상에서 제외(스팸 방지)
        if not v and len(members) < 3:
            continue
        items.append({
            "id": c.id,
            "title": c.title or "크루",
            "icon": c.icon or "👥",
            "members": len(members),
            "crew_type": getattr(c, "crew_type", None) or "friends",
            "org_name": getattr(c, "org_name", None),
            "visits": (v or {}).get("visits", 0),
            "amount": (v or {}).get("amount", 0),
            "last_visit": (v or {}).get("last", ""),
        })
    items.sort(key=lambda x: (x["visits"], x["members"]), reverse=True)
    return {"items": items[:30], "visited_count": len([i for i in items if i["visits"] > 0])}


def _haversine_km(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = math.radians(lat2 - lat1), math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(min(1.0, math.sqrt(a)))


@router.get("/stores/{store_id}/demand")
def store_demand(
    store_id: int,
    radius_km: float = 3.0,
    fresh_hours: int = 72,
    merchant_uid: str = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    """지금 근처에서 장소를 찾고 있는 크루 — '미래 수요' 신호.

    기존 CRM이 못 보는 자리다. POS도 도도포인트도 '왔던 사람'만 안다.
    이건 아직 안 온 크루가 B2C 앱에서 장소 투표를 열어둔 순간을 잡는다
    (ChatPoll kind=place, status=open + meta{lat,lng,purpose}).

    ★신원은 안 준다★ — 사장님에게 나가는 건 '몇 명이 · 무슨 목적으로 · 언제쯤'까지다.
    크루 이름·멤버·방 id는 크루가 제안을 수락한 뒤에야 열린다. 제안은
    signal_id(투표 id)로 보내고 크루는 서버가 찾는다.
    """
    place = _assert_merchant_owns(db, store_id, merchant_uid)
    if place.lat is None or place.lng is None:
        return {"items": [], "count": 0, "note": "가게 좌표가 없어 근처 수요를 볼 수 없어요."}

    polls = (
        db.query(models.ChatPoll)
        .filter(models.ChatPoll.kind == "place", models.ChatPoll.status == "open")
        .order_by(models.ChatPoll.id.desc())
        .limit(200)
        .all()
    )
    now = datetime.now()
    items = []
    for p in polls:
        meta = p.meta or {}
        # 크루는 동네 3곳을 나란히 놓고 후보를 담는다. 그래서 '고른 한 곳'이 아니라
        # 검토한 동네 전부와 대본다 — 우리 동네가 후보 중 하나였다면 그것도 기회다.
        spots = [r for r in (meta.get("regions") or []) if r.get("lat") is not None]
        if not spots and meta.get("lat") is not None:
            spots = [{"name": meta.get("anchor_name") or "", "lat": meta["lat"], "lng": meta["lng"]}]
        near = None
        for r in spots:
            try:
                d = _haversine_km(float(place.lat), float(place.lng), float(r["lat"]), float(r["lng"]))
            except (TypeError, ValueError):
                continue
            if d <= radius_km and (near is None or d < near[0]):
                near = (d, r.get("name") or "")
        if near is None:
            continue
        dist, region_name = near
        crew = db.query(models.Community).filter(models.Community.id == p.room_id).first()
        if crew is None:
            continue        # 크루가 아닌 방(1:1 등)은 제외
        members = list(dict.fromkeys(([crew.host_id] if crew.host_id else []) + list(crew.member_ids or [])))
        if len(members) < 2:
            continue        # 0~1명짜리 방은 수요가 아니다(빈 방·테스트 방)

        # ★신선도가 이 기능의 전부다★ — '지금 찾고 있다'가 기존 CRM과 갈리는 지점인데,
        # 2주 전에 열어두고 잊은 투표를 그렇게 부르면 그 주장 자체가 무너진다.
        age_h = (now - p.created_at).total_seconds() / 3600.0 if p.created_at else None
        if age_h is None or age_h > fresh_hours:
            continue
        when = (p.meta or {}).get("plan_date")
        if when:
            try:
                if datetime.strptime(str(when), "%Y-%m-%d").date() < now.date():
                    continue    # 약속 날짜가 지났다 = 이미 끝난 모임
            except ValueError:
                pass

        opts = db.query(models.ChatPollOption).filter(models.ChatPollOption.poll_id == p.id).all()
        # 우리 가게가 이미 후보에 있으면 제안의 성격이 다르다(밀어주기 vs 진입)
        on_list = any(o.place_id == place.id for o in opts)
        age_h = max(0.0, age_h)
        items.append({
            "signal_id": p.id,
            "party_size": len(members),
            "purpose": meta.get("purpose") or "식사",
            "when_date": meta.get("plan_date"),      # 일정 투표까지 확정한 크루만 채워진다
            "when_time": meta.get("plan_time"),
            "area": region_name or meta.get("anchor_name") or "",
            "regions": [r.get("name") for r in spots if r.get("name")],
            "distance_km": round(dist, 2),
            "candidates": len(opts),
            # 우리 동네에서 이미 담긴 후보가 있는지 — 없으면 '아직 우리 동네는 비었다'
            "candidates_here": sum(1 for o in opts if ((o.meta or {}).get("region") == region_name)),
            "on_candidate_list": on_list,
            "opened_hours_ago": round(age_h, 1),
        })
    # 가까운 순 → 인원 많은 순. 오늘 당장 붙일 수 있는 게 위로.
    items.sort(key=lambda x: (x["distance_km"], -x["party_size"]))
    return {"items": items[:30], "count": len(items), "radius_km": radius_km,
            "fresh_hours": fresh_hours, "store_name": place.name}


@router.post("/stores/{store_id}/demand/{signal_id}/offer")
def offer_to_demand(
    store_id: int,
    signal_id: int,
    req: dict,
    merchant_uid: str = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    """수요 신호에 혜택 제안 — 크루 신원을 사장님에게 노출하지 않고 보낸다.

    딜(partnership_id)을 주면 그 딜로 제안하고, 없으면 가장 최근 활성 딜을 쓴다.
    """
    place = _assert_merchant_owns(db, store_id, merchant_uid)
    poll = db.query(models.ChatPoll).filter(models.ChatPoll.id == signal_id).first()
    if not poll or poll.status != "open":
        raise HTTPException(status_code=404, detail="이미 끝난 수요예요.")
    crew = db.query(models.Community).filter(models.Community.id == poll.room_id).first()
    if crew is None:
        raise HTTPException(status_code=404, detail="크루를 찾을 수 없어요.")

    pid = req.get("partnership_id")
    deal = None
    if pid:
        deal = db.query(models.CrewPartnership).filter(
            models.CrewPartnership.id == int(pid), models.CrewPartnership.place_id == place.id).first()
    if deal is None:
        deal = (db.query(models.CrewPartnership)
                .filter(models.CrewPartnership.place_id == place.id,
                        models.CrewPartnership.status == "active")
                .order_by(models.CrewPartnership.id.desc()).first())
    if deal is None:
        raise HTTPException(status_code=400, detail={
            "code": "no_deal", "detail": "먼저 제휴 혜택을 하나 만들어 주세요."})

    exists = (db.query(models.CrewPartnershipApp)
              .filter(models.CrewPartnershipApp.partnership_id == deal.id,
                      models.CrewPartnershipApp.community_id == crew.id).first())
    if exists:
        return {"sent": 0, "already": True}

    db.add(models.CrewPartnershipApp(
        partnership_id=deal.id, community_id=crew.id, applicant_id=0,
        direction="store_invite",
        message=(req.get("message") or "").strip()[:200] or None,
    ))
    db.commit()

    _notify_crew_members(
        crew,
        "🤝 %s에서 제휴 제안이 왔어요" % place.name,
        "%s — 지금 고르는 중이면 바로 쓸 수 있어요." % deal.benefit,
        data={"type": "partnership_invite", "community_id": crew.id, "poll_id": str(poll.id)},
    )
    return {"sent": 1, "already": False, "benefit": deal.benefit}


@router.post("/partnerships/{pid}/invite")
def invite_crew_to_partnership(
    pid: int,
    req: dict,
    merchant_uid: str = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    """가게 → 크루 제휴 제안. 크루의 '제휴 관리'에 받은 제안으로 뜨고 수락하면 성사."""
    d = db.query(models.CrewPartnership).filter(models.CrewPartnership.id == pid).first()
    if not d:
        raise HTTPException(status_code=404, detail="딜을 찾을 수 없어요.")
    _assert_merchant_owns(db, d.place_id, merchant_uid)

    cids = req.get("community_ids") or ([req.get("community_id")] if req.get("community_id") else [])
    cids = [str(c) for c in cids if c]
    if not cids:
        raise HTTPException(status_code=400, detail="제안할 크루를 선택해주세요.")
    message = (req.get("message") or "").strip()[:200] or None

    sent, skipped = 0, 0
    invited = []
    for cid in cids:
        crew = db.query(models.Community).filter(models.Community.id == cid).first()
        if not crew:
            skipped += 1
            continue
        exists = (
            db.query(models.CrewPartnershipApp)
            .filter(
                models.CrewPartnershipApp.partnership_id == pid,
                models.CrewPartnershipApp.community_id == cid,
            ).first()
        )
        if exists:
            skipped += 1
            continue
        db.add(models.CrewPartnershipApp(
            partnership_id=pid, community_id=cid, applicant_id=0,
            direction="store_invite", message=message,
        ))
        invited.append(crew)
        sent += 1
    db.commit()

    # 제안이 도착했다는 걸 크루가 바로 알아야 루프가 돈다
    place = db.query(models.Place).filter(models.Place.id == d.place_id).first()
    for crew in invited:
        _notify_crew_members(
            crew,
            "🤝 %s에서 제휴 제안이 왔어요" % (place.name if place else "가게"),
            "%s — 크루에서 수락하면 바로 쓸 수 있어요." % d.benefit,
            data={"type": "partnership_invite", "community_id": crew.id},
        )
    return {"sent": sent, "skipped": skipped}


# ─────────────────────────────────────────────────────────────
# 📊 오늘 탭 v2 — 기간 선택(오늘/이번 주/이번 달) KPI + 추이 + 브리핑
# ─────────────────────────────────────────────────────────────

@router.get("/stores/{store_id}/overview")
def store_overview(
    store_id: int,
    period: str = "today",   # today | week | month
    merchant_uid: str = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    """기간별 한눈에 — KPI(예약·예상 손님·정산액) + 직전 기간 대비 + 추이 차트 + 오늘 브리핑.
    차트 창: today=최근 7일(일별) / week=최근 8주(주별) / month=최근 6개월(월별)."""
    from datetime import date, timedelta

    place = _assert_merchant_owns(db, store_id, merchant_uid)
    if period not in ("today", "week", "month"):
        period = "today"

    today = date.today()

    def ymd(d: date) -> str:
        return d.strftime("%Y-%m-%d")

    # 기간 경계(KPI 집계용) + 직전 기간
    if period == "today":
        cur_from, cur_to = today, today
        prev_from, prev_to = today - timedelta(days=1), today - timedelta(days=1)
    elif period == "week":
        monday = today - timedelta(days=(today.weekday()))
        cur_from, cur_to = monday, monday + timedelta(days=6)
        prev_from, prev_to = monday - timedelta(days=7), monday - timedelta(days=1)
    else:
        first = today.replace(day=1)
        cur_from, cur_to = first, today
        prev_last = first - timedelta(days=1)
        prev_from, prev_to = prev_last.replace(day=1), prev_last

    # 데이터 로드 창: 차트까지 커버 (최대 6개월)
    load_from = ymd(today - timedelta(days=190))
    resvs = (
        db.query(models.Reservation)
        .filter(
            models.Reservation.place_id == place.id,
            models.Reservation.date >= load_from,
            models.Reservation.status.in_(["confirmed", "completed"]),
        ).all()
    )
    splits = (
        db.query(models.ChatSplitRequest)
        .filter(
            models.ChatSplitRequest.place_id == place.id,
            models.ChatSplitRequest.status == "completed",
            models.ChatSplitRequest.date >= load_from,
        ).all()
    )

    def in_range(dstr, a: date, b: date) -> bool:
        return bool(dstr) and ymd(a) <= dstr <= ymd(b)

    def agg(a: date, b: date):
        rs = [r for r in resvs if in_range(r.date, a, b)]
        sp = [x for x in splits if in_range(x.date, a, b)]
        guests = sum(int(r.party_size or 0) for r in rs) + sum(int(x.party_size or 0) for x in sp)
        amount = sum(int(r.deposit_amount or 0) for r in rs) + sum(int(x.total_amount or 0) for x in sp)
        return {"reservations": len(rs) + len(sp), "guests": guests, "amount": amount}

    cur = agg(cur_from, cur_to)
    prev = agg(prev_from, prev_to)

    def delta_pct(c: int, p: int):
        if p <= 0:
            return None
        return round((c - p) / p * 100, 1)

    # 추이 시리즈
    series = []
    if period == "today":
        for i in range(6, -1, -1):
            d = today - timedelta(days=i)
            a = agg(d, d)
            series.append({"label": d.strftime("%m/%d"), "guests": a["guests"], "is_current": d == today})
    elif period == "week":
        this_monday = today - timedelta(days=today.weekday())
        for i in range(7, -1, -1):
            m = this_monday - timedelta(days=7 * i)
            a = agg(m, m + timedelta(days=6))
            series.append({"label": m.strftime("%m/%d"), "guests": a["guests"], "is_current": i == 0})
    else:
        y, mo = today.year, today.month
        months = []
        for i in range(5, -1, -1):
            mm = mo - i
            yy = y
            while mm <= 0:
                mm += 12
                yy -= 1
            months.append((yy, mm))
        for (yy, mm) in months:
            first = date(yy, mm, 1)
            last = (date(yy + (1 if mm == 12 else 0), (mm % 12) + 1, 1) - timedelta(days=1))
            a = agg(first, last)
            series.append({"label": f"{mm}월", "guests": a["guests"], "is_current": (yy, mm) == (y, mo)})

    # 오늘 브리핑 — 예약 하이라이트(방문 이력 기반) + 할 일
    briefing = []
    todays = sorted(
        [r for r in resvs if r.date == ymd(today)],
        key=lambda r: (r.time or ""),
    )[:3]
    for r in todays:
        visits = (
            db.query(models.Reservation)
            .filter(
                models.Reservation.place_id == place.id,
                models.Reservation.user_id == r.user_id,
                models.Reservation.status == "completed",
            ).count()
        ) if r.user_id else 0
        tier = "VIP" if visits >= 4 else ("단골" if visits >= 2 else ("재방문" if visits >= 1 else "첫 방문"))
        briefing.append({"time": r.time or "", "party": int(r.party_size or 0), "tier": tier})

    pending_resv = (
        db.query(models.Reservation)
        .filter(
            models.Reservation.place_id == place.id,
            models.Reservation.date >= ymd(today),
            models.Reservation.status == "confirmed",
        ).count()
    )
    pending_apps = (
        db.query(models.CrewPartnershipApp)
        .join(models.CrewPartnership, models.CrewPartnership.id == models.CrewPartnershipApp.partnership_id)
        .filter(
            models.CrewPartnership.place_id == place.id,
            models.CrewPartnershipApp.status == "pending",
        ).count()
    )

    return {
        "period": period,
        "store": {"name": place.name, "category": place.cuisine_type or ""},
        "kpis": {
            "reservations": cur["reservations"],
            "guests": cur["guests"],
            "amount": cur["amount"],
            "delta": {
                "reservations": delta_pct(cur["reservations"], prev["reservations"]),
                "guests": delta_pct(cur["guests"], prev["guests"]),
                "amount": delta_pct(cur["amount"], prev["amount"]),
            },
        },
        "series": series,
        "briefing": briefing,
        "todo": {"pending_reservations": pending_resv, "pending_partnership_apps": pending_apps},
    }


# ─────────────────────────────────────────────────────────────
# ⚙ 영업·브레이크 타임 — places.features["hours"]에 저장(무마이그레이션)
# 스케줄러 표시 범위 + B2C 앱 예약 차단의 단일 소스
# ─────────────────────────────────────────────────────────────

_HOURS_DEFAULT = {"open": "09:00", "close": "24:00", "break_from": "", "break_to": "", "break_days": "everyday"}


def _valid_hhmm(v: str) -> bool:
    import re
    return bool(re.fullmatch(r"([01]\d|2[0-4]):[0-5]\d", v or ""))


@router.get("/stores/{store_id}/hours")
def get_store_hours(
    store_id: int,
    merchant_uid: str = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    place = _assert_merchant_owns(db, store_id, merchant_uid)
    h = (place.features or {}).get("hours") or {}
    return {**_HOURS_DEFAULT, **h}


@router.post("/stores/{store_id}/hours")
def set_store_hours(
    store_id: int,
    req: dict,
    merchant_uid: str = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    place = _assert_merchant_owns(db, store_id, merchant_uid)
    open_t = req.get("open") or "09:00"
    close_t = req.get("close") or "24:00"
    bf = (req.get("break_from") or "").strip()
    bt = (req.get("break_to") or "").strip()
    bd = req.get("break_days") or "everyday"
    if not _valid_hhmm(open_t) or not _valid_hhmm(close_t):
        raise HTTPException(status_code=400, detail="영업 시간 형식이 올바르지 않아요. (HH:MM)")
    if open_t >= close_t:
        raise HTTPException(status_code=400, detail="영업 종료가 시작보다 빨라요.")
    if (bf and not bt) or (bt and not bf):
        raise HTTPException(status_code=400, detail="브레이크 시작·종료를 모두 입력해주세요.")
    if bf and bt:
        if not _valid_hhmm(bf) or not _valid_hhmm(bt) or bf >= bt:
            raise HTTPException(status_code=400, detail="브레이크 시간이 올바르지 않아요.")
        if bf < open_t or bt > close_t:
            raise HTTPException(status_code=400, detail="브레이크는 영업 시간 안에 있어야 해요.")
    if bd not in ("everyday", "weekday"):
        bd = "everyday"

    feats = dict(place.features or {})
    feats["hours"] = {"open": open_t, "close": close_t, "break_from": bf, "break_to": bt, "break_days": bd}
    place.features = feats
    try:
        from sqlalchemy.orm.attributes import flag_modified
        flag_modified(place, "features")
    except Exception:
        pass
    db.commit()
    return feats["hours"]
