from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models

router = APIRouter()


def _first_non_empty(*values: Optional[str]) -> Optional[str]:
    for value in values:
        if value:
            return value
    return None


def _base_benefit(rule: models.OfferRule) -> Dict[str, Any]:
    base = getattr(rule, "base_benefit_json", None)
    return base if isinstance(base, dict) else {}


def _resolve_rule_title(rule: models.OfferRule) -> str:
    base = _base_benefit(rule)
    title = _first_non_empty(
        getattr(rule, "title", None),
        getattr(rule, "benefit_title", None),
        base.get("title"),
        base.get("name"),
        base.get("benefit_title"),
        getattr(rule, "rule_name", None),
    )
    return title or "핫딜"


def _resolve_rule_description(rule: models.OfferRule) -> str:
    """혜택을 사람이 읽기 좋은 라벨로. 예: '20% 할인', '3000원 할인'."""
    base = _base_benefit(rule)
    btype = _first_non_empty(getattr(rule, "benefit_type", None), base.get("type"))
    bval = _first_non_empty(getattr(rule, "benefit_value", None), base.get("value"))
    if bval:
        if btype == "PERCENT_DISCOUNT":
            return f"{bval}% 할인"
        if btype == "FIXED_AMOUNT_OFF":
            return f"{bval}원 할인"
        if btype:
            return f"{bval}"
    desc = _first_non_empty(
        getattr(rule, "description", None),
        base.get("description"),
        base.get("value"),
    )
    return desc or ""


def _to_minutes(value: Optional[str]) -> Optional[int]:
    if not value or ":" not in value:
        return None
    try:
        hours, minutes = value.split(":")[:2]
        return int(hours) * 60 + int(minutes)
    except (ValueError, TypeError):
        return None


def _rule_active_today(rule: models.OfferRule, weekday: int, today: str = "") -> bool:
    """오늘 노출 대상 룰인지. 요일(day_of_week_mask) + 유효기간(valid_from~to) + 수량(inventory)을 모두 통과해야 함.
    - 요일 미지정이면 상시. 유효기간 미지정이면 무제한. inventory_cap=0이면 무제한.
    - 소진(used>=cap) 또는 기간 만료 시 자동으로 노출 제외(운영루프)."""
    mask = getattr(rule, "day_of_week_mask", None) or 0
    if mask and not (mask & (1 << weekday)):
        return False
    # 유효기간
    vf = getattr(rule, "valid_from", None)
    vt = getattr(rule, "valid_to", None)
    if today:
        if vf and today < vf:
            return False
        if vt and today > vt:
            return False
    # 수량 소진
    cap = getattr(rule, "inventory_cap", 0) or 0
    used = getattr(rule, "inventory_used", 0) or 0
    if cap > 0 and used >= cap:
        return False
    return True


def _rule_remaining(rule: models.OfferRule) -> Optional[int]:
    """남은 수량(무제한이면 None)."""
    cap = getattr(rule, "inventory_cap", 0) or 0
    if cap <= 0:
        return None
    used = getattr(rule, "inventory_used", 0) or 0
    return max(0, cap - used)


def _format_window(rule: models.OfferRule) -> str:
    """룰의 적용 시간대를 사람이 읽기 좋게. 예: '오늘 18:00~20:00'."""
    blocks = getattr(rule, "time_blocks_json", None) or []
    parts = []
    if isinstance(blocks, list):
        for b in blocks:
            if isinstance(b, dict) and b.get("start") and b.get("end"):
                parts.append(f"{b['start']}~{b['end']}")
    return "오늘 " + ", ".join(parts) if parts else "오늘 종일"


def _rule_end_time(rule: models.OfferRule) -> Optional[str]:
    """오늘 마지막 시간블록 end (프론트 만료 표시용)."""
    blocks = getattr(rule, "time_blocks_json", None) or []
    ends = [b.get("end") for b in blocks if isinstance(b, dict) and b.get("end")]
    return max(ends) if ends else None


