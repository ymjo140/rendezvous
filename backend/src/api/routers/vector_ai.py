"""
🤖 벡터 AI 추천 API
- 임베딩 생성 및 관리
- 벡터 유사도 기반 추천
- 유저 상호작용 로깅
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
    """단일 장소 임베딩 생성"""
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
        raise HTTPException(status_code=500, detail="임베딩 생성 실패")
    
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
    """모든 장소 임베딩 생성 (백그라운드)"""
    from services.vector_embedding_service import get_embedding_service
    
    service = get_embedding_service()
    
    # 백그라운드에서 실행
    def run_embedding():
        count = service.embed_all_places(db)
        print(f"✅ 총 {count}개 장소 임베딩 완료")
    
    background_tasks.add_task(run_embedding)
    
    return {
        "message": "임베딩 작업이 백그라운드에서 시작되었습니다.",
        "status": "processing"
    }


@router.post("/api/vector/similar-places", response_model=List[SimilarPlaceResponse])
def get_similar_places(
    req: SimilarPlaceRequest,
    db: Session = Depends(get_db)
):
    """유사한 장소 검색"""
    from services.vector_embedding_service import get_embedding_service
    
    service = get_embedding_service()
    
    # 쿼리 임베딩 생성
    if req.place_id:
        # 특정 장소와 유사한 장소 찾기
        place_embedding = db.query(models.PlaceEmbedding).filter(
            models.PlaceEmbedding.place_id == req.place_id
        ).first()
        
        if not place_embedding or not place_embedding.embedding:
            raise HTTPException(status_code=404, detail="장소 임베딩을 찾을 수 없습니다")
        
        query_embedding = place_embedding.embedding
        exclude_ids = [req.place_id]
    elif req.query_text:
        # 텍스트로 검색
        query_embedding = service.generate_embedding(req.query_text)
        exclude_ids = []
    else:
        raise HTTPException(status_code=400, detail="place_id 또는 query_text가 필요합니다")
    
    # 유사한 장소 검색
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
    """유저 맞춤 벡터 기반 추천"""
    from services.vector_embedding_service import get_embedding_service
    
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    
    service = get_embedding_service()
    
    # 유저 임베딩 확인
    user_embedding = db.query(models.UserEmbedding).filter(
        models.UserEmbedding.user_id == current_user.id
    ).first()
    
    if not user_embedding or not user_embedding.preference_embedding:
        # 임베딩이 없으면 인기 장소 반환
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
    
    # 벡터 유사도 기반 추천
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
    """유저 상호작용 로깅 (AI 학습 데이터)"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    
    # 유효성 검사
    valid_actions = ["VIEW", "CLICK", "LIKE", "SAVE", "SHARE", "DISMISS", "DWELL", "REVIEW"]
    if req.action_type.upper() not in valid_actions:
        raise HTTPException(status_code=400, detail=f"유효하지 않은 action_type. 가능한 값: {valid_actions}")
    
    # 로그 저장
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
    
    # 백그라운드에서 유저 임베딩 업데이트
    def update_embedding():
        from services.vector_embedding_service import get_embedding_service
        service = get_embedding_service()
        service.update_user_embedding(db, current_user.id)
    
    # 중요한 행동일 때만 업데이트
    if req.action_type.upper() in ["LIKE", "SAVE", "SHARE", "REVIEW"]:
        background_tasks.add_task(update_embedding)
    
    return InteractionLogResponse(
        success=True,
        log_id=log.id,
        message="상호작용이 기록되었습니다."
    )


@router.post("/api/vector/update-user-embedding")
def update_user_embedding(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """유저 임베딩 수동 업데이트"""
    from services.vector_embedding_service import get_embedding_service
    
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다")
    
    service = get_embedding_service()
    success = service.update_user_embedding(db, current_user.id)
    
    if success:
        return {"message": "유저 임베딩이 업데이트되었습니다.", "success": True}
    else:
        return {"message": "업데이트할 행동 데이터가 없습니다.", "success": False}


@router.get("/api/vector/stats")
def get_vector_stats(
    db: Session = Depends(get_db)
):
    """벡터 AI 시스템 통계"""
    place_count = db.query(models.PlaceEmbedding).count()
    user_count = db.query(models.UserEmbedding).count()
    log_count = db.query(models.UserInteractionLog).count()
    
    # 최근 로그 통계
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
        "model": "ko-sbert-nli (768 dim)",
        "status": "operational"
    }


@router.get("/api/vector/health")
def health_check():
    """벡터 AI 서비스 헬스체크"""
    from services.vector_embedding_service import get_embedding_service
    
    try:
        service = get_embedding_service()
        # 테스트 임베딩 생성
        test_embedding = service.generate_embedding("테스트 텍스트")
        embedding_works = len(test_embedding) == service.EMBEDDING_DIM
        
        return {
            "status": "healthy" if embedding_works else "degraded",
            "embedding_service": "operational" if embedding_works else "error",
            "embedding_dim": service.EMBEDDING_DIM,
            "backend": "OpenAI" if service.use_openai else "Korean SBERT"
        }
    except Exception as e:
        return {
            "status": "error",
            "error": str(e)
        }
