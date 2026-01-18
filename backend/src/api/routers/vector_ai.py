# -*- coding: utf-8 -*-
"""
Vector AI Recommendation API (Optimized)
- N+1 query optimization
- Context-aware recommendations
- Robust error handling
- Async-friendly logging
"""

from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from core.database import get_db
from domain import models
from api.dependencies import get_current_user

router = APIRouter()


# ========================================
# Pydantic Schemas
# ========================================

class EmbedPlaceRequest(BaseModel):
    place_id: int
    name: str
    category: Optional[str] = None
    address: Optional[str] = None
    tags: Optional[List[str]] = []

class EmbedPlaceResponse(BaseModel):
    success: bool
    place_id: int
    source_text: str
    embedding_dim: int

class SimilarPlaceRequest(BaseModel):
    place_id: Optional[int] = None
    query_text: Optional[str] = None
    limit: int = 10

class SimilarPlaceResponse(BaseModel):
    place_id: int
    name: str
    category: Optional[str]
    similarity_score: float
    tags: List[str] = []

class UserRecommendationResponse(BaseModel):
    algorithm: str
    recommendations: List[dict]
    user_embedding_exists: bool
    context: Optional[dict] = None

class InteractionLogRequest(BaseModel):
    place_id: Optional[int] = None
    post_id: Optional[str] = None
    action_type: str
    action_value: float = 1.0
    context: Optional[dict] = {}
    recommendation_id: Optional[int] = None
    position_in_list: Optional[int] = None
    session_id: Optional[str] = None

class InteractionLogResponse(BaseModel):
    success: bool
    log_id: int
    message: str


# ========================================
# Helper Functions
# ========================================

def get_current_context() -> dict:
    """Get current context for recommendations"""
    try:
        from core.ml_engine import get_context_analyzer
        return get_context_analyzer().analyze()
    except Exception:
        now = datetime.now()
        return {
            "hour": now.hour,
            "day_of_week": now.weekday(),
            "is_weekend": now.weekday() >= 5
        }


# ========================================
# API Endpoints
# ========================================

