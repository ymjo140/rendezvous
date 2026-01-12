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

# --- (기존 import 생략) ---

# --- 수정된 create_event 함수 ---
@app.post("/api/events")
async def create_event(evt: EventCreate):
    # 1. 요청 데이터 로그 출력 (디버깅용)
    print(f"📩 [Raw Request] {evt.dict()}")

    if not supabase: 
        return JSONResponse(status_code=500, content={"message": "DB 연결 실패"})
    
    try:
        # 2. 데이터 정제 (DB 스키마에 100% 맞추기)
        data = evt.dict()

        # (1) ID: 문자열 UUID 보장
        if "id" not in data or not data["id"]:
            data["id"] = str(uuid.uuid4())
        
        # (2) user_id: 숫자형 변환 (에러 방지)
        if data.get("user_id"):
            try:
                data["user_id"] = int(data["user_id"])
            except:
                del data["user_id"] # 변환 안되면 삭제 (NULL 처리)
        
        # (3) duration_hours: 숫자형 변환
        if "duration_hours" in data:
            try:
                # 프론트에서 "120"(분)으로 오든 "2"(시간)로 오든 float로 변환
                val = float(data["duration_hours"])
                # 만약 프론트가 '분' 단위(30, 60, 90...)로 보냈다면 '시간'으로 변환
                # (보통 10 이상이면 분으로 간주)
                if val >= 10: 
                    data["duration_hours"] = val / 60
                else:
                    data["duration_hours"] = val
            except:
                # 변환 실패하면 기본값 1.0 또는 NULL
                data["duration_hours"] = 1.0

        # (4) 필수 컬럼 채우기 (빈 문자열 방지)
        if not data.get("location_name"):
            data["location_name"] = "장소 미정"
        
        if not data.get("title"):
            data["title"] = "새로운 일정"

        # (5) 불필요한 필드 제거 (DB에 없는 컬럼이 있으면 에러남)
        # Pydantic 모델에 정의된 필드만 남김 (extra='allow' 때문에 더 들어올 수 있음)
        # 하지만 insert 시에는 DB 컬럼만 있어야 함.
        # 안전하게 수동으로 payload 재구성
        db_payload = {
            "id": str(data["id"]),
            "user_id": data.get("user_id"), # 없으면 None
            "title": str(data["title"]),
            "date": str(data.get("date", "")),
            "time": str(data.get("time", "")),
            "duration_hours": data.get("duration_hours"),
            "location_name": str(data.get("location_name")),
            "purpose": str(data.get("purpose", "개인")),
            "is_private": bool(data.get("is_private", True))
        }

        print(f"💾 [DB Insert Payload] {db_payload}")
        
        # 3. DB 저장 실행
        res = supabase.table("events").insert(db_payload).execute()
        
        return {"status": "success", "message": "등록 완료", "data": res.data[0] if res.data else {}}

    except Exception as e:
        print(f"❌ [DB Error] {str(e)}")
        # 에러 메시지를 프론트엔드에 그대로 전달 (alert 창에 뜸)
        return JSONResponse(status_code=500, content={"message": f"DB 저장 실패: {str(e)}"})

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