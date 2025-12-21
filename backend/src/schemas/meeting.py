from pydantic import BaseModel, ConfigDict
from typing import List, Optional, Any, Dict

# --- 회의/모임 흐름 (AI 추천) ---
class MeetingCondition(BaseModel):
    date: str = "today"
    time: str = "19:00"
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

# --- 일정 (Event) ---
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