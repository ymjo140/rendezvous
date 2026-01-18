# -*- coding: utf-8 -*-
"""
Vector AI Recommendation API
- Embedding generation and management
- Vector similarity based recommendations
- User interaction logging
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

class InteractionLogRequest(BaseModel):
    place_id: Optional[int] = None
    post_id: Optional[str] = None
    action_type: str  # VIEW, CLICK, LIKE, SAVE, SHARE, DISMISS, DWELL
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
# API Endpoints
# ========================================

@router.post("/api/vector/embed-place", response_model=EmbedPlaceResponse)
def embed_place(
    req: EmbedPlaceRequest,
    db: Session = Depends(get_db)
):
    """Generate embedding for a single place"""
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


@router.post("/api/vector/embed-all-places")
def embed_all_places(
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    """Generate embeddings for all places (background task)"""
    from services.vector_embedding_service import get_embedding_service
    
    service = get_embedding_service()
    
    # Run in background
    def run_embedding():
        count = service.embed_all_places(db)
        print(f"[OK] Total {count} place embeddings created")
    
    background_tasks.add_task(run_embedding)
    
    return {
        "message": "Embedding job started in background",
        "status": "processing"
    }


@router.post("/api/vector/similar-places", response_model=List[SimilarPlaceResponse])
def get_similar_places(
    req: SimilarPlaceRequest,
    db: Session = Depends(get_db)
):
    """Search similar places"""
    from services.vector_embedding_service import get_embedding_service
    
    service = get_embedding_service()
    
    # Generate query embedding
    if req.place_id:
        # Find similar places to a specific place
        place_embedding = db.query(models.PlaceEmbedding).filter(
            models.PlaceEmbedding.place_id == req.place_id
        ).first()
        
        if not place_embedding or not place_embedding.embedding:
            raise HTTPException(status_code=404, detail="Place embedding not found")
        
        query_embedding = place_embedding.embedding
        exclude_ids = [req.place_id]
    elif req.query_text:
        # Search by text
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
    
    results = []
    for place_id, score in similar:
        place = db.query(models.Place).filter(models.Place.id == place_id).first()
        if place:
            results.append(SimilarPlaceResponse(
                place_id=place.id,
                name=place.name,
                category=place.category,
                similarity_score=round(score, 4),
                tags=place.tags or []
            ))
    
    return results


@router.get("/api/vector/recommendations", response_model=UserRecommendationResponse)
def get_user_recommendations(
    limit: int = 10,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Get personalized vector-based recommendations"""
    from services.vector_embedding_service import get_embedding_service
    
    if not current_user:
        raise HTTPException(status_code=401, detail="Login required")
    
    service = get_embedding_service()
    
    # Check user embedding
    user_embedding = db.query(models.UserEmbedding).filter(
        models.UserEmbedding.user_id == current_user.id
    ).first()
    
    if not user_embedding or not user_embedding.preference_embedding:
        # Return popular places if no embedding
        popular_places = db.query(models.Place).order_by(
            models.Place.wemeet_rating.desc()
        ).limit(limit).all()
        
        return UserRecommendationResponse(
            algorithm="popular_fallback",
            recommendations=[{
                "place_id": p.id,
                "name": p.name,
                "category": p.category,
                "address": p.address,
                "rating": p.wemeet_rating,
                "tags": p.tags or []
            } for p in popular_places],
            user_embedding_exists=False
        )
    
    # Vector similarity based recommendations
    recommendations = service.get_recommendations_for_user(
        db, 
        current_user.id, 
        limit=limit
    )
    
    return UserRecommendationResponse(
        algorithm="vector_similarity",
        recommendations=recommendations,
        user_embedding_exists=True
    )


@router.post("/api/vector/interaction", response_model=InteractionLogResponse)
def log_interaction(
    req: InteractionLogRequest,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Log user interaction (AI learning data)"""
    if not current_user:
        raise HTTPException(status_code=401, detail="Login required")
    
    # Validation
    valid_actions = ["VIEW", "CLICK", "LIKE", "SAVE", "SHARE", "DISMISS", "DWELL", "REVIEW"]
    if req.action_type.upper() not in valid_actions:
        raise HTTPException(status_code=400, detail=f"Invalid action_type. Valid values: {valid_actions}")
    
    # Save log
    log = models.UserInteractionLog(
        user_id=current_user.id,
        place_id=req.place_id,
        post_id=req.post_id,
        action_type=req.action_type.upper(),
        action_value=req.action_value,
        context=req.context or {},
        recommendation_id=req.recommendation_id,
        position_in_list=req.position_in_list,
        session_id=req.session_id
    )
    
    db.add(log)
    db.commit()
    db.refresh(log)
    
    # Update user embedding in background
    def update_embedding():
        from services.vector_embedding_service import get_embedding_service
        service = get_embedding_service()
        service.update_user_embedding(db, current_user.id)
    
    # Only update on important actions
    if req.action_type.upper() in ["LIKE", "SAVE", "SHARE", "REVIEW"]:
        background_tasks.add_task(update_embedding)
    
    return InteractionLogResponse(
        success=True,
        log_id=log.id,
        message="Interaction logged successfully"
    )


@router.post("/api/vector/update-user-embedding")
def update_user_embedding(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Manually update user embedding"""
    from services.vector_embedding_service import get_embedding_service
    
    if not current_user:
        raise HTTPException(status_code=401, detail="Login required")
    
    service = get_embedding_service()
    success = service.update_user_embedding(db, current_user.id)
    
    if success:
        return {"message": "User embedding updated", "success": True}
    else:
        return {"message": "No action data to update", "success": False}


@router.get("/api/vector/stats")
def get_vector_stats(
    db: Session = Depends(get_db)
):
    """Get vector AI system statistics"""
    place_count = db.query(models.PlaceEmbedding).count()
    user_count = db.query(models.UserEmbedding).count()
    log_count = db.query(models.UserInteractionLog).count()
    
    # Action stats
    from sqlalchemy import func
    action_stats = db.query(
        models.UserInteractionLog.action_type,
        func.count(models.UserInteractionLog.id)
    ).group_by(models.UserInteractionLog.action_type).all()
    
    return {
        "place_embeddings": place_count,
        "user_embeddings": user_count,
        "interaction_logs": log_count,
        "action_breakdown": {action: count for action, count in action_stats},
        "model": "ko-sbert-nli (768 dim) or Gemini",
        "status": "operational"
    }


@router.get("/api/vector/health")
def health_check():
    """Vector AI service health check"""
    from services.vector_embedding_service import get_embedding_service
    
    try:
        service = get_embedding_service()
        # Test embedding generation
        test_embedding = service.generate_embedding("test text")
        embedding_works = len(test_embedding) == service.EMBEDDING_DIM
        
        return {
            "status": "healthy" if embedding_works else "degraded",
            "embedding_service": "operational" if embedding_works else "error",
            "embedding_dim": service.EMBEDDING_DIM,
            "backend": "Gemini" if service.use_gemini else "Korean SBERT"
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }
