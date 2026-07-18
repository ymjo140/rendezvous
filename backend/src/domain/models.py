from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, JSON, ARRAY, UniqueConstraint
from sqlalchemy.orm import relationship
from pgvector.sqlalchemy import Vector  # pgvector 768-dim 임베딩 컬럼용
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
    ml_status = Column(String, default="STARTER")
    interaction_score = Column(Integer, default=0)
    blacklisted_place_ids = Column(JSON, default=[])
    wallet_balance = Column(Integer, default=0)
    
    review_count = Column(Integer, default=0)
    avg_rating_given = Column(Float, default=0.0)

    # 🎮 게이미피케이션(듀오링고식) — 캐시(wallet_balance)와 분리된 게임 진행도
    xp = Column(Integer, default=0)
    level = Column(Integer, default=1)
    streak_count = Column(Integer, default=0)       # 현재 연속 활동일
    best_streak = Column(Integer, default=0)         # 최고 연속 기록
    last_activity_date = Column(String, nullable=True)  # YYYY-MM-DD (마지막 활동일)
    game_state = Column(JSON, default={})            # 일일 퀘스트 진행 등

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
class PlaceCategory(str, enum.Enum):
    """장소 메인 카테고리"""
    RESTAURANT = "RESTAURANT"  # 식당/맛집
    CAFE = "CAFE"              # 카페/디저트
    PUB = "PUB"                # 술집/바
    BUSINESS = "BUSINESS"      # 비즈니스 (회의실, 스터디카페, 코워킹)
    CULTURE = "CULTURE"        # 문화생활 (영화관, 극장, 공연장, 전시)
    ACTIVITY = "ACTIVITY"      # 액티비티 (볼링, 방탈출, 노래방)


class Place(Base):
    """
    장소 모델 - 3단계 계층 구조
    L1: main_category (RESTAURANT, CAFE, PUB, BUSINESS, CULTURE, ACTIVITY)
    L2: cuisine_type (한식, 양식, 일식, 카페, 바, 회의실, 영화관...)
    L3: vibe_tags (분위기/목적 태그)
    L4: features (시설 정보 JSON)
    """
    __tablename__ = "places"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, index=True, nullable=False)
    
    # L1: Main Category (대분류)
    main_category = Column(String, index=True, default="RESTAURANT")  # PlaceCategory enum
    
    # L2: Cuisine/Sub Category (음식 장르)
    cuisine_type = Column(String, index=True)  # 한식, 양식, 일식, 중식, 카페, 바...
    
    # Legacy category (원본 카테고리 보존)
    category = Column(String)
    
    # 위치 정보
    address = Column(String, nullable=True)
    lat = Column(Float, nullable=False)
    lng = Column(Float, nullable=False)

    # Owner (merchant) linkage
    owner_id = Column(String, nullable=True)
    
    # L3: Vibe/Theme Tags (분위기 태그만)
    vibe_tags = Column(JSON, default=[])  # ["데이트", "회식", "조용한", "혼밥"]
    
    # L4: Facilities (시설 정보 - 인덱싱 가능)
    features = Column(JSON, default={})  # {"parking": true, "private_room": true, "wifi": true}
    
    # Legacy tags (기존 호환성)
    tags = Column(JSON, default=[])
    
    # 평점 & 리뷰
    wemeet_rating = Column(Float, default=0.0)
    review_count = Column(Integer, default=0)
    
    # 추가 정보
    phone = Column(String, nullable=True)
    business_hours = Column(String, nullable=True)
    price_range = Column(String, nullable=True)  # 저렴, 보통, 고급
    external_link = Column(String, nullable=True)
    
    # 검색 최적화용 통합 필드
    search_keywords = Column(JSON, default=[])  # [name, cuisine, vibe tags 통합]

    # 외부 지도 장소 id — 저장 리스트 임포트 시 같은 가게를 같은 place로 수렴시키는 키
    naver_sid = Column(String, nullable=True, index=True)
    kakao_cid = Column(String, nullable=True, index=True)
    # 대표 이미지(사장님이 손님 사진 중 지정) — B2C 상세/카드 얼굴
    hero_image = Column(String, nullable=True)

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
    last_read_at = Column(DateTime, nullable=True)  # 안읽음 뱃지 기준(마지막으로 방을 본 시각)

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
    # 맛집 모임 공개 수준: private(우리끼리) | list_only(리스트만 공개) | public(모임 공개) | open(오픈채팅)
    visibility = Column(String, default="private")
    icon = Column(String, nullable=True)  # 모임 대표 이모지(탐색 노출용)
    created_at = Column(DateTime, default=datetime.now)


