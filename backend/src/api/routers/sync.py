import os
import uuid
import httpx
from datetime import datetime
from fastapi import APIRouter, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from supabase import create_client, Client
from icalendar import Calendar

router = APIRouter()

# --- SUPABASE 설정 (여기서도 필요합니다) ---
SUPABASE_URL = os.environ.get("SUPABASE_URL")
SUPABASE_KEY = os.environ.get("SUPABASE_KEY")
SUPABASE: Client = None

if SUPABASE_URL and SUPABASE_KEY:
    try:
        SUPABASE = create_client(SUPABASE_URL, SUPABASE_KEY)
    except Exception as e:
        print(f"❌ SUPABASE Connection Error in Sync: {e}")

# --- 데이터 모델 (여기서만 쓰므로 이동) ---
class IcalSyncRequest(BaseModel):
    url: str
    source_name: str = "External"

# --- 기능 구현 ---
# main.py에서는 "/api/sync"로 prefix를 잡을 것이므로 여기선 "/ical"만 씁니다.
# 최종 주소: POST /api/sync/ical
@router.post("/ical")
async def sync_ical(req: IcalSyncRequest):
    print(f"📡 iCal 요청 URL: {req.url}")
    
    if not SUPABASE: 
        return JSONResponse(status_code=500, content={"message": "DB 미연결"})

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
                    
                    if isinstance(dtstart, datetime):
                        date_str = dtstart.strftime("%Y-%m-%d")
                        time_str = dtstart.strftime("%H:%M")
                    else: # date 타입
                        date_str = dtstart.strftime("%Y-%m-%d")
                        time_str = "09:00"

                    location = str(component.get('location', ''))

                    new_events.append({
                        "id": str(uuid.uuid4()),
                        # 🌟 테스트용으로 5번 유저(조영민) 할당
                        "user_id": 5, 
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
            SUPABASE.table("events").insert(new_events).execute()
            return {"status": "success", "message": f"{count}개의 일정을 불러왔습니다!"}
        
        return {"status": "success", "message": "가져올 일정이 없습니다."}

    except Exception as e:
        print(f"❌ iCal Sync Error: {e}")
        return JSONResponse(status_code=200, content={"status": "error", "message": f"동기화 오류: {str(e)}"})