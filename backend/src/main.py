import sys
import os
import uuid
import fastapi
from fastapi import Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from supabase import create_client, Client

# [경로 설정]
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

app = fastapi.FastAPI()

# --- I. CORS 설정 ---
origins = [
    "http://localhost:3000",
    "https://v0-we-meet-app-features.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- II. Supabase 설정 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase 연결 성공")
    except Exception as e:
        print(f"❌ Supabase 연결 실패: {e}")

# --- III. 데이터 모델 ---

class EventCreate(BaseModel):
    user_id: Optional[int] = None # 🌟 이제 진짜 ID가 들어옵니다
    title: str
    date: Optional[str] = None
    time: Optional[str] = None
    duration_hours: Optional[float] = 1.0
    location_name: Optional[str] = ""
    purpose: Optional[str] = "개인"
    is_private: Optional[bool] = False
    
    class Config:
        extra = "allow"

class CommunityCreate(BaseModel):
    host_id: Optional[int] = None
    title: str
    category: Optional[str] = "모임"
    location: Optional[str] = ""
    date_time: Optional[str] = ""
    max_members: Optional[int] = 10
    description: Optional[str] = ""
    tags: Optional[List[str]] = []
    class Config:
        extra = "allow"

# --- IV. API 엔드포인트 ---

@app.get("/api/events")
async def get_events():
    if not supabase: return []
    try:
        res = supabase.table("events").select("*").execute()
        return res.data
    except Exception as e:
        print(f"Event List Error: {e}")
        return []

@app.post("/api/events")
async def create_event(evt: EventCreate):
    print(f"📩 일정 생성 요청: {evt.dict()}") 

    if not supabase: 
        return JSONResponse(status_code=500, content={"message": "DB 미연결"})
    
    try:
        data = evt.dict()
        
        # ID 생성 (프론트에서 보낸 id가 있으면 쓰고, 없으면 생성)
        if "id" not in data or not data["id"]:
            data["id"] = str(uuid.uuid4())
        
        print(f"💾 DB 저장 시도: {data}")
        
        res = supabase.table("events").insert(data).execute()
        
        return {"status": "success", "message": "등록 완료", "data": res.data[0] if res.data else {}}

    except Exception as e:
        print(f"❌ Create Event Error: {e}")
        return JSONResponse(status_code=500, content={"message": f"서버 저장 실패: {str(e)}"})

# 1. 커뮤니티 API
@app.get("/api/communities")
async def get_communities():
    if not supabase: return []
    try:
        res = supabase.table("communities").select("*").execute()
        return res.data
    except Exception as e:
        print(f"Community Error: {e}")
        return []

@app.post("/api/communities")
async def create_community(comm: CommunityCreate):
    if not supabase: return JSONResponse(status_code=500, content={"message": "DB 미연결"})
    try:
        data = comm.dict()
        if "id" not in data: data["id"] = str(uuid.uuid4())
        
        res = supabase.table("communities").insert(data).execute()
        return {"status": "success", "message": "커뮤니티 생성 완료", "data": res.data[0]}
    except Exception as e:
        print(f"Create Community Error: {e}")
        return JSONResponse(status_code=500, content={"message": str(e)})

# --- V. 기타 ---
@app.get("/")
async def root():
    return {"message": "WeMeet Backend is Running!"}

try:
    from api.routers import auth, users, coins, recommend
    app.include_router(recommend.router, prefix="/api", tags=["recommend"])
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(coins.router, prefix="/api/coins", tags=["coins"])
except ImportError:
    pass