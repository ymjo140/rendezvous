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

    def _adjust_inventory(self, db: Session, offer_rule_id: int, delta: int):
        """핫딜 예약 수량 증감(+1 예약, -1 취소). 0 미만으로 내려가지 않게."""
        try:
            rule = db.query(models.OfferRule).filter(models.OfferRule.id == offer_rule_id).first()
            if rule is None:
                return
            used = (rule.inventory_used or 0) + delta
            rule.inventory_used = max(0, used)
        except Exception as e:
            print(f"[reservation] inventory 조정 실패: {e}")

    def create(self, db: Session, user: models.User, req: schemas.ReservationCreate):
        deposit = max(0, int(req.deposit_amount or 0))
        if deposit > 0 and (user.wallet_balance or 0) < deposit:
            raise HTTPException(status_code=400, detail="캐시 잔액이 부족합니다. 충전 후 이용해주세요.")

        try:
            rid = uuid.uuid4().hex
            offer_rule_id = getattr(req, "offer_rule_id", None)
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
                offer_rule_id=offer_rule_id,
            )
            db.add(resv)

            # 캐시 차감 + 원장 기록
            if deposit > 0:
                user.wallet_balance = (user.wallet_balance or 0) - deposit
                self.coins.create_history(db, user.id, -deposit, "use", f"예약 결제 · {req.place_name}")

            # 핫딜 예약이면 수량 차감(소진 시 자동 노출 중단)
            if offer_rule_id:
                self._adjust_inventory(db, offer_rule_id, +1)

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

    def set_status(self, db: Session, reservation_id: str, new_status: str):
        """예약 상태 변경(사장님 콘솔용). 취소로 전환 시 예약금 환불(중복 방지).
        ⚠️ 데모: 소유권(RLS) 검증은 추후. 지금은 상태/환불 로직만 단일 소스로."""
        valid = {"confirmed", "completed", "cancelled", "no_show"}
        if new_status not in valid:
            raise HTTPException(status_code=400, detail="잘못된 예약 상태입니다.")

        resv = db.query(models.Reservation).filter(models.Reservation.id == reservation_id).first()
        if resv is None:
            raise HTTPException(status_code=404, detail="예약을 찾을 수 없습니다.")

        prev = resv.status
        try:
            # 취소(또는 노쇼) 전환 시 환불 — 이미 취소/노쇼였으면 중복 환불 안 함
            if new_status in ("cancelled", "no_show") and prev not in ("cancelled", "no_show"):
                refund = int(resv.deposit_amount or 0)
                if refund > 0 and resv.user_id:
                    u = db.query(models.User).filter(models.User.id == resv.user_id).first()
                    if u is not None:
                        u.wallet_balance = (u.wallet_balance or 0) + refund
                        self.coins.create_history(db, u.id, refund, "refund", f"예약 취소 환불 · {resv.place_name}")
                # 핫딜 수량 복구
                if resv.offer_rule_id:
                    self._adjust_inventory(db, resv.offer_rule_id, -1)
            resv.status = new_status
            db.commit()
            return {"status": new_status, "reservation_id": reservation_id, "prev": prev}
        except Exception as e:
            db.rollback()
            print(f"[reservation] set_status 실패: {e}")
            raise HTTPException(status_code=500, detail="상태 변경 중 오류가 발생했습니다.")

    def list_by_place(self, db: Session, place_id: int):
        """특정 가게의 앱 예약 목록(사장님 콘솔용)."""
        return (
            db.query(models.Reservation)
            .filter(models.Reservation.place_id == place_id)
            .order_by(models.Reservation.date.asc(), models.Reservation.time.asc())
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
            # 핫딜 수량 복구
            if resv.offer_rule_id:
                self._adjust_inventory(db, resv.offer_rule_id, -1)
            db.commit()
            return {"status": "cancelled", "refunded": refund, "balance": user.wallet_balance}
        except Exception as e:
            db.rollback()
            print(f"[reservation] cancel 실패: {e}")
            raise HTTPException(status_code=500, detail="취소 처리 중 오류가 발생했습니다.")
