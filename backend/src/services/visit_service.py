# -*- coding: utf-8 -*-
"""방문 집계 — 크루 화면과 사장님 콘솔이 같은 규칙을 쓰게 하는 단일 출처.

예전에는 크루 쪽(home.py)은 세 소스를 합치고 사장님 쪽(merchant.py)은 분담결제만
세서, 같은 제휴인데 양쪽 숫자가 달랐다. QR 체크인을 붙여놓고 사장님 콘솔에는
안 잡히니 "제휴해줘도 숫자가 0"으로 보이던 문제.
"""
from typing import Optional

from sqlalchemy.orm import Session

from domain import models


def crew_visit_stats(db: Session, community_id: str, place_id: Optional[int] = None) -> dict:
    """크루의 '함께 방문' 통합 집계.

    한 가지 소스(분담결제)만 세면 그냥 밥만 먹고 온 모임은 영원히 실적이 0이라
    세 가지 증거를 모두 인정한다. 같은 가게·같은 날은 어느 경로든 1회로 친다.
      · 분담결제 완료 — 가장 강한 증거(돈이 오감)
      · QR 체크인 — 크루를 지정한 현장 방문
      · 모임 방문 피드백 — 방문 후 '또 갈래요?' 응답

    place_id를 주면 그 가게에서의 방문만 센다(사장님 콘솔용).
    """
    keys: set = set()          # (place_id or 이름, 날짜) — 중복 제거 키
    by_source = {"split": 0, "checkin": 0, "feedback": 0}
    amount = 0

    q = (db.query(models.ChatSplitRequest)
         .filter(models.ChatSplitRequest.room_id == community_id,
                 models.ChatSplitRequest.status == "completed"))
    if place_id is not None:
        q = q.filter(models.ChatSplitRequest.place_id == place_id)
    for r in q.all():
        keys.add((r.place_id or r.place_name or "", r.date or ""))
        by_source["split"] += 1
        amount += int(r.total_amount or 0)

    try:
        q = db.query(models.PlaceCheckin).filter(models.PlaceCheckin.community_id == community_id)
        if place_id is not None:
            q = q.filter(models.PlaceCheckin.place_id == place_id)
        for c in q.all():
            keys.add((c.place_id, c.date or ""))
            by_source["checkin"] += 1
    except Exception:
        pass  # 테이블 생성 전에도 죽지 않게

    q = db.query(models.PlaceVisitFeedback).filter(models.PlaceVisitFeedback.room_id == community_id)
    if place_id is not None:
        q = q.filter(models.PlaceVisitFeedback.place_id == place_id)
    for f in q.all():
        keys.add((f.place_id, f.created_at.strftime("%Y-%m-%d") if f.created_at else ""))
        by_source["feedback"] += 1

    return {"visits": len(keys), "amount": amount, "by_source": by_source}


def crew_visits(db: Session, community_id: str, place_id: Optional[int] = None) -> int:
    return crew_visit_stats(db, community_id, place_id)["visits"]


def partnership_month_uses(db: Session, app_id: int, month: str) -> int:
    """제휴를 이번 달 몇 번 썼는지 — 크루-일 단위로 1회.

    같은 날 멤버 다섯이 각자 찍어도 회식 1회다. 방문 집계와 같은 규칙이라
    사장님이 보는 숫자와 크루가 보는 숫자가 갈리지 않는다. month는 'YYYY-MM'.
    """
    try:
        rows = (db.query(models.PlaceCheckin.date)
                .filter(models.PlaceCheckin.partnership_app_id == app_id,
                        models.PlaceCheckin.date.like(month + "%")).all())
    except Exception:
        return 0
    return len({r[0] for r in rows})


def partnership_uses_by_app(db: Session, app_ids: list, month: Optional[str] = None) -> dict:
    """app_id → 사용 횟수(크루-일 단위). month가 없으면 전체 기간."""
    if not app_ids:
        return {}
    try:
        q = (db.query(models.PlaceCheckin.partnership_app_id, models.PlaceCheckin.date)
             .filter(models.PlaceCheckin.partnership_app_id.in_(app_ids)))
        if month:
            q = q.filter(models.PlaceCheckin.date.like(month + "%"))
        rows = q.all()
    except Exception:
        return {}
    seen: dict = {}
    for app_id, date in rows:
        seen.setdefault(app_id, set()).add(date)
    return {k: len(v) for k, v in seen.items()}
