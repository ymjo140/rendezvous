"""방문 후 재방문 의향 설문 — 개인 취향 + 모임 적합 2축.
별점 대신 '또 갈래요?'라는 진성 신호로 자체 신뢰 데이터 구축.
트리거: 결제(예약) 방문일 다음날부터, 미응답 예약에 노출."""
from datetime import date
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from api.dependencies import get_current_user

router = APIRouter()


@router.get("/api/feedback/pending")
def pending_feedback(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """방문일(예약 date)이 지난 예약 중 아직 재방문 설문을 안 한 것들(다음날부터 노출)."""
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    today = date.today().isoformat()  # 'YYYY-MM-DD' — date 컬럼도 문자열이라 사전식=시간순
    resvs = (
        db.query(models.Reservation)
        .filter(
            models.Reservation.user_id == user.id,
            models.Reservation.date < today,          # 방문일 지남(=다음날부터)
            models.Reservation.status != "cancelled",
        )
        .order_by(models.Reservation.date.desc())
        .limit(20)
        .all()
    )
    done = {
        row[0]
        for row in db.query(models.PlaceVisitFeedback.reservation_id)
        .filter(models.PlaceVisitFeedback.user_id == user.id)
        .all()
        if row[0]
    }
    items = [
        {
            "reservation_id": rv.id,
            "place_id": rv.place_id,
            "place_name": rv.place_name,
            "date": rv.date,
        }
        for rv in resvs
        if rv.id not in done
    ]
    return {"count": len(items), "items": items}


@router.post("/api/feedback")
def submit_feedback(req: dict, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    """재방문 설문 저장.
    body: {reservation_id?, place_id, room_id?, personal_revisit(bool), group_revisit(bool|null)}"""
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    place_id = req.get("place_id")
    if place_id is None:
        raise HTTPException(status_code=400, detail="place_id가 필요합니다.")

    reservation_id = req.get("reservation_id")
    if reservation_id:
        exists = (
            db.query(models.PlaceVisitFeedback)
            .filter(
                models.PlaceVisitFeedback.user_id == user.id,
                models.PlaceVisitFeedback.reservation_id == reservation_id,
            )
            .first()
        )
        if exists:
            return {"status": "already", "message": "이미 응답했어요."}

    fb = models.PlaceVisitFeedback(
        user_id=user.id,
        place_id=int(place_id),
        reservation_id=reservation_id,
        room_id=req.get("room_id"),
        personal_revisit=req.get("personal_revisit"),
        group_revisit=req.get("group_revisit"),
    )
    db.add(fb)
    db.commit()
    return {"status": "ok"}


@router.get("/api/feedback/place/{place_id}")
def place_revisit_stats(place_id: int, db: Session = Depends(get_db)):
    """장소 재방문 의향 집계(배지용). '단골' 배지는 최소 3명 이상일 때만."""
    rows = (
        db.query(models.PlaceVisitFeedback)
        .filter(models.PlaceVisitFeedback.place_id == place_id)
        .all()
    )
    personal_yes = sum(1 for r in rows if r.personal_revisit is True)
    group_yes = sum(1 for r in rows if r.group_revisit is True)
    return {
        "total": len(rows),
        "personal_revisit_yes": personal_yes,
        "group_revisit_yes": group_yes,
        "personal_regulars": personal_yes if personal_yes >= 3 else 0,  # 배지 노출용
        "group_regulars": group_yes if group_yes >= 3 else 0,
    }
