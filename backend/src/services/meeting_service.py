import json
import asyncio
import re
import uuid
import numpy as np
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

    # ============================================================
    # 🌟 1. AI 장소 추천 로직 (핵심 수정됨)
    # ============================================================
    def _format_recommendations(self, db: Session, regions: list, req: schemas.RecommendRequest) -> List[Dict[str, Any]]:
        results = []
        user_prefs = req.user_selected_tags or [] 
        
        # 1. 카테고리 영문/한글 매핑
        category_map = {
            "식사": "restaurant",
            "카페": "cafe",
            "술": "bar",
            "술/회식": "bar"
        }
        db_category = category_map.get(req.purpose, req.purpose)

        # 2. 검색어 확장
        search_queries = [req.purpose] + user_prefs

        for r in regions:
            # 🌟 [Fix] tags 컬럼을 TEXT로 변환(CAST)하여 LIKE 검색 가능하게 수정
            db_query = text("""
                SELECT name, category, lat, lng, address, tags, wemeet_rating
                FROM places 
                WHERE (6371 * acos(cos(radians(:lat)) * cos(radians(lat)) * cos(radians(lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(lat)))) <= 2.0
                AND (
                    category LIKE :kor_purpose 
                    OR category LIKE :eng_purpose 
                    OR name LIKE :kor_purpose
                    OR CAST(tags AS TEXT) LIKE :tag_query
                )
                ORDER BY wemeet_rating DESC
                LIMIT 30
            """)
            
            # 태그 검색어 설정
            tag_search = f"%{user_prefs[0]}%" if user_prefs else f"%{req.purpose}%"

            try:
                db_rows = db.execute(db_query, {
                    "lat": r['lat'], 
                    "lng": r['lng'], 
                    "kor_purpose": f"%{req.purpose}%", 
                    "eng_purpose": f"%{db_category}%",
                    "tag_query": tag_search
                }).fetchall()
            except Exception as e:
                print(f"⚠️ DB Search Error: {e}")
                db_rows = []

            place_candidates = []
            for row in db_rows:
                # DB의 tags는 JSON 형식이므로 파싱 시도
                try:
                    # row[5]가 이미 dict/list라면 그대로, 문자열이면 loads
                    loaded_tags = row[5] if isinstance(row[5], (list, dict)) else json.loads(row[5])
                except:
                    loaded_tags = []

                place_candidates.append(POI(
                    id=0, name=row[0], category=row[1], tags=loaded_tags, 
                    location=np.array([row[2], row[3]]), price_level=1, 
                    avg_rating=float(row[6] or 0.0), address=row[4]
                ))

            # [데이터 부족 시 API 보충]
            if len(place_candidates) < 5:
                # search_queries 전체를 넘겨서 다양하게 검색
                ext = data_provider.search_places_all_queries(search_queries, r['name'], r['lat'], r['lng'], db=db)
                for p in ext:
                    if not any(c.name == p.name for c in place_candidates):
                        place_candidates.append(POI(
                            id=0, name=p.name, category=p.category, tags=p.tags, 
                            location=np.array(p.location), price_level=1, 
                            avg_rating=p.wemeet_rating, address=p.address
                        ))

            # [취향 가중치 랭킹 및 결과 반환]
            if place_candidates:
                recommender = AdvancedRecommender(place_candidates)
                ranked = recommender.recommend([{"tag_weights": {}, "foods": user_prefs, "vibes": user_prefs}], req.purpose, top_k=5)
                
                results.append({
                    "region_name": r["name"], 
                    "center": {"lat": r["lat"], "lng": r["lng"]}, 
                    "places": [{"name": p.name, "address": p.address, "category": p.category, "lat": float(p.location[0]), "lng": float(p.location[1]), "wemeet_rating": p.avg_rating} for p in ranked]
                })
        return results

    def get_recommendations_direct(self, db: Session, req: schemas.RecommendRequest) -> List[Dict[str, Any]]:
        """(1-2단계) n개의 출발지를 인식하고 중간 지점을 도출합니다."""
        all_points = []
        
        # 1. 내 위치 (current)
        if req.current_lat and req.current_lng and abs(req.current_lat) > 1.0:
            all_points.append({'lat': float(req.current_lat), 'lng': float(req.current_lng)})
        
        # 2. 추가 장소들 (users) - Pydantic 모델과 Dict 타입 모두 안전하게 처리
        if req.users:
            for u in req.users:
                u_lat, u_lng = None, None
                
                # Case A: Pydantic 모델
                if hasattr(u, 'location') and u.location:
                    if hasattr(u.location, 'lat'):
                        u_lat, u_lng = u.location.lat, u.location.lng
                    elif isinstance(u.location, dict):
                        u_lat, u_lng = u.location.get('lat'), u.location.get('lng')
                # Case B: Dict
                elif isinstance(u, dict):
                    loc = u.get('location')
                    if loc:
                        if isinstance(loc, dict):
                            u_lat, u_lng = loc.get('lat'), loc.get('lng')
                        else:
                            u_lat, u_lng = getattr(loc, 'lat', None), getattr(loc, 'lng', None)
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
            # (2단계) 중간지점 도출 (TransportEngine)
            top_3_regions = TransportEngine.find_best_midpoints(db, all_points)
            
        return self._format_recommendations(db, top_3_regions, req)

    # ============================================================
    # 2. 자동완성 및 검색 (기존 로직 유지)
    # ============================================================
    def search_hotspots(self, query: str) -> List[Dict[str, Any]]:
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

    # ============================================================
    # 3. AI 흐름 및 일정 관리 (BackgroundTasks 사용)
    # ============================================================
    async def run_meeting_flow(self, db: Session, req: schemas.MeetingFlowRequest, background_tasks: BackgroundTasks) -> Dict[str, str]:
        background_tasks.add_task(self.process_background_recommendation, req, db)
        return {"status": "success", "message": "AI 분석을 시작합니다."}

    async def process_background_recommendation(self, req: schemas.MeetingFlowRequest, db: Session):
        await self._send_system_msg(req.room_id, "🤖 최적의 약속 장소와 시간을 분석 중입니다...")
        slot = self._find_best_time_slot(db, req.room_id)
        
        recommend_req = schemas.RecommendRequest(
            current_lat=req.current_lat, current_lng=req.current_lng, 
            purpose=req.purpose, users=req.users
        )
        recommendations = self.get_recommendations_direct(db, recommend_req)
        
        if recommendations and recommendations[0]['places']:
            place = recommendations[0]['places'][0]
            card_data = {
                "type": "vote_card", "place": place, 
                "date": slot["date"], "time": slot["time"], 
                "recommendation_reason": "✨ AI가 찾은 최적의 제안입니다!", 
                "vote_count": 0
            }
            content = json.dumps(card_data, ensure_ascii=False)
            msg = models.Message(room_id=req.room_id, user_id=0, content=content)
            db.add(msg); db.commit()
            
            await manager.broadcast({
                "id": msg.id, "room_id": msg.room_id, "user_id": 0, 
                "name": "AI 매니저", "content": msg.content, 
                "timestamp": datetime.now().strftime("%H:%M")
            }, req.room_id)

    def _find_best_time_slot(self, db: Session, room_id: str) -> dict:
        members = db.query(models.ChatRoomMember).filter(models.ChatRoomMember.room_id == room_id).all()
        u_ids = [m.user_id for m in members]
        if not u_ids: return {"date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"), "time": "19:00"}
        today = datetime.now().date()
        for i in range(1, 15):
            t_date = today + timedelta(days=i); t_str = t_date.strftime("%Y-%m-%d")
            evts = db.query(models.Event).filter(models.Event.user_id.in_(u_ids), models.Event.date == t_str).all()
            if not any(e.time and re.search(r"(1[89]|20|21):", e.time) for e in evts): return {"date": t_str, "time": "19:00"}
        return {"date": (today + timedelta(days=1)).strftime("%Y-%m-%d"), "time": "19:00"}

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
            await self._send_system_msg(req.room_id, f"✅ {req.place_name} 약속이 확정되었습니다!")
            return {"status": "success"}
        except Exception as e:
            db.rollback(); raise HTTPException(status_code=500, detail=str(e))

    async def _send_system_msg(self, room_id: str, text: str):
        content = json.dumps({"type": "system", "text": text}, ensure_ascii=False)
        await manager.broadcast({
            "room_id": room_id, "user_id": 0, "name": "System", 
            "content": content, "timestamp": datetime.now().strftime("%H:%M")
        }, room_id)

    # ============================================================
    # 4. 일정 CRUD (생략 없음)
    # ============================================================
    def get_events(self, db: Session, user_id: int): 
        return self.repo.get_user_events(db, user_id)
        
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