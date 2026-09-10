from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

ContextTag = Literal["date", "work", "friends", "solo", "cafe", "drink", "family", "special"]


class VisitInput(BaseModel):
    model_config = ConfigDict(extra="forbid", allow_inf_nan=False)
    place_id: int = Field(gt=0)
    community_id: str | None = Field(default=None, min_length=1, max_length=100)
    reservation_id: str | None = Field(default=None, max_length=100)
    party_size: int = Field(default=1, ge=1, le=50)  # Self-report only; never evidence.
    context_tag: ContextTag | None = None


class CheckinRequest(VisitInput):
    qr_token: str = Field(min_length=1, max_length=2048)
    lat: float = Field(ge=-90, le=90)
    lng: float = Field(ge=-180, le=180)
    accuracy_m: float = Field(gt=0, le=150)
    position_at: datetime

    @field_validator("position_at")
    @classmethod
    def aware_position(cls, value):
        if value.tzinfo is None:
            raise ValueError("위치 확인 시각에 시간대가 필요합니다.")
        return value


class RedeemRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    partnership_app_id: int = Field(gt=0)
    idempotency_key: str = Field(min_length=8, max_length=128)
