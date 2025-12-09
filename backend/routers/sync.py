import requests
import xml.etree.ElementTree as ET
from icalendar import Calendar
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from uuid import uuid4
from pydantic import BaseModel
import re
import pytz  # 🌟 시간대 변환 라이브러리 추가

import models
from dependencies import get_db, get_current_user

router = APIRouter()

class SyncRequest(BaseModel):
    url: str
    source_name: str  # "구글" or "에브리타임"

# 🌟 한국 시간대 정의
KST = pytz.timezone('Asia/Seoul')

# 기존 일정 삭제 함수 (변경 없음)
def clear_previous_sync_events(user_id: int, source_name: str, db: Session):
    search_pattern = f"[{source_name}]%"
    db.query(models.Event).filter(
        models.Event.user_id == user_id,
        models.Event.title.like(search_pattern)
    ).delete(synchronize_session=False)
    db.commit()

# 에브리타임 로직 (변경 없음)
def sync_everytime_logic(url: str, user_id: int, db: Session):
    match = re.search(r'everytime\.kr/@([A-Za-z0-9]+)', url)
    if not match: raise HTTPException(status_code=400, detail="올바른 에브리타임 URL이 아닙니다.")
    
    identifier = match.group(1)
    api_url = "https://api.everytime.kr/find/timetable/table/friend"
    headers = { "User-Agent": "Mozilla/5.0", "Referer": "https://everytime.kr/" }
    
    try: response = requests.post(api_url, data={"identifier": identifier}, headers=headers)
    except: raise HTTPException(status_code=500, detail="에브리타임 서버 연결 실패")

    try: root = ET.fromstring(response.content)
    except: raise HTTPException(status_code=422, detail="데이터 파싱 실패")

    new_events = []
    today = datetime.now().date()
    start_of_week = today - timedelta(days=today.weekday())
    
    for subject in root.iter("subject"):
        name = subject.find("name").get("value")
        for data in subject.iter("data"):
            day_idx = int(data.get("day"))
            start_val = int(data.get("starttime"))
            end_val = int(data.get("endtime"))
            place = data.get("place", "강의실 미정")

            start_hour = (start_val * 5) // 60
            start_minute = (start_val * 5) % 60
            time_str = f"{start_hour:02d}:{start_minute:02d}"
            duration_hours = round(((end_val - start_val) * 5) / 60.0, 1)
            
            for week in range(16):
                target_date = start_of_week + timedelta(days=day_idx) + timedelta(weeks=week)
                new_event = models.Event(
                    id=str(uuid4()), user_id=user_id, title=f"[에브리타임] {name}",
                    date=target_date.strftime("%Y-%m-%d"), time=time_str,
                    duration_hours=duration_hours, location_name=place, purpose="학업"
                )
                db.add(new_event)
                new_events.append(new_event)
    db.commit()
    return new_events

@router.post("/api/sync/ical")
def sync_calendar(req: SyncRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        # 1. 기존 데이터 초기화
        clear_previous_sync_events(current_user.id, req.source_name, db)
        new_events = []

        # 2. 에브리타임 처리
        if req.source_name == "에브리타임":
            new_events = sync_everytime_logic(req.url, current_user.id, db)
            
        # 3. 구글/iCal 처리 (🌟 시차 보정 추가됨)
        else:
            headers = {"User-Agent": "Mozilla/5.0"}
            response = requests.get(req.url, headers=headers, timeout=10)
            if response.status_code != 200: raise HTTPException(status_code=400, detail="URL 접속 실패")

            cal = Calendar.from_ical(response.content)
            
            for component in cal.walk():
                if component.name == "VEVENT":
                    summary = str(component.get('summary', '제목 없음'))
                    dtstart_prop = component.get('dtstart')
                    if not dtstart_prop: continue
                    
                    dtstart = dtstart_prop.dt
                    dtend_prop = component.get('dtend')
                    dtend = dtend_prop.dt if dtend_prop else None
                    
                    # 🌟 [핵심] 시간대 변환 로직 (UTC -> Asia/Seoul)
                    if isinstance(dtstart, datetime):
                        # 타임존 정보가 있다면 한국 시간으로 변환
                        if dtstart.tzinfo:
                            dtstart = dtstart.astimezone(KST)
                        
                        date_str = dtstart.strftime("%Y-%m-%d")
                        time_str = dtstart.strftime("%H:%M")
                    else:
                        # 날짜만 있는 경우 (하루 종일 일정)
                        date_str = dtstart.strftime("%Y-%m-%d")
                        time_str = "09:00"

                    # 소요 시간 계산
                    duration = 1.0
                    if dtend:
                        if isinstance(dtend, datetime) and isinstance(dtstart, datetime):
                            # dtend도 변환해서 계산
                            if dtend.tzinfo: dtend = dtend.astimezone(KST)
                            diff = dtend - dtstart
                            duration = diff.total_seconds() / 3600
                        elif not isinstance(dtstart, datetime):
                            duration = 24.0 # 하루 종일

                    location = str(component.get('location', ''))
                    
                    new_event = models.Event(
                        id=str(uuid4()),
                        user_id=current_user.id,
                        title=f"[{req.source_name}] {summary}",
                        date=date_str,
                        time=time_str,
                        duration_hours=round(duration, 1),
                        location_name=location if location else f"{req.source_name} 일정",
                        purpose="개인"
                    )
                    db.add(new_event)
                    new_events.append(new_event)
            db.commit()

        return {"message": f"{req.source_name} 일정이 최신 상태로 업데이트되었습니다! ({len(new_events)}개)", "count": len(new_events)}

    except HTTPException as he: raise he
    except Exception as e:
        print(f"Sync Error: {e}")
        raise HTTPException(status_code=500, detail=f"연동 실패: {str(e)}")