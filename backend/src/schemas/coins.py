from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime

class CoinChargeRequest(BaseModel):
    amount: int
    payment_method: str = "card"

class CoinUsageRequest(BaseModel):
    amount: int
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