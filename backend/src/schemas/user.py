from pydantic import BaseModel
from typing import Optional, List, Dict, Any

# --- 기본 유저 정보 ---
class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    name: str

class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    gender: Optional[str] = "unknown"
    age_group: Optional[str] = "20s"
    lat: Optional[float] = None
    lng: Optional[float] = None
    location_name: Optional[str] = None

class UserProfileUpdate(BaseModel):
    name: str

class UserPreferenceUpdate(BaseModel):
    foods: List[str] = []
    disliked_foods: List[str] = []
    vibes: List[str] = []
    alcohol: List[str] = []
    conditions: List[str] = []
    avg_spend: int = 15000

class LocationUpdate(BaseModel):
    location_name: str
    lat: float
    lng: float

# --- 상점 & 아이템 ---
class BuyRequest(BaseModel):
    item_id: str

class EquipRequest(BaseModel):
    category: str
    item_id: str

# --- 친구 ---
class FriendRequest(BaseModel):
    email: str

class FriendAccept(BaseModel):
    request_id: int

# --- 리뷰 & 즐겨찾기 ---
class ReviewCreate(BaseModel):
    place_name: str
    rating: float
    tags: List[str] = []
    image_urls: List[str] = []
    score_taste: int
    score_service: int
    score_price: int
    score_vibe: int
    comment: Optional[str] = None
    reason: Optional[str] = None

class FavoriteRequest(BaseModel):
    place_id: int
    place_name: str

# --- 온보딩 (기존 유지) ---
class OnboardingRequest(BaseModel):
    name: str
    gender: str
    age_group: str
    job_status: str
    lat: float
    lng: float
    location_name: str
    preferred_foods: List[str] = []
    preferred_vibes: List[str] = []
    preferred_alcohol: List[str] = []
    avg_budget: int = 20000
    
class KakaoLoginRequest(BaseModel):
    code: str