class ChatSplitRequest(Base):
    """모임 예약금 분담 요청 — 각자 수락(탭)해야 본인 캐시에서 차감. 전원 완료 시 예약 생성."""
    __tablename__ = "chat_split_requests"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, ForeignKey("chat_rooms.id"), index=True, nullable=False)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    place_id = Column(Integer, nullable=True)
    place_name = Column(String, nullable=False)
    date = Column(String)   # YYYY-MM-DD
    time = Column(String)   # HH:MM
    party_size = Column(Integer, default=2)
    total_amount = Column(Integer, default=0)  # 걷는 총액(per*멤버수)
    per_amount = Column(Integer, default=0)    # 1인당
    status = Column(String, default="open")    # open|completed|cancelled|expired|refunded
    reservation_id = Column(String, nullable=True)  # 완료 시 user_reservations.id
    expires_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class ChatSplitShare(Base):
    """분담 몫 — user_id의 몫을 paid_by가 납부(본인 또는 대신)."""
    __tablename__ = "chat_split_shares"
    id = Column(Integer, primary_key=True, index=True)
    request_id = Column(Integer, ForeignKey("chat_split_requests.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    amount = Column(Integer, default=0)
    paid_by = Column(Integer, ForeignKey("users.id"), nullable=True)
    paid_at = Column(DateTime, nullable=True)
    __table_args__ = (UniqueConstraint("request_id", "user_id", name="uq_split_share_user"),)


class UserPushToken(Base):
    """FCM 디바이스 토큰 — 유저당 여러 기기 가능, 토큰은 전역 유니크."""
    __tablename__ = "user_push_tokens"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    token = Column(String, nullable=False, unique=True)
    platform = Column(String, default="android")
    created_at = Column(DateTime, default=datetime.now)
    last_seen_at = Column(DateTime, default=datetime.now)


class ChatPoll(Base):
    """채팅방 투표 카드 — 장소/일정 조율. 만든 사람만 확정 가능."""
    __tablename__ = "chat_polls"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, ForeignKey("chat_rooms.id"), index=True, nullable=False)
    creator_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    kind = Column(String, default="place")  # place(장소) | schedule(일정)
    title = Column(String, nullable=True)
    meta = Column(JSON, default={})  # {anchor_name, lat, lng, purpose} 등
    status = Column(String, default="open")  # open | confirmed
    confirmed_option_id = Column(Integer, nullable=True)
    created_at = Column(DateTime, default=datetime.now)


class ChatPollOption(Base):
    """투표 후보 — AI 시드(added_by=None) 또는 멤버가 실시간 추가."""
    __tablename__ = "chat_poll_options"
    id = Column(Integer, primary_key=True, index=True)
    poll_id = Column(Integer, ForeignKey("chat_polls.id", ondelete="CASCADE"), index=True, nullable=False)
    added_by = Column(Integer, ForeignKey("users.id"), nullable=True)  # None = AI 추천 시드
    place_id = Column(Integer, nullable=True)
    label = Column(String, nullable=False)
    meta = Column(JSON, default={})  # {category, note} / 일정이면 {date, time}
    created_at = Column(DateTime, default=datetime.now)


class ChatPollVote(Base):
    """1인 1표(변경 가능) — poll당 유저 유니크."""
    __tablename__ = "chat_poll_votes"
    id = Column(Integer, primary_key=True, index=True)
    poll_id = Column(Integer, ForeignKey("chat_polls.id", ondelete="CASCADE"), index=True, nullable=False)
    option_id = Column(Integer, ForeignKey("chat_poll_options.id", ondelete="CASCADE"), index=True, nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime, default=datetime.now)
    __table_args__ = (UniqueConstraint("poll_id", "user_id", name="uq_poll_vote_user"),)


class CommunityFollow(Base):
    """맛집 모임 팔로우 — 공개 모임을 팔로우(친구/유저 팔로우와 별개)."""
    __tablename__ = "community_follows"
    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    community_id = Column(String, ForeignKey("communities.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.now)
    __table_args__ = (UniqueConstraint("follower_id", "community_id", name="uq_community_follow"),)

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


class UserFollow(Base):
    """큐레이터 팔로우 — 단방향(친구 friendships와 별개).
    follower가 following(큐레이터)을 팔로우. 인스타 팔로우와 동일 개념."""
    __tablename__ = "user_follows"
    id = Column(Integer, primary_key=True, index=True)
    follower_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    following_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.now)
    __table_args__ = (UniqueConstraint("follower_id", "following_id", name="uq_user_follow"),)

class Review(Base):
    __tablename__ = "reviews"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    place_name = Column(String, index=True)
    rating = Column(Float)
    comment = Column(String, nullable=True)
    tags = Column(JSON, default=[])
    image_urls = Column(JSON, default=[])
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
    type = Column(String) # charge, use, reward, refund
    description = Column(String)
    created_at = Column(DateTime, default=datetime.now)

class ContentReport(Base):
    """콘텐츠 신고(게시물/댓글/사용자) — 스토어 UGC 정책(Apple 1.2) 대응."""
    __tablename__ = "content_reports"
    id = Column(Integer, primary_key=True, index=True)
    reporter_id = Column(Integer, ForeignKey("users.id"), index=True)
    target_type = Column(String)   # post, comment, user
    target_id = Column(String, index=True)
    reason = Column(String)        # spam, abuse, adult, etc
    detail = Column(String, nullable=True)
    status = Column(String, default="pending")  # pending, reviewed
    created_at = Column(DateTime, default=datetime.now)


class UserBlock(Base):
    """사용자 차단 — 차단한 유저의 게시물/댓글을 피드에서 제외."""
    __tablename__ = "user_blocks"
    id = Column(Integer, primary_key=True, index=True)
    blocker_id = Column(Integer, ForeignKey("users.id"), index=True)
    blocked_user_id = Column(Integer, ForeignKey("users.id"), index=True)
    created_at = Column(DateTime, default=datetime.now)


class UserBadge(Base):
    """획득한 뱃지(업적). 정의는 코드 상수, 여기엔 획득 기록만."""
    __tablename__ = "user_badges"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    badge_key = Column(String, index=True)
    earned_at = Column(DateTime, default=datetime.now)


class Reservation(Base):
    """B2C 유저 예약(캐시 결제). 머천트 reservations 테이블과 구분해 user_reservations 사용."""
    __tablename__ = "user_reservations"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    place_id = Column(Integer, nullable=True)
    place_name = Column(String)
    date = Column(String)          # YYYY-MM-DD
    time = Column(String)          # HH:MM
    party_size = Column(Integer, default=2)
    deposit_amount = Column(Integer, default=0)  # 캐시 예약금(원)
    status = Column(String, default="confirmed")  # confirmed, cancelled, completed
    offer_rule_id = Column(Integer, nullable=True)  # 핫딜 예약이면 해당 offer_rule(수량 차감용)
    table_id = Column(Integer, nullable=True)       # 손님이 지정한 테이블(store_tables.id)
    table_label = Column(String, nullable=True)     # 지정 테이블 라벨 스냅샷(예: '창가 T1')
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


# --- Offers / Action Logs ---
class Offer(Base):
    __tablename__ = "offers"
    id = Column(Integer, primary_key=True, index=True)
    place_id = Column(Integer, ForeignKey("places.id"), nullable=True)
    title = Column(String)
    description = Column(String)
    benefit_type = Column(String)
    benefit_value = Column(String)
    conditions_json = Column(JSON, default={})
    valid_from = Column(DateTime, nullable=True)
    valid_to = Column(DateTime, nullable=True)
    inventory_cap = Column(Integer, default=0)
    inventory_used = Column(Integer, default=0)
    status = Column(String, default="active")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class OfferRule(Base):
    __tablename__ = "offer_rules"
    id = Column(Integer, primary_key=True, index=True)
    place_id = Column(Integer, ForeignKey("places.id"), nullable=True)
    rule_name = Column(String)
    day_of_week_mask = Column(Integer, default=0)
    time_blocks_json = Column(JSON, default=[])
    party_size_min = Column(Integer, default=1)
    party_size_max = Column(Integer, default=10)
    lead_time_thresholds_json = Column(JSON, default={})
    base_benefit_json = Column(JSON, default={})
    enabled = Column(Boolean, default=True)
    # 핫딜 운영루프: 수량/유효기간 (소진·만료 시 B2C 노출 자동 중단)
    inventory_cap = Column(Integer, default=0)     # 0 = 무제한
    inventory_used = Column(Integer, default=0)
    valid_from = Column(String, nullable=True)     # YYYY-MM-DD (포함)
    valid_to = Column(String, nullable=True)       # YYYY-MM-DD (포함)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class ActionLog(Base):
    __tablename__ = "action_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=True)
    action_type = Column(String, nullable=False, index=True)
    request_id = Column(String, nullable=True, index=True)
    decision_cell_json = Column(JSON, default={})
    entity_type = Column(String, nullable=True)
    entity_id = Column(String, nullable=True)
    metadata_json = Column(JSON, default={})
    created_at = Column(DateTime, default=datetime.now, index=True)


# --- SNS 게시물 (Instagram 스타일) ---
class Post(Base):
    __tablename__ = "posts"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # 이미지/영상 (JSON 배열 - 여러 장 지원). 영상이면 Storage URL.
    image_urls = Column(JSON, default=[])
    # 'image' | 'video' — 숏폼 영상 게시물 구분
    media_type = Column(String, default="image")

    # 내용
    content = Column(String, nullable=True)

    # 소셜: 해시태그(#) 문자열 배열 + 멘션(@) 친구 user_id 배열
    hashtags = Column(JSON, default=[])
    mentions = Column(JSON, default=[])
    
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


class PostSave(Base):
    """게시물 저장/찜 (레거시 - SavedItem으로 마이그레이션)"""
    __tablename__ = "post_saves"
    id = Column(Integer, primary_key=True, index=True)
    post_id = Column(String, ForeignKey("posts.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.now)


# === 저장 폴더 시스템 ===

class SaveFolder(Base):
    """저장 폴더 - 비즈니스 미팅, 데이트 등으로 분류"""
    __tablename__ = "save_folders"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)  # 폴더 이름
    icon = Column(String, default="📁")    # 이모지 아이콘
    color = Column(String, default="#7C3AED")  # 색상 코드
    is_default = Column(Boolean, default=False)  # 기본 폴더 여부
    # 시스템 폴더 구분: place_default(내 장소) / post_default(저장한 게시물) — 삭제/수정 불가
    system_kind = Column(String, nullable=True, index=True)
    item_count = Column(Integer, default=0)
    # 큐레이터 '맛집 리스트' 공개 — 공개 시 프로필에 노출되고 남들이 팔로우/열람
    is_public = Column(Boolean, default=False)
    description = Column(String, nullable=True)  # 리스트 소개 문구
    community_id = Column(String, ForeignKey("communities.id"), nullable=True, index=True)  # 모임 소유 폴더(개인 폴더면 null)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)

    items = relationship("SavedItem", back_populates="folder", cascade="all, delete-orphan")


class SavedItem(Base):
    """폴더 내 저장된 아이템 (게시물 또는 장소)"""
    __tablename__ = "saved_items"
    id = Column(Integer, primary_key=True, index=True)
    folder_id = Column(Integer, ForeignKey("save_folders.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    # 저장 대상 (게시물 또는 장소 중 하나)
    item_type = Column(String, nullable=False)  # "post" 또는 "place"
    post_id = Column(String, ForeignKey("posts.id", ondelete="CASCADE"), nullable=True)
    place_id = Column(Integer, ForeignKey("places.id", ondelete="CASCADE"), nullable=True)
    
    # 메모/태그
    memo = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.now)
    
    folder = relationship("SaveFolder", back_populates="items")


class ListLike(Base):
    """공개 맛집 리스트 '추천'(좋아요) — 추천 수가 리스트 랭킹을 올림."""
    __tablename__ = "list_likes"
    id = Column(Integer, primary_key=True, index=True)
    folder_id = Column(Integer, ForeignKey("save_folders.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.now)
    __table_args__ = (UniqueConstraint("folder_id", "user_id", name="uq_list_like"),)


class ListSave(Base):
    """공개 맛집 리스트 '담기' 기록 — 담은 사람 수 집계(1인 1회)."""
    __tablename__ = "list_saves"
    id = Column(Integer, primary_key=True, index=True)
    folder_id = Column(Integer, ForeignKey("save_folders.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    created_at = Column(DateTime, default=datetime.now)
    __table_args__ = (UniqueConstraint("folder_id", "user_id", name="uq_list_save"),)


class ListComment(Base):
    """공개 맛집 리스트 댓글 — '친구 추천으로 갔는데 최고' 같은 반응."""
    __tablename__ = "list_comments"
    id = Column(Integer, primary_key=True, index=True)
    folder_id = Column(Integer, ForeignKey("save_folders.id", ondelete="CASCADE"), nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    content = Column(String, nullable=False)
    created_at = Column(DateTime, default=datetime.now)


# === 공유 담기 시스템 ===

class ShareCart(Base):
    """공유 담기 장바구니 - 여러 아이템을 모아서 공유"""
    __tablename__ = "share_carts"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    
    item_type = Column(String, nullable=False)  # "post" 또는 "place"
    post_id = Column(String, ForeignKey("posts.id", ondelete="CASCADE"), nullable=True)
    place_id = Column(Integer, ForeignKey("places.id", ondelete="CASCADE"), nullable=True)
    
    created_at = Column(DateTime, default=datetime.now)


class SharedMessage(Base):
    """공유된 메시지 - 채팅방으로 공유된 내역"""
    __tablename__ = "shared_messages"
    id = Column(Integer, primary_key=True, index=True)
    sender_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    room_id = Column(String, ForeignKey("chat_rooms.id"), nullable=False, index=True)
    
    # 공유 내용 (JSON으로 여러 아이템 포함 가능)
    shared_items = Column(JSON, default=[])  # [{type: "post", id: "..."}, {type: "place", id: 123}]
    message = Column(String, nullable=True)  # 함께 보내는 메시지
    
    created_at = Column(DateTime, default=datetime.now)


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
    RESERVE = "reserve"     # 예약
    DISMISS = "dismiss"     # 관심 없음
    BAD_REVIEW = "bad_review"  # 부정 리뷰


class UserAction(Base):
    """사용자 행동 기록 - AI 추천에 활용"""
    __tablename__ = "user_actions"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    place_id = Column(Integer, ForeignKey("places.id"), nullable=True, index=True)
    
    action_type = Column(String, nullable=False, index=True)  # ActionType enum 값
    action_value = Column(Float, default=1.0)  # 행동 가중치 (리뷰 점수 등)
    weight_score = Column(Integer, default=1)  # 행동 점수 (양수/음수)
    
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


# ============================================
# AI Vector Recommendation System Models (pgvector based)
# ============================================

class PlaceEmbedding(Base):
    """Place embedding - Real AI vector storage"""
    __tablename__ = "place_embeddings"
    id = Column(Integer, primary_key=True, index=True)
    place_id = Column(Integer, ForeignKey("places.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    # Embedding vector (pgvector 768-dim, Supabase pgvector 확장)
    embedding = Column(Vector(768), nullable=True)  # 768 dim vector

    # Embedding source text
    source_text = Column(String, nullable=True)

    # Metadata
    model_name = Column(String, default="text-embedding-004")
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class UserEmbedding(Base):
    """User preference embedding - Action based learning"""
    __tablename__ = "user_embeddings"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), unique=True, nullable=False)
    
    # User preference vector
    preference_embedding = Column(Vector(768), nullable=True)  # 768 dim
    recent_embedding = Column(Vector(768), nullable=True)  # Recent interest vector
    
    # Learning info
    action_count = Column(Integer, default=0)
    last_action_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.now)
    updated_at = Column(DateTime, default=datetime.now, onupdate=datetime.now)


class UserInteractionLog(Base):
    """User interaction log - AI learning data"""
    __tablename__ = "user_interaction_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Interaction target
    place_id = Column(Integer, ForeignKey("places.id", ondelete="SET NULL"), nullable=True, index=True)
    post_id = Column(String, ForeignKey("posts.id", ondelete="SET NULL"), nullable=True)
    
    # Interaction type
    action_type = Column(String, nullable=False, index=True)  # VIEW, CLICK, LIKE, SAVE, SHARE, DISMISS, DWELL
    action_value = Column(Float, default=1.0)  # dwell time (sec), rating, etc
    
    # Context (important for AI learning!)
    context = Column(JSON, default={})  # {"hour": 19, "day_of_week": 5, "weather": "clear"}
    
    # Recommendation tracking
    recommendation_id = Column(Integer, nullable=True)
    position_in_list = Column(Integer, nullable=True)
    
    # Session tracking
    session_id = Column(String, nullable=True)
    
    created_at = Column(DateTime, default=datetime.now, index=True)


class RecommendationResult(Base):
    """Recommendation result log - A/B testing and performance measurement"""
    __tablename__ = "recommendation_results"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Recommendation info
    algorithm_type = Column(String, nullable=False)  # 'vector_similarity', 'collaborative', 'hybrid'
    model_version = Column(String, nullable=True)
    
    # Recommendation results (실제 DB는 integer[]/float[] — 마이그레이션과 정합)
    recommended_place_ids = Column(ARRAY(Integer), default=[])
    scores = Column(ARRAY(Float), default=[])

    # Performance measurement
    clicked_place_id = Column(Integer, nullable=True)
    clicked_position = Column(Integer, nullable=True)
    
    # Context
    context = Column(JSON, default={})

    created_at = Column(DateTime, default=datetime.now, index=True)


class PlaceVisitFeedback(Base):
    """방문 후 재방문 의향 설문 — 별점 대신 '또 갈래요?'라는 진성 신호.
    2축: 개인 취향(personal_revisit) + 모임 적합(group_revisit).
    트리거: 결제(예약) 방문일 다음날부터, 미응답 예약에 노출.
    집계 → '비슷한 사람/모임이 단골' 사회적 증거 + IR 데이터 해자."""
    __tablename__ = "place_visit_feedback"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True)
    place_id = Column(Integer, index=True)
    reservation_id = Column(String, nullable=True)   # user_reservations.id (방문 근거)
    room_id = Column(String, nullable=True)          # 모임(커뮤니티) 방문이면 링크
    personal_revisit = Column(Boolean, nullable=True)  # 또 가고 싶어요?(개인 취향 축)
    group_revisit = Column(Boolean, nullable=True)     # 모임 장소로 추천?(모임 적합 축)
    created_at = Column(DateTime, default=datetime.now, index=True)
