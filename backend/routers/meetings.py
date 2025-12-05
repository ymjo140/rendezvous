import random
import numpy as np
import json
import re
from datetime import datetime, timedelta, time
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel, ConfigDict
import google.generativeai as genai

import models
import algorithm as agora_algo
from data_provider import RealDataProvider
from transport import TransportEngine
from dependencies import get_db
from constants import (
    NAVER_SEARCH_ID, NAVER_SEARCH_SECRET, NAVER_MAP_ID, NAVER_MAP_SECRET, 
    GEMINI_API_KEY, PURPOSE_CONFIG, TAG_KEYWORD_EXPANSIONS, PURPOSE_DURATIONS
)

genai.configure(api_key=GEMINI_API_KEY)
data_provider = RealDataProvider(NAVER_SEARCH_ID, NAVER_SEARCH_SECRET, NAVER_MAP_ID, NAVER_MAP_SECRET)
flow_engine = agora_algo.AdvancedRecommender([], []) 

router = APIRouter()

# 🌟 [대규모 데이터] 검색 및 중간지점용 좌표 리스트 (네이버 API 대신 이걸 뒤집니다)
FALLBACK_COORDINATES = {
    # 1호선
    "서울역": (37.5559, 126.9723), "시청": (37.5657, 126.9769), "종각": (37.5702, 126.9831),
    "종로3가": (37.5704, 126.9920), "종로5가": (37.5709, 127.0019), "동대문": (37.5717, 127.0113),
    "동묘앞": (37.5732, 127.0165), "신설동": (37.5760, 127.0243), "제기동": (37.5781, 127.0348),
    "청량리": (37.5801, 127.0485), "회기": (37.5894, 127.0575), "용산": (37.5298, 126.9645),
    "노량진": (37.5142, 126.9424), "영등포": (37.5155, 126.9076), "신도림": (37.5089, 126.8913),
    "구로": (37.5030, 126.8819), "부천": (37.4840, 126.7826), "부평": (37.4894, 126.7249),
    "안양": (37.4016, 126.9228), "수원": (37.2656, 127.0000),

    # 2호선
    "강남": (37.4980, 127.0276), "역삼": (37.5006, 127.0364), "선릉": (37.5045, 127.0490),
    "삼성": (37.5088, 127.0631), "잠실": (37.5132, 127.1001), "건대입구": (37.5407, 127.0702),
    "성수": (37.5445, 127.0560), "왕십리": (37.5612, 127.0371), "을지로3가": (37.5662, 126.9926),
    "을지로입구": (37.5660, 126.9826), "홍대입구": (37.5575, 126.9244), "합정": (37.5489, 126.9166),
    "신촌": (37.5551, 126.9369), "이대": (37.5567, 126.9460), "당산": (37.5343, 126.9022),
    "구로디지털단지": (37.4852, 126.9014), "신림": (37.4842, 126.9297), "사당": (37.4765, 126.9815),
    "서초": (37.4918, 127.0076), "교대": (37.4934, 127.0140),

    # 3호선
    "연신내": (37.6190, 126.9210), "불광": (37.6104, 126.9298), "경복궁": (37.5757, 126.9735),
    "안국": (37.5765, 126.9854), "충무로": (37.5612, 126.9942), "약수": (37.5543, 127.0107),
    "옥수": (37.5414, 127.0178), "압구정": (37.5270, 127.0284), "신사": (37.5163, 127.0203),
    "고속터미널": (37.5049, 127.0049), "양재": (37.4841, 127.0346), "수서": (37.4873, 127.1018),

    # 4호선
    "노원": (37.6551, 127.0613), "창동": (37.6531, 127.0477), "성신여대입구": (37.5926, 127.0170),
    "혜화": (37.5822, 127.0018), "명동": (37.5609, 126.9863), "회현": (37.5585, 126.9782),
    "삼각지": (37.5347, 126.9731), "이촌": (37.5222, 126.9743), "이수": (37.4862, 126.9819),
    "과천": (37.4330, 126.9965), "범계": (37.3897, 126.9507),

    # 5호선
    "김포공항": (37.5624, 126.8013), "여의도": (37.5215, 126.9243), "공덕": (37.5435, 126.9515),
    "광화문": (37.5710, 126.9768), "청구": (37.5602, 127.0138), "군자": (37.5571, 127.0794),
    "천호": (37.5386, 127.1236), "올림픽공원": (37.5162, 127.1309),

    # 6호선
    "이태원": (37.5345, 126.9943), "한강진": (37.5396, 127.0017), "안암": (37.5863, 127.0292),
    "고려대": (37.5905, 127.0358), "석계": (37.6148, 127.0656), "망원": (37.5559, 126.9099),

    # 7호선
    "강남구청": (37.5171, 127.0412), "논현": (37.5110, 127.0214), "내방": (37.4876, 126.9935),
    "가산디지털단지": (37.4815, 126.8825), "철산": (37.4760, 126.8679), "상봉": (37.5965, 127.0850),

    # 8호선
    "암사": (37.5499, 127.1271), "석촌": (37.5054, 127.1069), "가락시장": (37.4925, 127.1182),
    "문정": (37.4858, 127.1225), "모란": (37.4321, 127.1290),

    # 9호선
    "마곡나루": (37.5667, 126.8272), "신논현": (37.5045, 127.0250), "선정릉": (37.5102, 127.0438),
    "봉은사": (37.5142, 127.0602), "종합운동장": (37.5109, 127.0736),

    # 경기/인천
    "판교": (37.3947, 127.1112), "분당": (37.3830, 127.1217), "일산": (37.6584, 126.7636), "수원": (37.2656, 127.0000), "인천": (37.4424, 126.6991),
    "부천": (37.4840, 126.7826), "부평": (37.4895, 126.7245), "송도": (37.3866, 126.6392), "안양": (37.4016, 126.9228), "의정부": (37.7386, 127.0460)
}

