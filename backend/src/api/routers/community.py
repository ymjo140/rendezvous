from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List
from core.database import get_db
from domain import models
from schemas import community as schemas
from services.community_service import CommunityService
from api.dependencies import get_current_user

router = APIRouter()
service = CommunityService()

@router.get("/api/communities", response_model=List[dict])
def get_communities(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.get_communities(db, user)

@router.post("/api/communities")
def create_community(req: schemas.CommunityCreate, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.create_community(db, user, req)

@router.post("/api/communities/{comm_id}/join")
def join_community(comm_id: str, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.join_community(db, user, comm_id)