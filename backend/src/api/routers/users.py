from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from typing import List

from ...core.database import get_db
from ...domain import models
from ...schemas import user as schemas
from ...services.user_service import UserService
from ..dependencies import get_current_user # core/dependencies.py 로 이동했는지 확인 필요, 없으면 아래처럼 임시 사용

router = APIRouter()
user_service = UserService()

# --- 유저 정보 & 온보딩 ---
@router.get("/api/users/me")
def get_my_info(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.get_my_info(db, current_user)

@router.post("/api/users/me/onboarding")
def complete_onboarding(req: schemas.OnboardingRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.complete_onboarding(db, current_user, req)

@router.put("/api/users/me/location")
def update_user_location(req: schemas.LocationUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.update_location(db, current_user, req)

@router.put("/api/users/me")
def update_profile(req: schemas.UserProfileUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.update_profile(db, current_user, req)

@router.put("/api/users/me/preferences")
def update_preferences(prefs: schemas.UserPreferenceUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.update_preferences(db, current_user, prefs)

# --- 상점 & 아바타 ---
@router.get("/api/shop/items")
def get_shop_items(db: Session = Depends(get_db)):
    return user_service.get_shop_items(db)

@router.post("/api/shop/buy")
def buy_item(req: schemas.BuyRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.buy_item(db, current_user, req)

@router.post("/api/avatar/equip")
def equip_item(req: schemas.EquipRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.equip_item(db, current_user, req)

# --- 친구 ---
@router.get("/api/friends")
def get_friends(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.get_friends_list(db, current_user)

@router.post("/api/friends/request")
def request_friend(req: schemas.FriendRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.request_friend(db, current_user, req)

@router.post("/api/friends/accept")
def accept_friend(req: schemas.FriendAccept, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.accept_friend(db, current_user, req)

# --- 리뷰 & 즐겨찾기 ---
@router.post("/api/reviews")
def create_review(review: schemas.ReviewCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.create_review(db, current_user, review)

@router.get("/api/reviews/{place_name}")
def get_place_reviews(place_name: str, db: Session = Depends(get_db)):
    return user_service.get_place_reviews(db, place_name)

@router.post("/api/favorites")
def toggle_favorite(req: schemas.FavoriteRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return user_service.toggle_favorite(db, current_user, req)