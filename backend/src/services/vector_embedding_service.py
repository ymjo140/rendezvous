# -*- coding: utf-8 -*-
"""
Vector Embedding Service (Optimized)
- Google Gemini Embedding API or Korean SBERT model
- N+1 query optimization with batch loading
- Error handling with safe defaults
- Async-friendly design
"""

import os
import numpy as np
from typing import List, Dict, Optional, Tuple
from datetime import datetime
from sqlalchemy import text as sql_text
from sqlalchemy.orm import Session

# Environment variables
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY") or os.getenv("GOOGLE_API_KEY")
USE_GEMINI = bool(GEMINI_API_KEY)

# Korean SBERT model (local)
_sbert_model = None

def get_sbert_model():
    """Load Korean SBERT model (Lazy Loading)"""
    global _sbert_model
    if _sbert_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            _sbert_model = SentenceTransformer('jhgan/ko-sbert-nli')
            print("[OK] Korean SBERT model loaded")
        except ImportError:
            print("[WARN] sentence-transformers not installed")
            return None
        except Exception as e:
            print(f"[WARN] SBERT model load failed: {e}")
            return None
    return _sbert_model


class VectorEmbeddingService:
    """Vector embedding generation and management service"""
    
    EMBEDDING_DIM = 768
    # 저장 임베딩(배치)과 반드시 동일해야 함: 모델/task_type/차원이 다르면 유사도가 무의미.
    EMBEDDING_MODEL = "models/gemini-embedding-001"
    DEFAULT_SCORE = 0.5
    
    def __init__(self):
        self.use_gemini = USE_GEMINI
        self.gemini_model = None
        
        if self.use_gemini:
            try:
                import google.generativeai as genai
                genai.configure(api_key=GEMINI_API_KEY)
                self.gemini_model = genai
                print("[OK] Gemini Embedding API ready")
            except ImportError:
                self.use_gemini = False
                print("[WARN] google-generativeai not installed, using local SBERT")
            except Exception as e:
                self.use_gemini = False
                print(f"[WARN] Gemini setup failed: {e}")
    
    def generate_embedding(self, text: str) -> List[float]:
        """Convert text to embedding vector with error handling"""
        try:
            if not text or not text.strip():
                return [0.0] * self.EMBEDDING_DIM
            
            text = text.strip()[:500]
            
            if self.use_gemini and self.gemini_model:
                return self._gemini_embedding(text)
            else:
                return self._sbert_embedding(text)
        except Exception as e:
            print(f"[ERROR] generate_embedding failed: {e}")
            return [0.0] * self.EMBEDDING_DIM
    
    def _gemini_embedding(self, text: str) -> List[float]:
        """Use Google Gemini Embedding API (gemini-embedding-001, 768차원 절단)"""
        try:
            result = self.gemini_model.embed_content(
                model=self.EMBEDDING_MODEL,
                content=text,
                task_type="SEMANTIC_SIMILARITY",
                output_dimensionality=self.EMBEDDING_DIM,
            )
            embedding = result['embedding']

            if len(embedding) > self.EMBEDDING_DIM:
                return embedding[:self.EMBEDDING_DIM]
            elif len(embedding) < self.EMBEDDING_DIM:
                return embedding + [0.0] * (self.EMBEDDING_DIM - len(embedding))
            return embedding
        except Exception as e:
            print(f"[WARN] Gemini embedding error: {e}, falling back to SBERT")
            return self._sbert_embedding(text)
    
    def _sbert_embedding(self, text: str) -> List[float]:
        """Use Korean SBERT model"""
        try:
            model = get_sbert_model()
            if model is None:
                return [0.0] * self.EMBEDDING_DIM
            
            embedding = model.encode(text, convert_to_numpy=True)
            return embedding.tolist()
        except Exception as e:
            print(f"[ERROR] SBERT embedding error: {e}")
            return [0.0] * self.EMBEDDING_DIM
    
    def generate_place_text(self, place: Dict) -> str:
        """장소 정보를 임베딩용 텍스트로 변환.

        분위기/맥락 검색("조용한", "노트북 하기 좋은", "데이트")의 품질은
        여기서 얼마나 풍부한 신호를 넣느냐로 결정된다. 카테고리 계층 +
        지역 + 가격대 + 분위기/목적 태그 + 시설을 모두 포함한다.
        """
        def _as_list(v):
            if isinstance(v, list):
                return [str(x).strip() for x in v if str(x).strip()]
            if isinstance(v, str) and v.strip():
                return [v.strip()]
            return []

        try:
            parts = []

            # 1) 카테고리 계층 (대분류 > 음식장르 > 원본)
            for key in ("main_category", "cuisine_type", "category"):
                if place.get(key):
                    parts.append(str(place[key]))

            # 2) 이름
            if place.get("name"):
                parts.append(str(place["name"]))

            # 3) 지역 (주소 앞부분: 시/구/동 수준)
            if place.get("address"):
                region = " ".join(str(place["address"]).split()[:3])
                if region:
                    parts.append(region)

            # 4) 가격대
            if place.get("price_range"):
                parts.append(str(place["price_range"]))

            # 5) 분위기/목적/검색 태그 (핵심 신호)
            parts += _as_list(place.get("vibe_tags"))
            parts += _as_list(place.get("tags"))
            parts += _as_list(place.get("search_keywords"))

            # 6) 시설 (features 중 True 인 것만: parking, wifi, private_room ...)
            feats = place.get("features")
            if isinstance(feats, dict):
                parts += [str(k) for k, val in feats.items() if val is True]

            # 순서 유지하며 중복 제거
            seen, result = set(), []
            for p in parts:
                p = p.strip()
                if p and p not in seen:
                    seen.add(p)
                    result.append(p)

            return " | ".join(result) if result else "place"
        except Exception as e:
            print(f"[ERROR] generate_place_text failed: {e}")
            return "place"
    
    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity with error handling"""
        try:
            if not vec1 or not vec2:
                return 0.0
            
            vec1 = np.array(vec1)
            vec2 = np.array(vec2)
            
            dot_product = np.dot(vec1, vec2)
            norm1 = np.linalg.norm(vec1)
            norm2 = np.linalg.norm(vec2)
            
            if norm1 == 0 or norm2 == 0:
                return 0.0
            
            return float(dot_product / (norm1 * norm2))
        except Exception as e:
            print(f"[ERROR] cosine_similarity failed: {e}")
            return 0.0
    
    # ========================================
    # Preference seed (온보딩 취향 → 임베딩)
    # ========================================

    def preferences_to_text(self, preferences: Dict) -> str:
        """유저 취향(JSON)을 place_text와 같은 어휘로 변환 → 같은 벡터공간에 안착.

        장소 임베딩 텍스트(generate_place_text)와 동일 토큰(음식/분위기/가격대)을 써야
        코사인 유사도가 의미를 가진다. 싫어하는 음식은 시드에서 제외.
        """
        if not isinstance(preferences, dict):
            return ""
        parts: List[str] = []

        def _extend(key: str):
            v = preferences.get(key)
            if isinstance(v, list):
                parts.extend(str(x).strip() for x in v if str(x).strip())
            elif isinstance(v, str) and v.strip():
                parts.append(v.strip())

        _extend("foods")
        _extend("vibes")
        _extend("alcohol")
        _extend("conditions")

        spend = preferences.get("avg_spend")
        try:
            spend = float(spend) if spend is not None else 0.0
        except (TypeError, ValueError):
            spend = 0.0
        if spend >= 50000:
            parts.append("하이엔드 고급")
        elif spend >= 30000:
            parts.append("미디엄 가격대")
        elif spend > 0:
            parts.append("가성비")

        seen, result = set(), []
        for p in parts:
            p = p.strip()
            if p and p not in seen:
                seen.add(p)
                result.append(p)
        return " | ".join(result)

    def _preference_terms(self, preferences: Dict) -> List[str]:
        """preferences에서 매칭용 취향 토큰(음식/분위기/주류/조건) 추출."""
        if not isinstance(preferences, dict):
            return []
        terms = []
        for key in ("foods", "vibes", "alcohol", "conditions"):
            v = preferences.get(key)
            if isinstance(v, list):
                terms += [str(x).strip() for x in v if str(x).strip()]
            elif isinstance(v, str) and v.strip():
                terms.append(v.strip())
        # dedupe preserve order
        seen, out = set(), []
        for t in terms:
            if t not in seen:
                seen.add(t)
                out.append(t)
        return out

    def seed_vector_from_preferences(self, db: Session, preferences: Dict) -> Optional[List[float]]:
        """취향에 맞는 장소들의 '저장된 임베딩 평균'으로 시드 벡터 생성 (Gemini 불필요).

        장소 벡터(12만건 적재완료)와 동일 공간이라 코사인 검색이 바로 의미를 가진다.
        Gemini 임베딩 호출/크레딧이 필요 없다.
        """
        terms = self._preference_terms(preferences)
        if not terms:
            return None
        try:
            from domain.models import PlaceEmbedding

            # 1) 취향 토큰과 매칭되는 장소 id (category/cuisine/tags/vibe_tags ILIKE)
            term_clauses, params = [], {}
            for i, t in enumerate(terms[:8]):
                params[f"t{i}"] = f"%{t}%"
                term_clauses += [
                    f"category ILIKE :t{i}",
                    f"cuisine_type ILIKE :t{i}",
                    f"tags::text ILIKE :t{i}",
                    f"vibe_tags::text ILIKE :t{i}",
                ]
            sql = sql_text(
                f"SELECT id FROM places WHERE ({' OR '.join(term_clauses)}) LIMIT 150"
            )
            ids = [r[0] for r in db.execute(sql, params).fetchall()]
            if not ids:
                return None

            # 2) 매칭 장소들의 저장 임베딩 평균
            rows = (
                db.query(PlaceEmbedding.embedding)
                .filter(PlaceEmbedding.place_id.in_(ids), PlaceEmbedding.embedding.isnot(None))
                .limit(100)
                .all()
            )
            vecs = [np.asarray(r[0], dtype=float) for r in rows if r[0] is not None]
            if not vecs:
                return None

            seed = np.mean(vecs, axis=0)
            norm = np.linalg.norm(seed)
            return (seed / norm).tolist() if norm else seed.tolist()
        except Exception as e:
            print(f"[ERROR] seed_vector_from_preferences failed: {e}")
            return None

    def seed_user_embedding_from_preferences(self, db: Session, user_id: int, preferences: Dict) -> bool:
        """온보딩/취향수정/리뷰 시 호출. 취향→매칭장소 벡터평균으로 UserEmbedding 시드/블렌드.

        - 기존 임베딩이 없으면(=신규/콜드) 시드를 그대로 저장 → 첫 추천부터 개인화.
        - 행동기반 임베딩이 이미 있으면(action_count>0) 명시 취향을 0.5 가중으로 블렌드.
        Gemini 불필요(저장된 장소 벡터 평균). 예외는 삼켜 메인 플로우를 깨지 않음.
        """
        try:
            from domain.models import UserEmbedding

            seed = self.seed_vector_from_preferences(db, preferences)
            if not seed or not any(seed):  # 매칭 장소 없음 → 시드 스킵(cold-start)
                return False

            existing = db.query(UserEmbedding).filter(UserEmbedding.user_id == user_id).first()
            if existing is None:
                db.add(UserEmbedding(
                    user_id=user_id,
                    preference_embedding=seed,
                    recent_embedding=seed,
                    action_count=0,
                    last_action_at=None,
                ))
            elif existing.action_count and existing.preference_embedding is not None:
                prev = np.asarray(existing.preference_embedding, dtype=float)
                s = np.asarray(seed, dtype=float)
                blended = 0.5 * prev + 0.5 * s
                norm = np.linalg.norm(blended)
                existing.preference_embedding = (blended / norm).tolist() if norm else seed
                existing.updated_at = datetime.now()
            else:
                # 임베딩 행은 있으나 행동이 없음(순수 시드 상태) → 최신 취향으로 갱신
                existing.preference_embedding = seed
                existing.updated_at = datetime.now()

            db.commit()
            return True
        except Exception as e:
            print(f"[ERROR] seed_user_embedding_from_preferences failed: {e}")
            db.rollback()
            return False

    # ========================================
    # Database integration methods (Optimized)
    # ========================================

    def embed_place(self, db: Session, place_id: int, place_data: Dict) -> bool:
        """Generate and save place embedding"""
        try:
            from domain.models import PlaceEmbedding
            
            source_text = self.generate_place_text(place_data)
            embedding = self.generate_embedding(source_text)
            
            existing = db.query(PlaceEmbedding).filter(
                PlaceEmbedding.place_id == place_id
            ).first()
            
            if existing:
                existing.embedding = embedding
                existing.source_text = source_text
                existing.updated_at = datetime.now()
            else:
                new_embedding = PlaceEmbedding(
                    place_id=place_id,
                    embedding=embedding,
                    source_text=source_text
                )
                db.add(new_embedding)
            
            db.commit()
            return True
        except Exception as e:
            print(f"[ERROR] Place embedding save error: {e}")
            db.rollback()
            return False
    
    def embed_all_places(self, db: Session) -> int:
        """Generate embeddings for all places"""
        from domain.models import Place
        
        try:
            places = db.query(Place).all()
            success_count = 0
            
            for place in places:
                place_data = {
                    "name": place.name,
                    "category": place.category,
                    "address": place.address,
                    "tags": place.tags or []
                }
                
                if self.embed_place(db, place.id, place_data):
                    success_count += 1
                    print(f"[OK] Embedding created: {place.name}")
                else:
                    print(f"[FAIL] Embedding failed: {place.name}")
            
            return success_count
        except Exception as e:
            print(f"[ERROR] embed_all_places failed: {e}")
            return 0
    
    def update_user_embedding(self, db: Session, user_id: int) -> bool:
        """Update user embedding based on actions (Optimized N+1)"""
        try:
            from domain.models import UserEmbedding, UserInteractionLog, PlaceEmbedding
            
            # Get recent actions
            recent_actions = db.query(UserInteractionLog).filter(
                UserInteractionLog.user_id == user_id,
                UserInteractionLog.place_id.isnot(None)
            ).order_by(UserInteractionLog.created_at.desc()).limit(50).all()
            
            if not recent_actions:
                return False
            
            # Batch load place embeddings (N+1 optimization)
            place_ids = list(set(a.place_id for a in recent_actions if a.place_id))
            place_embeddings = db.query(PlaceEmbedding).filter(
                PlaceEmbedding.place_id.in_(place_ids)
            ).all()
            
            # Create lookup dict
            pe_dict = {pe.place_id: pe for pe in place_embeddings}
            
            # Action weights
            action_weights = {
                "LIKE": 3.0, "SAVE": 2.5, "SHARE": 2.0,
                "CLICK": 1.5, "VIEW": 1.0, "DISMISS": -1.0,
                "REVIEW": 4.0, "DWELL": 1.5
            }
            
            # Calculate weighted average
            weighted_sum = np.zeros(self.EMBEDDING_DIM)
            total_weight = 0.0
            
            for action in recent_actions:
                pe = pe_dict.get(action.place_id)
                if pe is not None and pe.embedding is not None:
                    weight = action_weights.get(action.action_type, 1.0)
                    vec = np.array(pe.embedding)
                    weighted_sum += vec * weight
                    total_weight += abs(weight)
            
            if total_weight == 0:
                return False

            behavior_vec = weighted_sum / total_weight

            # 기존 임베딩(온보딩 시드/이전 학습 포함)과 EMA 블렌드 → 명시 취향이 한번에 사라지지 않음.
            existing_pref = db.query(UserEmbedding).filter(
                UserEmbedding.user_id == user_id
            ).first()
            if existing_pref is not None and existing_pref.preference_embedding is not None:
                prev = np.asarray(existing_pref.preference_embedding, dtype=float)
                blended = 0.7 * behavior_vec + 0.3 * prev
            else:
                blended = behavior_vec
            norm = np.linalg.norm(blended)
            preference_embedding = (blended / norm).tolist() if norm else behavior_vec.tolist()

            # Recent embedding from last 10 actions
            recent_sum = np.zeros(self.EMBEDDING_DIM)
            recent_count = 0
            
            for action in recent_actions[:10]:
                pe = pe_dict.get(action.place_id)
                if pe is not None and pe.embedding is not None:
                    recent_sum += np.array(pe.embedding)
                    recent_count += 1
            
            recent_embedding = (recent_sum / max(recent_count, 1)).tolist()
            
            # Save
            existing = db.query(UserEmbedding).filter(
                UserEmbedding.user_id == user_id
            ).first()
            
            if existing:
                existing.preference_embedding = preference_embedding
                existing.recent_embedding = recent_embedding
                existing.action_count = len(recent_actions)
                existing.last_action_at = recent_actions[0].created_at
                existing.updated_at = datetime.now()
            else:
                new_embedding = UserEmbedding(
                    user_id=user_id,
                    preference_embedding=preference_embedding,
                    recent_embedding=recent_embedding,
                    action_count=len(recent_actions),
                    last_action_at=recent_actions[0].created_at
                )
                db.add(new_embedding)
            
            db.commit()
            return True
        except Exception as e:
            print(f"[ERROR] User embedding update error: {e}")
            db.rollback()
            return False
    
    def get_similar_places(
        self, 
        db: Session, 
        query_embedding: List[float], 
        limit: int = 10,
        exclude_place_ids: List[int] = None
    ) -> List[Tuple[int, float]]:
        """pgvector 코사인 거리(<=>)로 유사 장소 검색.

        기존엔 모든 임베딩을 메모리로 올려 파이썬 루프로 계산했으나(전체 테이블
        스캔), 이제 DB에서 <=> 연산자로 정렬·상위 N개만 가져온다(인덱스 활용).
        """
        try:
            from domain.models import PlaceEmbedding

            distance = PlaceEmbedding.embedding.cosine_distance(query_embedding)
            q = (
                db.query(PlaceEmbedding.place_id, distance.label("distance"))
                .filter(PlaceEmbedding.embedding.isnot(None))
            )
            if exclude_place_ids:
                q = q.filter(~PlaceEmbedding.place_id.in_(list(exclude_place_ids)))

            rows = q.order_by(distance).limit(limit).all()
            # similarity = 1 - cosine_distance
            return [(pid, 1.0 - float(dist)) for pid, dist in rows]
        except Exception as e:
            print(f"[ERROR] get_similar_places failed: {e}")
            return []
    
    def get_recommendations_for_user(
        self, 
        db: Session, 
        user_id: int, 
        limit: int = 10,
        context: Dict = None
    ) -> List[Dict]:
        """Get personalized recommendations (Optimized with N+1 fix)"""
        try:
            from domain.models import UserEmbedding, Place, PlaceEmbedding
            from core.ml_engine import get_ml_scorer, ColdStartHandler
            
            # Get user embedding
            user_embedding = db.query(UserEmbedding).filter(
                UserEmbedding.user_id == user_id
            ).first()
            
            # Cold start handling
            if user_embedding is None or user_embedding.preference_embedding is None:
                return ColdStartHandler.get_cold_start_recommendations(
                    db, context=context, limit=limit
                )

            # Search similar places (벡터를 list로 변환해 pgvector에 전달)
            pref_vec = np.asarray(user_embedding.preference_embedding, dtype=float).tolist()
            similar = self.get_similar_places(
                db,
                pref_vec,
                limit=limit * 2  # Get more for re-ranking
            )
            
            if not similar:
                return ColdStartHandler.get_cold_start_recommendations(
                    db, context=context, limit=limit
                )
            
            # Batch load places (N+1 optimization)
            place_ids = [p[0] for p in similar]
            places = db.query(Place).filter(Place.id.in_(place_ids)).all()
            place_dict = {p.id: p for p in places}
            
            # Score and rank with ML
            scorer = get_ml_scorer()
            results = []
            
            for place_id, similarity in similar:
                place = place_dict.get(place_id)
                if not place:
                    continue
                
                # Combine vector similarity with ML scoring
                features = {
                    "category": place.category or "",
                    "tags": place.tags or [],
                    "rating": place.wemeet_rating or 0,
                    "review_count": place.review_count or 0
                }
                
                ml_score, reason = scorer.score_place(features, context=context)
                
                # Hybrid score: 70% vector similarity + 30% ML score
                final_score = similarity * 0.7 + ml_score * 0.3
                
                results.append({
                    "place_id": place.id,
                    "name": place.name,
                    "category": place.category,
                    "address": place.address,
                    "similarity_score": round(final_score, 4),
                    "reason": reason,
                    "tags": place.tags or [],
                    "rating": place.wemeet_rating
                })
            
            # Sort by final score
            results.sort(key=lambda x: x["similarity_score"], reverse=True)
            return results[:limit]
            
        except Exception as e:
            print(f"[ERROR] get_recommendations_for_user failed: {e}")
            # Fallback to cold start
            try:
                from core.ml_engine import ColdStartHandler
                return ColdStartHandler.get_cold_start_recommendations(
                    db, context=context, limit=limit
                )
            except:
                return []

    def get_group_recommendations(
        self,
        db: Session,
        user_ids: List[int],
        limit: int = 10,
        context: Dict = None,
    ) -> Dict:
        """그룹 취향 합성 추천 (Group Vector AI).

        멤버 개인 취향 벡터를 평균(Average)해 후보를 뽑고, 후보별 멤버 최소
        만족도(Least Misery)로 재랭킹해 '아무도 싫어하지 않는' 곳을 우선한다.
        멤버 누구든 블랙리스트한 장소는 제외.
        """
        from domain.models import UserEmbedding, User, Place, PlaceEmbedding
        from core.ml_engine import ColdStartHandler

        def _cold(members_with_taste: int, algo: str = "group_cold_start") -> Dict:
            return {
                "algorithm": algo,
                "members_total": len(user_ids),
                "members_with_taste": members_with_taste,
                "recommendations": ColdStartHandler.get_cold_start_recommendations(
                    db, context=context, limit=limit
                ),
            }

        try:
            # 1) 멤버 개인 벡터 수집
            embeddings = (
                db.query(UserEmbedding)
                .filter(UserEmbedding.user_id.in_(user_ids))
                .all()
            )
            member_vecs = [
                np.asarray(e.preference_embedding, dtype=float)
                for e in embeddings
                if e.preference_embedding is not None
            ]
            members_with_taste = len(member_vecs)

            # 취향 데이터가 없으면 cold start(인기)로
            if members_with_taste == 0:
                return _cold(0)

            # 2) 평균 벡터로 후보 추출
            group_vec = np.mean(member_vecs, axis=0)
            candidates = self.get_similar_places(db, group_vec.tolist(), limit=limit * 3)
            if not candidates:
                return _cold(members_with_taste)

            cand_ids = [c[0] for c in candidates]

            # 3) 후보 임베딩 + 장소 정보 배치 로드
            pes = (
                db.query(PlaceEmbedding)
                .filter(PlaceEmbedding.place_id.in_(cand_ids))
                .all()
            )
            pe_map = {
                pe.place_id: np.asarray(pe.embedding, dtype=float)
                for pe in pes
                if pe.embedding is not None
            }
            places = db.query(Place).filter(Place.id.in_(cand_ids)).all()
            place_map = {p.id: p for p in places}

            # 4) 멤버 블랙리스트 합집합 (누구든 싫어하면 제외)
            users = db.query(User).filter(User.id.in_(user_ids)).all()
            blacklist = set()
            for u in users:
                for pid in (u.blacklisted_place_ids or []):
                    blacklist.add(pid)

            # 5) 그룹 점수 = 평균 만족 0.6 + 최소 만족(Least Misery) 0.4
            results = []
            for pid, _avg in candidates:
                if pid in blacklist:
                    continue
                pv = pe_map.get(pid)
                place = place_map.get(pid)
                if pv is None or place is None:
                    continue
                sims = [self.cosine_similarity(mv.tolist(), pv.tolist()) for mv in member_vecs]
                min_sim = min(sims)
                mean_sim = sum(sims) / len(sims)
                group_score = 0.6 * mean_sim + 0.4 * min_sim

                # 사람이 읽기 좋은 그룹 추천 이유(최소 만족도 기준)
                if min_sim >= 0.6:
                    reason = "모두의 취향에 딱 맞아요"
                elif min_sim >= 0.45:
                    reason = "다 같이 만족할 만한 곳이에요"
                else:
                    reason = f"{members_with_taste}명이 함께 가기 좋아요"

                results.append({
                    "place_id": place.id,
                    "name": place.name,
                    "category": place.category,
                    "address": place.address,
                    "group_score": round(group_score, 4),
                    "min_member_score": round(min_sim, 4),
                    "reason": reason,
                    "tags": place.tags or [],
                    "rating": place.wemeet_rating,
                })

            results.sort(key=lambda x: x["group_score"], reverse=True)
            return {
                "algorithm": "group_vector_least_misery",
                "members_total": len(user_ids),
                "members_with_taste": members_with_taste,
                "recommendations": results[:limit],
            }
        except Exception as e:
            print(f"[ERROR] get_group_recommendations failed: {e}")
            try:
                return _cold(0, algo="group_fallback")
            except Exception:
                return {
                    "algorithm": "group_error",
                    "members_total": len(user_ids),
                    "members_with_taste": 0,
                    "recommendations": [],
                }


# Singleton instance
_embedding_service = None

def get_embedding_service() -> VectorEmbeddingService:
    """Get embedding service singleton"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = VectorEmbeddingService()
    return _embedding_service
