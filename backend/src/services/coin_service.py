from datetime import date
from sqlalchemy import func
from sqlalchemy.orm import Session
from fastapi import HTTPException
from domain import models
from repositories.coin_repository import CoinRepository
from schemas import coins as schemas

# 지도 보물찾기 하루 최대 획득 횟수(남용 방지)
MAP_LOOT_DAILY_CAP = 20
MAP_LOOT_DESC = "지도 보물찾기 획득"

class CoinService:
    def __init__(self):
        self.repo = CoinRepository()

    def get_wallet_info(self, db: Session, user: models.User):
        history = self.repo.get_history(db, user.id)
        return {"balance": user.wallet_balance, "history": history}

    @staticmethod
    def charge_bonus(amount: int) -> int:
        """충전 보너스(예치금 float 적립 촉진). 금액 클수록 보너스율↑."""
        amount = int(amount or 0)
        if amount >= 100000:
            return int(amount * 0.10)
        if amount >= 50000:
            return int(amount * 0.05)
        if amount >= 30000:
            return int(amount * 0.03)
        return 0

    def charge_coins(self, db: Session, user: models.User, req: schemas.CoinChargeRequest):
        # 실제 PG사 연동 로직이 들어갈 자리 (여기선 성공 가정)
        try:
            bonus = self.charge_bonus(req.amount)
            user.wallet_balance = (user.wallet_balance or 0) + req.amount + bonus
            self.repo.create_history(db, user.id, req.amount, "charge", f"{req.payment_method} 충전")
            if bonus > 0:
                self.repo.create_history(db, user.id, bonus, "reward", f"충전 보너스 (+{bonus}원)")
            db.commit()
            db.refresh(user)
            return {
                "message": "Charge successful",
                "balance": user.wallet_balance,
                "charged": req.amount,
                "bonus": bonus,
            }
        except Exception:
            db.rollback()
            raise HTTPException(status_code=500, detail="Transaction failed")

    def use_coins(self, db: Session, user: models.User, req: schemas.CoinUsageRequest):
        if user.wallet_balance < req.amount:
            raise HTTPException(status_code=400, detail="Insufficient balance")
        
        try:
            user.wallet_balance -= req.amount
            self.repo.create_history(db, user.id, -req.amount, "use", req.description)
            db.commit()
            return {"message": "Payment successful", "balance": user.wallet_balance}
        except Exception as e:
            db.rollback()
            raise e
            
    def loot_coin(self, db: Session, user: models.User, lat: float, lng: float):
        """지도에서 보물상자 열기 (하루 획득 횟수 제한 — 무한 적립 남용 방지)."""
        today_count = (
            db.query(models.CoinHistory)
            .filter(
                models.CoinHistory.user_id == user.id,
                models.CoinHistory.description == MAP_LOOT_DESC,
                func.date(models.CoinHistory.created_at) == date.today(),
            )
            .count()
        )
        if today_count >= MAP_LOOT_DAILY_CAP:
            raise HTTPException(status_code=429, detail="오늘의 보물찾기 획득 한도에 도달했어요. 내일 다시 도전해주세요!")

        amount = 50  # 획득량
        try:
            user.wallet_balance = (user.wallet_balance or 0) + amount
            self.repo.create_history(db, user.id, amount, "reward", MAP_LOOT_DESC)
            db.commit()
            return {"message": f"{amount} 코인을 획득했습니다!", "balance": user.wallet_balance}
        except HTTPException:
            raise
        except Exception:
            db.rollback()
            raise HTTPException(status_code=500, detail="Loot failed")