def get_fuzzy_coordinate(place_name: str):
    for key, coords in FALLBACK_COORDINATES.items():
        if key in place_name: return coords
    return 0.0, 0.0

# --- Helper Functions ---
def save_place_to_db(db: Session, poi_list: List[Any]):
    for p in poi_list:
        existing = db.query(models.Place).filter(models.Place.name == p.name).first()
        if not existing:
            new_place = models.Place(
                name=p.name, category=p.category, tags=p.tags,
                lat=float(p.location[0]), lng=float(p.location[1]),
                wemeet_rating=p.avg_rating, address=""
            )
            db.add(new_place)
    try: db.commit()
    except: db.rollback()

def search_places_in_db(db: Session, region_name: str, keywords: List[str], allowed_types: List[str]) -> List[Any]:
    lat, lng = data_provider.get_coordinates(region_name)
    if lat == 0.0:
        lat, lng = get_fuzzy_coordinate(region_name)
        if lat == 0.0: return []

    all_places = db.query(models.Place).all()
    candidates = []
    
    for p in all_places:
        dist = ((p.lat - lat)**2 + (p.lng - lng)**2)**0.5
        if dist > 0.02: continue 

        if allowed_types:
            if "workspace" in allowed_types and p.category == "junk":
                 if not any(k in p.name for k in ["회의", "룸", "오피스"]): continue
            elif p.category not in allowed_types and p.category != "junk":
                 continue
        
        is_match = False
        for kw in keywords:
            if kw in p.name or any(kw in t for t in (p.tags or [])):
                is_match = True
                break
        
        if is_match:
            candidates.append(agora_algo.POI(
                id=p.id, name=p.name, category=p.category, tags=p.tags,
                location=np.array([p.lat, p.lng]), price_level=2, avg_rating=p.wemeet_rating or 4.0
            ))
    return candidates

def expand_tags_to_keywords(purpose: str, user_tags: List[str]) -> List[str]:
    keywords = []
    if user_tags:
        for tag in user_tags:
            if tag in TAG_KEYWORD_EXPANSIONS:
                keywords.extend(TAG_KEYWORD_EXPANSIONS[tag][:5])
            keywords.append(tag)
        return list(dict.fromkeys(keywords))
    
    base_keywords = PURPOSE_CONFIG.get(purpose, {}).get("keywords", ["맛집"])
    return base_keywords

def _format_pois(pois):
    return [{
        "id": p.id, "name": p.name, "category": p.category, 
        "score": max(0.1, p.avg_rating), 
        "tags": p.tags, "location": [p.location[0], p.location[1]]
    } for p in pois]

def compute_availability_slots(user_ids: List[int], days_to_check: int, db: Session, required_duration: float = 1.5) -> List[str]:
    events = db.query(models.Event).filter(models.Event.user_id.in_(user_ids)).all()
    booked_slots = set()
    for ev in events:
        try:
            start_dt = datetime.strptime(f"{ev.date} {ev.time}", "%Y-%m-%d %H:%M")
            blocks = int(ev.duration_hours * 2)
            curr = start_dt
            for _ in range(blocks):
                booked_slots.add(curr.strftime("%Y-%m-%d %H:%M"))
                curr += timedelta(minutes=30)
        except: continue
    avail = []
    curr_date = datetime.now().date()
    end_date = curr_date + timedelta(days=days_to_check)
    while curr_date <= end_date:
        for h in range(11, 22): 
            for m in [0, 30]:
                start_check = datetime.combine(curr_date, time(h, m))
                if start_check < datetime.now(): continue
                if start_check.strftime("%Y-%m-%d %H:%M") not in booked_slots:
                     avail.append(start_check.strftime("%Y-%m-%d %H:%M"))
        curr_date += timedelta(days=1)
    return avail

