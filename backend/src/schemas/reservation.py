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
    offer_rule_id: Optional[int] = None  # 핫딜 예약이면 수량 차감 대상
    table_id: Optional[int] = None       # 손님 지정 테이블(store_tables.id)
    table_label: Optional[str] = None    # 지정 테이블 라벨(예: '창가 T1')
    # 크루 예약이면 그 크루 — 체크인 때 크루를 다시 고를 필요가 없고 제휴가 자동으로 걸린다
    community_id: Optional[str] = None


class ReservationResponse(BaseModel):
    id: str
    place_id: Optional[int] = None
    place_name: str
    date: str
    time: str
    party_size: int
    deposit_amount: int
    status: str
    offer_rule_id: Optional[int] = None
    table_id: Optional[int] = None
    table_label: Optional[str] = None
    community_id: Optional[str] = None
    crew_title: Optional[str] = None     # 목록 화면에서 크루 이름을 바로 보여주려고
    crew_icon: Optional[str] = None
    created_at: datetime

    class Config:
        from_attributes = True
