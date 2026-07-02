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

    def _seed_taste_embedding(self, db: Session, user: models.User, preferences: dict):
        """취향 저장 시 UserEmbedding 시드(개인화 추천 첫 사용부터 작동). 실패해도 무시."""
        try:
            from services.vector_embedding_service import VectorEmbeddingService
            VectorEmbeddingService().seed_user_embedding_from_preferences(db, user.id, preferences or {})
        except Exception as e:
            print(f"[WARN] taste embedding seed skipped: {e}")

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
        
        from datetime import datetime as _dt
        existing = user.preferences if isinstance(user.preferences, dict) else {}
        preferences = {
            "foods": req.preferred_foods,
            "vibes": req.preferred_vibes,
            "alcohol": req.preferred_alcohol,
            "avg_spend": req.avg_budget,
            "job_status": req.job_status,
            # 필수 동의 이력(법적 근거) — 기존 동의 기록은 보존
            "consents": {
                **(existing.get("consents") or {}),
                "terms": bool(req.agreed_terms),
                "privacy": bool(req.agreed_privacy),
                "location": bool(req.agreed_location),
                "age_over_14": bool(req.age_over_14),
                "at": _dt.now().isoformat(),
            },
        }
        user.preferences = preferences
        flag_modified(user, "preferences")
        db.commit()
        # 취향 → 임베딩 시드 (첫 추천부터 개인화)
        self._seed_taste_embedding(db, user, preferences)
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

    def withdraw(self, db: Session, user: models.User):
        """회원 탈퇴(스토어 필수): 개인 콘텐츠/연결 삭제 + 계정 익명화.
        예약/리뷰/거래원장은 정산·기록 보존을 위해 행은 남기되 계정 정보를 익명화
        (email 변경으로 기존 JWT는 즉시 무효화됨)."""
        from datetime import datetime as _dt
        uid = user.id
        try:
            # 1) 내 게시물 + 부속(좋아요/댓글) 삭제
            posts = db.query(models.Post).filter(models.Post.user_id == uid).all()
            for p in posts:
                db.query(models.PostLike).filter(models.PostLike.post_id == p.id).delete(synchronize_session=False)
                db.query(models.PostComment).filter(models.PostComment.post_id == p.id).delete(synchronize_session=False)
                db.delete(p)
            # 2) 내가 남긴 좋아요/댓글
            db.query(models.PostLike).filter(models.PostLike.user_id == uid).delete(synchronize_session=False)
            db.query(models.PostComment).filter(models.PostComment.user_id == uid).delete(synchronize_session=False)
            # 3) 소셜/학습/게임 데이터
            db.query(models.Friendship).filter(
                (models.Friendship.requester_id == uid) | (models.Friendship.receiver_id == uid)
            ).delete(synchronize_session=False)
            db.query(models.ChatRoomMember).filter(models.ChatRoomMember.user_id == uid).delete(synchronize_session=False)
            db.query(models.UserEmbedding).filter(models.UserEmbedding.user_id == uid).delete(synchronize_session=False)
            db.query(models.UserInteractionLog).filter(models.UserInteractionLog.user_id == uid).delete(synchronize_session=False)
            db.query(models.UserBadge).filter(models.UserBadge.user_id == uid).delete(synchronize_session=False)
            db.query(models.UserBlock).filter(
                (models.UserBlock.blocker_id == uid) | (models.UserBlock.blocked_user_id == uid)
            ).delete(synchronize_session=False)
            try:
                db.query(models.SavedItem).filter(models.SavedItem.user_id == uid).delete(synchronize_session=False)
                db.query(models.SaveFolder).filter(models.SaveFolder.user_id == uid).delete(synchronize_session=False)
                db.query(models.ShareCart).filter(models.ShareCart.user_id == uid).delete(synchronize_session=False)
            except Exception:
                pass
            db.query(models.UserAvatar).filter(models.UserAvatar.user_id == uid).delete(synchronize_session=False)

            # 4) 계정 익명화 — email 변경으로 기존 토큰(sub=email) 즉시 무효
            stamp = _dt.now().strftime("%Y%m%d%H%M%S")
            user.name = "탈퇴한 사용자"
            user.email = f"deleted_{uid}_{stamp}@deleted.invalid"
            user.hashed_password = "withdrawn"
            user.preferences = {}
            user.preference_vector = {}
            user.favorites = []
            user.blacklisted_place_ids = []
            user.lat = 37.5665
            user.lng = 126.9780
            user.location_name = ""
            user.wallet_balance = 0
            user.xp = 0
            user.level = 1
            user.streak_count = 0
            user.best_streak = 0
            user.last_activity_date = None
            user.game_state = {}
            flag_modified(user, "preferences")
            flag_modified(user, "game_state")
            db.commit()
            return {"status": "withdrawn", "message": "탈퇴가 완료되었습니다. 이용해주셔서 감사합니다."}
        except Exception as e:
            db.rollback()
            print(f"[withdraw] 실패: {e}")
            raise HTTPException(500, "탈퇴 처리 중 오류가 발생했습니다.")

    def update_preferences(self, db: Session, user: models.User, prefs: schemas.UserPreferenceUpdate):
        user.preferences = prefs.dict()
        flag_modified(user, "preferences")
        db.commit()
        # 취향 변경 → 임베딩 재시드/블렌드
        self._seed_taste_embedding(db, user, user.preferences)
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
        # user_id 우선, 없으면 email로 대상 조회 (인앱 검색은 user_id 사용)
        target = None
        if req.user_id:
            target = self.repo.get_by_id(db, req.user_id)
        elif req.email:
            target = self.repo.get_by_email(db, req.email)
        if not target: raise HTTPException(404, "유저를 찾을 수 없습니다.")
        if target.id == user.id: raise HTTPException(400, "자신에게 요청할 수 없습니다.")

        existing = self.repo.get_friendship(db, user.id, target.id)
        if existing:
            if existing.status == "accepted": return {"message": "이미 친구입니다."}
            # 상대가 나에게 보낸 요청이 이미 있으면 수락 처리
            if existing.receiver_id == user.id:
                existing.status = "accepted"
                db.commit()
                return {"message": "친구가 되었습니다."}
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

    def link_referral(self, db: Session, user: models.User, inviter_id: int):
        """카톡 초대링크로 가입한 유저를 초대자와 즉시(accepted) 친구 연결."""
        if inviter_id == user.id:
            return {"message": "본인 초대링크는 사용할 수 없습니다.", "linked": False}
        inviter = self.repo.get_by_id(db, inviter_id)
        if not inviter:
            return {"message": "초대한 사용자를 찾을 수 없습니다.", "linked": False}

        existing = self.repo.get_friendship(db, user.id, inviter.id)
        if existing:
            if existing.status != "accepted":
                existing.status = "accepted"
                db.commit()
            return {"message": "이미 연결되어 있습니다.", "linked": True, "inviter_name": inviter.name}

        # 초대자가 requester가 되도록 생성 + 즉시 수락
        self.repo.create_friendship(db, inviter.id, user.id, status="accepted")
        db.commit()
        return {"message": f"{inviter.name}님과 친구가 되었습니다.", "linked": True, "inviter_name": inviter.name}

    def search_users(self, db: Session, user: models.User, query: str):
        """이름으로 유저 검색 → 친구 추가용. 친구 상태(none/pending/accepted) 함께 반환."""
        results = self.repo.search_by_name(db, query, exclude_id=user.id, limit=10)
        out = []
        for u in results:
            rel = self.repo.get_friendship(db, user.id, u.id)
            status = "none"
            if rel:
                status = "accepted" if rel.status == "accepted" else "pending"
            out.append({
                "id": u.id,
                "name": u.name,
                "location_name": u.location_name,
                "status": status,
            })
        return out

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
        # 리뷰로 갱신된 취향을 임베딩에 반영(학습 일원화)
        self._seed_taste_embedding(db, user, user.preferences)
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
