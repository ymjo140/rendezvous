import sys
import os
import uuid
import json
import fastapi
import httpx # 실제 요청용
from datetime import datetime
from fastapi import Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List, Any, Dict
from supabase import create_client, Client
from icalendar import Calendar # icalendar 라이브러리 사용

# [경로 설정]
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

app = fastapi.FastAPI()

# --- I. CORS 설정 ---
origins = [
    "http://localhost:3000",
    "https://v0-we-meet-app-features.vercel.app",
    "*"  # 모든 출처 허용 (CORS 에러 원천 차단)
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
    user_id: Optional[Any] = None # int나 str, null 모두 허용
    title: str
    date: Optional[str] = None
    time: Optional[str] = None
    duration_hours: Optional[Any] = 1.0 
    location_name: Optional[str] = ""
    purpose: Optional[str] = "개인"
    is_private: Optional[bool] = True
    
    class Config:
        extra = "allow"

class IcalSyncRequest(BaseModel):
    url: str
    source_name: str = "External"

class CommunityCreate(BaseModel):
    title: str
    class Config:
        extra = "allow"

# --- IV. API 엔드포인트 ---

@app.get("/")
async def root():
    return {"status": "ok", "message": "WeMeet Backend is Live."}

# 1. 일정 목록 조회
@app.get("/api/events")
async def get_events():
    if not supabase: return []
    try:
        res = supabase.table("events").select("*").execute()
        return res.data
    except Exception as e:
        print(f"❌ Event List Error: {e}")
        return []

# 2. 일정 생성 (강력한 에러 방지 적용)
@app.post("/api/events")
async def create_event(evt: EventCreate):
    print(f"📩 일정 생성 요청: {evt.dict()}")

    if not supabase: 
        return JSONResponse(status_code=500, content={"message": "DB 연결 끊김"})
    
    try:
        data = evt.dict()

        # (1) ID 생성
        if "id" not in data or not data["id"]:
            data["id"] = str(uuid.uuid4())
        
        # (2) duration_hours 변환 (문자열 "2" -> 숫자 2.0)
        if "duration_hours" in data:
            try:
                val = float(data["duration_hours"])
                if val >= 10: data["duration_hours"] = val / 60 # 분 단위 보정
                else: data["duration_hours"] = val
            except:
                data["duration_hours"] = 1.0
        
        # (3) user_id 처리 (가장 중요한 부분)
        # 프론트에서 온 user_id가 있으면 숫자로 변환해서 넣고, 에러나면 NULL로 처리
        final_user_id = None
        if data.get("user_id"):
            try:
                final_user_id = int(data["user_id"])
            except:
                final_user_id = None

        # (4) DB Payload 구성
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

        print(f"💾 DB 저장 시도: {db_payload}")
        
        res = supabase.table("events").insert(db_payload).execute()
        
        return {"status": "success", "message": "일정 등록 성공", "data": res.data[0] if res.data else {}}

    except Exception as e:
        print(f"❌ Critical Error: {e}")
        # 서버가 죽지 않고 에러 메시지를 반환하도록 함
        return JSONResponse(status_code=500, content={"message": f"서버 오류: {str(e)}"})

# 3. 진짜 iCal 동기화 (icalendar 라이브러리 사용)
@app.post("/api/sync/ical")
async def sync_ical(req: IcalSyncRequest):
    print(f"📡 iCal 요청 URL: {req.url}")
    
    if not supabase: return JSONResponse(status_code=500, content={"message": "DB 미연결"})

    try:
        # 1. URL에서 iCal 파일 다운로드
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(req.url)
            if resp.status_code != 200:
                return JSONResponse(status_code=400, content={"message": "캘린더 URL 접속 실패"})
            ical_content = resp.content

        # 2. 파싱
        cal = Calendar.from_ical(ical_content)
        new_events = []
        count = 0
        
        for component in cal.walk():
            if component.name == "VEVENT":
                try:
                    summary = str(component.get('summary', '제목 없음'))
                    dtstart = component.get('dtstart').dt
                    
                    # 날짜/시간 포맷팅
                    if isinstance(dtstart, datetime):
                        date_str = dtstart.strftime("%Y-%m-%d")
                        time_str = dtstart.strftime("%H:%M")
                    else: # date 타입 (하루 종일)
                        date_str = dtstart.strftime("%Y-%m-%d")
                        time_str = "09:00"

                    location = str(component.get('location', ''))

                    new_events.append({
                        "id": str(uuid.uuid4()),
                        "user_id": 5, # 🌟 요청하신 대로 5번 유저(조영민)에게 할당 (테스트용)
                        "title": summary,
                        "date": date_str,
                        "time": time_str,
                        "duration_hours": 1.0,
                        "location_name": location,
                        "purpose": req.source_name,
                        "is_private": True
                    })
                    count += 1
                except Exception as parse_e:
                    print(f"⚠️ 파싱 건너뜀: {parse_e}")
                    continue

        # 3. DB 저장
        if new_events:
            print(f"💾 {count}개 일정 저장 중...")
            supabase.table("events").insert(new_events).execute()
            return {"status": "success", "message": f"{count}개의 일정을 불러왔습니다!"}
        
        return {"status": "success", "message": "가져올 일정이 없습니다."}

    except Exception as e:
        print(f"❌ iCal Sync Error: {e}")
        return JSONResponse(status_code=200, content={"status": "error", "message": f"동기화 오류: {str(e)}"})

# 4. 기타 라우터 (AI 기능 포함)
try:
    from api.routers import auth, users, coins, recommend
    app.include_router(recommend.router, prefix="/api", tags=["recommend"])
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(coins.router, prefix="/api/coins", tags=["coins"])
    print("✅ 라우터 로드 완료")
except Exception as e:
    print(f"⚠️ 라우터 로드 경고: {e}")