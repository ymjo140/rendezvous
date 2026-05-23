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


def _rule_active_now(rule: models.OfferRule, weekday: int, cur_min: int) -> bool:
    """현재(요일/시각) 기준으로 룰이 진행 중인지.

    day_of_week_mask는 머천트와 동일하게 월=bit0..일=bit6 (Python weekday()와 일치).
    요일/시간 미지정이면 상시 노출로 간주.
    """
    mask = getattr(rule, "day_of_week_mask", None) or 0
    if mask and not (mask & (1 << weekday)):
        return False

    blocks = getattr(rule, "time_blocks_json", None) or []
    if isinstance(blocks, list) and blocks:
        def in_block(b: Dict[str, str]) -> bool:
            start = _to_minutes(b.get("start"))
            end = _to_minutes(b.get("end"))
            if start is None or end is None:
                return True
            return start <= cur_min < end

        if not any(in_block(b) for b in blocks if isinstance(b, dict)):
            return False
    return True


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
        SELECT td.id AS deal_id, td.title AS title, td.end_time AS end_time,
               p.id AS store_id, p.name AS store_name
        FROM time_deals td
        JOIN places p
          ON (td.store_id ~ '^[0-9]+$' AND p.id = CAST(td.store_id AS INTEGER))
        WHERE td.date = :today
          AND td.start_time <= :now
          AND td.end_time >= :now
        """
    )
    try:
        rows = db.execute(sql, {"today": today, "now": now}).mappings().all()
    except Exception as exc:  # 테이블 부재/권한 등에도 핫딜 전체가 죽지 않도록
        print(f"[hotdeals] time_deals 조회 실패: {exc}")
        return []

    deals: List[Dict[str, Any]] = []
    for r in rows:
        end_time = r.get("end_time")
        deals.append(
            {
                "deal_id": r.get("deal_id"),
                "benefit_title": r.get("title") or "타임 핫딜",
                "description": "지금 진행 중",
                "end_time": end_time.isoformat() if isinstance(end_time, datetime) else end_time,
                "store_id": r.get("store_id"),
                "store_name": r.get("store_name"),
                "image_url": None,
            }
        )
    return deals


@router.get("/api/hotdeals")
def get_hot_deals(db: Session = Depends(get_db)) -> List[Dict[str, Any]]:
    now = datetime.now()
    weekday = now.weekday()  # 0=월 .. 6=일 (머천트 day_of_week_mask와 일치)
    cur_min = now.hour * 60 + now.minute

    rows = (
        db.query(models.OfferRule, models.Place)
        .join(models.Place, models.OfferRule.place_id == models.Place.id)
        .filter(models.OfferRule.enabled == True)
        .all()
    )

    deals: List[Dict[str, Any]] = []
    for rule, place in rows:
        if not _rule_active_now(rule, weekday, cur_min):
            continue
        deals.append(
            {
                "deal_id": rule.id,
                "benefit_title": _resolve_rule_title(rule),
                "description": _resolve_rule_description(rule),
                "end_time": None,
                "store_id": place.id,
                "store_name": place.name,
                "image_url": _resolve_place_image(place),
            }
        )

    # 진행 중인 타임 핫딜(time_deals) 합치기
    deals.extend(_active_time_deals(db, now))

    return deals
