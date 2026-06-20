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
    @staticmethod
    def _cosine(a, b) -> float:
        try:
            a = np.asarray(a, dtype=float)
            b = np.asarray(b, dtype=float)
            na = np.linalg.norm(a)
            nb = np.linalg.norm(b)
            if na == 0 or nb == 0:
                return 0.0
            return float(np.dot(a, b) / (na * nb))
        except Exception:
            return 0.0

    @staticmethod
    def _build_reason(poi, sim: float, pref_tags: list, session_tags: list, purpose: str = "") -> str:
        """추천 근거 한 줄(규칙 기반, Gemini 불필요).
        장기취향/세션태그가 장소 태그·카테고리와 겹치면 그걸로, 없으면 벡터 유사도로."""
        cand = set(t for t in (getattr(poi, "tags", None) or []) if t)
        cat = getattr(poi, "category", None)
        if cat:
            cand.add(str(cat))
        matched = []
        for t in list(pref_tags or []) + list(session_tags or []):
            if t and t in cand and t not in matched:
                matched.append(t)
        matched = matched[:2]
        # 지리추천 후보는 항상 중간지점 반경 내 → '중간지점 근처'를 기본 설명 요소로 결합(설명가능성↑)
        if matched:
            suffix = "취향과 잘 맞아요" if pref_tags else "조건에 맞아요"
            return f"중간지점 근처 · {' · '.join(matched)} {suffix}"
        if sim >= 0.6:
            return "중간지점 근처 · 내 취향과 잘 맞는 분위기예요"
        if sim >= 0.45:
            return "중간지점 근처 · 취향에 맞을 만한 곳이에요"
        if purpose:
            return f"중간지점 근처 · {purpose} 추천"
        return "중간지점에서 가까운 곳이에요"

    def _load_user_vector(self, db: Session, uid: int):
        """유저의 블렌드 취향 벡터(장기 0.7 + 최근 0.3) 로드. 없으면 None."""
        try:
            ue = db.query(models.UserEmbedding).filter(
                models.UserEmbedding.user_id == uid
            ).first()
            if ue is None or ue.preference_embedding is None:
                return None
            pref = np.asarray(ue.preference_embedding, dtype=float)
            if ue.recent_embedding is not None:
                recent = np.asarray(ue.recent_embedding, dtype=float)
                blended = 0.7 * pref + 0.3 * recent
                norm = np.linalg.norm(blended)
                return (blended / norm) if norm else pref
            return pref
        except Exception as e:
            print(f"[Debug] _load_user_vector({uid}) skipped: {e}")
            return None

    @staticmethod
    def _group_reason(poi, min_sim: float, mean_sim: float, n_members: int, session_tags: list) -> str:
        """그룹 추천 이유 — 최소 만족도(least-misery) 기반 + 중간지점 결합."""
        cand = set(t for t in (getattr(poi, "tags", None) or []) if t)
        cat = getattr(poi, "category", None)
        if cat:
            cand.add(str(cat))
        matched = [t for t in (session_tags or []) if t and t in cand][:1]
        tag_part = f" · {matched[0]}" if matched else ""
        if min_sim >= 0.6:
            return f"중간지점 근처{tag_part} · 우리 모두의 취향에 딱 맞아요"
        if min_sim >= 0.45:
            return f"중간지점 근처{tag_part} · 다 같이 만족할 만한 곳이에요"
        return f"중간지점 근처{tag_part} · {n_members}명이 함께 가기 좋아요"

    def _group_rerank(self, db: Session, candidates: list, member_vecs: list, session_tags: list, top_k: int = 15) -> list:
        """멤버 벡터들로 그룹 재랭킹(least-misery). (POI, 이유) 페어 반환.
        그룹점수 = 0.65*(0.6*평균유사 + 0.4*최소유사) + 0.35*세션태그매칭.
        '아무도 싫어하지 않는' 곳을 우선해 모임 전체 만족을 높인다."""
        from domain.models import PlaceEmbedding

        ids = [c.id for c in candidates if getattr(c, "id", 0)]
        pe_map = {}
        if ids:
            try:
                rows = db.query(PlaceEmbedding.place_id, PlaceEmbedding.embedding).filter(
                    PlaceEmbedding.place_id.in_(ids),
                    PlaceEmbedding.embedding.isnot(None),
                ).all()
                pe_map = {pid: np.asarray(emb, dtype=float) for pid, emb in rows}
            except Exception as e:
                print(f"[Debug] group place embedding load skipped: {e}")

        tagset = set(t for t in (session_tags or []) if t)
        n = len(member_vecs)
        scored = []
        for c in candidates:
            emb = pe_map.get(getattr(c, "id", 0))
            if emb is not None:
                sims = [max(0.0, self._cosine(mv, emb)) for mv in member_vecs]
                min_sim = min(sims)
                mean_sim = sum(sims) / len(sims)
            else:
                min_sim = mean_sim = 0.0
            group_vec_score = 0.6 * mean_sim + 0.4 * min_sim
            tag_hits = sum(1 for t in (getattr(c, "tags", None) or []) if t in tagset)
            tag_score = min(tag_hits / 3.0, 1.0) if tagset else 0.0
            final = 0.65 * group_vec_score + 0.35 * tag_score
            scored.append((final, min_sim, mean_sim, c))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            (c, self._group_reason(c, min_sim, mean_sim, n, session_tags))
            for _s, min_sim, mean_sim, c in scored[:top_k]
        ]

    def _lookalike_social_proof(self, db: Session, member_vecs: list, member_ids: list, place_ids: list,
                                top_k_users: int = 25, sim_threshold: float = 0.5) -> dict:
        """유사 취향 그룹의 '좋아한 곳' 사회적 증거.
        그룹 벡터와 취향이 비슷한 다른 유저(lookalike)를 찾아, 그들이 실제로
        관여(리뷰/저장/예약/게시물)한 장소를 집계 → {place_id: {count, names}}.
        Q2 '비슷한 목적/특성의 집단은 어딜 좋아했나'의 답."""
        if not member_vecs or not place_ids:
            return {}
        try:
            group_vec = np.mean(member_vecs, axis=0)
            others = (
                db.query(models.UserEmbedding)
                .filter(~models.UserEmbedding.user_id.in_(member_ids))
                .all()
            )
            sims = []
            for ue in others:
                if ue.preference_embedding is None:
                    continue
                s = self._cosine(group_vec, np.asarray(ue.preference_embedding, dtype=float))
                if s >= sim_threshold:
                    sims.append((ue.user_id, s))
            sims.sort(key=lambda x: x[1], reverse=True)
            look_ids = [uid for uid, _ in sims[:top_k_users]]
            if not look_ids:
                return {}

            valid_pids = [int(p) for p in place_ids if p]
            if not valid_pids:
                return {}

            # 관여 신호 통합(리뷰/저장/예약/게시물). 테이블 없거나 컬럼 차이는 개별 try.
            place_users = {}  # pid -> set(user_id)
            sources = [
                "SELECT place_id, user_id FROM reviews WHERE user_id = ANY(:uids) AND place_id = ANY(:pids)",
                "SELECT place_id, user_id FROM saved_items WHERE user_id = ANY(:uids) AND place_id = ANY(:pids)",
                "SELECT place_id, user_id FROM user_reservations WHERE user_id = ANY(:uids) AND place_id = ANY(:pids)",
                "SELECT place_id, user_id FROM posts WHERE user_id = ANY(:uids) AND place_id = ANY(:pids)",
            ]
            params = {"uids": look_ids, "pids": valid_pids}
            for sql in sources:
                try:
                    for pid, uid in db.execute(text(sql), params).fetchall():
                        if pid is None or uid is None:
                            continue
                        place_users.setdefault(int(pid), set()).add(int(uid))
                except Exception as exc:
                    print(f"[social-proof] source skip: {str(exc)[:60]}")
                    db.rollback()

            if not place_users:
                return {}

            # 이름 매핑
            all_uids = set()
            for s in place_users.values():
                all_uids |= s
            name_map = {
                u.id: u.name
                for u in db.query(models.User).filter(models.User.id.in_(list(all_uids))).all()
            }
            out = {}
            for pid, uids in place_users.items():
                names = [name_map.get(uid, "사용자") for uid in list(uids)[:3]]
                out[pid] = {"count": len(uids), "names": names}
            return out
        except Exception as e:
            print(f"[social-proof] 실패: {e}")
            return {}

    def _personalized_rerank(self, db: Session, candidates: list, user_vec, session_tags: list, pref_tags: list, top_k: int = 15) -> list:
        """후보(POI)를 개인 취향 벡터로 재랭킹하고 (POI, 추천이유) 페어를 반환.
        점수 = 0.65*벡터유사도(장기취향) + 0.35*세션태그매칭(현재의도).
        임베딩 없는 후보(외부/id=0)는 벡터 0으로 처리되어 태그매칭만 반영."""
        from domain.models import PlaceEmbedding

        ids = [c.id for c in candidates if getattr(c, "id", 0)]
        pe_map = {}
        if ids:
            try:
                rows = db.query(PlaceEmbedding.place_id, PlaceEmbedding.embedding).filter(
                    PlaceEmbedding.place_id.in_(ids),
                    PlaceEmbedding.embedding.isnot(None),
                ).all()
                pe_map = {pid: emb for pid, emb in rows}
            except Exception as e:
                print(f"[Debug] place embedding batch load skipped: {e}")

        tagset = set(t for t in (session_tags or []) if t)

        scored = []
        for c in candidates:
            emb = pe_map.get(getattr(c, "id", 0))
            v_sim = max(0.0, self._cosine(user_vec, emb)) if emb is not None else 0.0
            tag_hits = sum(1 for t in (getattr(c, "tags", None) or []) if t in tagset)
            tag_score = min(tag_hits / 3.0, 1.0) if tagset else 0.0
            scored.append((0.65 * v_sim + 0.35 * tag_score, v_sim, c))

        scored.sort(key=lambda x: x[0], reverse=True)
        return [
            (c, self._build_reason(c, v_sim, pref_tags, session_tags))
            for _s, v_sim, c in scored[:top_k]
        ]

    def _format_recommendations(self, db: Session, regions: list, req: schemas.RecommendRequest, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
        results = []
        raw_prefs = req.user_selected_tags or []
        purpose = (req.purpose or "").strip()

        # 로그인 유저의 개인 취향 벡터(있으면 후보를 코사인 유사도로 재랭킹)
        # 장기취향(preference) 0.7 + 최근관심(recent) 0.3 블렌드 → '요즘 끌리는' 반영
        user_vec = self._load_user_vector(db, user_id) if user_id else None

        # 그룹 모드: 요청자 + 멤버(친구) user_id들의 벡터를 모아 least-misery 재랭킹.
        # 2명 이상이 취향 벡터를 가질 때만 그룹 추천으로 전환(아니면 개인/지리 폴백).
        member_ids = []
        if user_id:
            member_ids.append(int(user_id))
        for mid in (getattr(req, "member_user_ids", None) or []):
            try:
                iv = int(mid)
            except (TypeError, ValueError):
                continue
            if iv not in member_ids:
                member_ids.append(iv)
        member_vecs = []
        for mid in member_ids:
            mv = user_vec if (mid == user_id and user_vec is not None) else self._load_user_vector(db, mid)
            if mv is not None:
                member_vecs.append(mv)
        is_group = len(member_vecs) >= 2

        # 장기 취향 태그(추천 이유 생성용): foods/vibes/alcohol
        pref_tags = []
        if user_id:
            try:
                u = db.query(models.User).filter(models.User.id == user_id).first()
                if u is not None and isinstance(u.preferences, dict):
                    for k in ("foods", "vibes", "alcohol"):
                        v = u.preferences.get(k)
                        if isinstance(v, list):
                            pref_tags += [str(x).strip() for x in v if str(x).strip()]
            except Exception as e:
                print(f"[Debug] user preferences load skipped: {e}")

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
            "식사": ["RESTAURANT", "FOOD"],
            "카페": ["CAFE"],
            "술": ["PUB"],
            "술집": ["PUB"],
            "주점": ["PUB"],
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

            social_proof = {}
            if place_candidates:
                if is_group:
                    # 그룹 취향 합성 재랭킹(least-misery) — 모임 전체 만족 우선
                    ranked_pairs = self._group_rerank(db, place_candidates, member_vecs, user_prefs, top_k=15)
                    # 유사 취향 그룹의 사회적 증거(비슷한 사람들이 좋아한 곳)
                    cand_ids = [p.id for p, _ in ranked_pairs if getattr(p, "id", 0)]
                    social_proof = self._lookalike_social_proof(db, member_vecs, member_ids, cand_ids)
                elif user_vec is not None:
                    # 개인 취향 벡터 재랭킹: 장기취향(벡터) + 현재의도(선택태그) 결합
                    ranked_pairs = self._personalized_rerank(db, place_candidates, user_vec, user_prefs, pref_tags, top_k=15)
                else:
                    recommender = AdvancedRecommender(place_candidates)
                    # 프론트에서 추천순/평점순/거리순 재정렬할 수 있도록 넉넉히 반환
                    ranked = recommender.recommend([{"tag_weights": {}, "foods": user_prefs, "vibes": user_prefs}], purpose, top_k=15)
                    ranked_pairs = [(p, self._build_reason(p, 0.0, [], user_prefs, purpose)) for p in ranked]

                results.append({
                    "region_name": r["name"],
                    "center": {"lat": r["lat"], "lng": r["lng"]},
                    "travel_times": r.get("travel_times", []),
                    "personalized": (is_group or user_vec is not None),
                    "group_mode": is_group,
                    "group_size": len(member_vecs) if is_group else 0,
                    "places": [{
                        "id": p.id,
                        "name": p.name,
                        "address": p.address,
                        "category": p.category,
                        "lat": float(p.location[0]),
                        "lng": float(p.location[1]),
                        "wemeet_rating": p.avg_rating,
                        "reason": reason,
                        # 유사 취향 그룹 사회적 증거(있을 때만)
                        "social_proof": social_proof.get(p.id),
                    } for p, reason in ranked_pairs]
                })
        return results

    def get_recommendations_direct(self, db: Session, req: schemas.RecommendRequest, user_id: Optional[int] = None) -> List[Dict[str, Any]]:
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

        print(f"[Debug] 인식된 총 출발지 수: {len(all_points)}개")

        if len(all_points) < 2:
            base_lat = all_points[0]['lat'] if all_points else 37.5665
            base_lng = all_points[0]['lng'] if all_points else 126.9780
            top_3_regions = [{"name": "내 주변", "lat": base_lat, "lng": base_lng}]
        else:
            # (2?④퀎) 以묎컙吏???꾩텧 (TransportEngine)
            top_3_regions = TransportEngine.find_best_midpoints(db, all_points)
            
        return self._format_recommendations(db, top_3_regions, req, user_id=user_id)

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

