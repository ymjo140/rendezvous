import sys
import os
import uuid
import fastapi
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Any
from supabase import create_client, Client

# [경로 설정]
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

app = fastapi.FastAPI()

# --- CORS 설정 ---
origins = [
    "http://localhost:3000",
    "https://v0-we-meet-app-features.vercel.app",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Supabase 설정 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
supabase: Optional[Client] = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase 연결 성공 (Main)")
    except Exception as e:
        print(f"❌ Supabase 연결 실패: {e}")

# --- 데이터 모델 (Event, Community) ---
class EventCreate(BaseModel):
    user_id: Optional[Any] = None
    title: str
    date: Optional[str] = None
    time: Optional[str] = None
    duration_hours: Optional[Any] = 1.0 
    location_name: Optional[str] = ""
    purpose: Optional[str] = "개인"
    is_private: Optional[bool] = True
    class Config:
        extra = "allow"

class CommunityCreate(BaseModel):
    title: str
    class Config:
        extra = "allow"

# --- API 엔드포인트 ---

@app.get("/")
async def root():
    return {"status": "ok", "message": "WeMeet Backend is Live."}

# 1. 일정 API
@app.get("/api/events")
async def get_events():
    if not supabase: return []
    try:
        res = supabase.table("events").select("*").execute()
        return res.data
    except Exception as e:
        print(f"❌ Event List Error: {e}")
        return []

@app.post("/api/events")
async def create_event(evt: EventCreate):
    print(f"📩 일정 생성 요청: {evt.dict()}")
    if not supabase: return JSONResponse(500, {"message": "DB 연결 끊김"})
    try:
        data = evt.dict()
        if "id" not in data or not data["id"]: data["id"] = str(uuid.uuid4())
        
        # duration 변환
        if "duration_hours" in data:
            try:
                val = float(data["duration_hours"])
                if val >= 10: data["duration_hours"] = val / 60
                else: data["duration_hours"] = val
            except: data["duration_hours"] = 1.0
        
        # user_id 처리
        final_user_id = None
        if data.get("user_id"):
            try: final_user_id = int(data["user_id"])
            except: final_user_id = None

        db_payload = {
            "id": str(data["id"]),
            "user_id": final_user_id, 
            "title": str(data["title"]),
            "date": str(data.get("date", "")),
            "time": str(data.get("time", "")),
            "duration_hours": float(data.get("duration_hours", 1.0)),
            "location_name": str(data.get("location_name", "")),
            "purpose": str(data.get("purpose", "개인")),
            "is_private": bool(data.get("is_private", True))
        }
        res = supabase.table("events").insert(db_payload).execute()
        return {"status": "success", "message": "일정 등록 성공", "data": res.data[0] if res.data else {}}
    except Exception as e:
        print(f"❌ Critical Error: {e}")
        return JSONResponse(500, {"message": f"서버 오류: {str(e)}"})

# 🌟 [핵심 변경] 라우터 연결 (여기서 분리된 파일을 불러옵니다)
try:
    # 1. 방금 만든 api/sync.py 연결
    # 주의: src 폴더 구조에 따라 import 경로가 다를 수 있습니다.
    # 보통 src/api/sync.py라면 -> from api import sync
    from api import sync 
    app.include_router(sync.router, prefix="/api/sync", tags=["sync"])
    print("✅ Sync 라우터 연결 성공")

    # 2. 기존 다른 라우터들
    from api.routers import auth, users, coins, recommend
    app.include_router(recommend.router, prefix="/api", tags=["recommend"])
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(coins.router, prefix="/api/coins", tags=["coins"])

except Exception as e:
    print(f"⚠️ 라우터 로드 중 경고: {e}")