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

# 🌟 [1] 백업 좌표 리스트
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
    "강남": (37.4980, 127.0276), "역삼": (37.5006, 127.0364), "신논현": (37.5045, 127.0250), "삼성": (37.5088, 127.0631),
    "잠실": (37.5132, 127.1001), "건대입구": (37.5407, 127.0702),
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

# 🌟 [2] Request Models (함수보다 위로 올림!)
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

# 🌟 [3] Helper Functions
def save_place_to_db(db: Session, poi_list: List[Any]):
    """검색된 장소를 DB에 자산화 (중복 방지 + 주소 저장)"""
    for p in poi_list:
        existing = db.query(models.Place).filter(models.Place.name == p.name).first()
        
        # 중복 체크 (좌표 기반)
        is_duplicate = False
        target_lat = float(p.location[0])
        target_lng = float(p.location[1])
        
        if existing:
            if abs(existing.lat - target_lat) < 0.0005 and abs(existing.lng - target_lng) < 0.0005:
                is_duplicate = True
        
        if not is_duplicate:
            # 🌟 주소 정보 가져오기 (data_provider에서 넣어준 값)
            addr = getattr(p, 'address', '주소 정보 없음')
            
            new_place = models.Place(
                name=p.name, 
                category=p.category, 
                tags=p.tags,
                lat=target_lat, 
                lng=target_lng,
                wemeet_rating=p.avg_rating,
                address=addr # 🌟 주소 저장
            )
            db.add(new_place)
    try: db.commit()
    except: db.rollback()

# backend/routers/meetings.py 내부 함수 교체

def search_places_in_db(db: Session, region_name: str, keywords: List[str], allowed_types: List[str]) -> List[Any]:
    # 1. 중심 좌표 구하기
    lat, lng = data_provider.get_coordinates(region_name)
    if lat == 0.0:
        lat, lng = get_fuzzy_coordinate(region_name)
        if lat == 0.0: return []

    # 2. 🌟 [핵심] Bounding Box (검색 범위) 설정
    # 위도 1도 ≒ 111km, 0.01도 ≒ 1.1km
    # 중심에서 약 2km 반경의 사각형 범위를 만듭니다.
    lat_min, lat_max = lat - 0.02, lat + 0.02
    lng_min, lng_max = lng - 0.02, lng + 0.02

    # 3. 🌟 [핵심] DB에서 범위 내의 데이터만 쏙 뽑아옴 (속도 100배 향상)
    # Python에서 for문을 돌리는 게 아니라, DB가 필터링해서 가져옴
    places_in_range = db.query(models.Place).filter(
        models.Place.lat.between(lat_min, lat_max),
        models.Place.lng.between(lng_min, lng_max)
    ).all()
    
    candidates = []
    
    for p in places_in_range:
        # 범위 내에 있는 것들 중에서만 정밀 거리 계산 (약 2km 원형)
        dist = ((p.lat - lat)**2 + (p.lng - lng)**2)**0.5
        if dist > 0.02: continue 

        # 🌟 유연한 매칭 로직 (기존 유지)
        is_keyword_match = False
        tags_list = p.tags if isinstance(p.tags, list) else []
        for kw in keywords:
            if kw in p.name or any(kw in t for t in tags_list):
                is_keyword_match = True
                break
        
        if is_keyword_match:
            pass
        elif allowed_types:
            if p.category not in allowed_types: continue
            if "workspace" in allowed_types and p.category == "junk":
                 if not any(k in p.name for k in ["회의", "룸", "오피스"]): continue
        
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

# 🌟 [4] Core Logic Functions
def run_general_search(req: RecommendRequest, db: Session):
    search_query = req.location_name
    if not search_query or search_query in ["내 위치", "중간지점", ""]:
        return [{ "region_name": "내 주변", "lat": req.current_lat, "lng": req.current_lng, "transit_info": {"avg_time": 0, "details": []}, "places": [] }]
    
    lat, lng = data_provider.get_coordinates(search_query)
    if lat == 0.0: lat, lng = get_fuzzy_coordinate(search_query)

    if lat != 0.0 and lng != 0.0:
        keywords = expand_tags_to_keywords(req.purpose, req.user_selected_tags)
        pois = search_places_in_db(db, search_query, keywords, None)
        if len(pois) < 5:
            api_pois = data_provider.search_places_all_queries(keywords, search_query, lat, lng, allowed_types=None)
            save_place_to_db(db, api_pois)
            existing_names = {p.name for p in pois}
            for p in api_pois:
                if p.name not in existing_names: pois.append(p)

        return [{ "region_name": search_query, "lat": lat, "lng": lng, "transit_info": {"avg_time": 0, "details": []}, "places": _format_pois(pois) }]
    else:
        pois = data_provider.search_places_all_queries([search_query], "", req.current_lat, req.current_lng, allowed_types=None)
        save_place_to_db(db, pois)
        return [{ "region_name": "검색 결과", "lat": req.current_lat, "lng": req.current_lng, "transit_info": {"avg_time": 0, "details": []}, "places": _format_pois(pois) }]

