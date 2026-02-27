"""
AI 추천 API 라우터
- 개인화 장소 추천
- 사용자 행동 기록 (비동기 BackgroundTasks 적용)
- 유사 장소 추천
"""

from fastapi import APIRouter, Depends, HTTPException, Query, BackgroundTasks
from sqlalchemy.orm import Session
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from core.database import get_db, SessionLocal
from domain import models
from api.dependencies import get_current_user
from services.ai_recommendation_service import AIRecommendationService

router = APIRouter()
ai_service = AIRecommendationService()


# === Background Task Functions ===

def _record_action_background(
    user_id: int,
    action_type: str,
    place_id: Optional[int],
    action_value: float,
    context: dict
):
    """
    Background task for recording user actions
    Uses separate DB session to avoid blocking the main request
    """
    db = SessionLocal()
    try:
        normalized_type = (action_type or "").lower()
        if normalized_type in ["dismiss", "bad_review"]:
            if place_id is None:
                return
            ai_service.record_negative_feedback(
                db=db,
                user_id=user_id,
                place_id=place_id,
                reason=normalized_type,
                context=context
            )
        else:
            ai_service.record_action(
                db=db,
                user_id=user_id,
                action_type=normalized_type,
                place_id=place_id,
                action_value=action_value,
                context=context
            )
        print(f"[BG] Action recorded: user={user_id}, type={action_type}, place={place_id}")
    except Exception as e:
        print(f"[BG] Action record failed: {e}")
    finally:
        db.close()


def _log_recommendation_background(
    user_id: int,
    algorithm: str,
    place_ids: List[int],
    scores: List[float],
    context: dict
):
    """
    Background task for logging recommendations
    """
    db = SessionLocal()
    try:
        ai_service._log_recommendation(
            db=db,
            user_id=user_id,
            algorithm=algorithm,
            place_ids=place_ids,
            scores=scores,
            context=context
        )
        print(f"[BG] Recommendation logged: user={user_id}, algorithm={algorithm}")
    except Exception as e:
        print(f"[BG] Recommendation log failed: {e}")
    finally:
        db.close()


# === Pydantic Schemas ===

class ActionRequest(BaseModel):
    action_type: str  # detail_view, click, like, save, review, share, reserve, dismiss, bad_review, etc
    place_id: Optional[int] = None
    meeting_id: Optional[str] = None
    event_id: Optional[str] = None
    offer_id: Optional[int] = None
    request_id: Optional[str] = None
    decision_cell: Optional[dict] = None
    source: Optional[str] = None
    metadata: dict = {}
    action_value: float = 1.0
    context: dict = {}

class ActionResponse(BaseModel):
    success: bool
    action_id: int
    message: str

class PlaceRecommendation(BaseModel):
    place_id: int
    place_name: str
    category: Optional[str]
    score: float
    reason: str
    review_count: Optional[int] = None
    avg_rating: Optional[float] = None

class RecommendationResponse(BaseModel):
    recommendations: List[PlaceRecommendation]
    algorithm: str
    total_count: int

class SimilarPlaceResponse(BaseModel):
    place_id: int
    place_name: str
    category: Optional[str]
    similarity: float


class RecommendationRequest(BaseModel):
    purpose: Optional[str] = None
    limit: int = 10
    exclude: Optional[List[int]] = None
    request_id: Optional[str] = None
    decision_cell: Optional[dict] = None


# === API Endpoints ===

