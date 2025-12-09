# backend/routers/sync.py

import requests
from icalendar import Calendar
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from uuid import uuid4
from pydantic import BaseModel

import models
from dependencies import get_db, get_current_user

router = APIRouter()

class SyncRequest(BaseModel):
    url: str
    source_name: str  # "구글" or "에브리타임"

@router.post("/api/sync/ical")
def sync_calendar(req: SyncRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    try:
        # 1. ics 파일 다운로드
        response = requests.get(req.url)
        if response.status_code != 200:
            raise HTTPException(status_code=400, detail="캘린더를 불러올 수 없습니다. URL을 확인해주세요.")

        # 2. 파싱 (icalendar 라이브러리 사용)
        cal = Calendar.from_ical(response.content)
        new_events = []
        
        # 3. 기존에 이 소스(구글/에타)로 등록된 일정은 중복 방지를 위해 삭제할 수도 있지만, 일단은 추가만 진행
        
        for component in cal.walk():
            if component.name == "VEVENT":
                # 제목
                summary = str(component.get('summary', '제목 없음'))
                
                # 시간 처리 (dtstart, dtend)
                dtstart = component.get('dtstart').dt
                dtend = component.get('dtend').dt if component.get('dtend') else None
                
                # 날짜 형식 변환 (YYYY-MM-DD)
                if isinstance(dtstart, datetime):
                    date_str = dtstart.strftime("%Y-%m-%d")
                    time_str = dtstart.strftime("%H:%M")
                else:
                    # 시간이 없는 '하루 종일' 일정인 경우
                    date_str = dtstart.strftime("%Y-%m-%d")
                    time_str = "09:00" # 기본 시간 설정

                # 소요 시간 계산
                duration = 1.0
                if dtend:
                    if isinstance(dtend, datetime) and isinstance(dtstart, datetime):
                        diff = dtend - dtstart
                        duration = diff.total_seconds() / 3600
                    elif not isinstance(dtstart, datetime): # 날짜만 있는 경우 (하루 종일)
                        duration = 24.0

                # 장소
                location = str(component.get('location', ''))
                
                # DB 저장 객체 생성
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
        return {"message": f"{len(new_events)}개의 일정을 성공적으로 불러왔습니다!", "count": len(new_events)}

    except Exception as e:
        print(f"Sync Error: {e}")
        raise HTTPException(status_code=500, detail=f"연동 실패: {str(e)}")