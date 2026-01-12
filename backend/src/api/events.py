import os
import uuid
from typing import Optional, Any
from fastapi import APIRouter
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from SUPABASE import create_client, Client

router = APIRouter()

# --- SUPABASE 설정 ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SUPABASE: Client = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        SUPABASE = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"❌ SUPABASE Connection Error in Events: {e}")

# --- 데이터 모델 ---
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

# --- 기능 구현 ---

# GET /api/events (메인에서 prefix를 붙이므로 여기선 / 만 씀)
@router.get("/")
async def get_events():
    if not SUPABASE: return []
    try:
        res = SUPABASE.table("events").select("*").execute()
        return res.data
    except Exception as e:
        print(f"❌ Event List Error: {e}")
        return []

# POST /api/events
@router.post("/")
async def create_event(evt: EventCreate):
    print(f"📩 일정 생성 요청: {evt.dict()}")

    if not SUPABASE: 
        return JSONResponse(status_code=500, content={"message": "DB 연결 끊김"})
    
    try:
        data = evt.dict()

        # (1) ID 생성
        if "id" not in data or not data["id"]:
            data["id"] = str(uuid.uuid4())
        
        # (2) duration_hours 변환
        if "duration_hours" in data:
            try:
                val = float(data["duration_hours"])
                if val >= 10: data["duration_hours"] = val / 60
                else: data["duration_hours"] = val
            except:
                data["duration_hours"] = 1.0
        
        # (3) user_id 처리
        final_user_id = None
        if data.get("user_id"):
            try: final_user_id = int(data["user_id"])
            except: final_user_id = None

        # (4) Payload 구성
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
        
        res = SUPABASE.table("events").insert(db_payload).execute()
        
        return {"status": "success", "message": "일정 등록 성공", "data": res.data[0] if res.data else {}}

    except Exception as e:
        print(f"❌ Critical Error: {e}")
        return JSONResponse(status_code=500, content={"message": f"서버 오류: {str(e)}"})

# DELETE /api/events/{id}
@router.delete("/{event_id}")
async def delete_event(event_id: str):
    if not SUPABASE: return {"status": "error"}
    try:
        SUPABASE.table("events").delete().eq("id", event_id).execute()
        return {"status": "success"}
    except Exception as e:
        return JSONResponse(status_code=400, content={"message": str(e)})