def run_group_recommendation(req: RecommendRequest, db: Session):
    participants = []
    for u in req.users:
        try:
            loc = u.get('location') if isinstance(u, dict) else None
            if loc and isinstance(loc, dict):
                lat, lng = float(loc.get('lat', 0)), float(loc.get('lng', 0))
                if lat > 0: participants.append({"id": u.get("id", 0), "name": u.get("name", "User"), "lat": lat, "lng": lng})
        except: continue
        
    if req.manual_locations:
        for idx, loc_name in enumerate(req.manual_locations):
            if loc_name.strip():
                lat, lng = data_provider.get_coordinates(loc_name)
                if lat == 0.0: lat, lng = get_fuzzy_coordinate(loc_name)
                if lat != 0.0: participants.append({"id": 9000+idx, "name": loc_name, "lat": lat, "lng": lng})
    
    if req.friend_location_manual:
        lat, lng = data_provider.get_coordinates(req.friend_location_manual)
        if lat == 0.0: lat, lng = get_fuzzy_coordinate(req.friend_location_manual)
        if lat != 0.0: participants.append({"id": 9999, "name": req.friend_location_manual, "lat": lat, "lng": lng})

    if len(participants) <= 1:
        if not participants: center_lat, center_lng = 37.5665, 126.9780; region_name = "서울 시청"
        else: center_lat = participants[0]['lat']; center_lng = participants[0]['lng']; region_name = "내 주변"
        regions = [{"region_name": region_name, "lat": center_lat, "lng": center_lng, "transit_info": { "avg_time": 0, "details": [] }}]
    else:
        regions = []
        try:
            avg_lat = sum(p['lat'] for p in participants) / len(participants)
            avg_lng = sum(p['lng'] for p in participants) / len(participants)
            nearest_name = TransportEngine.get_nearest_hotspot(avg_lat, avg_lng)
            regions.append({"region_name": f"{nearest_name} (중간)", "lat": avg_lat, "lng": avg_lng})
            regions.extend(TransportEngine.find_best_midpoints(participants)[:2])
        except: pass
    
    config = PURPOSE_CONFIG.get(req.purpose, PURPOSE_CONFIG["식사"])
    allowed_types = config.get("allowed", ["restaurant"])
    user_tags_str = str(req.user_selected_tags)
    if "비즈니스" in req.purpose:
        if any(x in user_tags_str for x in ["회의", "워크샵", "스터디", "공유오피스"]): allowed_types = ["workspace"]
        elif any(x in user_tags_str for x in ["식사", "접대", "회식"]): allowed_types = ["restaurant", "fine_dining"]
        else: allowed_types = ["restaurant", "cafe", "workspace"]

    final_keywords = expand_tags_to_keywords(req.purpose, req.user_selected_tags)
    final_response = []
    
    for region in regions:
        try:
            r_name = region.get('region_name', '중간지점').split('(')[0].strip()
            if r_name == "지리적 중간" or r_name == "중간지점":
                 r_name = TransportEngine.get_nearest_hotspot(region['lat'], region['lng'])
            
            pois = search_places_in_db(db, r_name, final_keywords, allowed_types)
            if len(pois) < 5:
                api_pois = data_provider.search_places_all_queries(final_keywords, r_name, region.get("lat"), region.get("lng"), allowed_types=allowed_types)
                save_place_to_db(db, api_pois)
                existing_names = {p.name for p in pois}
                for p in api_pois:
                    if p.name not in existing_names: pois.append(p)

            algo_users = [agora_algo.UserProfile(id=p.get('id',0), preferences={}, history=[]) for p in participants]
            engine = agora_algo.AdvancedRecommender(algo_users, pois)
            results = engine.recommend(req.purpose, np.array([region.get("lat"), region.get("lng")]), req.user_selected_tags)
            
            formatted_places = []
            for p, s in results[:10]:
                formatted_places.append({ 
                    "id": p.id, "name": p.name, "category": p.category, 
                    "score": max(0.1, round(float(s), 1)), 
                    "tags": p.tags, "location": [p.location[0], p.location[1]] 
                })
            
            final_response.append({
                "region_name": region['region_name'], "lat": region["lat"], "lng": region["lng"], 
                "transit_info": region.get("transit_info"), "places": formatted_places
            })
        except: continue

    return final_response

