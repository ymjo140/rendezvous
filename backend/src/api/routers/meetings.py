from fastapi import APIRouter, Depends, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List

from ...core.database import get_db
from ...domain import models
from ...schemas import meeting as schemas
from ...services.meeting_service import MeetingService
from ..dependencies import get_current_user

router = APIRouter()
meeting_service = MeetingService()

@router.post("/api/meeting-flow")
async def run_meeting_flow(req: schemas.MeetingFlowRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    return await meeting_service.run_meeting_flow(db, req, background_tasks)

@router.post("/api/meeting-flow/vote")
async def vote_meeting(req: schemas.VoteRequest, db: Session = Depends(get_db)):
    return await meeting_service.vote_meeting(db, req)

@router.post("/api/meeting-flow/confirm")
async def confirm_meeting(req: schemas.ConfirmRequest, db: Session = Depends(get_db)):
    return await meeting_service.confirm_meeting(db, req)

# --- 일정 (Events) ---
@router.post("/api/events", response_model=schemas.EventSchema)
def create_event(event: schemas.EventSchema, db: Session = Depends(get_db)):
    return meeting_service.create_event(db, event)

@router.get("/api/events", response_model=List[schemas.EventSchema])
def get_events(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return meeting_service.get_events(db, current_user.id)

@router.delete("/api/events/{event_id}")
def delete_event(event_id: str, db: Session = Depends(get_db)):
    meeting_service.delete_event(db, event_id)
    return {"detail": "Deleted"}

# --- 추천 (홈 탭 등) ---
@router.post("/api/recommend")
def get_recommendation(req: schemas.RecommendRequest, db: Session = Depends(get_db)):
    # 로직 재사용 (단순화)
    return []