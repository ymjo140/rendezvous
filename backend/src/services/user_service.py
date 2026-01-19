from sqlalchemy.orm import Session
from typing import List
from sqlalchemy.orm.attributes import flag_modified
from fastapi import HTTPException

from domain import models
from schemas import user as schemas
from repositories.user_repository import UserRepository

# 🌟 [수정] 경로에 맞게 정확히 import 합니다.
try:
    from core.algorithm import AdvancedRecommender
except ImportError:
    AdvancedRecommender = None

class UserService:
    def __init__(self):
        self.repo = UserRepository()

    def get_my_info(self, db: Session, user: models.User):
        avatar = self.repo.get_avatar_info(db, user.id)
        avatar_data = {}
        if avatar:
            avatar_data = { "equipped": avatar.equipped, "inventory": avatar.inventory, "level": avatar.level }
        
        my_reviews = self.repo.get_user_reviews(db, user.id)
        
        return {
            "id": user.id, "name": user.name, "email": user.email,
            "gender": user.gender, "age_group": user.age_group,
            "preferences": user.preferences, 
            "location": {"lat": user.lat, "lng": user.lng},
            "location_name": user.location_name,
            "wallet_balance": user.wallet_balance, 
            "avatar": avatar_data, 
            "favorites": user.favorites, 
            "reviews": my_reviews
        }

    def complete_onboarding(self, db: Session, user: models.User, req: schemas.OnboardingRequest):
        user.name = req.name
        user.gender = req.gender
        user.age_group = req.age_group
        user.lat = req.lat
        user.lng = req.lng
        user.location_name = req.location_name
        
        preferences = {
            "foods": req.preferred_foods,
            "vibes": req.preferred_vibes,
            "alcohol": req.preferred_alcohol,
            "avg_spend": req.avg_budget,
            "job_status": req.job_status
        }
        user.preferences = preferences
        flag_modified(user, "preferences")
        db.commit()
        return {"message": "Onboarding completed", "user": {"name": user.name, "preferences": preferences}}

    def update_location(self, db: Session, user: models.User, req: schemas.LocationUpdate):
        user.location_name = req.location_name
        user.lat = req.lat
        user.lng = req.lng
        db.commit()
        db.refresh(user)
        return {"message": "Location updated", "user": {"name": user.name, "location": user.location_name}}

    def update_profile(self, db: Session, user: models.User, req: schemas.UserProfileUpdate):
        if not req.name.strip(): raise HTTPException(400, "Name cannot be empty")
        user.name = req.name
        db.commit()
        return {"message": "Updated", "name": user.name}

    def update_preferences(self, db: Session, user: models.User, prefs: schemas.UserPreferenceUpdate):
        user.preferences = prefs.dict()
        flag_modified(user, "preferences")
        db.commit()
        return {"message": "Updated"}

    # --- 상점 ---
    def get_shop_items(self, db: Session):
        return self.repo.get_all_items(db)

    def buy_item(self, db: Session, user: models.User, req: schemas.BuyRequest):
        item = self.repo.get_item_by_id(db, req.item_id)
        if not item: raise HTTPException(404, "아이템 없음")
        
        avatar = self.repo.get_avatar_info(db, user.id)
        if not avatar:
            avatar = models.UserAvatar(user_id=user.id)
            db.add(avatar)
        
        inventory = avatar.inventory or []
        if req.item_id in inventory: return {"message": "이미 보유 중"}
        if user.wallet_balance < item.price_coin: raise HTTPException(400, "코인 부족")
        
        # 트랜잭션: 잔액 차감 + 인벤토리 추가
        try:
            user.wallet_balance -= item.price_coin
            inventory.append(req.item_id)
            avatar.inventory = inventory
            flag_modified(avatar, "inventory")
            db.commit()
        except Exception as e:
            db.rollback()
            raise e
            
        return {"message": "구매 완료", "balance": user.wallet_balance}

    def equip_item(self, db: Session, user: models.User, req: schemas.EquipRequest):
        avatar = self.repo.get_avatar_info(db, user.id)
        if not avatar: raise HTTPException(404, "아바타 정보 없음")
        
        equipped = dict(avatar.equipped) if avatar.equipped else {}
        equipped[req.category] = req.item_id 
        avatar.equipped = equipped
        flag_modified(avatar, "equipped")
        db.commit()
        return {"message": "장착 완료", "equipped": equipped}

    # --- 친구 ---
    def get_friends_list(self, db: Session, user: models.User):
        friends_rels = self.repo.get_friends(db, user.id)
        friends = []
        for f in friends_rels:
            friend_id = f.receiver_id if f.requester_id == user.id else f.requester_id
            friend_user = self.repo.get_by_id(db, friend_id)
            if friend_user:
                f_avatar = self.repo.get_avatar_info(db, friend_user.id)
                equipped = f_avatar.equipped if f_avatar else {}
                friends.append({
                    "id": friend_user.id, "name": friend_user.name, "email": friend_user.email,
                    "location": {"lat": friend_user.lat, "lng": friend_user.lng},
                    "avatar": {"equipped": equipped}
                })

        requests_rels = self.repo.get_friend_requests(db, user.id)
        pending_requests = []
        for r in requests_rels:
            requester = self.repo.get_by_id(db, r.requester_id)
            if requester:
                pending_requests.append({"id": r.id, "requester_name": requester.name, "requester_email": requester.email})

        return {"friends": friends, "requests": pending_requests}

    def request_friend(self, db: Session, user: models.User, req: schemas.FriendRequest):
        target = self.repo.get_by_email(db, req.email)
        if not target: raise HTTPException(404, "유저를 찾을 수 없습니다.")
        if target.id == user.id: raise HTTPException(400, "자신에게 요청할 수 없습니다.")
        
        existing = self.repo.get_friendship(db, user.id, target.id)
        if existing:
            if existing.status == "accepted": return {"message": "이미 친구입니다."}
            return {"message": "이미 요청이 진행 중입니다."}

        self.repo.create_friendship(db, user.id, target.id)
        db.commit()
        return {"message": "친구 요청을 보냈습니다."}

    def accept_friend(self, db: Session, user: models.User, req: schemas.FriendAccept):
        friendship = db.query(models.Friendship).filter(models.Friendship.id == req.request_id, models.Friendship.receiver_id == user.id).first()
        if not friendship: raise HTTPException(404, "요청을 찾을 수 없습니다.")
        friendship.status = "accepted"
        db.commit()
        return {"message": "친구 수락 완료"}

    # --- 리뷰 & 즐겨찾기 ---
    def _normalize_image_urls(self, image_urls: List[str]):
        normalized = []
        for url in image_urls or []:
            if not url:
                continue
            if url.startswith("http://") or url.startswith("https://") or url.startswith("data:image"):
                normalized.append(url)
            else:
                normalized.append(f"data:image/jpeg;base64,{url}")
        return normalized

    def create_review(self, db: Session, user: models.User, req: schemas.ReviewCreate):
        avg_rating = (req.score_taste + req.score_service + req.score_price + req.score_vibe) / 4.0
        image_urls = self._normalize_image_urls(req.image_urls)
        db_review = models.Review(
            user_id=user.id, place_name=req.place_name, rating=avg_rating,
            score_taste=req.score_taste, score_service=req.score_service, score_price=req.score_price, score_vibe=req.score_vibe,
            comment=req.comment, tags=req.tags, reason=req.reason, image_urls=image_urls
        )
        self.repo.create_review(db, db_review)
        
        # 유저 통계 업데이트
        total_sum = (user.avg_rating_given * user.review_count) + avg_rating
        user.review_count += 1
        user.avg_rating_given = total_sum / user.review_count
        
        # 🌟 알고리즘 학습 (AdvancedRecommender 사용)
        if AdvancedRecommender:
            current_prefs = dict(user.preferences) if user.preferences else {}
            updated_prefs = AdvancedRecommender.train_user_model(current_prefs, req.tags, avg_rating, req.reason)
            user.preferences = updated_prefs
            flag_modified(user, "preferences")
            
        db.commit()
        return {"message": "Review saved", "avg_rating": avg_rating}

    def get_place_reviews(self, db: Session, place_name: str):
        reviews = self.repo.get_place_reviews(db, place_name)
        result = []
        for r in reviews:
            user = self.repo.get_by_id(db, r.user_id)
            result.append({
                "id": r.id, "user_name": user.name if user else "알 수 없음", "rating": r.rating,
                "scores": { "taste": r.score_taste, "service": r.score_service, "price": r.score_price, "vibe": r.score_vibe },
                "comment": r.comment, "tags": r.tags, "image_urls": r.image_urls or [], "created_at": r.created_at.strftime("%Y-%m-%d")
            })
        return result

    def toggle_favorite(self, db: Session, user: models.User, req: schemas.FavoriteRequest):
        favs = list(user.favorites) if user.favorites else []
        target = {"id": req.place_id, "name": req.place_name}
        exists = False
        for f in favs:
            if isinstance(f, dict) and f.get("id") == req.place_id: 
                favs.remove(f)
                exists = True
                break
        if not exists: favs.append(target)
        user.favorites = favs
        flag_modified(user, "favorites")
        db.commit()
        return {"message": "Removed" if exists else "Added", "favorites": favs}
