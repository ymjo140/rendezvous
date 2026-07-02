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
    # 이메일 또는 user_id 중 하나로 친구 요청 가능 (인앱 검색은 user_id 사용)
    email: Optional[str] = None
    user_id: Optional[int] = None

class FriendAccept(BaseModel):
    request_id: int

class FriendReferral(BaseModel):
    # 카톡 초대링크로 들어온 신규 가입자가 초대자와 즉시 친구 연결
    inviter_id: int

class ShareToFriends(BaseModel):
    # 추천 결과/장소를 인앱 친구(1:1 방) 또는 특정 방으로 공유
    friend_ids: List[int] = []
    room_id: Optional[str] = None
    message: Optional[str] = None
    items: List[Dict[str, Any]] = []

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
    # 필수 동의 이력(선택 필드 — 미전송 시 False로 기록)
    agreed_terms: bool = False
    agreed_privacy: bool = False
    agreed_location: bool = False
    age_over_14: bool = False

class KakaoLoginRequest(BaseModel):
    code: str
