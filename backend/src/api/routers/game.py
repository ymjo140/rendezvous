from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from services.gamification_service import GamificationService
from api.dependencies import get_current_user

router = APIRouter()
service = GamificationService()

VALID_ACTIONS = {"daily_login", "explore", "recommend", "review", "reserve", "share"}


@router.get("/api/game/profile")
def get_game_profile(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return service.get_profile(db, user)


@router.get("/api/game/leaderboard")
def get_leaderboard(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return service.get_leaderboard(db, user)


@router.post("/api/game/activity")
def record_activity(
    req: dict,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    action_type = str(req.get("action_type") or "").strip()
    if action_type not in VALID_ACTIONS:
        raise HTTPException(status_code=400, detail="알 수 없는 활동입니다.")
    return service.record_activity(db, user, action_type)
