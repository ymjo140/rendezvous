from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, JSON, ARRAY
from sqlalchemy.orm import relationship
from datetime import datetime
import uuid
import enum
from core.database import Base

def generate_uuid():
    return str(uuid.uuid4())

class ItemCategory(str, enum.Enum):
    BODY = "body"
    EYES = "eyes"
    BROWS = "eyebrows"
    HAIR = "hair"
    TOP = "top"
    BOTTOM = "bottom"
    SHOES = "shoes"
    PET = "pet"
    FOOTPRINT = "footprint"

# --- 사용자 & 아바타 ---
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    name = Column(String, index=True)
    gender = Column(String, default="unknown")
    age_group = Column(String, default="20s")
    avatar = Column(String) # 간단 이모지
    
    lat = Column(Float, default=37.5665)
    lng = Column(Float, default=126.9780)
    location_name = Column(String, default="서울 시청")
    
    preferences = Column(JSON, default={})
    preference_vector = Column(JSON, default={})
    favorites = Column(JSON, default=[])
    wallet_balance = Column(Integer, default=0)
    
    review_count = Column(Integer, default=0)
    avg_rating_given = Column(Float, default=0.0)
    
    avatar_info = relationship("UserAvatar", uselist=False, back_populates="user")

class UserAvatar(Base):
    __tablename__ = "user_avatars"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    equipped = Column(JSON, default={})
    inventory = Column(JSON, default=[])
    level = Column(Integer, default=1)
    current_energy = Column(Integer, default=100)
    total_steps = Column(Integer, default=0)
    user = relationship("User", back_populates="avatar_info")

class AvatarItem(Base):
    __tablename__ = "avatar_items"
    id = Column(String, primary_key=True)
    category = Column(String, index=True)
    name = Column(String)
    image_url = Column(String)
    price_coin = Column(Integer, default=0)
    is_limited = Column(Boolean, default=False)
    metadata_json = Column(JSON, default={})

# --- 장소 & 모임 & 기록 ---
class Place(Base):
    __tablename__ = "places"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    category = Column(String)
    address = Column(String, nullable=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)
    tags = Column(JSON, default=[])
    wemeet_rating = Column(Float, default=0.0)
    review_count = Column(Integer, default=0)
    external_link = Column(String, nullable=True)

class MeetingLog(Base):
    __tablename__ = "meeting_logs"
    id = Column(String, primary_key=True, default=generate_uuid)
    community_id = Column(String, nullable=True)
    date_time = Column(DateTime)
    location_name = Column(String)
    participants_count = Column(Integer)
    created_at = Column(DateTime, default=datetime.now)

class VisitLog(Base):
    __tablename__ = "visit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    place_name = Column(String)
    created_at = Column(DateTime, default=datetime.now)

class MeetingHistory(Base):
    __tablename__ = "meeting_histories"
    id = Column(Integer, primary_key=True, index=True)
    region_name = Column(String)
    selected_place_name = Column(String)
    tags = Column(String) # 콤마로 구분된 태그
    participant_count = Column(Integer)
    satisfaction_score = Column(Float) # 1.0 ~ 5.0
    created_at = Column(DateTime, default=datetime.now)
    purpose = Column(String) # 식사, 술, 카페 등

class TravelTimeCache(Base):
    __tablename__ = "travel_time_cache"
    id = Column(String, primary_key=True) # "StartName_EndName"
    start_name = Column(String, index=True)
    end_name = Column(String, index=True)
    total_time = Column(Integer) # 분 단위
    created_at = Column(DateTime, default=datetime.now)

# --- 채팅 & 커뮤니티 ---
class ChatRoom(Base):
    __tablename__ = "chat_rooms"
    id = Column(String, primary_key=True, default=generate_uuid)
    title = Column(String)
    is_group = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)

