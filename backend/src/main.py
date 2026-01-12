import sys
import os
import uuid
import fastapi
import httpx # 🌟 HTTP 요청용
from datetime import datetime
from fastapi import Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from supabase import create_client, Client
from icalendar import Calendar # 🌟 iCal 파싱용

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
    user_id: Optional[int] = None
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

# 🌟 iCal 요청 모델 추가
class IcalSyncRequest(BaseModel):
    url: str
    source_name: str = "External"

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
    # (기존 create_event 로직 유지 - 생략 없이 그대로 둠)
    print(f"📩 일정 생성 요청: {evt.dict()}")
    if not supabase: return JSONResponse(status_code=500, content={"message": "DB 미연결"})
    try:
        data = evt.dict()
        if "user_id" in data: del data["user_id"] # FK 에러 방지용 임시조치
        if "id" not in data or not data["id"]: data["id"] = str(uuid.uuid4())
        
        # duration 타입 안전 변환
        if "duration_hours" in data:
            try:
                val = float(data["duration_hours"])
                if val >= 10: data["duration_hours"] = val / 60
                else: data["duration_hours"] = val
            except: data["duration_hours"] = 1.0

        db_payload = {
            "id": str(data["id"]),
            "title": str(data["title"]),
            "date": str(data.get("date", "")),
            "time": str(data.get("time", "")),
            "duration_hours": data.get("duration_hours"),
            "location_name": str(data.get("location_name", "")),
            "purpose": str(data.get("purpose", "개인")),
            "is_private": bool(data.get("is_private", True))
        }
        res = supabase.table("events").insert(db_payload).execute()
        return {"status": "success", "message": "등록 완료", "data": res.data[0] if res.data else {}}
    except Exception as e:
        print(f"❌ Create Event Error: {e}")
        return JSONResponse(status_code=500, content={"message": f"DB 에러: {str(e)}"})

@app.delete("/api/events/{event_id}")
async def delete_event(event_id: str):
    if not supabase: return {"status": "error"}
    try:
        supabase.table("events").delete().eq("id", event_id).execute()
        return {"status": "success"}
    except Exception as e:
        return JSONResponse(status_code=400, content={"message": str(e)})

# 🌟 [핵심] 진짜 iCal 동기화 로직 구현
@app.post("/api/sync/ical")
async def sync_ical(req: IcalSyncRequest):
    print(f"📡 iCal 동기화 요청: {req.url}")
    
    if not supabase:
        return JSONResponse(status_code=500, content={"message": "DB 미연결"})

    try:
        # 1. 실제 iCal 파일 다운로드
        async with httpx.AsyncClient() as client:
            resp = await client.get(req.url)
            if resp.status_code != 200:
                return JSONResponse(status_code=400, content={"message": "URL에서 캘린더를 가져오지 못했습니다."})
            ical_content = resp.content

        # 2. 파싱 (icalendar 라이브러리 사용)
        cal = Calendar.from_ical(ical_content)
        new_events = []
        count = 0

        for component in cal.walk():
            if component.name == "VEVENT":
                summary = str(component.get('summary'))
                dtstart = component.get('dtstart').dt
                
                # 날짜/시간 포맷팅
                if isinstance(dtstart, datetime):
                    date_str = dtstart.strftime("%Y-%m-%d")
                    time_str = dtstart.strftime("%H:%M")
                else: # date 타입인 경우 (종일 일정)
                    date_str = dtstart.strftime("%Y-%m-%d")
                    time_str = "09:00" # 기본값

                location = str(component.get('location', ''))
                
                # DB에 넣을 데이터 구성
                new_events.append({
                    "id": str(uuid.uuid4()),
                    "title": summary,
                    "date": date_str,
                    "time": time_str,
                    "location_name": location,
                    "duration_hours": 1.0, # 기본 1시간
                    "purpose": req.source_name, # 출처(에타/구글) 표시
                    "is_private": True
                })
                count += 1

        # 3. DB 일괄 저장
        if new_events:
            print(f"💾 {count}개 일정 저장 시도...")
            supabase.table("events").insert(new_events).execute()
            return {"status": "success", "message": f"{count}개의 일정을 불러왔습니다!"}
        else:
            return {"status": "success", "message": "가져올 일정이 없습니다."}

    except Exception as e:
        print(f"❌ iCal Sync Error: {e}")
        return JSONResponse(status_code=500, content={"message": f"동기화 실패: {str(e)}"})


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
        if "host_id" in data: del data["host_id"]
        
        res = supabase.table("communities").insert(data).execute()
        return {"status": "success", "message": "커뮤니티 생성 완료", "data": res.data[0]}
    except Exception as e:
        print(f"Create Community Error: {e}")
        return JSONResponse(status_code=500, content={"message": str(e)})

@app.get("/api/chat/rooms")
async def get_chat_rooms():
    return []

@app.get("/")
async def root():
    return {"message": "WeMeet Backend (Real iCal) Running!"}

try:
    from api.routers import auth, users, coins, recommend
    app.include_router(recommend.router, prefix="/api", tags=["recommend"])
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(coins.router, prefix="/api/coins", tags=["coins"])
except ImportError:
    pass