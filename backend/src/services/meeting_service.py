import json
import asyncio
from datetime import datetime, timedelta
from typing import List
from sqlalchemy.orm import Session
from fastapi import BackgroundTasks

from ..core.config import settings
from ..domain import models
from ..schemas import meeting as schemas
from ..repositories.meeting_repository import MeetingRepository
from ..core.data_provider import RealDataProvider
from ..core.connection_manager import manager
from ..core.transport import TransportEngine 

data_provider = RealDataProvider()

class MeetingService:
    def __init__(self):
        self.repo = MeetingRepository()

    def _find_best_time_slot(self, db: Session, member_ids: List[int]) -> str:
        today = datetime.now().date()
        return f"{today} 19:00"

    async def _send_system_msg(self, room_id: str, text: str):
        try:
            content = json.dumps({"type": "system", "text": text}, ensure_ascii=False)
            await manager.broadcast({
                "room_id": room_id, "user_id": 0, "name": "System", "avatar": "🤖",
                "content": content, "timestamp": datetime.now().strftime("%H:%M")
            }, room_id)
        except: pass

    def search_hotspots(self, query: str):
        if not query: return []
        results = []
        if hasattr(TransportEngine, 'SEOUL_HOTSPOTS'):
            for spot in TransportEngine.SEOUL_HOTSPOTS:
                if query in spot['name']:
                    results.append({
                        "name": spot['name'],
                        "lat": spot['lat'],
                        "lng": spot['lng'],
                        "lines": spot.get('lines', [])
                    })
        results.sort(key=lambda x: len(x['name']))
        return results[:10]

    # 🌟 [수정] db 세션을 TransportEngine에 전달
    def get_recommendations_direct(self, db: Session, req: schemas.RecommendRequest):
        all_points = []

        if req.current_lat and req.current_lng and req.current_lat != 0:
            all_points.append({'lat': req.current_lat, 'lng': req.current_lng})

        if req.users:
            for u in req.users:
                if u.location and u.location.lat and u.location.lng:
                    all_points.append({'lat': u.location.lat, 'lng': u.location.lng})

        if req.manual_locations:
            for loc in req.manual_locations:
                if not loc: continue
                if ',' in loc and any(c.isdigit() for c in loc):
                    try:
                        parts = loc.split(',')
                        all_points.append({'lat': float(parts[0]), 'lng': float(parts[1])})
                    except: pass
                else:
                    found = False
                    if hasattr(TransportEngine, 'SEOUL_HOTSPOTS'):
                        for spot in TransportEngine.SEOUL_HOTSPOTS:
                            if spot['name'] == loc or spot['name'] == loc.replace("역", ""):
                                all_points.append({'lat': spot['lat'], 'lng': spot['lng']})
                                found = True
                                break
                    if not found:
                        try:
                            lat, lng = data_provider.get_coordinates(loc)
                            if lat != 0.0:
                                all_points.append({'lat': lat, 'lng': lng})
                        except: pass

        # 🌟 여기! db 세션 전달
        top_3_regions = TransportEngine.find_best_midpoints(db, all_points)

        if not top_3_regions:
            top_3_regions = [{"name": "서울 시청", "lat": 37.5665, "lng": 126.9780}]

        final_results = []
        category_map = { "식사": "restaurant", "카페": "cafe", "술": "pub", "스터디": "workspace", "문화생활": "culture" }
        target_db_category = category_map.get(req.purpose, req.purpose)

        for region in top_3_regions:
            r_name = region['name']
            r_lat = region['lat']
            r_lng = region['lng']

            places = self.repo.search_places_in_range(db, r_lat, r_lng, target_db_category)

            if len(places) < 3:
                search_query = f"{r_name} {req.purpose} 맛집" 
                if req.user_selected_tags:
                    search_query += f" {req.user_selected_tags[0]}"
                
                api_pois = data_provider.search_places_all_queries([search_query], r_name, r_lat, r_lng, db=db)
                for p in api_pois:
                    if not self.repo.get_place_by_name(db, p.name):
                        try:
                            p_lat = p.location[0] if isinstance(p.location, (list, tuple)) else p.location
                            p_lng = p.location[1] if isinstance(p.location, (list, tuple)) else 0.0
                            self.repo.create_place(db, p.name, target_db_category, p_lat, p_lng, p.tags, 0.0)
                        except: continue
                try: db.commit()
                except: db.rollback()
                places = self.repo.search_places_in_range(db, r_lat, r_lng, target_db_category)

            formatted_places = []
            if places:
                scored = []
                for p in places:
                    score = (p.wemeet_rating or 0) * 10
                    dist = TransportEngine._haversine(r_lat, r_lng, p.lat, p.lng)
                    if dist < 500: score += 20
                    elif dist < 1000: score += 10
                    elif dist > 3000: score -= 30
                    if p.tags and req.user_selected_tags:
                        p_tags = p.tags if isinstance(p.tags, list) else []
                        matched = len(set(p_tags) & set(req.user_selected_tags))
                        score += matched * 15
                    scored.append((score, p))
                scored.sort(key=lambda x: x[0], reverse=True)
                top_places = [item[1] for item in scored[:5]]

                for place in top_places:
                    formatted_places.append({
                        "id": place.id,
                        "name": place.name,
                        "category": place.category,
                        "address": place.address or "",
                        "location": [place.lat, place.lng],
                        "lat": place.lat,
                        "lng": place.lng,
                        "tags": place.tags or [],
                        "image": None, 
                        "score": round(score, 1)
                    })

            final_results.append({
                "region_name": r_name,
                "lat": r_lat,
                "lng": r_lng,
                "places": formatted_places,
                "transit_info": None
            })

        return final_results

    # (이하 메서드 생략 - 변경 없음)
    async def process_background_recommendation(self, req: schemas.MeetingFlowRequest, db: Session): pass 
    async def run_meeting_flow(self, db: Session, req: schemas.MeetingFlowRequest, background_tasks: BackgroundTasks):
        if req.room_id: background_tasks.add_task(self.process_background_recommendation, req, db); return {"status": "accepted"}
        return {"cards": [], "recommendations": []}
    async def vote_meeting(self, db: Session, req: schemas.VoteRequest):
        msg = self.repo.get_message_by_id(db, req.message_id)
        if msg:
            data = json.loads(msg.content); data["vote_count"] = data.get("vote_count", 0) + 1; msg.content = json.dumps(data, ensure_ascii=False); db.commit()
            await manager.broadcast({ "id": msg.id, "room_id": msg.room_id, "user_id": msg.user_id, "content": msg.content, "timestamp": str(msg.timestamp), "name": "AI 매니저", "avatar": "🤖" }, req.room_id)
        return {"status": "success"}
    async def confirm_meeting(self, db: Session, req: schemas.ConfirmRequest):
        room_members = self.repo.get_room_members(db, req.room_id); count = 0
        for m in room_members:
            event = schemas.EventSchema(user_id=m.user_id, title=f"📅 {req.place_name}", date=req.date, time=req.time, location_name=req.place_name, purpose=req.category); self.repo.create_event(db, event); count += 1
        db.commit()
        text = f"✅ {req.place_name} 약속 확정! ({count}명 캘린더 등록)"
        msg = self.repo.create_system_message(db, req.room_id, json.dumps({"text": text}, ensure_ascii=False))
        await manager.broadcast({ "id": msg.id, "room_id": msg.room_id, "user_id": 1, "name": "AI 매니저", "avatar": "🤖", "content": msg.content, "timestamp": str(msg.timestamp) }, req.room_id)
        return {"status": "success"}
    def create_event(self, db: Session, event: schemas.EventSchema): db_ev = self.repo.create_event(db, event); db.commit(); db.refresh(db_ev); return db_ev
    def get_events(self, db: Session, user_id: int): return self.repo.get_user_events(db, user_id)
    def delete_event(self, db: Session, event_id: str): self.repo.delete_event(db, event_id); db.commit()