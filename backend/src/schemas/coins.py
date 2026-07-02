from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime

# 충전 1회 상한(원). mock 결제라도 서버측 금액 검증으로 무한/음수 적립 차단.
MAX_CHARGE_AMOUNT = 1_000_000

class CoinChargeRequest(BaseModel):
    amount: int = Field(gt=0, le=MAX_CHARGE_AMOUNT)
    payment_method: str = "card"

class CoinUsageRequest(BaseModel):
    amount: int = Field(gt=0)
    description: str

class CoinHistoryResponse(BaseModel):
    id: int
    amount: int
    type: str # charge, use, reward
    description: str
    created_at: datetime
    
    class Config:
        from_attributes = True

class WalletResponse(BaseModel):
    balance: int
    history: List[CoinHistoryResponse]