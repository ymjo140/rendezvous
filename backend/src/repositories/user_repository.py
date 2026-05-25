from sqlalchemy.orm import Session
from sqlalchemy import or_
from domain import models
from schemas import user as schemas

class UserRepository:
    def get_by_email(self, db: Session, email: str):
        return db.query(models.User).filter(models.User.email == email).first()

    def get_by_id(self, db: Session, user_id: int):
        return db.query(models.User).filter(models.User.id == user_id).first()

    # --- 유저 생성 (Auth에서 사용) ---
    def create(self, db: Session, user: schemas.UserCreate, hashed_password: str, initial_balance: int = 0):
        db_user = models.User(
            email=user.email,
            hashed_password=hashed_password,
            name=user.name,
            gender=user.gender,
            age_group=user.age_group,
            lat=user.lat,
            lng=user.lng,
            location_name=user.location_name,
            wallet_balance=initial_balance,
            avatar="👤"
        )
        db.add(db_user)
        db.flush()
        return db_user

    def create_kakao_user(self, db: Session, email: str, name: str, password: str, initial_balance: int = 0):
        db_user = models.User(
            email=email,
            hashed_password=password,
            name=name,
            avatar="👤",
            lat=37.5665,
            lng=126.9780,
            location_name="위치 미설정",
            wallet_balance=initial_balance
        )
        db.add(db_user)
        db.flush()
        return db_user

    def create_default_avatar(self, db: Session, user_id: int):
        avatar = models.UserAvatar(
            user_id=user_id,
            equipped={"body": "body_basic", "eyes": "eyes_normal", "eyebrows": "brows_basic", "top": "top_tshirt", "bottom": "bottom_shorts", "shoes": "shoes_sneakers"},
            inventory=["body_basic", "eyes_normal", "brows_basic", "hair_01", "top_tshirt", "bottom_shorts", "shoes_sneakers"]
        )
        db.add(avatar)

    # --- 아바타 & 상점 ---
    def get_avatar_info(self, db: Session, user_id: int):
        return db.query(models.UserAvatar).filter(models.UserAvatar.user_id == user_id).first()

    def get_item_by_id(self, db: Session, item_id: str):
        return db.query(models.AvatarItem).filter(models.AvatarItem.id == item_id).first()

    def get_all_items(self, db: Session):
        return db.query(models.AvatarItem).all()

    # --- 친구 ---
    def get_friends(self, db: Session, user_id: int):
        return db.query(models.Friendship).filter(
            (models.Friendship.requester_id == user_id) | (models.Friendship.receiver_id == user_id),
            models.Friendship.status == "accepted"
        ).all()

    def get_friend_requests(self, db: Session, user_id: int):
        return db.query(models.Friendship).filter(
            models.Friendship.receiver_id == user_id,
            models.Friendship.status == "pending"
        ).all()

    def get_friendship(self, db: Session, user1_id: int, user2_id: int):
        return db.query(models.Friendship).filter(
            ((models.Friendship.requester_id == user1_id) & (models.Friendship.receiver_id == user2_id)) |
            ((models.Friendship.requester_id == user2_id) & (models.Friendship.receiver_id == user1_id))
        ).first()

    def create_friendship(self, db: Session, requester_id: int, receiver_id: int, status: str = "pending"):
        friendship = models.Friendship(requester_id=requester_id, receiver_id=receiver_id, status=status)
        db.add(friendship)
        return friendship

    def search_by_name(self, db: Session, query: str, exclude_id: int, limit: int = 10):
        # 이름 부분일치 검색 (카카오 자동생성 닉네임 User_xxxx 제외하지 않음)
        q = (query or "").strip()
        if not q:
            return []
        return (
            db.query(models.User)
            .filter(models.User.name.ilike(f"%{q}%"), models.User.id != exclude_id)
            .limit(limit)
            .all()
        )

    # --- 리뷰 ---
    def create_review(self, db: Session, review_data: models.Review):
        db.add(review_data)
        return review_data

    def get_user_reviews(self, db: Session, user_id: int):
        return db.query(models.Review).filter(models.Review.user_id == user_id).order_by(models.Review.created_at.desc()).all()

    def get_place_reviews(self, db: Session, place_name: str):
        return db.query(models.Review).filter(models.Review.place_name == place_name).order_by(models.Review.created_at.desc()).all()