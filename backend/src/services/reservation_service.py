import uuid
from sqlalchemy.orm import Session
from fastapi import HTTPException

from domain import models
from repositories.coin_repository import CoinRepository
from schemas import reservation as schemas


class ReservationService:
    """B2C 예약 + 캐시(충전금) 결제/환불. 캐시는 user.wallet_balance(원)."""

    def __init__(self):
        self.coins = CoinRepository()

    def create(self, db: Session, user: models.User, req: schemas.ReservationCreate):
        deposit = max(0, int(req.deposit_amount or 0))
        if deposit > 0 and (user.wallet_balance or 0) < deposit:
            raise HTTPException(status_code=400, detail="캐시 잔액이 부족합니다. 충전 후 이용해주세요.")

        try:
            rid = uuid.uuid4().hex
            resv = models.Reservation(
                id=rid,
                user_id=user.id,
                place_id=req.place_id,
                place_name=req.place_name,
                date=req.date,
                time=req.time,
                party_size=int(req.party_size or 2),
                deposit_amount=deposit,
                status="confirmed",
            )
            db.add(resv)

            # 캐시 차감 + 원장 기록
            if deposit > 0:
                user.wallet_balance = (user.wallet_balance or 0) - deposit
                self.coins.create_history(db, user.id, -deposit, "use", f"예약 결제 · {req.place_name}")

            db.commit()
            db.refresh(resv)
            return {"reservation": resv, "balance": user.wallet_balance}
        except HTTPException:
            raise
        except Exception as e:
            db.rollback()
            print(f"[reservation] create 실패: {e}")
            raise HTTPException(status_code=500, detail="예약 처리 중 오류가 발생했습니다.")

    def list_my(self, db: Session, user: models.User):
        return (
            db.query(models.Reservation)
            .filter(models.Reservation.user_id == user.id)
            .order_by(models.Reservation.created_at.desc())
            .all()
        )

    def cancel(self, db: Session, user: models.User, reservation_id: str):
        resv = (
            db.query(models.Reservation)
            .filter(
                models.Reservation.id == reservation_id,
                models.Reservation.user_id == user.id,
            )
            .first()
        )
        if resv is None:
            raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다.")
        if resv.status == "cancelled":
            return {"status": "already_cancelled", "balance": user.wallet_balance}

        try:
            refund = int(resv.deposit_amount or 0)
            resv.status = "cancelled"
            if refund > 0:
                user.wallet_balance = (user.wallet_balance or 0) + refund
                self.coins.create_history(db, user.id, refund, "refund", f"예약 취소 환불 · {resv.place_name}")
            db.commit()
            return {"status": "cancelled", "refunded": refund, "balance": user.wallet_balance}
        except Exception as e:
            db.rollback()
            print(f"[reservation] cancel 실패: {e}")
            raise HTTPException(status_code=500, detail="취소 처리 중 오류가 발생했습니다.")
