from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Any, Dict

# --- ?뚯쓽/紐⑥엫 ?먮쫫 (AI 異붿쿇) ---
class MeetingCondition(BaseModel):
    date: str = "today"
    time: Optional[str] = None
    budget_range: List[int] = [1, 10]
    category: str = "식사"
    tags: List[str] = []
    detail_prompt: str = ""

class MeetingFlowRequest(BaseModel):
    room_id: Optional[str] = None
    purpose: str = "식사"
    conditions: MeetingCondition
    manual_locations: List[str] = []
    current_lat: float = 0.0
    current_lng: float = 0.0
    participants: List[Any] = []
    user_tags: List[str] = []

class VoteRequest(BaseModel):
    room_id: str
    message_id: int

class ConfirmRequest(BaseModel):
    room_id: str
    place_name: str
    date: str
    time: str
    category: str

# --- ?쇱젙 (Event) ---
class EventSchema(BaseModel):
    id: Optional[str] = None
    user_id: int
    title: str
    date: str
    time: str
    duration_hours: float = 1.5
    location_name: Optional[str] = None
    purpose: str
    
    model_config = ConfigDict(from_attributes=True)

class NlpRequest(BaseModel):
    text: str

class RecommendRequest(BaseModel):
    users: List[Any] = []
    purpose: str = "식사"
    location_name: str = ""
    friend_location_manual: Optional[str] = None
    manual_locations: List[str] = []
    user_selected_tags: List[str] = []
    current_lat: float = 37.566
    current_lng: float = 126.978
    # 모임 멤버 user_id(요청자 외 친구들) — 그룹 취향 합성 추천용
    member_user_ids: List[int] = []
    # 반환 개수(전체 보기용, 최대 60) — 기본 15
    top_k: int = 15
    # 모임 취향 신호(저장/재방문 의사 장소) — 센트로이드 블렌드용
    taste_place_ids: List[int] = []
    # 후보 품에 추가로 포함할 main_category (예: 빵모임 → CAFE)
    boost_main_categories: List[str] = []
