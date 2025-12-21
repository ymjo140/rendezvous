from sqlalchemy.orm import Session
from fastapi import HTTPException
from ..domain import models
from ..repositories.coin_repository import CoinRepository
from ..schemas import coins as schemas

class CoinService:
    def __init__(self):
        self.repo = CoinRepository()

    def get_wallet_info(self, db: Session, user: models.User):
        history = self.repo.get_history(db, user.id)
        return {"balance": user.wallet_balance, "history": history}

    def charge_coins(self, db: Session, user: models.User, req: schemas.CoinChargeRequest):
        # 실제 PG사 연동 로직이 들어갈 자리 (여기선 성공 가정)
        try:
            user.wallet_balance += req.amount
            self.repo.create_history(db, user.id, req.amount, "charge", f"{req.payment_method} 충전")
            db.commit()
            db.refresh(user)
            return {"message": "Charge successful", "balance": user.wallet_balance}
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
        """지도에서 보물상자 열기"""
        # (추후 위치 검증 로직 추가 가능)
        amount = 50 # 획득량
        try:
            user.wallet_balance += amount
            self.repo.create_history(db, user.id, amount, "reward", "지도 보물찾기 획득")
            db.commit()
            return {"message": f"{amount} 코인을 획득했습니다!", "balance": user.wallet_balance}
        except:
            db.rollback()
            raise HTTPException(status_code=500, detail="Loot failed")