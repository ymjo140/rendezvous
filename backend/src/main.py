import sys
import os
import uuid  # 🌟 ID 생성을 위해 추가
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

# --- III. 데이터 모델 (DB 스키마와 1:1 매칭) ---

# 1. 이벤트 (Events) 테이블 구조 반영
class EventCreate(BaseModel):
    user_id: Optional[int] = 1 # 임시 유저 ID
    title: str
    date: str                # 예: "2026-01-14"
    time: str                # 예: "12:00"
    duration_hours: float    # 예: 2.0
    location_name: Optional[str] = ""
    purpose: Optional[str] = "개인"
    is_private: Optional[bool] = False

# 2. 커뮤니티 (Communities) 테이블 구조 반영
class CommunityCreate(BaseModel):
    host_id: Optional[int] = 1
    title: str
    category: Optional[str] = "모임"
    location: Optional[str] = ""
    date_time: Optional[str] = ""
    max_members: Optional[int] = 10
    description: Optional[str] = ""
    tags: Optional[List[str]] = []
    # member_ids 등은 생성 시엔 빈 값 처리

# --- IV. API 엔드포인트 ---

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
        # Pydantic 모델을 dict로 변환
        data = comm.dict()
        # 🌟 ID 생성 (UUID 문자열)
        data["id"] = str(uuid.uuid4())
        
        # tags 리스트를 JSON 형태로 변환 필요할 수 있음 (Supabase가 자동 처리하기도 함)
        
        res = supabase.table("communities").insert(data).execute()
        return {"status": "success", "message": "커뮤니티 생성 완료", "data": res.data[0]}
    except Exception as e:
        print(f"Create Community Error: {e}")
        return JSONResponse(status_code=422, content={"message": str(e)})

# 2. 일정(Events) API
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
    print(f"📩 일정 생성 요청 데이터: {evt.dict()}")
    if not supabase: return JSONResponse(status_code=500, content={"message": "DB 미연결"})
    
    try:
        data = evt.dict()
        # 🌟 ID 생성 (UUID 문자열) - DB가 문자열 ID이므로 필수
        data["id"] = str(uuid.uuid4())
        
        res = supabase.table("events").insert(data).execute()
        return {"status": "success", "message": "등록 완료", "data": res.data[0]}
    except Exception as e:
        print(f"Create Event Error: {e}")
        return JSONResponse(status_code=422, content={"message": f"DB 저장 실패: {str(e)}"})

@app.delete("/api/events/{event_id}")
async def delete_event(event_id: str): # ID가 문자열이므로 str로 변경
    if not supabase: return {"status": "error"}
    try:
        supabase.table("events").delete().eq("id", event_id).execute()
        return {"status": "success"}
    except Exception as e:
        return JSONResponse(status_code=400, content={"message": str(e)})

# --- V. 기타 ---
@app.get("/")
async def root():
    return {"message": "WeMeet Backend (Schema Matched) Running!"}

# 기존 라우터 연결 시도 (파일이 있을 경우)
try:
    from api.routers import auth, users, coins, recommend
    app.include_router(recommend.router, prefix="/api", tags=["recommend"])
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(coins.router, prefix="/api/coins", tags=["coins"])
except ImportError:
    pass