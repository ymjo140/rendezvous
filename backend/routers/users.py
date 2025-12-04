from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import or_
from sqlalchemy.orm.attributes import flag_modified
from typing import List, Optional, Any
from pydantic import BaseModel

import models
import algorithm as agora_algo
from dependencies import get_db, get_current_user

router = APIRouter()

# --- Data Models ---
class UserPreferenceUpdate(BaseModel):
    foods: List[str] = []; disliked_foods: List[str] = []; vibes: List[str] = []; alcohol: List[str] = []; conditions: List[str] = []; avg_spend: int = 15000
class UserProfileUpdate(BaseModel): name: str
class EquipRequest(BaseModel): category: str; item_id: str
class BuyRequest(BaseModel): item_id: str
class ReviewCreate(BaseModel):
    place_name: str; rating: float; tags: List[str] = []
    score_taste: int; score_service: int; score_price: int; score_vibe: int
    comment: Optional[str] = None; reason: Optional[str] = None
class FavoriteRequest(BaseModel): place_id: int; place_name: str
# 🌟 [신규] 친구 관련 모델
class FriendRequest(BaseModel): email: str
class FriendAccept(BaseModel): request_id: int

# --- User Info API ---
@router.get("/api/users/me")
def get_my_info(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    avatar = db.query(models.UserAvatar).filter(models.UserAvatar.user_id == current_user.id).first()
    avatar_data = {}
    if avatar: avatar_data = { "equipped": avatar.equipped, "inventory": avatar.inventory, "level": avatar.level }
    my_reviews = db.query(models.Review).filter(models.Review.user_id == current_user.id).order_by(models.Review.created_at.desc()).all()
    
    return {
        "id": current_user.id, "name": current_user.name, "email": current_user.email,
        "preferences": current_user.preferences, "location": {"lat": current_user.lat, "lng": current_user.lng},
        "wallet_balance": current_user.wallet_balance, "avatar": avatar_data, "favorites": current_user.favorites, "reviews": my_reviews
    }

@router.put("/api/users/me")
def update_profile(req: UserProfileUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not req.name.strip(): raise HTTPException(400, "Name cannot be empty")
    current_user.name = req.name; db.commit(); return {"message": "Updated", "name": current_user.name}

@router.put("/api/users/me/preferences")
def update_preferences(prefs: UserPreferenceUpdate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    current_user.preferences = prefs.dict(); flag_modified(current_user, "preferences"); db.commit(); return {"message": "Updated"}

# --- Shop & Avatar ---
@router.get("/api/shop/items")
def get_shop_items(db: Session = Depends(get_db)): return db.query(models.AvatarItem).all()

@router.post("/api/shop/buy")
def buy_item(req: BuyRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    item = db.query(models.AvatarItem).filter(models.AvatarItem.id == req.item_id).first()
    if not item: raise HTTPException(404, "아이템 없음")
    avatar = db.query(models.UserAvatar).filter(models.UserAvatar.user_id == current_user.id).first()
    if not avatar: avatar = models.UserAvatar(user_id=current_user.id); db.add(avatar)
    inventory = avatar.inventory or []
    if req.item_id in inventory: return {"message": "이미 보유 중"}
    if current_user.wallet_balance < item.price_coin: raise HTTPException(400, "코인 부족")
    current_user.wallet_balance -= item.price_coin
    inventory.append(req.item_id); avatar.inventory = inventory; flag_modified(avatar, "inventory"); db.commit()
    return {"message": "구매 완료", "balance": current_user.wallet_balance}

@router.post("/api/avatar/equip")
def equip_item(req: EquipRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    avatar = db.query(models.UserAvatar).filter(models.UserAvatar.user_id == current_user.id).first()
    if not avatar: raise HTTPException(404, "아바타 정보 없음")
    equipped = dict(avatar.equipped) if avatar.equipped else {}; equipped[req.category] = req.item_id 
    avatar.equipped = equipped; flag_modified(avatar, "equipped"); db.commit()
    return {"message": "장착 완료", "equipped": equipped}

# --- Friends API (신규) ---
@router.get("/api/friends")
def get_friends(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 1. 이미 친구인 목록 (Accepted)
    friends_query = db.query(models.Friendship).filter(
        (models.Friendship.requester_id == current_user.id) | (models.Friendship.receiver_id == current_user.id),
        models.Friendship.status == "accepted"
    ).all()
    
    friends = []
    for f in friends_query:
        friend_id = f.receiver_id if f.requester_id == current_user.id else f.requester_id
        friend_user = db.query(models.User).filter(models.User.id == friend_id).first()
        if friend_user:
            # 친구 아바타 정보
            f_avatar = db.query(models.UserAvatar).filter(models.UserAvatar.user_id == friend_user.id).first()
            equipped = f_avatar.equipped if f_avatar else {}
            friends.append({
                "id": friend_user.id, "name": friend_user.name, "email": friend_user.email,
                "location": {"lat": friend_user.lat, "lng": friend_user.lng},
                "avatar": {"equipped": equipped}
            })

    # 2. 받은 요청 목록 (Pending)
    requests_query = db.query(models.Friendship).filter(
        models.Friendship.receiver_id == current_user.id,
        models.Friendship.status == "pending"
    ).all()
    
    pending_requests = []
    for r in requests_query:
        requester = db.query(models.User).filter(models.User.id == r.requester_id).first()
        if requester:
            pending_requests.append({"id": r.id, "requester_name": requester.name, "requester_email": requester.email})

    return {"friends": friends, "requests": pending_requests}

@router.post("/api/friends/request")
def request_friend(req: FriendRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    target = db.query(models.User).filter(models.User.email == req.email).first()
    if not target: raise HTTPException(404, "유저를 찾을 수 없습니다.")
    if target.id == current_user.id: raise HTTPException(400, "자신에게 요청할 수 없습니다.")
    
    existing = db.query(models.Friendship).filter(
        ((models.Friendship.requester_id == current_user.id) & (models.Friendship.receiver_id == target.id)) |
        ((models.Friendship.requester_id == target.id) & (models.Friendship.receiver_id == current_user.id))
    ).first()
    
    if existing:
        if existing.status == "accepted": return {"message": "이미 친구입니다."}
        return {"message": "이미 요청이 진행 중입니다."}

    new_friendship = models.Friendship(requester_id=current_user.id, receiver_id=target.id, status="pending")
    db.add(new_friendship); db.commit()
    return {"message": "친구 요청을 보냈습니다."}

@router.post("/api/friends/accept")
def accept_friend(req: FriendAccept, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    friendship = db.query(models.Friendship).filter(models.Friendship.id == req.request_id, models.Friendship.receiver_id == current_user.id).first()
    if not friendship: raise HTTPException(404, "요청을 찾을 수 없습니다.")
    
    friendship.status = "accepted"
    db.commit()
    return {"message": "친구 수락 완료"}

# --- Reviews & Favorites ---
@router.post("/api/reviews")
def create_review(review: ReviewCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    avg_rating = (review.score_taste + review.score_service + review.score_price + review.score_vibe) / 4.0
    db_review = models.Review(
        user_id=current_user.id, place_name=review.place_name, rating=avg_rating,
        score_taste=review.score_taste, score_service=review.score_service, score_price=review.score_price, score_vibe=review.score_vibe,
        comment=review.comment, tags=review.tags, reason=review.reason
    )
    db.add(db_review)
    total_sum = (current_user.avg_rating_given * current_user.review_count) + avg_rating
    current_user.review_count += 1
    current_user.avg_rating_given = total_sum / current_user.review_count
    current_prefs = dict(current_user.preferences) if current_user.preferences else {}
    updated_prefs = agora_algo.AdvancedRecommender.train_user_model(current_prefs, review.tags, avg_rating, review.reason)
    current_user.preferences = updated_prefs
    flag_modified(current_user, "preferences")
    db.commit()
    return {"message": "Review saved", "avg_rating": avg_rating}

@router.get("/api/reviews/{place_name}")
def get_place_reviews(place_name: str, db: Session = Depends(get_db)):
    reviews = db.query(models.Review).filter(models.Review.place_name == place_name).order_by(models.Review.created_at.desc()).all()
    result = []
    for r in reviews:
        user = db.query(models.User).filter(models.User.id == r.user_id).first()
        result.append({
            "id": r.id, "user_name": user.name if user else "알 수 없음", "rating": r.rating,
            "scores": { "taste": r.score_taste, "service": r.score_service, "price": r.score_price, "vibe": r.score_vibe },
            "comment": r.comment, "tags": r.tags, "created_at": r.created_at.strftime("%Y-%m-%d")
        })
    return result

@router.post("/api/favorites")
def toggle_favorite(req: FavoriteRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    favs = list(current_user.favorites) if current_user.favorites else []
    target = {"id": req.place_id, "name": req.place_name}
    exists = False
    for f in favs:
        if isinstance(f, dict) and f.get("id") == req.place_id: favs.remove(f); exists = True; break
    if not exists: favs.append(target)
    current_user.favorites = favs; flag_modified(current_user, "favorites"); db.commit()
    return {"message": "Removed" if exists else "Added", "favorites": favs}