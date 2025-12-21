from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from ...core.database import get_db
from ...domain import models
from ...schemas import sync as schemas
from ...services.sync_service import SyncService
from ..dependencies import get_current_user

router = APIRouter()
service = SyncService()

@router.post("/api/sync/ical")
def sync_calendar(req: schemas.SyncRequest, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.sync_calendar(db, user, req)