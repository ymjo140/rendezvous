import json, asyncio, re, uuid, numpy as np
from datetime import datetime, timedelta
from typing import List, Optional, Dict, Any
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import BackgroundTasks, HTTPException

from core.config import settings
from domain import models
from schemas import meeting as schemas
from repositories.meeting_repository import MeetingRepository
from core.data_provider import RealDataProvider
from core.connection_manager import manager
from core.transport import TransportEngine 
from core.algorithm import AdvancedRecommender, POI

data_provider = RealDataProvider()

class MeetingService:
    def __init__(self):
        self.repo = MeetingRepository()

    # ---------------------------------------------------------
    # 🌟 1. 자동완성 및 기초 검색 로직 (생략 없이 유지)
    # ---------------------------------------------------------
    def search_hotspots(self, query: str) -> List[Dict[str, Any]]:
        results = []
        if hasattr(TransportEngine, 'SEOUL_HOTSPOTS'):
            for spot in TransportEngine.SEOUL_HOTSPOTS:
                if query in spot['name']:
                    results.append({"name": spot['name'], "lat": spot['lat'], "lng": spot['lng'], "line": spot.get('lines', [])})
        results.sort(key=lambda x: len(x['name']))
        return results[:10]

    def search_places_for_registration(self, db: Session, query: str, lat: Optional[float] = None, lng: Optional[float] = None) -> List[Dict[str, Any]]:
        hotspot_results = self.search_hotspots(query)
        places = data_provider.search_places_all_queries([query], "", 37.5665, 126.9780, db=db)
        place_results = [{"name": p.name, "lat": p.location[0], "lng": p.location[1], "category": p.category} for p in places]
        return (hotspot_results + place_results)[:15]

    # ---------------------------------------------------------
    # 🌟 [문제의 핵심 해결] _format_recommendations 함수 추가
    # ---------------------------------------------------------
    def _format_recommendations(self, db: Session, regions: list, req: schemas.RecommendRequest) -> List[Dict[str, Any]]:
        """AI 추천 장소들을 필터링하고 가중치를 부여하여 리턴합니다."""
        results = []
        user_prefs = req.user_selected_tags or [] 
        for r in regions:
            # DB에서 1km 내 장소 선조회 (wemeet_rating 컬럼 사용)
            db_query = text("""
                SELECT name, category, lat, lng, address, tags, wemeet_rating
                FROM places 
                WHERE (6371 * acos(cos(radians(:lat)) * cos(radians(lat)) * cos(radians(lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(lat)))) <= 1.0
                AND (category LIKE :purp OR name LIKE :purp) LIMIT 30
            """)
            db_rows = db.execute(db_query, {"lat": r['lat'], "lng": r['lng'], "purp": f"%{req.purpose}%"}).fetchall()
            place_candidates = [POI(0, row[0], row[1], row[5] or [], np.array([row[2], row[3]]), 1, float(row[6] or 0.0), row[4]) for row in db_rows]

            # 데이터 부족 시 Naver API 보충
            if len(place_candidates) < 5:
                ext = data_provider.search_places_all_queries([req.purpose], r['name'], r['lat'], r['lng'], db=db)
                for p in ext:
                    if not any(c.name == p.name for c in place_candidates):
                        place_candidates.append(POI(0, p.name, p.category, p.tags, np.array(p.location), 1, p.wemeet_rating, p.address))

            # 취향 알고리즘 적용 및 결과 정렬
            if place_candidates:
                recommender = AdvancedRecommender(place_candidates)
                ranked = recommender.recommend([{"tag_weights": {}, "foods": user_prefs, "vibes": user_prefs}], req.purpose, top_k=5)
                results.append({
                    "region_name": r["name"], "center": {"lat": r["lat"], "lng": r["lng"]}, 
                    "places": [{"name": p.name, "address": p.address, "category": p.category, "lat": float(p.location[0]), "lng": float(p.location[1]), "wemeet_rating": p.avg_rating} for p in ranked]
                })
        return results

    def get_recommendations_direct(self, db: Session, req: schemas.RecommendRequest) -> List[Dict[str, Any]]:
        """1~2단계: 출발지 인식 및 중간지점 도출 (117번 라인 호출부 수정 방지)"""
        all_points = []
        if req.current_lat and abs(req.current_lat) > 1.0:
            all_points.append({'lat': float(req.current_lat), 'lng': float(req.current_lng)})
        
        if req.users:
            for u in req.users:
                u_lat = getattr(u, 'lat', None) or (u.get('lat') if isinstance(u, dict) else None)
                u_lng = getattr(u, 'lng', None) or (u.get('lng') if isinstance(u, dict) else None)
                if u_lat and u_lng: all_points.append({'lat': float(u_lat), 'lng': float(u_lng)})

        if len(all_points) <= 1:
            base = all_points[0] if all_points else {'lat': 37.5665, 'lng': 126.9780}
            top_3_regions = [{"name": "설정 위치 주변", "lat": base['lat'], "lng": base['lng']}]
        else:
            top_3_regions = TransportEngine.find_best_midpoints(db, all_points)
            
        # 🌟 여기서 self._format_recommendations를 호출합니다.
        return self._format_recommendations(db, top_3_regions, req)

    # --- 실시간 기능 로직 (원본 유지) ---
    async def run_meeting_flow(self, db, req, bt):
        bt.add_task(self.process_background_recommendation, req, db); return {"status": "success"}

    async def process_background_recommendation(self, req, db):
        await self._send_system_msg(req.room_id, "🤖 최적의 약속을 찾는 중입니다...")
        slot = self._find_best_time_slot(db, req.room_id)
        recommend_req = schemas.RecommendRequest(current_lat=req.current_lat, current_lng=req.current_lng, purpose=req.purpose, users=req.users)
        recommendations = self.get_recommendations_direct(db, recommend_req)
        if recommendations and recommendations[0]['places']:
            place = recommendations[0]['places'][0]
            card_data = {"type": "vote_card", "place": place, "date": slot["date"], "time": slot["time"], "recommendation_reason": "✨ AI 분석 결과입니다!", "vote_count": 0}
            msg = models.Message(room_id=req.room_id, user_id=0, content=json.dumps(card_data, ensure_ascii=False))
            db.add(msg); db.commit()
            await manager.broadcast({"id": msg.id, "room_id": msg.room_id, "user_id": 0, "name": "AI 매니저", "content": msg.content, "timestamp": datetime.now().strftime("%H:%M")}, req.room_id)

    def _find_best_time_slot(self, db, room_id):
        members = db.query(models.ChatRoomMember).filter(models.ChatRoomMember.room_id == room_id).all()
        u_ids = [m.user_id for m in members]
        if not u_ids: return {"date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"), "time": "19:00"}
        today = datetime.now().date()
        for i in range(1, 15):
            t_date = today + timedelta(days=i); t_str = t_date.strftime("%Y-%m-%d")
            evts = db.query(models.Event).filter(models.Event.user_id.in_(u_ids), models.Event.date == t_str).all()
            if not any(e.time and re.search(r"(1[89]|20|21):", e.time) for e in evts): return {"date": t_str, "time": "19:00"}
        return {"date": (today + timedelta(days=1)).strftime("%Y-%m-%d"), "time": "19:00"}

    async def vote_meeting(self, db, req):
        msg = db.query(models.Message).filter(models.Message.id == req.message_id).first()
        if msg:
            data = json.loads(msg.content); data["vote_count"] = data.get("vote_count", 0) + 1
            msg.content = json.dumps(data, ensure_ascii=False); db.commit()
            await manager.broadcast({"id": msg.id, "room_id": req.room_id, "user_id": 0, "content": msg.content, "timestamp": datetime.now().strftime("%H:%M")}, req.room_id)
            return {"status": "success", "vote_count": data["vote_count"]}

    async def confirm_meeting(self, db, req):
        members = db.query(models.ChatRoomMember).filter(models.ChatRoomMember.room_id == req.room_id).all()
        for m in members:
            db.add(models.Event(id=str(uuid.uuid4()), user_id=m.user_id, title=f"📅 {req.place_name}", date=req.date, time=req.time, duration_hours=1.0, location_name=req.place_name, purpose=req.category, is_private=True))
        db.commit(); await self._send_system_msg(req.room_id, f"✅ 약속 확정!"); return {"status": "success"}

    async def _send_system_msg(self, r_id, txt):
        content = json.dumps({"type": "system", "text": txt}, ensure_ascii=False)
        await manager.broadcast({"room_id": r_id, "user_id": 0, "name": "System", "content": content, "timestamp": datetime.now().strftime("%H:%M")}, r_id)

    def create_event(self, db, e_data):
        new_event = models.Event(id=str(uuid.uuid4()), user_id=e_data.user_id, title=e_data.title, date=e_data.date, time=e_data.time, duration_hours=getattr(e_data, 'duration_hours', 1.0), location_name=e_data.location_name, purpose=e_data.purpose, is_private=True)
        db.add(new_event); db.commit(); db.refresh(new_event); return new_event

    def get_events(self, db, u_id): return self.repo.get_user_events(db, u_id)