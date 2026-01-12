import requests
import re
import pytz
import xml.etree.ElementTree as ET
from icalendar import Calendar
from datetime import datetime, timedelta
from uuid import uuid4
from fastapi import HTTPException
from sqlalchemy.orm import Session

from domain import models
from schemas import sync as schemas
from repositories.sync_repository import SyncRepository

# 한국 시간대
KST = pytz.timezone('Asia/Seoul')

class SyncService:
    def __init__(self):
        self.repo = SyncRepository()

    def sync_calendar(self, db: Session, user: models.User, req: schemas.SyncRequest):
        try:
            # 1. 기존 데이터 삭제 (해당 출처만)
            self.repo.delete_events_by_source(db, user.id, req.source_name)
            
            new_events = []

            # 2. 소스별 로직
            if req.source_name == "에브리타임":
                new_events = self._sync_everytime(db, user.id, req.url)
            else:
                # 구글/애플 등 iCal
                new_events = self._sync_ical(db, user.id, req.url, req.source_name)
            
            # 3. 커밋
            db.commit()
            
            return {
                "message": f"{req.source_name} 일정이 업데이트되었습니다! ({len(new_events)}개)", 
                "count": len(new_events)
            }

        except HTTPException as he:
            db.rollback()
            raise he
        except Exception as e:
            db.rollback()
            print(f"Sync Error: {e}")
            raise HTTPException(status_code=500, detail=f"연동 실패: {str(e)}")

    def _sync_everytime(self, db: Session, user_id: int, url: str):
        match = re.search(r'everytime\.kr/@([A-Za-z0-9]+)', url)
        if not match: 
            raise HTTPException(status_code=400, detail="올바른 에브리타임 URL이 아닙니다.")
        
        identifier = match.group(1)
        api_url = "https://api.everytime.kr/find/timetable/table/friend"
        headers = { "User-Agent": "Mozilla/5.0", "Referer": "https://everytime.kr/" }
        
        try: 
            response = requests.post(api_url, data={"identifier": identifier}, headers=headers)
        except: 
            raise HTTPException(status_code=500, detail="에브리타임 서버 연결 실패")

        try: 
            root = ET.fromstring(response.content)
        except: 
            raise HTTPException(status_code=422, detail="데이터 파싱 실패")

        new_events = []
        today = datetime.now().date()
        # 이번 주 월요일 계산
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
                
                # 16주 반복 생성
                for week in range(16):
                    target_date = start_of_week + timedelta(days=day_idx) + timedelta(weeks=week)
                    
                    new_event = models.Event(
                        id=str(uuid4()), 
                        user_id=user_id, 
                        title=f"[에브리타임] {name}",
                        date=target_date.strftime("%Y-%m-%d"), 
                        time=time_str,
                        duration_hours=duration_hours, 
                        location_name=place, 
                        purpose="학업"
                    )
                    self.repo.add_event(db, new_event)
                    new_events.append(new_event)
        
        return new_events

    def _sync_ical(self, db: Session, user_id: int, url: str, source_name: str):
        headers = {"User-Agent": "Mozilla/5.0"}
        try:
            response = requests.get(url, headers=headers, timeout=10)
        except:
            raise HTTPException(status_code=400, detail="URL 접속 실패")
            
        if response.status_code != 200: 
            raise HTTPException(status_code=400, detail="캘린더 데이터 로드 실패")

        cal = Calendar.from_ical(response.content)
        new_events = []
        
        for component in cal.walk():
            if component.name == "VEVENT":
                summary = str(component.get('summary', '제목 없음'))
                dtstart_prop = component.get('dtstart')
                if not dtstart_prop: continue
                
                dtstart = dtstart_prop.dt
                dtend_prop = component.get('dtend')
                dtend = dtend_prop.dt if dtend_prop else None
                
                # 시간대 변환
                if isinstance(dtstart, datetime):
                    if dtstart.tzinfo:
                        dtstart = dtstart.astimezone(KST)
                    date_str = dtstart.strftime("%Y-%m-%d")
                    time_str = dtstart.strftime("%H:%M")
                else:
                    date_str = dtstart.strftime("%Y-%m-%d")
                    time_str = "09:00"

                duration = 1.0
                if dtend:
                    if isinstance(dtend, datetime) and isinstance(dtstart, datetime):
                        if dtend.tzinfo: dtend = dtend.astimezone(KST)
                        diff = dtend - dtstart
                        duration = diff.total_seconds() / 3600
                    elif not isinstance(dtstart, datetime):
                        duration = 24.0

                location = str(component.get('location', ''))
                
                new_event = models.Event(
                    id=str(uuid4()),
                    user_id=user_id,
                    title=f"[{source_name}] {summary}",
                    date=date_str,
                    time=time_str,
                    duration_hours=round(duration, 1),
                    location_name=location if location else f"{source_name} 일정",
                    purpose="개인"
                )
                self.repo.add_event(db, new_event)
                new_events.append(new_event)
                
        return new_events