class MeetingFlowEngine:
    def __init__(self, provider: RealDataProvider): self.provider = provider
    def _rank_time_slots(self, slots: List[str], purpose: str) -> List[str]:
        if not slots: return []
        def get_score(slot_str):
            dt = datetime.strptime(slot_str, "%Y-%m-%d %H:%M"); h = dt.hour; score = 0
            days_diff = (dt.date() - datetime.now().date()).days; score -= days_diff * 2
            if "식사" in purpose: 
                if 11 <= h <= 13: score += 50
                elif 18 <= h <= 19: score += 60 
            elif "술" in purpose: 
                if h >= 18: score += 80
            return score
        return sorted(slots, key=get_score, reverse=True)

    def plan_meeting(self, req: MeetingFlowRequest, db: Session) -> Dict[str, Any]:
        part_dicts = []
        if req.room_id:
             room = db.query(models.Community).filter(models.Community.id == req.room_id).first()
             if room and room.member_ids:
                 users = db.query(models.User).filter(models.User.id.in_(room.member_ids)).all()
                 for u in users: part_dicts.append({"id": u.id, "name": u.name, "lat": u.lat, "lng": u.lng})
        if req.participants:
            for p in req.participants: part_dicts.append({"id": p.id, "name": p.name, "lat": p.lat, "lng": p.lng})
            
        if req.manual_locations:
            for idx, loc_name in enumerate(req.manual_locations):
                if loc_name.strip():
                    lat, lng = data_provider.get_coordinates(loc_name)
                    if lat == 0.0: lat, lng = get_fuzzy_coordinate(loc_name)
                    if lat != 0.0: part_dicts.append({"id": 9000+idx, "name": loc_name, "lat": lat, "lng": lng})

        regions = []
        if len(part_dicts) > 1:
            try:
                avg_lat = sum(p['lat'] for p in part_dicts) / len(part_dicts)
                avg_lng = sum(p['lng'] for p in part_dicts) / len(part_dicts)
                nearest_name = TransportEngine.get_nearest_hotspot(avg_lat, avg_lng)
                regions.append({"region_name": f"{nearest_name} (중간)", "lat": avg_lat, "lng": avg_lng})
                regions.extend(TransportEngine.find_best_midpoints(part_dicts)[:2])
            except: pass
        else:
             regions = [{"region_name": "서울 시청", "lat": 37.5665, "lng": 126.9780}]
        
        recommendations = []
        config = PURPOSE_CONFIG.get(req.purpose, PURPOSE_CONFIG["식사"])
        allowed_types = config.get("allowed", ["restaurant"])
        if "비즈니스" in req.purpose and any(x in str(req.user_tags) for x in ["회의", "워크샵", "스터디", "공유오피스"]):
             allowed_types = ["workspace"]

        final_keywords = expand_tags_to_keywords(req.purpose, req.user_tags)

        for region in regions:
            r_name = region.get('region_name', '중간지점').split('(')[0].strip()
            if r_name == "지리적 중간" or r_name == "중간지점":
                 r_name = TransportEngine.get_nearest_hotspot(region['lat'], region['lng'])
            
            pois = search_places_in_db(db, r_name, final_keywords, allowed_types)
            if len(pois) < 5:
                api_pois = self.provider.search_places_all_queries(final_keywords, r_name, region.get("lat"), region.get("lng"), allowed_types=allowed_types)
                save_place_to_db(db, api_pois)
                existing_names = {p.name for p in pois}
                for p in api_pois:
                    if p.name not in existing_names: pois.append(p)

            algo_users = [agora_algo.UserProfile(id=p.get('id',0), preferences={}, history=[]) for p in part_dicts]
            try:
                engine = agora_algo.AdvancedRecommender(algo_users, pois)
                results = engine.recommend(req.purpose, np.array([region.get("lat"), region.get("lng")]), req.user_tags)
                recs = [{"id": p.id, "name": p.name, "category": p.category, "score": float(s), "tags": p.tags, "location": [p.location[0], p.location[1]]} for p, s in results[:10]]
            except: recs = []
            recommendations.append({**region, "name": r_name, "recommendations": recs})
        
        user_ids = [p.get('id') for p in part_dicts if p.get('id')]
        target_duration = PURPOSE_DURATIONS.get(req.purpose, 1.5)
        raw_availability = compute_availability_slots(user_ids, req.days_to_check, db, required_duration=target_duration)
        ranked_availability = self._rank_time_slots(raw_availability, req.purpose)
        final_top3 = ranked_availability[:3]
        if not final_top3: final_top3 = [(datetime.now() + timedelta(hours=1)).strftime("%Y-%m-%d %H:%M")]
        
        cards = []
        for i, time_slot in enumerate(final_top3):
            place = {"name": "장소 미정", "tags": []}
            region_name = "중간지점"
            if recommendations:
                rec_idx = i % len(recommendations)
                target_region = recommendations[rec_idx]
                region_name = target_region.get("name", target_region.get("region_name", "추천 지역"))
                if target_region.get("recommendations"):
                    place = target_region["recommendations"][0]
            cards.append({"time": time_slot, "region": region_name, "place": place})
        return {"cards": cards, "all_available_slots": sorted(raw_availability)}

# --- Endpoints ---
@router.get("/api/places/search")
def search_places_endpoint(query: str = Query(..., min_length=1)):
    try:
        results = []
        for name, coords in FALLBACK_COORDINATES.items():
            if query in name:
                results.append({
                    "title": name,
                    "address": "주요 지하철역/거점",
                    "lat": coords[0],
                    "lng": coords[1]
                })
        return results[:10]
    except: return []

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