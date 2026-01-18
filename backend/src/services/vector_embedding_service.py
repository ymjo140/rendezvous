# -*- coding: utf-8 -*-
"""
Vector Embedding Service
- Google Gemini Embedding API or Korean SBERT model
- Convert place/user text to vectors
- Vector similarity based recommendations
"""

import os
import json
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
            # Korean optimized model
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
    
    EMBEDDING_DIM = 768  # ko-sbert-nli dimension
    
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
        """Convert text to embedding vector"""
        if not text or not text.strip():
            return [0.0] * self.EMBEDDING_DIM
        
        text = text.strip()[:500]  # Max 500 chars
        
        if self.use_gemini and self.gemini_model:
            return self._gemini_embedding(text)
        else:
            return self._sbert_embedding(text)
    
    def _gemini_embedding(self, text: str) -> List[float]:
        """Use Google Gemini Embedding API"""
        try:
            result = self.gemini_model.embed_content(
                model="models/text-embedding-004",
                content=text,
                task_type="SEMANTIC_SIMILARITY"
            )
            embedding = result['embedding']
            
            # Gemini returns 768 dim, same as ko-sbert
            if len(embedding) > self.EMBEDDING_DIM:
                return embedding[:self.EMBEDDING_DIM]
            elif len(embedding) < self.EMBEDDING_DIM:
                return embedding + [0.0] * (self.EMBEDDING_DIM - len(embedding))
            return embedding
        except Exception as e:
            print(f"Gemini embedding error: {e}")
            # Fallback to SBERT
            return self._sbert_embedding(text)
    
    def _sbert_embedding(self, text: str) -> List[float]:
        """Use Korean SBERT model"""
        model = get_sbert_model()
        if model is None:
            return [0.0] * self.EMBEDDING_DIM
        
        try:
            embedding = model.encode(text, convert_to_numpy=True)
            return embedding.tolist()
        except Exception as e:
            print(f"SBERT embedding error: {e}")
            return [0.0] * self.EMBEDDING_DIM
    
    def generate_place_text(self, place: Dict) -> str:
        """Convert place info to text for embedding"""
        parts = []
        
        if place.get("category"):
            parts.append(place["category"])
        
        if place.get("name"):
            parts.append(place["name"])
        
        if place.get("address"):
            # Extract area name from address
            address = place["address"]
            keywords = ["gangnam", "hongdae", "sinchon", "itaewon", "myeongdong", 
                       "kondae", "seongsu", "apgujeong", "jamsil", "yeouido"]
            korean_keywords = ["강남", "홍대", "신촌", "이태원", "명동", 
                             "건대", "성수", "압구정", "잠실", "여의도"]
            for kw in korean_keywords:
                if kw in address:
                    parts.append(kw)
                    break
        
        if place.get("tags"):
            tags = place["tags"]
            if isinstance(tags, list):
                parts.extend(tags[:5])  # Max 5 tags
            elif isinstance(tags, str):
                parts.append(tags)
        
        return " | ".join(parts) if parts else "place"
    
    def generate_user_preference_text(self, preferences: Dict) -> str:
        """Convert user preferences to text for embedding"""
        parts = []
        
        # Food preferences
        if preferences.get("foods"):
            parts.extend(preferences["foods"][:3])
        
        # Vibe preferences
        if preferences.get("vibes"):
            parts.extend(preferences["vibes"][:3])
        
        # Purpose
        if preferences.get("purposes"):
            parts.extend(preferences["purposes"][:2])
        
        return " | ".join(parts) if parts else "general"
    
    def cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """Calculate cosine similarity"""
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
    # Database integration methods
    # ========================================
    
    def embed_place(self, db: Session, place_id: int, place_data: Dict) -> bool:
        """Generate and save place embedding"""
        try:
            from domain.models import PlaceEmbedding
            
            source_text = self.generate_place_text(place_data)
            embedding = self.generate_embedding(source_text)
            
            # Check existing embedding
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
            print(f"Place embedding save error: {e}")
            db.rollback()
            return False
    
    def embed_all_places(self, db: Session) -> int:
        """Generate embeddings for all places"""
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
                print(f"[OK] Embedding created: {place.name}")
            else:
                print(f"[FAIL] Embedding failed: {place.name}")
        
        return success_count
    
    def update_user_embedding(self, db: Session, user_id: int) -> bool:
        """Update user embedding based on actions"""
        try:
            from domain.models import UserEmbedding, UserInteractionLog, PlaceEmbedding
            
            # Get recent actions (last 50)
            recent_actions = db.query(UserInteractionLog).filter(
                UserInteractionLog.user_id == user_id,
                UserInteractionLog.place_id.isnot(None)
            ).order_by(UserInteractionLog.created_at.desc()).limit(50).all()
            
            if not recent_actions:
                return False
            
            # Action weights
            action_weights = {
                "LIKE": 3.0,
                "SAVE": 2.5,
                "SHARE": 2.0,
                "CLICK": 1.5,
                "VIEW": 1.0,
                "DISMISS": -1.0
            }
            
            # Calculate weighted average of place embeddings
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
            
            # Calculate recent_embedding from last 10 actions
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
            print(f"User embedding update error: {e}")
            db.rollback()
            return False
    
    def get_similar_places(
        self, 
        db: Session, 
        query_embedding: List[float], 
        limit: int = 10,
        exclude_place_ids: List[int] = None
    ) -> List[Tuple[int, float]]:
        """Search similar places by vector similarity"""
        from domain.models import PlaceEmbedding
        
        # Get all place embeddings
        embeddings = db.query(PlaceEmbedding).all()
        
        results = []
        for pe in embeddings:
            if exclude_place_ids and pe.place_id in exclude_place_ids:
                continue
            
            if not pe.embedding:
                continue
            
            similarity = self.cosine_similarity(query_embedding, pe.embedding)
            results.append((pe.place_id, similarity))
        
        # Sort by similarity (descending)
        results.sort(key=lambda x: x[1], reverse=True)
        
        return results[:limit]
    
    def get_recommendations_for_user(
        self, 
        db: Session, 
        user_id: int, 
        limit: int = 10
    ) -> List[Dict]:
        """Get personalized recommendations for user (vector similarity based)"""
        from domain.models import UserEmbedding, Place
        
        # Get user embedding
        user_embedding = db.query(UserEmbedding).filter(
            UserEmbedding.user_id == user_id
        ).first()
        
        if not user_embedding or not user_embedding.preference_embedding:
            return []
        
        # Search similar places
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


# Singleton instance
_embedding_service = None

def get_embedding_service() -> VectorEmbeddingService:
    """Get embedding service singleton"""
    global _embedding_service
    if _embedding_service is None:
        _embedding_service = VectorEmbeddingService()
    return _embedding_service