class ChatRoomMember(Base):
    __tablename__ = "chat_room_members"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, ForeignKey("chat_rooms.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    joined_at = Column(DateTime, default=datetime.now)

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, ForeignKey("chat_rooms.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    content = Column(String)
    timestamp = Column(DateTime, default=datetime.now)

class Community(Base):
    __tablename__ = "communities"
    id = Column(String, primary_key=True, default=generate_uuid)
    host_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    category = Column(String)
    location = Column(String)
    date_time = Column(String)
    max_members = Column(Integer)
    description = Column(String)
    tags = Column(JSON, default=[])
    member_ids = Column(JSON, default=[])
    created_at = Column(DateTime, default=datetime.now)

# --- 기타 기능 (이벤트, 친구, 리뷰, 코인) ---
class Event(Base):
    __tablename__ = "events"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    date = Column(String)
    time = Column(String)
    duration_hours = Column(Float, default=1.0)
    location_name = Column(String, nullable=True)
    purpose = Column(String, default="개인")
    created_at = Column(DateTime, default=datetime.now)
    is_private = Column(Boolean, default=True)

class Friendship(Base):
    __tablename__ = "friendships"
    id = Column(Integer, primary_key=True, index=True)
    requester_id = Column(Integer, ForeignKey("users.id"))
    receiver_id = Column(Integer, ForeignKey("users.id"))
    status = Column(String, default="pending") # pending, accepted
    created_at = Column(DateTime, default=datetime.now)

class Review(Base):
    __tablename__ = "reviews"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    place_name = Column(String, index=True)
    rating = Column(Float)
    comment = Column(String, nullable=True)
    tags = Column(JSON, default=[])
    created_at = Column(DateTime, default=datetime.now)
    score_taste = Column(Integer, default=0)
    score_service = Column(Integer, default=0)
    score_price = Column(Integer, default=0)
    score_vibe = Column(Integer, default=0)
    reason = Column(String, nullable=True)

class CoinHistory(Base):
    __tablename__ = "coin_history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    amount = Column(Integer)
    type = Column(String) # charge, use, reward
    description = Column(String)
    created_at = Column(DateTime, default=datetime.now)

class Campaign(Base):
    __tablename__ = "campaigns"
    id = Column(Integer, primary_key=True, index=True)
    host_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    content = Column(String)
    reward_coin = Column(Integer)
    location = Column(String)
    max_applicants = Column(Integer)
    status = Column(String, default="open")
    created_at = Column(DateTime, default=datetime.now)


# --- SNS 게시물 (Instagram 스타일) ---
class Post(Base):
    __tablename__ = "posts"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # 이미지 (JSON 배열 - 여러 장 지원)
    image_urls = Column(JSON, default=[])
    
    # 내용
    content = Column(String, nullable=True)
    
    # 위치/장소 태그
    location_name = Column(String, nullable=True)
    place_id = Column(Integer, ForeignKey("places.id"), nullable=True)
    
    # 통계
    likes_count = Column(Integer, default=0)
    comments_count = Column(Integer, default=0)
    
    # 메타데이터
    is_public = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)
    
    # Relationships
    user = relationship("User", backref="posts")
    place = relationship("Place", backref="posts")
    likes = relationship("PostLike", back_populates="post", cascade="all, delete-orphan")
    comments = relationship("PostComment", back_populates="post", cascade="all, delete-orphan")


class PostLike(Base):
    __tablename__ = "post_likes"
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(String, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.now)
    
    post = relationship("Post", back_populates="likes")
    user = relationship("User")


class PostComment(Base):
    __tablename__ = "post_comments"
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(String, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    
    post = relationship("Post", back_populates="comments")
    user = relationship("User")


# === AI 추천 시스템 모델 ===

class ActionType(str, enum.Enum):
    """사용자 행동 유형"""
    VIEW = "view"           # 장소 조회
    CLICK = "click"         # 장소 클릭
    LIKE = "like"           # 좋아요
    SAVE = "save"           # 저장/찜
    REVIEW = "review"       # 리뷰 작성
    VISIT = "visit"         # 실제 방문
    SHARE = "share"         # 공유
    SEARCH = "search"       # 검색


class UserAction(Base):
    """사용자 행동 기록 - AI 추천에 활용"""
    __tablename__ = "user_actions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    place_id = Column(Integer, ForeignKey("places.id"), nullable=True, index=True)
    
    action_type = Column(String, nullable=False, index=True)  # ActionType enum 값
    action_value = Column(Float, default=1.0)  # 행동 가중치 (리뷰 점수 등)
    
    # 컨텍스트 정보
    context = Column(JSON, default={})  # 시간대, 날씨, 동행자 수 등
    session_id = Column(String, nullable=True)  # 세션 추적
    
    created_at = Column(DateTime, default=datetime.now, index=True)


class PlaceVector(Base):
    """장소 특성 벡터 - 콘텐츠 기반 추천용"""
    __tablename__ = "place_vectors"
    id = Column(Integer, primary_key=True, index=True)
    place_id = Column(Integer, ForeignKey("places.id"), unique=True, nullable=False)
    
    # 특성 벡터 (정규화된 0~1 값)
    price_level = Column(Float, default=0.5)      # 가격대 (0=저렴, 1=고급)
    noise_level = Column(Float, default=0.5)      # 소음 (0=조용, 1=시끄러움)
    group_friendly = Column(Float, default=0.5)   # 단체 적합도
    date_friendly = Column(Float, default=0.5)    # 데이트 적합도
    family_friendly = Column(Float, default=0.5)  # 가족 적합도
    solo_friendly = Column(Float, default=0.5)    # 혼밥/혼술 적합도
    
    # 음식 카테고리 점수
    korean_score = Column(Float, default=0.0)
    western_score = Column(Float, default=0.0)
    japanese_score = Column(Float, default=0.0)
    chinese_score = Column(Float, default=0.0)
    cafe_score = Column(Float, default=0.0)
    bar_score = Column(Float, default=0.0)
    
    # 분위기 점수
    trendy_score = Column(Float, default=0.0)     # 트렌디/힙한
    traditional_score = Column(Float, default=0.0) # 전통적/클래식
    cozy_score = Column(Float, default=0.0)       # 아늑한
    
    # 메타데이터
    embedding = Column(JSON, default=[])  # 추가 임베딩 벡터
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class UserPreferenceVector(Base):
    """사용자 선호도 벡터 - 개인화 추천용"""
    __tablename__ = "user_preference_vectors"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), unique=True, nullable=False)
    
    # PlaceVector와 동일한 차원의 선호도
    price_preference = Column(Float, default=0.5)
    noise_preference = Column(Float, default=0.5)
    group_preference = Column(Float, default=0.5)
    date_preference = Column(Float, default=0.5)
    family_preference = Column(Float, default=0.5)
    solo_preference = Column(Float, default=0.5)
    
    korean_preference = Column(Float, default=0.0)
    western_preference = Column(Float, default=0.0)
    japanese_preference = Column(Float, default=0.0)
    chinese_preference = Column(Float, default=0.0)
    cafe_preference = Column(Float, default=0.0)
    bar_preference = Column(Float, default=0.0)
    
    trendy_preference = Column(Float, default=0.0)
    traditional_preference = Column(Float, default=0.0)
    cozy_preference = Column(Float, default=0.0)
    
    # 학습 정보
    action_count = Column(Integer, default=0)  # 총 행동 수
    last_updated = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class RecommendationLog(Base):
    """추천 로그 - A/B 테스트 및 성능 측정용"""
    __tablename__ = "recommendation_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # 추천 정보
    algorithm = Column(String, nullable=False)  # "content", "collaborative", "hybrid", "popular"
    recommended_place_ids = Column(JSON, default=[])
    scores = Column(JSON, default=[])  # 각 장소별 추천 점수
    
    # 컨텍스트
    context = Column(JSON, default={})  # 요청 시점 컨텍스트
    
    # 결과 추적
    clicked_place_id = Column(Integer, nullable=True)  # 클릭한 장소
    converted = Column(Boolean, default=False)  # 전환 여부 (방문/예약 등)
    
    created_at = Column(DateTime, default=datetime.now, index=True)


class SimilarPlace(Base):
    """유사 장소 캐시 - 빠른 추천을 위한 사전 계산"""
    __tablename__ = "similar_places"
    id = Column(Integer, primary_key=True, index=True)
    place_id = Column(Integer, ForeignKey("places.id"), nullable=False, index=True)
    similar_place_id = Column(Integer, ForeignKey("places.id"), nullable=False)
    similarity_score = Column(Float, nullable=False)
    
    updated_at = Column(DateTime, default=datetime.now)