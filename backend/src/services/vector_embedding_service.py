"""
🤖 벡터 임베딩 서비스
- OpenAI Embedding API 또는 한국어 SBERT 모델 사용
- 장소/유저 텍스트를 벡터로 변환
- 벡터 유사도 기반 추천
"""

import os
import json
import numpy as np
from typing import List, Dict, Optional, Tuple
from datetime import datetime
from sqlalchemy.orm import Session
from sqlalchemy import text

# 환경 변수
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
USE_OPENAI = bool(OPENAI_API_KEY)

# 한국어 SBERT 모델 (로컬 실행 시)
_sbert_model = None

def get_sbert_model():
    """한국어 SBERT 모델 로드 (Lazy Loading)"""
    global _sbert_model
    if _sbert_model is None:
        try:
            from sentence_transformers import SentenceTransformer
            # 한국어에 최적화된 모델
            _sbert_model = SentenceTransformer('jhgan/ko-sbert-nli')
            print("✅ 한국어 SBERT 모델 로드 완료")
        except ImportError:
            print("⚠️ sentence-transformers 미설치. pip install sentence-transformers")
            return None
        except Exception as e:
            print(f"⚠️ SBERT 모델 로드 실패: {e}")
            return None
    return _sbert_model


class VectorEmbeddingService:
    """벡터 임베딩 생성 및 관리 서비스"""
    
    EMBEDDING_DIM = 768  # ko-sbert-nli 차원
    
    def __init__(self):
        self.use_openai = USE_OPENAI
        if self.use_openai:
            try:
                import openai
                openai.api_key = OPENAI_API_KEY
                self.openai = openai
                print("✅ OpenAI Embedding API 사용")
            except ImportError:
                self.use_openai = False
                print("⚠️ openai 패키지 미설치, 로컬 SBERT 사용")
    
    def generate_embedding(self, text: str) -> List[float]:
        """텍스트를 임베딩 벡터로 변환"""
        if not text or not text.strip():
            return [0.0] * self.EMBEDDING_DIM
        
        text = text.strip()[:500]  # 최대 500자
        
        if self.use_openai:
            return self._openai_embedding(text)
        else:
            return self._sbert_embedding(text)
    
    def _openai_embedding(self, text: str) -> List[float]:
        """OpenAI Embedding API 사용"""
        try:
            response = self.openai.embeddings.create(
                model="text-embedding-3-small",
                input=text
            )
            embedding = response.data[0].embedding
            # OpenAI는 1536차원, 768로 축소
            return embedding[:768] if len(embedding) > 768 else embedding + [0.0] * (768 - len(embedding))
        except Exception as e:
            print(f"OpenAI 임베딩 오류: {e}")
            return [0.0] * self.EMBEDDING_DIM
    
    def _sbert_embedding(self, text: str) -> List[float]:
        """한국어 SBERT 모델 사용"""
        model = get_sbert_model()
        if model is None:
            return [0.0] * self.EMBEDDING_DIM
        
        try:
            embedding = model.encode(text, convert_to_numpy=True)
            return embedding.tolist()
        except Exception as e:
            print(f"SBERT 임베딩 오류: {e}")
            return [0.0] * self.EMBEDDING_DIM
    
    def generate_place_text(self, place: Dict) -> str:
        """장소 정보를 임베딩용 텍스트로 변환"""
        parts = []
        
        if place.get("category"):
            parts.append(place["category"])
        
        if place.get("name"):
            parts.append(place["name"])
        
        if place.get("address"):
            # 주소에서 지역명 추출
            address = place["address"]
            for keyword in ["강남", "홍대", "신촌", "이태원", "명동", "건대", "성수", "압구정"]:
                if keyword in address:
                    parts.append(keyword)
                    break
        
        if place.get("tags"):
            tags = place["tags"]
            if isinstance(tags, list):
                parts.extend(tags[:5])  # 최대 5개 태그
            elif isinstance(tags, str):
                parts.append(tags)
        
        return " | ".join(parts) if parts else "장소"
    
    def generate_user_preference_text(self, preferences: Dict) -> str:
        """유저 선호도를 임베딩용 텍스트로 변환"""
        parts = []
        
        # 음식 선호도
        if preferences.get("foods"):
            parts.extend(preferences["foods"][:3])
        
        # 분위기 선호도
        if preferences.get("vibes"):
            parts.extend(preferences["vibes"][:3])
        
        # 목적
        if preferences.get("purposes"):
            parts.extend(preferences["purposes"][:2])
        
        return " | ".join(parts) if parts else "일반"
    
    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """코사인 유사도 계산"""
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
    
    # ========================================
    # 데이터베이스 연동 메서드
    # ========================================
    
    def embed_place(self, db: Session, place_id: int, place_data: Dict) -> bool:
        """장소 임베딩 생성 및 저장"""
        try:
            from domain.models import PlaceEmbedding
            
            source_text = self.generate_place_text(place_data)
            embedding = self.generate_embedding(source_text)
            
            # 기존 임베딩 확인
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
            print(f"장소 임베딩 저장 오류: {e}")
            db.rollback()
            return False
    
    def embed_all_places(self, db: Session) -> int:
        """모든 장소 임베딩 생성"""
        from domain.models import Place
        
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
                print(f"✅ 임베딩 생성: {place.name}")
            else:
                print(f"❌ 임베딩 실패: {place.name}")
        
        return success_count
    
    def update_user_embedding(self, db: Session, user_id: int) -> bool:
        """유저 행동 기반 임베딩 업데이트"""
        try:
            from domain.models import UserEmbedding, UserInteractionLog, PlaceEmbedding
            
            # 최근 행동 가져오기 (최근 50개)
            recent_actions = db.query(UserInteractionLog).filter(
                UserInteractionLog.user_id == user_id,
                UserInteractionLog.place_id.isnot(None)
            ).order_by(UserInteractionLog.created_at.desc()).limit(50).all()
            
            if not recent_actions:
                return False
            
            # 행동 가중치
            action_weights = {
                "LIKE": 3.0,
                "SAVE": 2.5,
                "SHARE": 2.0,
                "CLICK": 1.5,
                "VIEW": 1.0,
                "DISMISS": -1.0
            }
            
            # 장소 임베딩 가중 평균 계산
            weighted_sum = np.zeros(self.EMBEDDING_DIM)
            total_weight = 0.0
            
            for action in recent_actions:
                place_embedding = db.query(PlaceEmbedding).filter(
                    PlaceEmbedding.place_id == action.place_id
                ).first()
                
                if place_embedding and place_embedding.embedding:
                    weight = action_weights.get(action.action_type, 1.0)
                    vec = np.array(place_embedding.embedding)
                    weighted_sum += vec * weight
                    total_weight += abs(weight)
            
            if total_weight == 0:
                return False
            
            preference_embedding = (weighted_sum / total_weight).tolist()
            
            # 최근 10개 행동으로 recent_embedding 계산
            recent_sum = np.zeros(self.EMBEDDING_DIM)
            recent_count = 0
            
            for action in recent_actions[:10]:
                place_embedding = db.query(PlaceEmbedding).filter(
                    PlaceEmbedding.place_id == action.place_id
                ).first()
                
                if place_embedding and place_embedding.embedding:
                    recent_sum += np.array(place_embedding.embedding)
                    recent_count += 1
            
            recent_embedding = (recent_sum / max(recent_count, 1)).tolist()
            
            # 저장
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
            print(f"유저 임베딩 업데이트 오류: {e}")
            db.rollback()
            return False
    
    def get_similar_places(
        self, 
        db: Session, 
        query_embedding: List[float], 
        limit: int = 10,
        exclude_place_ids: List[int] = None
    ) -> List[Tuple[int, float]]:
        """벡터 유사도로 유사한 장소 검색"""
        from domain.models import PlaceEmbedding
        
        # 모든 장소 임베딩 가져오기
        embeddings = db.query(PlaceEmbedding).all()
        
        results = []
        for pe in embeddings:
            if exclude_place_ids and pe.place_id in exclude_place_ids:
                continue
            
            if not pe.embedding:
                continue
            
            similarity = self.cosine_similarity(query_embedding, pe.embedding)
            results.append((pe.place_id, similarity))
        
        # 유사도 높은 순으로 정렬
        results.sort(key=lambda x: x[1], reverse=True)
        
        return results[:limit]
    
    def get_recommendations_for_user(
        self, 
        db: Session, 
        user_id: int, 
        limit: int = 10
    ) -> List[Dict]:
        """유저 맞춤 추천 (벡터 유사도 기반)"""
        from domain.models import UserEmbedding, Place
        
        # 유저 임베딩 가져오기
        user_embedding = db.query(UserEmbedding).filter(
            UserEmbedding.user_id == user_id
        ).first()
        
        if not user_embedding or not user_embedding.preference_embedding:
            return []
        
        # 유사한 장소 검색
        similar = self.get_similar_places(
            db, 
            user_embedding.preference_embedding, 
            limit=limit
        )
        
        results = []
        for place_id, score in similar:
            place = db.query(Place).filter(Place.id == place_id).first()
            if place:
                results.append({
                    "place_id": place.id,
                    "name": place.name,
                    "category": place.category,
                    "address": place.address,
                    "similarity_score": round(score, 4),
                    "tags": place.tags or []
                })
        
        return results


# 싱글톤 인스턴스
_embedding_service = None

def get_embedding_service() -> VectorEmbeddingService:
    """임베딩 서비스 싱글톤"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = VectorEmbeddingService()
    return _embedding_service