@router.post("/api/ai/actions", response_model=ActionResponse)
async def record_user_action(
    req: ActionRequest,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    사용자 행동 기록 (비동기 처리)
    
    - **action_type**: view, click, like, save, review, visit, share
    - **place_id**: 장소 ID (선택)
    - **action_value**: 행동 가중치 (기본 1.0, 리뷰 점수 등)
    - **context**: 추가 컨텍스트 (시간대, 동행자 수 등)
    
    Note: 로그 저장은 BackgroundTasks로 비동기 처리되어 
          사용자가 응답을 기다리지 않습니다.
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    valid_actions = [
        "view", "click", "like", "save", "review", "visit",
        "share", "search", "reserve", "dismiss", "bad_review",
        "detail_view", "impression", "offer_impression", "offer_click",
        "reserve_click", "reserve_complete", "meeting_create", "meeting_join",
        "calendar_event_create", "review_submit"
    ]
    if req.action_type.lower() not in valid_actions:
        raise HTTPException(
            status_code=400, 
            detail=f"유효하지 않은 action_type입니다. 가능한 값: {valid_actions}"
        )
    
    try:
        entity_type = None
        entity_id = None
        if req.offer_id is not None:
            entity_type = "offer"
            entity_id = str(req.offer_id)
        elif req.place_id is not None:
            entity_type = "place"
            entity_id = str(req.place_id)
        elif req.meeting_id is not None:
            entity_type = "meeting"
            entity_id = str(req.meeting_id)
        elif req.event_id is not None:
            entity_type = "event"
            entity_id = str(req.event_id)

        metadata = {**(req.metadata or {})}
        if req.source:
            metadata["source"] = req.source

        action_log = models.ActionLog(
            user_id=current_user.id if current_user else None,
            action_type=req.action_type.lower(),
            request_id=req.request_id,
            decision_cell_json=req.decision_cell or {},
            entity_type=entity_type,
            entity_id=entity_id,
            metadata_json=metadata,
        )
        db.add(action_log)
        db.commit()

        # Add timestamp to context
        context_with_time = {
            **(req.context or {}),
            "recorded_at": datetime.now().isoformat(),
            "hour": datetime.now().hour,
            "is_weekend": datetime.now().weekday() >= 5,
            "request_id": req.request_id,
            "decision_cell": req.decision_cell or {},
            "source": req.source,
            "metadata": metadata,
        }
        
        # Schedule background task for place actions only (non-blocking)
        if req.place_id is not None:
            background_tasks.add_task(
                _record_action_background,
                user_id=current_user.id,
                action_type=req.action_type.lower(),
                place_id=req.place_id,
                action_value=req.action_value,
                context=context_with_time
            )
        
        # Return immediately without waiting for DB write
        return ActionResponse(
            success=True,
            action_id=0,  # ID not available since async
            message="행동이 기록 중입니다 (비동기 처리)."
        )
    except Exception as e:
        print(f"❌ 행동 기록 스케줄링 오류: {e}")
        # Even on error, don't block the user
        return ActionResponse(
            success=False,
            action_id=0,
            message="행동 기록 스케줄링 실패"
        )


@router.get("/api/ai/recommendations", response_model=RecommendationResponse)
def get_recommendations(
    purpose: Optional[str] = Query(None, description="목적 (식사, 술, 카페, 데이트 등)"),
    limit: int = Query(10, ge=1, le=50, description="추천 개수"),
    exclude: Optional[str] = Query(None, description="제외할 place_id (콤마 구분)"),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    AI 기반 장소 추천
    
    - 로그인 사용자: 개인화 추천 (콘텐츠 기반 + 협업 필터링)
    - 비로그인 사용자: 인기도 기반 추천
    """
    user_id = current_user.id if current_user else 0
    
    # 제외할 장소 파싱
    exclude_place_ids = []
    if exclude:
        try:
            exclude_place_ids = [int(x.strip()) for x in exclude.split(",")]
        except:
            pass
    
    try:
        if user_id > 0:
            recommendations, algorithm = ai_service.get_recommendations(
                db=db,
                user_id=user_id,
                purpose=purpose,
                limit=limit,
                exclude_place_ids=exclude_place_ids
            )
        else:
            recommendations = ai_service._get_popular_recommendations(
                db=db,
                purpose=purpose,
                limit=limit,
                exclude_place_ids=exclude_place_ids
            )
            algorithm = "popular"
        
        return RecommendationResponse(
            recommendations=[PlaceRecommendation(**r) for r in recommendations],
            algorithm=algorithm,
            total_count=len(recommendations)
        )
    except Exception as e:
        print(f"❌ 추천 오류: {e}")
        # 오류 시 빈 결과 반환 (서비스 중단 방지)
        return RecommendationResponse(
            recommendations=[],
            algorithm="error",
            total_count=0
        )


@router.post("/api/ai/recommendations", response_model=RecommendationResponse)
def post_recommendations(
    req: RecommendationRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    user_id = current_user.id if current_user else 0
    exclude_place_ids = req.exclude or []
    try:
        if user_id > 0:
            recommendations, algorithm = ai_service.get_recommendations(
                db=db,
                user_id=user_id,
                purpose=req.purpose,
                limit=req.limit,
                exclude_place_ids=exclude_place_ids
            )
        else:
            recommendations = ai_service._get_popular_recommendations(
                db=db,
                purpose=req.purpose,
                limit=req.limit,
                exclude_place_ids=exclude_place_ids
            )
            algorithm = "popular"

        return RecommendationResponse(
            recommendations=[PlaceRecommendation(**r) for r in recommendations],
            algorithm=algorithm,
            total_count=len(recommendations)
        )
    except Exception as e:
        print(f"POST 추천 오류: {e}")
        return RecommendationResponse(
            recommendations=[],
            algorithm="error",
            total_count=0
        )


@router.get("/api/ai/recommendations/similar/{place_id}", response_model=List[SimilarPlaceResponse])
def get_similar_places(
    place_id: int,
    limit: int = Query(5, ge=1, le=20),
    db: Session = Depends(get_db)
):
    """
    유사한 장소 추천
    
    - 콘텐츠 기반 유사도 계산
    - 특정 장소와 비슷한 분위기/카테고리의 장소 추천
    """
    # 장소 존재 확인
    place = db.query(models.Place).filter(models.Place.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="장소를 찾을 수 없습니다.")
    
    try:
        similar = ai_service.get_similar_places(db, place_id, limit)
        return [SimilarPlaceResponse(**s) for s in similar]
    except Exception as e:
        print(f"❌ 유사 장소 추천 오류: {e}")
        return []


@router.post("/api/ai/recommendations/click")
async def track_recommendation_click(
    place_id: int,
    background_tasks: BackgroundTasks,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    추천 클릭 추적 (A/B 테스트 및 성능 측정용)
    비동기로 처리하여 사용자 응답 지연 없음
    """
    if not current_user:
        return {"success": False, "message": "로그인이 필요합니다."}
    
    try:
        # Track click in background
        ai_service.track_recommendation_click(db, current_user.id, place_id)
        
        # Record click action in background (non-blocking)
        background_tasks.add_task(
            _record_action_background,
            user_id=current_user.id,
            action_type="click",
            place_id=place_id,
            action_value=1.0,
            context={
                "source": "recommendation",
                "recorded_at": datetime.now().isoformat()
            }
        )
        
        return {"success": True, "message": "클릭이 추적되었습니다."}
    except Exception as e:
        print(f"❌ 클릭 추적 오류: {e}")
        return {"success": False, "message": "추적 중 오류가 발생했습니다."}


@router.get("/api/ai/stats")
def get_recommendation_stats(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """
    사용자의 AI 추천 통계
    
    - 총 행동 수
    - 선호 카테고리
    - 추천 클릭률
    """
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    try:
        from sqlalchemy import func
        
        # 행동 통계
        action_stats = db.query(
            models.UserAction.action_type,
            func.count(models.UserAction.id)
        ).filter(models.UserAction.user_id == current_user.id)\
         .group_by(models.UserAction.action_type)\
         .all()
        
        # 선호도 벡터
        user_pref = db.query(models.UserPreferenceVector)\
            .filter(models.UserPreferenceVector.user_id == current_user.id)\
            .first()
        
        # 추천 로그 통계
        rec_logs = db.query(models.RecommendationLog)\
            .filter(models.RecommendationLog.user_id == current_user.id)\
            .all()
        
        total_recs = len(rec_logs)
        clicked_recs = sum(1 for r in rec_logs if r.clicked_place_id)
        click_rate = (clicked_recs / total_recs * 100) if total_recs > 0 else 0
        
        # 선호 카테고리 분석
        preferences = {}
        if user_pref:
            pref_map = {
                "한식": user_pref.korean_preference,
                "양식": user_pref.western_preference,
                "일식": user_pref.japanese_preference,
                "중식": user_pref.chinese_preference,
                "카페": user_pref.cafe_preference,
                "술집": user_pref.bar_preference
            }
            preferences = dict(sorted(pref_map.items(), key=lambda x: x[1], reverse=True)[:3])
        
        return {
            "total_actions": sum(count for _, count in action_stats),
            "action_breakdown": {action: count for action, count in action_stats},
            "top_preferences": preferences,
            "recommendation_stats": {
                "total_recommendations": total_recs,
                "clicked": clicked_recs,
                "click_rate": round(click_rate, 1)
            },
            "personalization_level": "high" if (user_pref and user_pref.action_count >= 20) else 
                                     "medium" if (user_pref and user_pref.action_count >= 5) else "low"
        }
    except Exception as e:
        print(f"❌ 통계 조회 오류: {e}")
        return {
            "total_actions": 0,
            "action_breakdown": {},
            "top_preferences": {},
            "recommendation_stats": {},
            "personalization_level": "low"
        }
