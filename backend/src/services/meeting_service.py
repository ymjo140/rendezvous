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
    # 1. 일정 및 자연어 파싱 로직 (생략 없음)
    # ============================================================

    def _find_best_time_slot(self, db: Session, room_id: str) -> dict:
        """채팅방 멤버들의 일정을 분석하여 빈 저녁 시간대를 반환합니다."""
        members = db.query(models.ChatRoomMember).filter(models.ChatRoomMember.room_id == room_id).all()
        user_ids = [m.user_id for m in members]
        
        if not user_ids:
            return {"date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"), "time": "19:00"}

        today = datetime.now().date()
        for i in range(1, 15): # 내일부터 14일간 탐색
            target_date = today + timedelta(days=i)
            target_str = target_date.strftime("%Y-%m-%d")
            
            existing_events = db.query(models.Event).filter(
                models.Event.user_id.in_(user_ids),
                models.Event.date == target_str
            ).all()
            
            # 저녁 시간대(18~21시) 중복 확인
            is_busy = any(re.search(r"(1[89]|20|21):", str(e.time)) for e in existing_events)
            
            if not is_busy:
                return {"date": target_str, "time": "19:00"}
        
        return {"date": (today + timedelta(days=1)).strftime("%Y-%m-%d"), "time": "19:00"}

    def parse_ai_schedule(self, text_input: str):
        """AI 자연어 파싱을 통해 약속의 시간, 장소를 추출합니다."""
        today = datetime.now()
        parsed = {
            "title": "새 약속",
            "date": (today + timedelta(days=1)).strftime("%Y-%m-%d"),
            "time": "19:00", "location_name": "미정", "purpose": "모임"
        }
        if "오늘" in text_input: parsed["date"] = today.strftime("%Y-%m-%d")
        elif "내일" in text_input: parsed["date"] = (today + timedelta(days=1)).strftime("%Y-%m-%d")
        
        time_match = re.search(r"(\d{1,2})시", text_input)
        if time_match:
            hour = int(time_match.group(1))
            if ("오후" in text_input or "저녁" in text_input) and hour < 12: hour += 12
            parsed["time"] = f"{hour:02d}:00"
            
        loc_match = re.search(r"([가-힣\w]+)(에서| 근처|역)", text_input)
        if loc_match:
            parsed["location_name"] = loc_match.group(1)
            parsed["title"] = f"{parsed['location_name']} 모임"
        return parsed

    async def _send_system_msg(self, room_id: str, text_msg: str):
        """채팅방에 시스템 메시지를 브로드캐스트합니다."""
        try:
            content = json.dumps({"type": "system", "text": text_msg}, ensure_ascii=False)
            await manager.broadcast({
                "room_id": room_id, "user_id": 0, "name": "System", "avatar": "🤖",
                "content": content, "timestamp": datetime.now().strftime("%H:%M")
            }, room_id)
        except: pass

    # ============================================================
    # 2. 🌟 핵심: AI 장소 추천 6단계 플로우
    # ============================================================

    def _format_recommendations(self, db: Session, regions: list, req: schemas.RecommendRequest) -> List[Dict[str, Any]]:
        """
        3~6단계: 도출된 중간 지역의 1km 이내 장소를 DB 선조회하고 개인 취향 가중치를 적용합니다.
        """
        results = []
        user_prefs = req.user_selected_tags or [] # 유저가 선택한 세부 필터 (식사, 분위기 등)

        for r in regions:
            # [3~4단계] DB에서 1km 내 장소 선조회 (wemeet_rating 반영)
            db_query = text("""
                SELECT name, category, lat, lng, address, tags, wemeet_rating
                FROM places 
                WHERE (6371 * acos(cos(radians(:center_lat)) * cos(radians(lat)) * cos(radians(lng) - radians(:center_lng)) + sin(radians(:center_lat)) * sin(radians(lat)))) <= 1.0
                AND (category LIKE :purpose OR name LIKE :purpose)
                LIMIT 30
            """)
            
            db_rows = db.execute(db_query, {
                "center_lat": r['lat'], "center_lng": r['lng'], "purpose": f"%{req.purpose}%"
            }).fetchall()

            # POI 객체로 변환
            place_candidates = []
            for row in db_rows:
                place_candidates.append(POI(
                    id=0, name=row[0], category=row[1], tags=row[5] or [], 
                    location=np.array([row[2], row[3]]), price_level=1, 
                    avg_rating=float(row[6] or 0.0), address=row[4]
                ))

            # 데이터가 5개 미만으로 부족하면 Naver API로 보충 및 자동 저장
            if len(place_candidates) < 5:
                external_places = data_provider.search_places_all_queries(
                    queries=[req.purpose], region_name=r['name'], 
                    center_lat=r['lat'], center_lng=r['lng'], db=db
                )
                for p in external_places:
                    if not any(c.name == p.name for c in place_candidates):
                        place_candidates.append(POI(
                            id=0, name=p.name, category=p.category, tags=p.tags, 
                            location=np.array(p.location), price_level=1, 
                            avg_rating=p.wemeet_rating, address=p.address
                        ))

            # [5단계] 취향 가중치 부여 (AdvancedRecommender)
            if place_candidates:
                recommender = AdvancedRecommender(place_candidates)
                # 다수 유저 혹은 현재 유저의 취향 모델 기반 추천
                ranked_pois = recommender.recommend(
                    user_prefs_list=[{"tag_weights": {}, "foods": user_prefs, "vibes": user_prefs}], 
                    purpose=req.purpose, top_k=5
                )

                # [6단계] 결과 구성
                formatted = []
                for p in ranked_pois:
                    formatted.append({
                        "name": p.name, "address": p.address, "category": p.category,
                        "lat": float(p.location[0]), "lng": float(p.location[1]),
                        "wemeet_rating": p.avg_rating, "tags": p.tags
                    })
                
                results.append({
                    "region_name": r["name"], 
                    "center": {"lat": r["lat"], "lng": r["lng"]}, 
                    "places": formatted
                })

        return results

    def get_recommendations_direct(self, db: Session, req: schemas.RecommendRequest) -> List[Dict[str, Any]]:
        all_points = []
        
        # 1. 첫 번째 출발지 (current)
        if req.current_lat and req.current_lng and abs(req.current_lat) > 1.0:
            all_points.append({'lat': float(req.current_lat), 'lng': float(req.current_lng)})
        
        # 2. 추가 출발지들 (users) - 여기서 데이터가 증발하지 않도록 강력하게 파싱
        if req.users:
            for u in req.users:
                u_lat, u_lng = None, None
                
                # Case A: u가 Pydantic 모델인 경우
                if hasattr(u, 'location') and u.location:
                    u_lat, u_lng = u.location.lat, u.location.lng
                # Case B: u가 딕셔너리인 경우 (프론트에서 JSON으로 보냄)
                elif isinstance(u, dict):
                    loc = u.get('location', {})
                    if loc:
                        u_lat, u_lng = loc.get('lat'), loc.get('lng')
                    else:
                        # 혹시 location 없이 바로 lat, lng가 있는 경우
                        u_lat, u_lng = u.get('lat'), u.get('lng')
                
                if u_lat and u_lng:
                    all_points.append({'lat': float(u_lat), 'lng': float(u_lng)})

        print(f"📍 [Debug] 인식된 총 출발지 수: {len(all_points)}개") # 🌟 이제 2개 이상 나올 것임

        if len(all_points) < 2:
            # 출발지가 1개면 중간지점 계산 불가 -> 해당 위치 주변 검색
            base_lat, base_lng = (all_points[0]['lat'], all_points[0]['lng']) if all_points else (37.5665, 126.9780)
            top_3_regions = [{"name": "설정 위치 주변", "lat": base_lat, "lng": base_lng}]
        else:
            # 🌟 [핵심] 2개 이상일 때만 TransportEngine으로 중간지점 계산
            top_3_regions = TransportEngine.find_best_midpoints(db, all_points)
            
        return self._format_recommendations(db, top_3_regions, req)

    # 🌟 [필수] _format_recommendations 함수 (AttributeError 방지용)
    def _format_recommendations(self, db: Session, regions: list, req: schemas.RecommendRequest) -> List[Dict[str, Any]]:
        results = []
        user_prefs = req.user_selected_tags or [] 
        for r in regions:
            # DB 조회 (wemeet_rating 사용)
            db_query = text("""
                SELECT name, category, lat, lng, address, tags, wemeet_rating
                FROM places 
                WHERE (6371 * acos(cos(radians(:lat)) * cos(radians(lat)) * cos(radians(lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(lat)))) <= 1.0
                AND (category LIKE :purp OR name LIKE :purp) LIMIT 30
            """)
            db_rows = db.execute(db_query, {"lat": r['lat'], "lng": r['lng'], "purp": f"%{req.purpose}%"}).fetchall()
            place_candidates = [POI(0, row[0], row[1], row[5] or [], np.array([row[2], row[3]]), 1, float(row[6] or 0.0), row[4]) for row in db_rows]

            # API 보충
            if len(place_candidates) < 5:
                ext = data_provider.search_places_all_queries([req.purpose], r['name'], r['lat'], r['lng'], db=db)
                for p in ext:
                    if not any(c.name == p.name for c in place_candidates):
                        place_candidates.append(POI(0, p.name, p.category, p.tags, np.array(p.location), 1, p.wemeet_rating, p.address))

            # 취향 가중치 랭킹
            if place_candidates:
                recommender = AdvancedRecommender(place_candidates)
                ranked = recommender.recommend([{"tag_weights": {}, "foods": user_prefs, "vibes": user_prefs}], req.purpose, top_k=5)
                results.append({
                    "region_name": r["name"], "center": {"lat": r["lat"], "lng": r["lng"]}, 
                    "places": [{"name": p.name, "address": p.address, "category": p.category, "lat": float(p.location[0]), "lng": float(p.location[1]), "wemeet_rating": p.avg_rating} for p in ranked]
                })
        return results

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