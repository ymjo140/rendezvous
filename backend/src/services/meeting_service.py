import json, asyncio, re, uuid, numpy as np
from datetime import datetime, timedelta
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from sqlalchemy import text
from fastapi import HTTPException
from fastapi import BackgroundTasks, HTTPException
from core.transport import TransportEngine 
from core.algorithm import AdvancedRecommender, POI
from core.data_provider import RealDataProvider
from domain import models
from schemas import meeting as schemas
from repositories.meeting_repository import MeetingRepository
from core.connection_manager import manager

data_provider = RealDataProvider()

class MeetingService:
    def __init__(self):
        self.repo = MeetingRepository()

    # 🌟 [수정] 세부 필터를 검색어에 반영
    def _format_recommendations(self, db: Session, regions: list, req: schemas.RecommendRequest) -> List[Dict[str, Any]]:
        results = []
        user_prefs = req.user_selected_tags or []
        
        # 🌟 검색어 조합: [목적] + [선택한 태그들] (예: ['식사', '한식', '고기'])
        search_queries = [req.purpose] + user_prefs

        for r in regions:
            # 3단계: DB 선조회
            db_query = text("""
                SELECT name, category, lat, lng, address, tags, wemeet_rating
                FROM places 
                WHERE (6371 * acos(cos(radians(:lat)) * cos(radians(lat)) * cos(radians(lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(lat)))) <= 1.0
                AND (category LIKE :purp OR name LIKE :purp) LIMIT 30
            """)
            db_rows = db.execute(db_query, {"lat": r['lat'], "lng": r['lng'], "purp": f"%{req.purpose}%"}).fetchall()
            place_candidates = [POI(0, row[0], row[1], row[5] or [], np.array([row[2], row[3]]), 1, float(row[6] or 0.0), row[4]) for row in db_rows]

            # 4단계: API 보충 (검색어 리스트 활용)
            if len(place_candidates) < 5:
                # 🌟 여기가 핵심: search_queries를 넘겨서 '한식', '일식' 등으로도 검색하게 함
                ext = data_provider.search_places_all_queries(search_queries, r['name'], r['lat'], r['lng'], db=db)
                for p in ext:
                    if not any(c.name == p.name for c in place_candidates):
                        place_candidates.append(POI(0, p.name, p.category, p.tags, np.array(p.location), 1, p.wemeet_rating, p.address))

            # 5단계: 취향 랭킹
            if place_candidates:
                recommender = AdvancedRecommender(place_candidates)
                ranked = recommender.recommend([{"tag_weights": {}, "foods": user_prefs, "vibes": user_prefs}], req.purpose, top_k=5)
                results.append({
                    "region_name": r["name"], "center": {"lat": r["lat"], "lng": r["lng"]}, 
                    "places": [{"name": p.name, "address": p.address, "category": p.category, "lat": float(p.location[0]), "lng": float(p.location[1]), "wemeet_rating": p.avg_rating} for p in ranked]
                })
        return results

    # 🌟 [수정] 1-2단계: n개의 출발지 인식 로직
    def get_recommendations_direct(self, db: Session, req: schemas.RecommendRequest):
        all_points = []
        if req.current_lat and req.current_lng and abs(req.current_lat) > 1.0:
            all_points.append({'lat': float(req.current_lat), 'lng': float(req.current_lng)})
        
        if req.users:
            for u in req.users:
                # Pydantic 모델과 Dict 모두 처리하도록 유연하게 파싱
                u_lat = getattr(u, 'lat', None) or (u.get('lat') if isinstance(u, dict) else None)
                u_lng = getattr(u, 'lng', None) or (u.get('lng') if isinstance(u, dict) else None)
                
                if not u_lat and isinstance(u, dict) and 'location' in u:
                    loc = u['location']
                    u_lat = loc.get('lat') if isinstance(loc, dict) else getattr(loc, 'lat', None)
                    u_lng = loc.get('lng') if isinstance(loc, dict) else getattr(loc, 'lng', None)
                
                if u_lat and u_lng:
                    all_points.append({'lat': float(u_lat), 'lng': float(u_lng)})

        print(f"📍 [Debug] 인식된 총 출발지 수: {len(all_points)}개")

        if len(all_points) < 2:
            base = all_points[0] if all_points else {'lat': 37.5665, 'lng': 126.9780}
            top_3_regions = [{"name": "설정 위치 주변", "lat": base['lat'], "lng": base['lng']}]
        else:
            # 🌟 2개 이상일 때만 중간지점 도출
            top_3_regions = TransportEngine.find_best_midpoints(db, all_points)
            
        return self._format_recommendations(db, top_3_regions, req)

    # ============================================================
    # 3. 자동완성 및 AI 매니저 흐름 (생략 없음)
    # ============================================================

    def search_hotspots(self, query: str) -> List[Dict[str, Any]]:
        if not query: return []
        results = []
        if hasattr(TransportEngine, 'SEOUL_HOTSPOTS'):
            for spot in TransportEngine.SEOUL_HOTSPOTS:
                if query in spot['name']:
                    results.append({
                        "name": spot['name'], "lat": spot['lat'], "lng": spot['lng'], 
                        "lines": spot.get('lines', [])
                    })
        results.sort(key=lambda x: len(x['name']))
        return results[:10]

    def search_places_for_registration(self, db: Session, query: str, lat: Optional[float] = None, lng: Optional[float] = None) -> List[Dict[str, Any]]:
        hotspot_results = self.search_hotspots(query)
        places = data_provider.search_places_all_queries([query], "", 37.5665, 126.9780, db=db)
        place_results = [{"name": p.name, "lat": p.location[0], "lng": p.location[1], "category": p.category} for p in places]
        return (hotspot_results + place_results)[:15]

    async def run_meeting_flow(self, db: Session, req: schemas.MeetingFlowRequest, background_tasks: BackgroundTasks) -> Dict[str, str]:
        background_tasks.add_task(self.process_background_recommendation, req, db)
        return {"status": "success", "message": "AI가 최적의 약속을 찾는 중입니다."}

    async def process_background_recommendation(self, req: schemas.MeetingFlowRequest, db: Session):
        await self._send_system_msg(req.room_id, "🤖 멤버들의 일정을 분석하여 최적의 약속을 도출하고 있습니다...")
        best_slot = self._find_best_time_slot(db, req.room_id)
        
        recommend_req = schemas.RecommendRequest(
            current_lat=req.current_lat, current_lng=req.current_lng, 
            purpose=req.purpose, users=req.users
        )
        recommendations = self.get_recommendations_direct(db, recommend_req)
        
        if recommendations and recommendations[0]['places']:
            place = recommendations[0]['places'][0]
            card_data = {
                "type": "vote_card", "place": place, 
                "date": best_slot["date"], "time": best_slot["time"],
                "recommendation_reason": f"✨ 모든 멤버가 비어있는 시간에 모이기 좋은 {place['name']}입니다.",
                "vote_count": 0
            }
            content = json.dumps(card_data, ensure_ascii=False)
            msg = models.Message(room_id=req.room_id, user_id=0, content=content)
            db.add(msg); db.commit()
            
            await manager.broadcast({
                "id": msg.id, "room_id": msg.room_id, "user_id": 0, "name": "AI 매니저", 
                "avatar": "🤖", "content": msg.content, "timestamp": datetime.now().strftime("%H:%M")
            }, req.room_id)

    async def vote_meeting(self, db: Session, req: schemas.VoteRequest):
        msg = db.query(models.Message).filter(models.Message.id == req.message_id).first()
        if msg:
            data = json.loads(msg.content)
            data["vote_count"] = data.get("vote_count", 0) + 1
            msg.content = json.dumps(data, ensure_ascii=False)
            db.commit()
            await manager.broadcast({
                "id": msg.id, "room_id": req.room_id, "user_id": 0, 
                "content": msg.content, "timestamp": datetime.now().strftime("%H:%M")
            }, req.room_id)
            return {"status": "success", "vote_count": data["vote_count"]}

    async def confirm_meeting(self, db: Session, req: schemas.ConfirmRequest):
        try:
            members = db.query(models.ChatRoomMember).filter(models.ChatRoomMember.room_id == req.room_id).all()
            for m in members:
                db.add(models.Event(
                    id=str(uuid.uuid4()), user_id=m.user_id, title=f"📅 {req.place_name}",
                    date=req.date, time=req.time, duration_hours=1.0, 
                    location_name=req.place_name, purpose=req.category, is_private=True
                ))
            db.commit()
            await self._send_system_msg(req.room_id, f"✅ {req.place_name} 약속 확정! 멤버 전원의 캘린더에 등록되었습니다.")
            return {"status": "success"}
        except Exception as e:
            db.rollback(); raise HTTPException(status_code=500, detail=str(e))

    def get_events(self, db: Session, user_id: int): return self.repo.get_user_events(db, user_id)
    def create_event(self, db: Session, event_data: schemas.EventSchema):
        new_event = models.Event(
            id=str(uuid.uuid4()), user_id=event_data.user_id, title=event_data.title,
            date=event_data.date, time=event_data.time, 
            duration_hours=getattr(event_data, 'duration_hours', 1.0),
            location_name=event_data.location_name, purpose=event_data.purpose, is_private=True
        )
        db.add(new_event); db.commit(); db.refresh(new_event); return new_event

    def delete_event(self, db: Session, user_id: int, event_id: str):
        event = db.query(models.Event).filter(models.Event.id == event_id, models.Event.user_id == user_id).first()
        if not event: raise HTTPException(status_code=404, detail="일정을 찾을 수 없습니다.")
        db.delete(event); db.commit(); return {"status": "success"}