import sys
import os
import fastapi
from fastapi import Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from typing import Optional, List
# 🌟 라이브러리 설치 필수: pip install supabase
from supabase import create_client, Client

# [경로 설정] src 폴더 인식용
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

# --- II. Supabase 연결 ---
# .env 파일이나 Render 환경변수에 꼭 설정되어 있어야 합니다!
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")

supabase: Client = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
        print("✅ Supabase 연결 성공!")
    except Exception as e:
        print(f"❌ Supabase 연결 실패: {e}")
else:
    print("⚠️ 경고: SUPABASE_URL 또는 SUPABASE_KEY가 없습니다.")


# --- III. 데이터 모델 (Pydantic) ---
class CommunityCreate(BaseModel):
    name: str
    description: Optional[str] = ""
    image: Optional[str] = ""

class EventCreate(BaseModel):
    title: str
    start: Optional[str] = None
    location: Optional[str] = ""
    description: Optional[str] = ""

class EventUpdate(BaseModel):
    title: Optional[str] = None
    start: Optional[str] = None
    location: Optional[str] = None
    description: Optional[str] = None


# --- IV. API 기능 구현 (진짜 DB 연동) ---

# 1. 커뮤니티 (communities 테이블)
@app.get("/api/communities")
async def get_communities():
    if not supabase: return []
    try:
        # id 역순(최신순)으로 가져오기
        response = supabase.table("communities").select("*").order("id", desc=True).execute()
        return response.data
    except Exception as e:
        print(f"Community Error: {e}")
        return []

@app.post("/api/communities")
async def create_community(comm: CommunityCreate):
    if not supabase: raise HTTPException(500, "DB 미연결")
    try:
        data = { "name": comm.name, "description": comm.description, "image": comm.image }
        # 데이터 삽입
        response = supabase.table("communities").insert(data).execute()
        return {"status": "success", "message": "커뮤니티 생성 완료", "data": response.data[0]}
    except Exception as e:
        print(f"Create Community Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

# 2. 일정/이벤트 (events 테이블)
@app.get("/api/events")
async def get_events():
    if not supabase: return []
    try:
        response = supabase.table("events").select("*").order("start_time").execute()
        # 프론트엔드는 'start'를, DB는 'start_time'을 쓸 수 있으므로 매핑
        events = []
        for item in response.data:
            # start 키가 없으면 start_time 값을 복사해서 넣어줌
            if 'start' not in item and 'start_time' in item:
                item['start'] = item['start_time']
            events.append(item)
        return events
    except Exception as e:
        print(f"Event Fetch Error: {e}")
        return []

@app.post("/api/events")
async def create_event(evt: EventCreate):
    if not supabase: raise HTTPException(500, "DB 미연결")
    try:
        # DB 컬럼명 확인 필요 (보통 start_time 또는 start)
        # 에러 방지를 위해 두 필드 모두 고려하거나 DB 스키마에 맞춰야 함
        # 여기서는 안전하게 start_time을 메인으로 봅니다.
        data = {
            "title": evt.title,
            "start_time": evt.start, 
            "location": evt.location,
            "description": evt.description
        }
        response = supabase.table("events").insert(data).execute()
        return {"status": "success", "message": "일정 등록 완료", "data": response.data[0]}
    except Exception as e:
        print(f"Create Event Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.patch("/api/events/{event_id}")
async def update_event(event_id: int, evt: EventUpdate):
    if not supabase: raise HTTPException(500, "DB 미연결")
    try:
        update_data = {}
        if evt.title: update_data["title"] = evt.title
        if evt.start: update_data["start_time"] = evt.start
        if evt.location: update_data["location"] = evt.location
        if evt.description: update_data["description"] = evt.description
        
        if not update_data: return {"status": "success"}

        response = supabase.table("events").update(update_data).eq("id", event_id).execute()
        return {"status": "success", "message": "수정 완료"}
    except Exception as e:
        print(f"Update Error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/events/{event_id}")
async def delete_event(event_id: int):
    if not supabase: raise HTTPException(500, "DB 미연결")
    try:
        supabase.table("events").delete().eq("id", event_id).execute()
        return {"status": "success", "message": "삭제 완료"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# 3. 채팅방 (chat_rooms 테이블 - 사진에 있으므로 실제 연동)
@app.get("/api/chat/rooms")
async def get_chat_rooms():
    if not supabase: return []
    try:
        # 채팅방 목록 가져오기
        response = supabase.table("chat_rooms").select("*").execute()
        return response.data
    except Exception as e:
        print(f"Chat Rooms Error: {e}")
        return [] # 에러나면 빈 배열 반환 (앱 멈춤 방지)


# --- V. 기존 라우터 연결 ---
try:
    from api.routers import auth, users, coins, recommend
    app.include_router(recommend.router, prefix="/api", tags=["recommend"])
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(coins.router, prefix="/api/coins", tags=["coins"])
except ImportError:
    pass # 파일 없으면 패스

# --- VI. 기타 ---
@app.post("/api/sync/ical")
async def sync_ical_dummy(request: Request):
    return {"status": "success", "message": "disabled"}

@app.get("/")
async def root():
    return {"message": "WeMeet Backend (Supabase Connected) Running!"}