from pydantic import BaseModel
from typing import Optional
from datetime import datetime


class ReservationCreate(BaseModel):
    place_id: Optional[int] = None
    place_name: str
    date: str            # YYYY-MM-DD
    time: str            # HH:MM
    party_size: int = 2
    deposit_amount: int = 0   # 캐시 예약금(원)


class ReservationResponse(BaseModel):
    id: str
    place_id: Optional[int] = None
    place_name: str
    date: str
    time: str
    party_size: int
    deposit_amount: int
    status: str
    created_at: datetime

    class Config:
        from_attributes = True
