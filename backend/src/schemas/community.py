from pydantic import BaseModel
from typing import List, Optional, Any

class CommunityCreate(BaseModel):
    title: str
    category: str
    location: str
    date_time: str
    max_members: int
    description: str
    tags: List[str] = []

class CommunityResponse(CommunityCreate):
    id: str
    host_name: str
    current_members: int
    is_joined: bool = False

class JoinRequest(BaseModel):
    community_id: str