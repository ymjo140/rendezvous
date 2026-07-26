from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.database import get_db
from api.dependencies import get_current_user, get_current_merchant
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
            SELECT sf.id, sf.name, u.name AS owner,
                   (SELECT COUNT(*) FROM list_likes ll WHERE ll.folder_id = sf.id) AS likes
            FROM saved_items si
            JOIN save_folders sf ON sf.id = si.folder_id AND sf.is_public = TRUE
            JOIN users u ON u.id = sf.user_id
            WHERE si.place_id = :pid
            GROUP BY sf.id, sf.name, u.name
            ORDER BY likes DESC LIMIT 10
            """
        ), {"pid": pid}).fetchall()
        for cid, cname, owner, likes in crows:
            curators.append({"folder_id": cid, "name": cname, "owner": owner, "likes": int(likes or 0)})
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
    # 함께 방문(분담결제 완료) — 크루 전체 활동 실적
    visits = (
        db.query(models.ChatSplitRequest)
        .filter(models.ChatSplitRequest.room_id == cid, models.ChatSplitRequest.status == "completed")
        .count()
    )
    return {
        "id": c.id, "title": c.title or "이름 없는 크루", "icon": c.icon or "👥",
        "members": len(members),
        "crew_type": getattr(c, "crew_type", None) or "friends",
        "org_name": getattr(c, "org_name", None),
        "verified_members": int(verified),
        "visits_total": int(visits),
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
    # 성과: 승인 크루가 "이 가게에서" 완료한 분담결제 + 재방문 의사
    perf_visits = 0
    perf_amount = 0
    perf_revisits = 0
    if approved_cids:
        rows = (
            db.query(models.ChatSplitRequest)
            .filter(
                models.ChatSplitRequest.room_id.in_(approved_cids),
                models.ChatSplitRequest.place_id == place.id,
                models.ChatSplitRequest.status == "completed",
            ).all()
        )
        perf_visits = len(rows)
        perf_amount = int(sum(r.total_amount or 0 for r in rows))
        member_ids = set()
        for cid in approved_cids:
            c = db.query(models.Community).filter(models.Community.id == cid).first()
            if c:
                member_ids.update(c.member_ids or [])
        if member_ids:
            perf_revisits = (
                db.query(models.PlaceVisitFeedback)
                .filter(
                    models.PlaceVisitFeedback.user_id.in_(list(member_ids)),
                    models.PlaceVisitFeedback.place_id == place.id,
                    models.PlaceVisitFeedback.personal_revisit == True,  # noqa: E712
                ).count()
            )

    apps_by_deal: dict = {}
    for a in apps:
        apps_by_deal.setdefault(a.partnership_id, []).append(a)

    out_deals = []
    for d in deals:
        das = apps_by_deal.get(d.id, [])
        out_deals.append({
            "id": d.id, "title": d.title, "benefit": d.benefit, "discount_pct": d.discount_pct,
            "target": d.target, "conditions": d.conditions or {}, "status": d.status,
            "expires_at": d.expires_at.isoformat() if d.expires_at else None,
            "pending": sum(1 for a in das if a.status == "pending"),
            "approved": sum(1 for a in das if a.status == "approved"),
            "applications": [
                {
                    "id": a.id, "status": a.status, "message": a.message or "",
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
    d = models.CrewPartnership(
        place_id=place.id,
        title=title[:60],
        benefit=benefit[:120],
        discount_pct=req.get("discount_pct"),
        target=target,
        conditions=req.get("conditions") or {},
        status="active",
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
    db.commit()
    return {"id": a.id, "status": a.status}
