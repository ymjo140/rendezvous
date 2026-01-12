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
    name = Column(String)
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