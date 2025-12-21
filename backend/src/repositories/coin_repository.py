from sqlalchemy.orm import Session
from ..domain import models

class CoinRepository:
    def create_history(self, db: Session, user_id: int, amount: int, type: str, description: str):
        history = models.CoinHistory(
            user_id=user_id,
            amount=amount,
            type=type,
            description=description
        )
        db.add(history)
        return history

    def get_history(self, db: Session, user_id: int, limit: int = 20):
        return db.query(models.CoinHistory).filter(models.CoinHistory.user_id == user_id)\
                 .order_by(models.CoinHistory.created_at.desc()).limit(limit).all()