# --- Request Models ---
class RecommendRequest(BaseModel):
    users: List[Any] = []; purpose: str = "식사"; location_name: str = ""
    friend_location_manual: Optional[str] = None; manual_locations: List[str] = [] 
    user_selected_tags: List[str] = []; current_lat: float = 37.566
    current_lng: float = 126.978; transport_mode: str = "subway"; room_id: Optional[str] = None
class NlpRequest(BaseModel): text: str
class ParticipantSchema(BaseModel): id: int; name: str; lat: float; lng: float; transport: str = "subway"; history_poi_ids: List[int] = []
class MeetingFlowRequest(BaseModel): room_id: Optional[str] = None; participants: List[ParticipantSchema] = []; purpose: str = "식사"; user_tags: List[str] = []; existing_midpoints: Optional[List[Dict[str, Any]]] = None; days_to_check: int = 7; manual_locations: List[str] = []
class EventSchema(BaseModel): id: Optional[str] = None; user_id: int; title: str; date: str; time: str; duration_hours: float = 1.5; location_name: Optional[str] = None; purpose: str; model_config = ConfigDict(from_attributes=True)
class AvailabilityRequest(BaseModel): user_ids: List[int]; days_to_check: int = 7

# --- Endpoints ---

# 🌟 [핵심 수정] 네이버 API 호출 제거 -> 내부 리스트(FALLBACK_COORDINATES)에서 검색
@router.get("/api/places/search")
def search_places_endpoint(query: str = Query(..., min_length=1)):
    results = []
    # 우리가 가진 데이터에서만 검색 (아파트, 이상한 곳 제외)
    for name, coords in FALLBACK_COORDINATES.items():
        if query in name:
            results.append({
                "title": name,
                "address": "주요 지하철역/거점",
                "lat": coords[0],
                "lng": coords[1]
            })
    
    return results[:10] # 10개까지만

@router.post("/api/recommend")
def get_recommendation(req: RecommendRequest, db: Session = Depends(get_db)):
    try:
        is_group_mode = (len(req.users) > 1 or len(req.manual_locations) > 0 or (req.friend_location_manual and req.friend_location_manual.strip() != ""))
        if is_group_mode: return run_group_recommendation(req, db)
        return run_general_search(req, db)
    except Exception as e:
        print(f"🔥 Error: {e}")
        return []

@router.post("/api/meeting-flow")
def run_meeting_flow(req: MeetingFlowRequest, db: Session = Depends(get_db)):
    engine_instance = MeetingFlowEngine(data_provider)
    return engine_instance.plan_meeting(req, db)

@router.post("/api/ai/parse-schedule")
def parse_schedule_endpoint(req: NlpRequest):
    try:
        model = genai.GenerativeModel('gemini-flash-latest')
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        prompt = f"Extract JSON (title, date YYYY-MM-DD, time HH:MM, location_name, purpose) from: '{req.text}'. Current: {now}. Return JSON string only."
        response = model.generate_content(prompt)
        return json.loads(response.text.replace("```json", "").replace("```", "").strip())
    except: return { "title": "새 일정", "date": datetime.now().strftime("%Y-%m-%d"), "time": "19:00", "location_name": "미정", "purpose": "식사" }

@router.post("/api/events", response_model=EventSchema)
def create_event(event: EventSchema, db: Session = Depends(get_db)):
    from uuid import uuid4
    db_event = models.Event(id=str(uuid4()), user_id=event.user_id, title=event.title, date=event.date, time=event.time, duration_hours=event.duration_hours, location_name=event.location_name, purpose=event.purpose)
    db.add(db_event); db.commit(); db.refresh(db_event)
    return db_event

@router.get("/api/events", response_model=List[EventSchema])
def get_events(db: Session = Depends(get_db)): return db.query(models.Event).all()
@router.put("/api/events/{event_id}")
def update_event(event_id: str, updated: EventSchema, db: Session = Depends(get_db)):
    ev = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not ev: raise HTTPException(status_code=404, detail="Not found")
    ev.title = updated.title; ev.date = updated.date; ev.time = updated.time; ev.location_name = updated.location_name; ev.purpose = updated.purpose; db.commit(); return ev
@router.delete("/api/events/{event_id}")
def delete_event(event_id: str, db: Session = Depends(get_db)):
    ev = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not ev: raise HTTPException(status_code=404, detail="Not found")
    db.delete(ev); db.commit(); return {"detail": "Deleted"}
@router.post("/api/group-availability")
def group_availability(req: AvailabilityRequest, db: Session = Depends(get_db)):
    avail = compute_availability_slots(req.user_ids, req.days_to_check, db)
    return {"available_slots": avail, "user_ids": req.user_ids}