@router.post("/api/vector/embed-place", response_model=EmbedPlaceResponse)
def embed_place(
    req: EmbedPlaceRequest,
    db: Session = Depends(get_db)
):
    """Generate embedding for a single place"""
    try:
        from services.vector_embedding_service import get_embedding_service
        
        service = get_embedding_service()
        
        place_data = {
            "name": req.name,
            "category": req.category,
            "address": req.address,
            "tags": req.tags
        }
        
        source_text = service.generate_place_text(place_data)
        success = service.embed_place(db, req.place_id, place_data)
        
        if not success:
            raise HTTPException(status_code=500, detail="Embedding generation failed")
        
        return EmbedPlaceResponse(
            success=True,
            place_id=req.place_id,
            source_text=source_text,
            embedding_dim=service.EMBEDDING_DIM
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] embed_place: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/vector/embed-all-places")
def embed_all_places(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Generate embeddings for all places (background task)"""
    try:
        from services.vector_embedding_service import get_embedding_service
        
        service = get_embedding_service()
        
        def run_embedding():
            try:
                count = service.embed_all_places(db)
                print(f"[OK] Total {count} place embeddings created")
            except Exception as e:
                print(f"[ERROR] Background embedding failed: {e}")
        
        background_tasks.add_task(run_embedding)
        
        return {
            "message": "Embedding job started in background",
            "status": "processing"
        }
    except Exception as e:
        print(f"[ERROR] embed_all_places: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/api/vector/similar-places", response_model=List[SimilarPlaceResponse])
def get_similar_places(
    req: SimilarPlaceRequest,
    db: Session = Depends(get_db)
):
    """Search similar places (N+1 optimized)"""
    try:
        from services.vector_embedding_service import get_embedding_service
        
        service = get_embedding_service()
        
        # Generate query embedding
        if req.place_id:
            place_embedding = db.query(models.PlaceEmbedding).filter(
                models.PlaceEmbedding.place_id == req.place_id
            ).first()
            
            if not place_embedding or not place_embedding.embedding:
                raise HTTPException(status_code=404, detail="Place embedding not found")
            
            query_embedding = place_embedding.embedding
            exclude_ids = [req.place_id]
        elif req.query_text:
            query_embedding = service.generate_embedding(req.query_text)
            exclude_ids = []
        else:
            raise HTTPException(status_code=400, detail="place_id or query_text required")
        
        # Search similar places
        similar = service.get_similar_places(
            db, 
            query_embedding, 
            limit=req.limit,
            exclude_place_ids=exclude_ids
        )
        
        if not similar:
            return []
        
        # Batch load places (N+1 optimization)
        place_ids = [p[0] for p in similar]
        places = db.query(models.Place).filter(models.Place.id.in_(place_ids)).all()
        place_dict = {p.id: p for p in places}
        
        results = []
        for place_id, score in similar:
            place = place_dict.get(place_id)
            if place:
                results.append(SimilarPlaceResponse(
                    place_id=place.id,
                    name=place.name,
                    category=place.category,
                    similarity_score=round(score, 4),
                    tags=place.tags or []
                ))
        
        return results
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] get_similar_places: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/api/vector/recommendations", response_model=UserRecommendationResponse)
def get_user_recommendations(
    limit: int = 10,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get personalized vector-based recommendations with context"""
    try:
        from services.vector_embedding_service import get_embedding_service
        from core.ml_engine import ColdStartHandler
        
        if not current_user:
            raise HTTPException(status_code=401, detail="Login required")
        
        service = get_embedding_service()
        context = get_current_context()
        
        # Check user embedding
        user_embedding = db.query(models.UserEmbedding).filter(
            models.UserEmbedding.user_id == current_user.id
        ).first()
        
        if not user_embedding or not user_embedding.preference_embedding:
            # Cold start: use ML-based recommendations
            recommendations = ColdStartHandler.get_cold_start_recommendations(
                db, context=context, limit=limit
            )
            
            return UserRecommendationResponse(
                algorithm="cold_start_ml",
                recommendations=recommendations,
                user_embedding_exists=False,
                context={
                    "intent": context.get("predicted_intent"),
                    "is_weekend": context.get("is_weekend")
                }
            )
        
        # Vector similarity + ML based recommendations
        recommendations = service.get_recommendations_for_user(
            db, 
            current_user.id, 
            limit=limit,
            context=context
        )
        
        return UserRecommendationResponse(
            algorithm="hybrid_vector_ml",
            recommendations=recommendations,
            user_embedding_exists=True,
            context={
                "intent": context.get("predicted_intent"),
                "is_weekend": context.get("is_weekend")
            }
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] get_user_recommendations: {e}")
        # Return empty recommendations instead of error
        return UserRecommendationResponse(
            algorithm="fallback",
            recommendations=[],
            user_embedding_exists=False,
            context=None
        )


@router.post("/api/vector/interaction", response_model=InteractionLogResponse)
def log_interaction(
    req: InteractionLogRequest,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Log user interaction (async-optimized)"""
    try:
        if not current_user:
            raise HTTPException(status_code=401, detail="Login required")
        
        # Validation
        valid_actions = ["VIEW", "CLICK", "LIKE", "SAVE", "SHARE", "DISMISS", "DWELL", "REVIEW"]
        action_type = req.action_type.upper()
        if action_type not in valid_actions:
            raise HTTPException(
                status_code=400, 
                detail=f"Invalid action_type. Valid values: {valid_actions}"
            )
        
        # Add context
        context = req.context or {}
        ctx = get_current_context()
        context["hour"] = ctx.get("hour")
        context["day_of_week"] = ctx.get("day_of_week")
        context["is_weekend"] = ctx.get("is_weekend")
        
        # Save log
        log = models.UserInteractionLog(
            user_id=current_user.id,
            place_id=req.place_id,
            post_id=req.post_id,
            action_type=action_type,
            action_value=req.action_value,
            context=context,
            recommendation_id=req.recommendation_id,
            position_in_list=req.position_in_list,
            session_id=req.session_id
        )
        
        db.add(log)
        db.commit()
        db.refresh(log)
        
        # Update user embedding in background (async)
        def update_embedding_async():
            try:
                from services.vector_embedding_service import get_embedding_service
                service = get_embedding_service()
                service.update_user_embedding(db, current_user.id)
            except Exception as e:
                print(f"[ERROR] Async embedding update failed: {e}")
        
        # Only update on important actions
        if action_type in ["LIKE", "SAVE", "SHARE", "REVIEW"]:
            background_tasks.add_task(update_embedding_async)
        
        return InteractionLogResponse(
            success=True,
            log_id=log.id,
            message="Interaction logged successfully"
        )
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] log_interaction: {e}")
        # Return success even on error to not break UX
        return InteractionLogResponse(
            success=False,
            log_id=0,
            message=f"Logging failed: {str(e)}"
        )


@router.post("/api/vector/update-user-embedding")
def update_user_embedding(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually update user embedding"""
    try:
        from services.vector_embedding_service import get_embedding_service
        
        if not current_user:
            raise HTTPException(status_code=401, detail="Login required")
        
        service = get_embedding_service()
        success = service.update_user_embedding(db, current_user.id)
        
        if success:
            return {"message": "User embedding updated", "success": True}
        else:
            return {"message": "No action data to update", "success": False}
    except HTTPException:
        raise
    except Exception as e:
        print(f"[ERROR] update_user_embedding: {e}")
        return {"message": f"Update failed: {str(e)}", "success": False}


@router.get("/api/vector/stats")
def get_vector_stats(db: Session = Depends(get_db)):
    """Get vector AI system statistics"""
    try:
        from sqlalchemy import func
        
        place_count = db.query(models.PlaceEmbedding).count()
        user_count = db.query(models.UserEmbedding).count()
        log_count = db.query(models.UserInteractionLog).count()
        
        action_stats = db.query(
            models.UserInteractionLog.action_type,
            func.count(models.UserInteractionLog.id)
        ).group_by(models.UserInteractionLog.action_type).all()
        
        # Get current context
        context = get_current_context()
        
        return {
            "place_embeddings": place_count,
            "user_embeddings": user_count,
            "interaction_logs": log_count,
            "action_breakdown": {action: count for action, count in action_stats},
            "current_context": {
                "intent": context.get("predicted_intent"),
                "hour": context.get("hour"),
                "is_weekend": context.get("is_weekend")
            },
            "model": "Gemini + ML Scoring",
            "status": "operational"
        }
    except Exception as e:
        print(f"[ERROR] get_vector_stats: {e}")
        return {
            "status": "error",
            "error": str(e)
        }


@router.get("/api/vector/health")
def health_check():
    """Vector AI service health check"""
    try:
        from services.vector_embedding_service import get_embedding_service
        
        service = get_embedding_service()
        test_embedding = service.generate_embedding("test text")
        embedding_works = len(test_embedding) == service.EMBEDDING_DIM
        
        return {
            "status": "healthy" if embedding_works else "degraded",
            "embedding_service": "operational" if embedding_works else "error",
            "embedding_dim": service.EMBEDDING_DIM,
            "backend": "Gemini" if service.use_gemini else "Korean SBERT",
            "ml_engine": "active"
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }
