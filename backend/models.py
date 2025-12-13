from sqlalchemy import Column, Integer, String, Float, DateTime, ForeignKey, Boolean, JSON, UniqueConstraint, ARRAY
from sqlalchemy.orm import relationship
from database import Base
from datetime import datetime
import uuid
import enum

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
    host_id = Column(Integer, ForeignKey("users.id"))
    place_id = Column(Integer, ForeignKey("places.id"), nullable=True)
    place_name = Column(String) 
    date = Column(String) 
    purpose = Column(String) 
    participants = Column(JSON) 
    is_successful = Column(Boolean, default=True)
    created_at = Column(DateTime, default=datetime.now)

class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    name = Column(String, index=True)
    
    gender = Column(String, default="unknown") 
    age_group = Column(String, default="20s")  
    
    avatar = Column(String)
    manner = Column(Float, default=36.5)
    
    # 🌟 [위치 정보]
    lat = Column(Float, default=37.5665)
    lng = Column(Float, default=126.9780)
    location_name = Column(String, nullable=True) # 🌟 주소명 추가 확인
    
    preferences = Column(JSON, default={"tag_weights": {}, "avg_spend": 20000}) 
    preference_vector = Column(JSON, default={}) 
    payment_history = Column(JSON, default=[])
    favorites = Column(JSON, default=[]) 
    wallet_balance = Column(Integer, default=3000) 
    
    avatar_info = relationship("UserAvatar", uselist=False, back_populates="user")
    review_count = Column(Integer, default=0)
    avg_rating_given = Column(Float, default=0.0)

class AvatarItem(Base):
    __tablename__ = "avatar_items"
    id = Column(String, primary_key=True) 
    category = Column(String, index=True) 
    name = Column(String)
    image_url = Column(String) 
    price_coin = Column(Integer, default=0)
    is_limited = Column(Boolean, default=False)
    metadata_json = Column(JSON, default={}) 

class UserAvatar(Base):
    __tablename__ = "user_avatars"
    user_id = Column(Integer, ForeignKey("users.id"), primary_key=True)
    equipped = Column(JSON, default={})
    inventory = Column(JSON, default=[])
    level = Column(Integer, default=1)
    current_energy = Column(Integer, default=100)
    total_steps = Column(Integer, default=0)
    user = relationship("User", back_populates="avatar_info")

class UserStepLog(Base):
    __tablename__ = "user_step_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    date = Column(String, index=True) 
    steps_count = Column(Integer, default=0)
    reward_claimed = Column(Boolean, default=False)

# 🌟 [수정] Chat Room Model (ID를 String으로 변경)
class ChatRoom(Base):
    __tablename__ = "chat_rooms"
    
    # 🌟 Integer -> String 변경 (UUID 호환 및 ChatRoomMember와 타입 일치)
    id = Column(String, primary_key=True, index=True, default=generate_uuid) 
    title = Column(String) 
    is_group = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.now)
    
    members = relationship("ChatRoomMember", back_populates="room")

# 🌟 [수정] Chat Room Member Link Table
class ChatRoomMember(Base):
    __tablename__ = "chat_room_members"
    
    id = Column(Integer, primary_key=True, index=True)
    # 🌟 ForeignKey 복구 (이제 chat_rooms.id도 String이므로 안전함)
    room_id = Column(String, ForeignKey("chat_rooms.id"), index=True) 
    user_id = Column(Integer, ForeignKey("users.id"))
    joined_at = Column(DateTime, default=datetime.now)
    
    room = relationship("ChatRoom", back_populates="members")
    user = relationship("User") 

class Message(Base):
    __tablename__ = "messages"
    id = Column(Integer, primary_key=True, index=True)
    room_id = Column(String, index=True) 
    user_id = Column(Integer, ForeignKey("users.id"))
    content = Column(String)
    timestamp = Column(DateTime, default=datetime.now)
    sender = relationship("User")
    votes = relationship("Vote", back_populates="message", cascade="all, delete-orphan")

class Vote(Base):
    __tablename__ = "votes"
    id = Column(Integer, primary_key=True, index=True)
    message_id = Column(Integer, ForeignKey("messages.id"))
    user_id = Column(Integer, ForeignKey("users.id"))
    vote_type = Column(String)
    message = relationship("Message", back_populates="votes")
    user = relationship("User")
    __table_args__ = (UniqueConstraint('message_id', 'user_id', name='_user_message_vote_uc'),)

class Event(Base):
    __tablename__ = "events"
    id = Column(String, primary_key=True, default=generate_uuid)
    user_id = Column(Integer, ForeignKey("users.id"))
    title = Column(String)
    date = Column(String) 
    time = Column(String) 
    duration_hours = Column(Float, default=1.5)
    location_name = Column(String, nullable=True)
    purpose = Column(String)
    is_private = Column(Boolean, default=False)

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
    tags = Column(JSON) 
    rating = Column(Float, default=0.0)
    member_ids = Column(JSON, default=[])
    pending_member_ids = Column(JSON, default=[])

class Review(Base):
    __tablename__ = "reviews"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    place_id = Column(Integer, ForeignKey("places.id"), nullable=True)
    place_name = Column(String) 
    score_taste = Column(Integer, default=3)
    score_service = Column(Integer, default=3)
    score_price = Column(Integer, default=3)
    score_vibe = Column(Integer, default=3)
    rating = Column(Float) 
    calibrated_rating = Column(Float, nullable=True) 
    reason = Column(String, nullable=True)
    comment = Column(String, nullable=True)
    tags = Column(JSON) 
    created_at = Column(DateTime, default=datetime.now)
    user = relationship("User")
    place = relationship("Place")

class Friendship(Base):
    __tablename__ = "friendships"
    id = Column(Integer, primary_key=True, index=True)
    requester_id = Column(Integer, ForeignKey("users.id")) 
    receiver_id = Column(Integer, ForeignKey("users.id"))  
    status = Column(String, default="pending") 
    created_at = Column(DateTime, default=datetime.now)

class CoinHistory(Base):
    __tablename__ = "coin_history"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    amount = Column(Integer) 
    type = Column(String) 
    description = Column(String) 
    created_at = Column(DateTime, default=datetime.now)

class VisitLog(Base):
    __tablename__ = "visit_logs"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"))
    place_name = Column(String) 
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

class TravelTimeCache(Base):
    __tablename__ = "travel_time_cache"
    id = Column(String, primary_key=True) 
    start_name = Column(String, index=True)
    end_name = Column(String, index=True)
    total_time = Column(Integer) 
    created_at = Column(DateTime, default=datetime.now)

class MeetingHistory(Base):
    __tablename__ = "meeting_histories"
    id = Column(Integer, primary_key=True, index=True)
    purpose = Column(String, index=True)  
    tags = Column(String)     
    participant_count = Column(Integer) 
    region_name = Column(String) 
    place_name = Column(String) 
    place_category = Column(String) 
    satisfaction_score = Column(Float, default=4.0) 
    created_at = Column(DateTime, default=datetime.now)