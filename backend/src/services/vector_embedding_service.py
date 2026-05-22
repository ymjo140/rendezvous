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
                if pe and pe.embedding:
                    weight = action_weights.get(action.action_type, 1.0)
                    vec = np.array(pe.embedding)
                    weighted_sum += vec * weight
                    total_weight += abs(weight)
            
            if total_weight == 0:
                return False
            
            preference_embedding = (weighted_sum / total_weight).tolist()
            
            # Recent embedding from last 10 actions
            recent_sum = np.zeros(self.EMBEDDING_DIM)
            recent_count = 0
            
            for action in recent_actions[:10]:
                pe = pe_dict.get(action.place_id)
                if pe and pe.embedding:
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
            if not user_embedding or not user_embedding.preference_embedding:
                return ColdStartHandler.get_cold_start_recommendations(
                    db, context=context, limit=limit
                )
            
            # Search similar places
            similar = self.get_similar_places(
                db, 
                user_embedding.preference_embedding, 
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


# Singleton instance
_embedding_service = None

def get_embedding_service() -> VectorEmbeddingService:
    """Get embedding service singleton"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = VectorEmbeddingService()
    return _embedding_service
