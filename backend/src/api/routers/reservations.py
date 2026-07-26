from typing import List
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from schemas import reservation as schemas
from services.reservation_service import ReservationService
from api.dependencies import get_current_user, get_current_merchant

router = APIRouter()
service = ReservationService()


def _assert_merchant_owns_place(db: Session, merchant_uid: str, place_id: int):
    """머천트가 해당 place의 소유자인지 검증(아니면 403/404)."""
    place = db.query(models.Place).filter(models.Place.id == place_id).first()
    if place is None:
        raise HTTPException(status_code=404, detail="가게를 찾을 수 없습니다.")
    if str(place.owner_id or "") != str(merchant_uid):
        raise HTTPException(status_code=403, detail="본인 가게의 예약만 관리할 수 있습니다.")


@router.post("/api/reservations", response_model=schemas.ReservationResponse)
def create_reservation(
    req: schemas.ReservationCreate,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    # ⚙ 영업·브레이크 타임 검증 — 사장님 설정(places.features.hours) 밖 시간대는 차단
    try:
        pid = getattr(req, "place_id", None)
        t = (getattr(req, "time", None) or "").strip()
        dstr = (getattr(req, "date", None) or "").strip()
        if pid and t:
            place = db.query(models.Place).filter(models.Place.id == int(pid)).first()
            h = ((place.features or {}).get("hours") or {}) if place else {}
            open_t, close_t = h.get("open"), h.get("close")
            bf, bt, bd = h.get("break_from"), h.get("break_to"), h.get("break_days") or "everyday"
            if open_t and close_t and not (open_t <= t < close_t):
                raise HTTPException(status_code=400, detail=f"영업 시간({open_t}~{close_t}) 안에서만 예약할 수 있어요.")
            if bf and bt and bf <= t < bt:
                import datetime as _dt
                is_weekday = True
                try:
                    is_weekday = _dt.date.fromisoformat(dstr).weekday() < 5
                except Exception:
                    pass
                if bd == "everyday" or (bd == "weekday" and is_weekday):
                    raise HTTPException(status_code=400, detail=f"브레이크 타임({bf}~{bt})에는 예약할 수 없어요.")
    except HTTPException:
        raise
    except Exception as _e:
        print(f"[reservation] hours check skip: {_e}")

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
# 머천트 Supabase 세션 검증 + place 소유권 확인. 머니 로직(환불)은 백엔드 단일 소스.
@router.get("/api/reservations/store/{place_id}", response_model=List[schemas.ReservationResponse])
def list_store_reservations(
    place_id: int,
    merchant: str = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    _assert_merchant_owns_place(db, merchant, place_id)
    return service.list_by_place(db, place_id)


@router.post("/api/reservations/{reservation_id}/status")
def set_reservation_status(
    reservation_id: str,
    req: dict,
    merchant: str = Depends(get_current_merchant),
    db: Session = Depends(get_db),
):
    resv = db.query(models.Reservation).filter(models.Reservation.id == reservation_id).first()
    if resv is None:
        raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다.")
    _assert_merchant_owns_place(db, merchant, resv.place_id)
    new_status = str(req.get("status") or "").strip()
    return service.set_status(db, reservation_id, new_status)
