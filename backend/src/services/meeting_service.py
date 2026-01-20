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
    # ?뙚 1. AI ?μ냼 異붿쿇 濡쒖쭅 (?듭떖 ?섏젙??
    # ============================================================
    def _format_recommendations(self, db: Session, regions: list, req: schemas.RecommendRequest) -> List[Dict[str, Any]]:
        results = []
        raw_prefs = req.user_selected_tags or []
        purpose = (req.purpose or "").strip()

        # Normalize and dedupe tags to expand matching coverage.
        user_prefs = []
        seen = set()
        for t in raw_prefs:
            if not t:
                continue
            t = str(t).strip()
            if not t or t in seen:
                continue
            seen.add(t)
            user_prefs.append(t)

        search_terms = []
        seen_terms = set()
        for t in [purpose] + user_prefs:
            if not t or t in seen_terms:
                continue
            seen_terms.add(t)
            search_terms.append(t)

        main_category_map = {
            "meal": ["RESTAURANT", "FOOD"],
            "cafe": ["CAFE"],
            "drink": ["PUB"],
            "pub": ["PUB"],
            "bar": ["PUB"],
        }
        main_category_terms = main_category_map.get(purpose, [])

        search_queries = search_terms

        for r in regions:
            params = {
                "lat": r["lat"],
                "lng": r["lng"],
            }
            filter_clauses = []

            for idx, term in enumerate(main_category_terms):
                key = f"main_category_{idx}"
                filter_clauses.append(f"main_category = :{key}")
                params[key] = term

            if purpose:
                params["purpose_like"] = f"%{purpose}%"
                filter_clauses.append("(category ILIKE :purpose_like OR cuisine_type ILIKE :purpose_like OR name ILIKE :purpose_like)")

            term_clauses = []
            for idx, term in enumerate(search_terms):
                key = f"term_{idx}"
                params[key] = f"%{term}%"
                term_clauses.extend([
                    f"tags::text ILIKE :{key}",
                    f"vibe_tags::text ILIKE :{key}",
                    f"category ILIKE :{key}",
                    f"cuisine_type ILIKE :{key}",
                    f"name ILIKE :{key}",
                ])

            if term_clauses:
                filter_clauses.append("(" + " OR ".join(term_clauses) + ")")

            filter_sql = " OR ".join(filter_clauses) if filter_clauses else "1=1"

            db_query = text(f"""
                SELECT id, name, category, lat, lng, address, tags, wemeet_rating
                FROM places
                WHERE (6371 * acos(cos(radians(:lat)) * cos(radians(lat)) * cos(radians(lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(lat)))) <= 2.0
                AND ({filter_sql})
                ORDER BY wemeet_rating DESC
                LIMIT 30
            """)

            try:
                db_rows = db.execute(db_query, params).fetchall()
            except Exception as e:
                print(f"[Error] DB search failed: {e}")
                db_rows = []

            if not db_rows:
                print(f"[Debug] DB candidates empty for {r['name']}")

            place_candidates = []
            for row in db_rows:
                try:
                    loaded_tags = row[6] if isinstance(row[6], (list, dict)) else json.loads(row[6])
                except:
                    loaded_tags = []

                place_candidates.append(POI(
                    id=int(row[0]), name=row[1], category=row[2], tags=loaded_tags,
                    location=np.array([row[3], row[4]]), price_level=1,
                    avg_rating=float(row[7] or 0.0), address=row[5]
                ))

            if search_queries and len(place_candidates) < 5:
                ext = data_provider.search_places_all_queries(search_queries, r["name"], r["lat"], r["lng"], db=db)
                for p in ext:
                    if not any(c.name == p.name for c in place_candidates):
                        place_candidates.append(POI(
                            id=0, name=p.name, category=p.category, tags=p.tags,
                            location=np.array(p.location), price_level=1,
                            avg_rating=p.wemeet_rating, address=p.address
                        ))

            if place_candidates:
                recommender = AdvancedRecommender(place_candidates)
                ranked = recommender.recommend([{"tag_weights": {}, "foods": user_prefs, "vibes": user_prefs}], purpose, top_k=5)

                results.append({
                    "region_name": r["name"],
                    "center": {"lat": r["lat"], "lng": r["lng"]},
                    "travel_times": r.get("travel_times", []),
                    "places": [{
                        "id": p.id,
                        "name": p.name,
                        "address": p.address,
                        "category": p.category,
                        "lat": float(p.location[0]),
                        "lng": float(p.location[1]),
                        "wemeet_rating": p.avg_rating
                    } for p in ranked]
                })
        return results

    def get_recommendations_direct(self, db: Session, req: schemas.RecommendRequest) -> List[Dict[str, Any]]:
        """(1-2?④퀎) n媛쒖쓽 異쒕컻吏瑜??몄떇?섍퀬 以묎컙 吏?먯쓣 ?꾩텧?⑸땲??"""
        all_points = []
        
        # 1. ???꾩튂 (current)
        if req.current_lat and req.current_lng and abs(req.current_lat) > 1.0:
            all_points.append({'lat': float(req.current_lat), 'lng': float(req.current_lng)})
        
        # 2. 異붽? ?μ냼??(users) - Pydantic 紐⑤뜽怨?Dict ???紐⑤몢 ?덉쟾?섍쾶 泥섎━
        if req.users:
            for u in req.users:
                u_lat, u_lng = None, None
                
                # Case A: Pydantic 紐⑤뜽
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

        print(f"?뱧 [Debug] ?몄떇??珥?異쒕컻吏 ?? {len(all_points)}媛?)

        if len(all_points) < 2:
            base_lat = all_points[0]['lat'] if all_points else 37.5665
            base_lng = all_points[0]['lng'] if all_points else 126.9780
            top_3_regions = [{"name": "?ㅼ젙 ?꾩튂 二쇰?", "lat": base_lat, "lng": base_lng}]
        else:
            # (2?④퀎) 以묎컙吏???꾩텧 (TransportEngine)
            top_3_regions = TransportEngine.find_best_midpoints(db, all_points)
            
        return self._format_recommendations(db, top_3_regions, req)

    # ============================================================
    # 2. ?먮룞?꾩꽦 諛?寃??(湲곗〈 濡쒖쭅 ?좎?)
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
    # 3. AI ?먮쫫 諛??쇱젙 愿由?(BackgroundTasks ?ъ슜)
    # ============================================================
    async def run_meeting_flow(self, db: Session, req: schemas.MeetingFlowRequest, background_tasks: BackgroundTasks) -> Dict[str, str]:
        background_tasks.add_task(self.process_background_recommendation, req, db)
        return {"status": "success", "message": "AI 遺꾩꽍???쒖옉?⑸땲??"}

    async def process_background_recommendation(self, req: schemas.MeetingFlowRequest, db: Session):
        await self._send_system_msg(req.room_id, "?쨼 理쒖쟻???쎌냽 ?μ냼? ?쒓컙??遺꾩꽍 以묒엯?덈떎...")
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
                "recommendation_reason": "??AI媛 李얠? 理쒖쟻???쒖븞?낅땲??", 
                "vote_count": 0
            }
            content = json.dumps(card_data, ensure_ascii=False)
            msg = models.Message(room_id=req.room_id, user_id=0, content=content)
            db.add(msg); db.commit()
            
            await manager.broadcast({
                "id": msg.id, "room_id": msg.room_id, "user_id": 0, 
                "name": "AI 留ㅻ땲?", "content": msg.content, 
                "timestamp": datetime.now().strftime("%H:%M")
            }, req.room_id)

    def _find_best_time_slot(self, db: Session, room_id: str) -> dict:
        members = db.query(models.ChatRoomMember).filter(models.ChatRoomMember.room_id == room_id).all()
        u_ids = [m.user_id for m in members]
        fallback_time = (datetime.now() + timedelta(hours=1)).strftime("%H:%M")
        if not u_ids:
            return {"date": (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d"), "time": fallback_time}
        today = datetime.now().date()
        for i in range(1, 15):
            t_date = today + timedelta(days=i); t_str = t_date.strftime("%Y-%m-%d")
            evts = db.query(models.Event).filter(models.Event.user_id.in_(u_ids), models.Event.date == t_str).all()
            if not any(e.time and re.search(r"(1[89]|20|21):", e.time) for e in evts):
                return {"date": t_str, "time": fallback_time}
        return {"date": (today + timedelta(days=1)).strftime("%Y-%m-%d"), "time": fallback_time}

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
                    id=str(uuid.uuid4()), user_id=m.user_id, title=f"?뱟 {req.place_name}",
                    date=req.date, time=req.time, duration_hours=1.0, 
                    location_name=req.place_name, purpose=req.category, is_private=True
                ))
            db.commit()
            await self._send_system_msg(req.room_id, f"??{req.place_name} ?쎌냽???뺤젙?섏뿀?듬땲??")
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
    # 4. ?쇱젙 CRUD (?앸왂 ?놁쓬)
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
        if not event: raise HTTPException(status_code=404, detail="?쇱젙??李얠쓣 ???놁뒿?덈떎.")
        db.delete(event); db.commit(); return {"status": "success"}