def _resolve_place_image(place: models.Place) -> Optional[str]:
    return _first_non_empty(getattr(place, "image_url", None))


def _active_time_deals(db: Session, now: datetime) -> List[Dict[str, Any]]:
    """진행 중인 time_deals(머천트 시간핫딜)를 places와 조인해 반환.

    time_deals는 B2C 모델에 없어 raw SQL로 조회(공유 Supabase). store_id(text)가
    숫자면 places.id와 매칭.
    """
    today = now.strftime("%Y-%m-%d")
    sql = text(
        """
        SELECT td.id AS deal_id, td.title AS title, td.date AS deal_date,
               td.start_time AS start_time, td.end_time AS end_time,
               p.id AS store_id, p.name AS store_name, p.lat AS lat, p.lng AS lng
        FROM time_deals td
        JOIN places p
          ON (td.store_id ~ '^[0-9]+$' AND p.id = CAST(td.store_id AS INTEGER))
        WHERE td.date >= :today
        ORDER BY td.date, td.start_time
        """
    )
    try:
        rows = db.execute(sql, {"today": today}).mappings().all()
    except Exception as exc:  # 테이블 부재/권한 등에도 핫딜 전체가 죽지 않도록
        print(f"[hotdeals] time_deals 조회 실패: {exc}")
        return []

    def _fmt(value: Any) -> Optional[str]:
        if isinstance(value, datetime):
            return value.isoformat()
        if value is None:
            return None
        return str(value)

    deals: List[Dict[str, Any]] = []
    for r in rows:
        deal_date = str(r.get("deal_date")) if r.get("deal_date") is not None else None
        start = _fmt(r.get("start_time"))
        end = _fmt(r.get("end_time"))
        day_label = "오늘" if deal_date == today else (deal_date or "")
        window = f"{start}~{end}" if start and end else ""
        description = f"{day_label} {window}".strip() or "타임 핫딜"
        deals.append(
            {
                "deal_id": r.get("deal_id"),
                "benefit_title": r.get("title") or "타임 핫딜",
                "description": description,
                "end_time": end,
                "store_id": r.get("store_id"),
                "store_name": r.get("store_name"),
                "lat": r.get("lat"),
                "lng": r.get("lng"),
                "image_url": None,
            }
        )
    return deals


@router.get("/api/hotdeals")
def get_hot_deals(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    now = datetime.now()
    weekday = now.weekday()  # 0=월 .. 6=일 (머천트 day_of_week_mask와 일치)
    today = now.strftime("%Y-%m-%d")

    rows = (
        db.query(models.OfferRule, models.Place)
        .join(models.Place, models.OfferRule.place_id == models.Place.id)
        .filter(models.OfferRule.enabled == True)
        .all()
    )

    deals: List[Dict[str, Any]] = []
    for rule, place in rows:
        if not _rule_active_today(rule, weekday, today):  # 요일+유효기간+수량 통과만
            continue
        title = _resolve_rule_title(rule)
        benefit = _resolve_rule_description(rule)
        window = _format_window(rule)
        # 혜택 문구가 타이틀과 중복되면 시간대만 노출
        description = f"{benefit} · {window}" if benefit and benefit != title else window
        deals.append(
            {
                "deal_id": rule.id,
                "offer_rule_id": rule.id,          # 예약 시 수량 차감용
                "benefit_title": title,
                "description": description,
                "end_time": _rule_end_time(rule),
                "store_id": place.id,
                "store_name": place.name,
                "lat": place.lat,
                "lng": place.lng,
                "image_url": _resolve_place_image(place),
                "remaining": _rule_remaining(rule),  # 남은 수량(무제한이면 None)
            }
        )

    # 진행 중인 타임 핫딜(time_deals) 합치기
    deals.extend(_active_time_deals(db, now))

    return deals
