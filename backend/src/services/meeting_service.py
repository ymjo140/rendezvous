import json, asyncio, re, uuid, numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import BackgroundTasks, HTTPException

from core.transport import TransportEngine 
from core.algorithm import AdvancedRecommender, POI
from core.data_provider import RealDataProvider
from domain import models
from schemas import meeting as schemas
from repositories.meeting_repository import MeetingRepository

# 🌟 [Fix] Pylance 에러 방지용 임포트
from core.connection_manager import manager 

data_provider = RealDataProvider()

class MeetingService:
    def __init__(self):
        self.repo = MeetingRepository()

    # 🌟 [핵심 수정] 카테고리 매핑 및 검색 쿼리 강화
    def _format_recommendations(self, db: Session, regions: list, req: schemas.RecommendRequest) -> List[Dict[str, Any]]:
        results = []
        user_prefs = req.user_selected_tags or [] 
        
        # 1. 카테고리 영문/한글 매핑 (DB는 restaurant, request는 식사)
        category_map = {
            "식사": "restaurant",
            "카페": "cafe",
            "술": "bar",
            "술/회식": "bar"
        }
        db_category = category_map.get(req.purpose, req.purpose) # 매핑 안되면 그대로 사용

        # 2. 검색어 확장 (목적 + 필터)
        search_queries = [req.purpose] + user_prefs

        for r in regions:
            # 🌟 [SQL 수정] 
            # 1. category가 한글('식사')이거나 영문('restaurant')인 경우 모두 잡음
            # 2. tags(JSON String) 안에 검색어(예: '한식')가 포함된 경우도 잡음
            # 3. 거리 제한을 1km -> 2km로 완화하여 조회율 높임
            db_query = text("""
                SELECT name, category, lat, lng, address, tags, wemeet_rating
                FROM places 
                WHERE (6371 * acos(cos(radians(:lat)) * cos(radians(lat)) * cos(radians(lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(lat)))) <= 2.0
                AND (
                    category LIKE :kor_purpose 
                    OR category LIKE :eng_purpose 
                    OR name LIKE :kor_purpose
                    OR tags LIKE :tag_query
                )
                ORDER BY wemeet_rating DESC
                LIMIT 30
            """)
            
            # 태그 검색을 위한 LIKE 패턴 ('%한식%')
            tag_search = f"%{user_prefs[0]}%" if user_prefs else f"%{req.purpose}%"

            db_rows = db.execute(db_query, {
                "lat": r['lat'], 
                "lng": r['lng'], 
                "kor_purpose": f"%{req.purpose}%", 
                "eng_purpose": f"%{db_category}%",
                "tag_query": tag_search
            }).fetchall()

            place_candidates = []
            for row in db_rows:
                # DB의 tags는 JSON string이므로 파싱 시도, 실패하면 빈 리스트
                try:
                    loaded_tags = json.loads(row[5]) if row[5] else []
                except:
                    loaded_tags = []

                place_candidates.append(POI(
                    id=0, name=row[0], category=row[1], tags=loaded_tags, 
                    location=np.array([row[2], row[3]]), price_level=1, 
                    avg_rating=float(row[6] or 0.0), address=row[4]
                ))

            # [데이터 부족 시 API 보충]
            if len(place_candidates) < 5:
                # 여기서 search_queries 전체를 넘겨서 다양하게 검색
                ext = data_provider.search_places_all_queries(search_queries, r['name'], r['lat'], r['lng'], db=db)
                for p in ext:
                    if not any(c.name == p.name for c in place_candidates):
                        place_candidates.append(POI(
                            id=0, name=p.name, category=p.category, tags=p.tags, 
                            location=np.array(p.location), price_level=1, 
                            avg_rating=p.wemeet_rating, address=p.address
                        ))

            # [랭킹 및 결과 반환]
            if place_candidates:
                recommender = AdvancedRecommender(place_candidates)
                ranked = recommender.recommend([{"tag_weights": {}, "foods": user_prefs, "vibes": user_prefs}], req.purpose, top_k=5)
                
                results.append({
                    "region_name": r["name"], 
                    "center": {"lat": r["lat"], "lng": r["lng"]}, 
                    "places": [{"name": p.name, "address": p.address, "category": p.category, "lat": float(p.location[0]), "lng": float(p.location[1]), "wemeet_rating": p.avg_rating} for p in ranked]
                })
        return results

    # --- (아래 기존 로직들은 생략 없이 그대로 유지) ---
    def get_recommendations_direct(self, db: Session, req: schemas.RecommendRequest) -> List[Dict[str, Any]]:
        all_points = []
        if req.current_lat and req.current_lng and abs(req.current_lat) > 1.0:
            all_points.append({'lat': float(req.current_lat), 'lng': float(req.current_lng)})
        
        if req.users:
            for u in req.users:
                u_lat, u_lng = None, None
                if hasattr(u, 'location') and u.location:
                    if hasattr(u.location, 'lat'): u_lat, u_lng = u.location.lat, u.location.lng
                    elif isinstance(u.location, dict): u_lat, u_lng = u.location.get('lat'), u.location.get('lng')
                elif isinstance(u, dict):
                    loc = u.get('location')
                    if loc:
                        if isinstance(loc, dict): u_lat, u_lng = loc.get('lat'), loc.get('lng')
                        else: u_lat, u_lng = getattr(loc, 'lat', None), getattr(loc, 'lng', None)
                    else:
                        u_lat, u_lng = u.get('lat'), u.get('lng')
                
                if u_lat and u_lng and abs(float(u_lat)) > 1.0:
                    all_points.append({'lat': float(u_lat), 'lng': float(u_lng)})

        print(f"📍 [Debug] 인식된 총 출발지 수: {len(all_points)}개")

        if len(all_points) < 2:
            base_lat = all_points[0]['lat'] if all_points else 37.5665
            base_lng = all_points[0]['lng'] if all_points else 126.9780
            top_3_regions = [{"name": "설정 위치 주변", "lat": base_lat, "lng": base_lng}]
        else:
            top_3_regions = TransportEngine.find_best_midpoints(db, all_points)
            
        return self._format_recommendations(db, top_3_regions, req)

    # ... (search_hotspots, run_meeting_flow, process_background_recommendation, vote_meeting, confirm_meeting, etc. 유지)
    def search_hotspots(self, query: str):
        results = []
        if hasattr(TransportEngine, 'SEOUL_HOTSPOTS'):
            for spot in TransportEngine.SEOUL_HOTSPOTS:
                if query in spot['name']:
                    results.append({"name": spot['name'], "lat": spot['lat'], "lng": spot['lng'], "lines": spot.get('lines', [])})
        results.sort(key=lambda x: len(x['name']))
        return results[:10]

    def search_places_for_registration(self, db, query, lat=None, lng=None):
        hotspot_results = self.search_hotspots(query)
        places = data_provider.search_places_all_queries([query], "", 37.5665, 126.9780, db=db)
        place_results = [{"name": p.name, "lat": p.location[0], "lng": p.location[1], "category": p.category} for p in places]
        return (hotspot_results + place_results)[:15]

    async def run_meeting_flow(self, db, req, bt):
        bt.add_task(self.process_background_recommendation, req, db); return {"status": "success", "message": "AI 분석 시작"}

    async def process_background_recommendation(self, req, db):
        await self._send_system_msg(req.room_id, "🤖 최적의 약속을 찾는 중입니다...")
        slot = self._find_best_time_slot(db, req.room_id)
        recommend_req = schemas.RecommendRequest(current_lat=req.current_lat, current_lng=req.current_lng, purpose=req.purpose, users=req.users)
        recommendations = self.get_recommendations_direct(db, recommend_req)
        if recommendations and recommendations[0]['places']:
            place = recommendations[0]['places'][0]
            card_data = {"type": "vote_card", "place": place, "date": slot["date"], "time": slot["time"], "recommendation_reason": "✨ AI 추천 결과", "vote_count": 0}
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

    def get_events(self, db, u_id): return self.repo.get_user_events(db, u_id)
    def create_event(self, db, e):
        ne = models.Event(id=str(uuid.uuid4()), user_id=e.user_id, title=e.title, date=e.date, time=e.time, duration_hours=1.0, location_name=e.location_name, purpose=e.purpose, is_private=True)
        db.add(ne); db.commit(); db.refresh(ne); return ne
    def delete_event(self, db, u, e):
        ev = db.query(models.Event).filter(models.Event.id == e, models.Event.user_id == u).first()
        if not ev: raise HTTPException(404, "삭제 불가");
        db.delete(ev); db.commit(); return {"status": "success"}