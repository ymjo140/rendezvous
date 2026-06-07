from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from schemas import reservation as schemas
from services.reservation_service import ReservationService
from api.dependencies import get_current_user

router = APIRouter()
service = ReservationService()


@router.post("/api/reservations", response_model=schemas.ReservationResponse)
def create_reservation(
    req: schemas.ReservationCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    result = service.create(db, user, req)
    return result["reservation"]


@router.get("/api/reservations", response_model=List[schemas.ReservationResponse])
def list_reservations(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return service.list_my(db, user)


@router.post("/api/reservations/{reservation_id}/cancel")
def cancel_reservation(
    reservation_id: str,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return service.cancel(db, user, reservation_id)


# --- 사장님 콘솔용: 가게 앱예약 조회 + 상태변경(취소 시 환불) ---
# ⚠️ 데모: 소유권(RLS/owner) 검증은 추후. 머니 로직(환불)을 단일 소스로 두기 위해 백엔드 경유.
@router.get("/api/reservations/store/{place_id}", response_model=List[schemas.ReservationResponse])
def list_store_reservations(place_id: int, db: Session = Depends(get_db)):
    return service.list_by_place(db, place_id)


@router.post("/api/reservations/{reservation_id}/status")
def set_reservation_status(reservation_id: str, req: dict, db: Session = Depends(get_db)):
    new_status = str(req.get("status") or "").strip()
    return service.set_status(db, reservation_id, new_status)
