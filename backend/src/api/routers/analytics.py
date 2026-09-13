"""Authenticated beta observation event intake."""
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session

from api.dependencies import require_user
from core.database import get_db
from services.beta_event_service import CLIENT_BETA_EVENT_NAMES, record_event


router = APIRouter()


class BetaEventRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    event_name: str = Field(min_length=1, max_length=64)
    entity_type: str | None = Field(default=None, max_length=32)
    entity_id: str | None = Field(default=None, max_length=64)
    request_id: str | None = Field(default=None, max_length=64)
    metadata: dict[str, Any] = Field(default_factory=dict)


@router.post("/api/analytics/events")
def collect_beta_event(
    req: BetaEventRequest,
    response: Response,
    user=Depends(require_user),
    db: Session = Depends(get_db),
):
    response.headers["Cache-Control"] = "no-store"
    if req.event_name not in CLIENT_BETA_EVENT_NAMES:
        raise HTTPException(422, "클라이언트에서 기록할 수 없는 베타 이벤트입니다.",
                            headers={"Cache-Control": "no-store"})
    try:
        _, duplicate = record_event(
            db,
            user.id,
            req.event_name,
            entity_type=req.entity_type,
            entity_id=req.entity_id,
            metadata=req.metadata,
            request_id=req.request_id,
        )
        db.commit()
    except ValueError as exc:
        raise HTTPException(422, str(exc), headers={"Cache-Control": "no-store"}) from None
    except SQLAlchemyError:
        db.rollback()
        raise HTTPException(503, "이벤트를 기록하지 못했어요.", headers={"Cache-Control": "no-store"}) from None
    return {"accepted": True, "duplicate": duplicate, "event_name": req.event_name}
