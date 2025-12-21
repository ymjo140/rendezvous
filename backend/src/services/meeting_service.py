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

# 외부 의존성 및 Mock 처리
try:
    from ..core.data_provider import RealDataProvider
    from ..core.connection_manager import manager
    try:
        from ..core.transport import TransportEngine
    except ImportError:
        import math
        class TransportEngine:
            @staticmethod
            def _haversine(lat1, lon1, lat2, lon2):
                R = 6371
                dLat = math.radians(lat2 - lat1)
                dLon = math.radians(lon2 - lon1)
                a = math.sin(dLat/2) * math.sin(dLat/2) + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) * math.sin(dLon/2)
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
                return R * c * 1000
            @staticmethod
            def find_best_midpoint(locs): return None

except ImportError:
    class RealDataProvider:
        def __init__(self, *args): pass
        def search_places_all_queries(self, *args): return []
        def search_places(self, *args, **kwargs): return []
        def get_coordinates(self, q): return 0.0, 0.0
    class MockManager:
        async def broadcast(self, m, r): pass
    manager = MockManager()

# 🌟 [수정] 인자 없이 생성 (Data Provider 내부에서 settings 참조)
data_provider = RealDataProvider()

class MeetingService:
    def __init__(self):
        self.repo = MeetingRepository()

    def _find_best_time_slot(self, db: Session, member_ids: List[int]) -> str:
        today = datetime.now().date()
        for i in range(14):
            target = today + timedelta(days=i)
            d_str = str(target)
            if not member_ids: return f"{d_str} 19:00"
            
            events = self.repo.get_events_by_date_and_users(db, member_ids, d_str)
            conflict = False
            for e in events:
                try:
                    h = int(e.time.split(":")[0])
                    if 18 <= h <= 21: conflict = True
                except: pass
            if not conflict: return f"{d_str} 19:00"
        return f"{today + timedelta(days=1)} 19:00"

    async def _send_system_msg(self, room_id: str, text: str):
        try:
            content = json.dumps({"type": "system", "text": text}, ensure_ascii=False)
            await manager.broadcast({
                "room_id": room_id, "user_id": 0, "name": "System", "avatar": "🤖",
                "content": content, "timestamp": datetime.now().strftime("%H:%M")
            }, room_id)
        except: pass

    def get_recommendations_direct(self, db: Session, req: schemas.RecommendRequest):
        # 1. 중심 위치 설정
        c_lat, c_lng = req.current_lat, req.current_lng
        if req.manual_locations:
            try:
                parts = req.manual_locations[0].split(',')
                c_lat, c_lng = float(parts[0]), float(parts[1])
            except: pass

        # 2. DB 검색
        places = self.repo.search_places_in_range(db, c_lat, c_lng, req.purpose)

        # 3. 외부 API 검색 (데이터 부족 시)
        if len(places) < 5:
            search_query = f"{req.location_name or '주변'} {req.purpose}"
            if req.user_selected_tags:
                search_query += f" {req.user_selected_tags[0]}"
            
            # 메서드 존재 여부 확인 후 호출
            if hasattr(data_provider, 'search_places'):
                external_places = data_provider.search_places(search_query, display=10)
            else:
                external_places = data_provider.search_places_all_queries([search_query], "", c_lat, c_lng)
            
            for p in external_places:
                if not self.repo.get_place_by_name(db, p.name):
                    try:
                        p_lat = p.location[0] if isinstance(p.location, (list, tuple)) else p.location
                        p_lng = p.location[1] if isinstance(p.location, (list, tuple)) else 0.0
                        self.repo.create_place(
                            db, p.name, p.category or req.purpose, 
                            p_lat, p_lng, 
                            p.tags, 0.0
                        )
                    except: continue
            
            try: db.commit()
            except: db.rollback()
            places = self.repo.search_places_in_range(db, c_lat, c_lng, req.purpose)

        # 4. 점수 산정
        scored = []
        for p in places:
            score = (p.wemeet_rating or 0) * 10
            dist = TransportEngine._haversine(c_lat, c_lng, p.lat, p.lng)
            if dist < 500: score += 20
            elif dist < 1000: score += 10
            elif dist > 3000: score -= 20
            
            if p.tags and req.user_selected_tags:
                p_tags = p.tags if isinstance(p.tags, list) else []
                matched = len(set(p_tags) & set(req.user_selected_tags))
                score += matched * 15
            scored.append((score, p))
        
        scored.sort(key=lambda x: x[0], reverse=True)
        top_places = [item[1] for item in scored[:5]]

        # 5. 포맷 변환
        result = []
        for place in top_places:
            result.append({
                "place_id": place.id,
                "name": place.name,
                "category": place.category,
                "address": place.address or "",
                "lat": place.lat,
                "lng": place.lng,
                "tags": place.tags or [],
                "image": None,
                "score": 0.0
            })
        return result

    async def process_background_recommendation(self, req: schemas.MeetingFlowRequest, db: Session):
        try:
            await self._send_system_msg(req.room_id, "🤖 멤버들의 위치와 일정을 분석 중입니다...")
            
            room_members = self.repo.get_room_members(db, req.room_id)
            member_ids = [m.user_id for m in room_members]
            members = self.repo.get_users_by_ids(db, member_ids)
            
            c_lat, c_lng = None, None
            location_desc = ""

            if req.manual_locations:
                c_lat, c_lng = req.current_lat, req.current_lng
                location_desc = "입력하신 위치"
            elif members:
                valid_users = [u for u in members if u.lat and abs(u.lat) > 1.0]
                if not valid_users:
                     c_lat, c_lng = 37.5665, 126.9780
                     location_desc = "서울 시청"
                elif len(valid_users) == 1:
                    c_lat, c_lng = valid_users[0].lat, valid_users[0].lng
                    location_desc = f"{valid_users[0].name}님의 위치"
                else:
                    user_locs = [{"lat": u.lat, "lng": u.lng} for u in valid_users]
                    best_spot = TransportEngine.find_best_midpoint(user_locs)
                    if best_spot:
                        c_lat, c_lng = best_spot['lat'], best_spot['lng']
                        location_desc = f"{len(valid_users)}명의 중간({best_spot['name']})"
                    else:
                        lats = [u.lat for u in valid_users]
                        lngs = [u.lng for u in valid_users]
                        c_lat, c_lng = sum(lats)/len(lats), sum(lngs)/len(lngs)
                        location_desc = f"{len(valid_users)}명의 중간 지점"

            if c_lat is None or c_lat == 0.0:
                 c_lat, c_lng = 37.5665, 126.9780
                 location_desc = "서울 시청 (기본)"

            await self._send_system_msg(req.room_id, f"📍 {location_desc} 기준 '{req.purpose}' 추천 중...")

            best_time_str = self._find_best_time_slot(db, member_ids)
            places = self.repo.search_places_in_range(db, c_lat, c_lng, req.purpose)

            if len(places) < 3:
                search_queries = [f"{req.purpose} 맛집"]
                if req.conditions.tags: search_queries += [f"{t} 맛집" for t in req.conditions.tags]
                
                api_pois = data_provider.search_places_all_queries(search_queries, "검색", c_lat, c_lng)
                for p in api_pois:
                    if not self.repo.get_place_by_name(db, p.name):
                        try:
                            p_lat = p.location[0] if isinstance(p.location, (list, tuple)) else p.location
                            p_lng = p.location[1] if isinstance(p.location, (list, tuple)) else 0.0
                            self.repo.create_place(db, p.name, p.category or "식사", p_lat, p_lng, p.tags, p.avg_rating)
                        except: continue
                try: db.commit()
                except: db.rollback()
                places = self.repo.search_places_in_range(db, c_lat, c_lng, req.purpose)

            scored = []
            for p in places:
                score = (p.wemeet_rating or 0) * 5
                if p.tags: 
                    p_tags = p.tags if isinstance(p.tags, list) else []
                    score += len(set(p_tags) & set(req.conditions.tags)) * 10
                scored.append((score, p))
            scored.sort(key=lambda x: x[0], reverse=True)
            
            best_place = scored[0][1] if scored else None
            
            if best_place:
                place_data = { "name": best_place.name, "category": best_place.category, "tags": best_place.tags }
                content = json.dumps({
                    "type": "vote_card",
                    "place": place_data,
                    "date": best_time_str.split(" ")[0],
                    "time": best_time_str.split(" ")[1],
                    "recommendation_reason": f"✨ {location_desc} 기준 추천 장소",
                    "vote_count": 0
                }, ensure_ascii=False)
                
                msg = self.repo.create_system_message(db, req.room_id, content)
                await manager.broadcast({
                    "id": msg.id, "room_id": msg.room_id, "user_id": 1, "name": "AI 매니저", "avatar": "🤖",
                    "content": msg.content, "timestamp": str(msg.timestamp)
                }, req.room_id)
            else:
                await self._send_system_msg(req.room_id, "⚠️ 적절한 추천 장소를 찾지 못했습니다.")

        except Exception as e:
            print(f"Background Error: {e}")
            await self._send_system_msg(req.room_id, "⚠️ 오류가 발생했습니다.")

    async def run_meeting_flow(self, db: Session, req: schemas.MeetingFlowRequest, background_tasks: BackgroundTasks):
        if req.room_id:
            background_tasks.add_task(self.process_background_recommendation, req, db)
            return {"status": "accepted"}
        return {"cards": [], "recommendations": []}

    async def vote_meeting(self, db: Session, req: schemas.VoteRequest):
        msg = self.repo.get_message_by_id(db, req.message_id)
        if msg:
            data = json.loads(msg.content)
            data["vote_count"] = data.get("vote_count", 0) + 1
            msg.content = json.dumps(data, ensure_ascii=False)
            db.commit()
            await manager.broadcast({ 
                "id": msg.id, "room_id": msg.room_id, "user_id": msg.user_id, 
                "content": msg.content, "timestamp": str(msg.timestamp), 
                "name": "AI 매니저", "avatar": "🤖" 
            }, req.room_id)
        return {"status": "success"}

    async def confirm_meeting(self, db: Session, req: schemas.ConfirmRequest):
        room_members = self.repo.get_room_members(db, req.room_id)
        count = 0
        for m in room_members:
            event = schemas.EventSchema(
                user_id=m.user_id,
                title=f"📅 {req.place_name}",
                date=req.date,
                time=req.time,
                location_name=req.place_name,
                purpose=req.category
            )
            self.repo.create_event(db, event)
            count += 1
        db.commit()
        
        text = f"✅ {req.place_name} 약속 확정! ({count}명 캘린더 등록)"
        msg = self.repo.create_system_message(db, req.room_id, json.dumps({"text": text}, ensure_ascii=False))
        
        await manager.broadcast({ 
            "id": msg.id, "room_id": msg.room_id, "user_id": 1, 
            "name": "AI 매니저", "avatar": "🤖", "content": msg.content, 
            "timestamp": str(msg.timestamp) 
        }, req.room_id)
        return {"status": "success"}

    def create_event(self, db: Session, event: schemas.EventSchema):
        db_ev = self.repo.create_event(db, event)
        db.commit()
        db.refresh(db_ev)
        return db_ev

    def get_events(self, db: Session, user_id: int):
        return self.repo.get_user_events(db, user_id)

    def delete_event(self, db: Session, event_id: str):
        self.repo.delete_event(db, event_id)
        db.commit()