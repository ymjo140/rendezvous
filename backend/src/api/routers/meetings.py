from fastapi import APIRouter, Depends, BackgroundTasks, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List

from core.database import get_db
from domain import models
from schemas import meeting as schemas
from services.meeting_service import MeetingService

# 🌟 [수정됨] 파일 위치가 'core' 폴더이므로 경로를 core로 변경합니다.
from core.data_provider import RealDataProvider 
from api.dependencies import get_current_user

router = APIRouter()
meeting_service = MeetingService()

# 객체 생성
data_provider = RealDataProvider() 

# 🌟 [신규 추가] 지하철역 자동완성 API
@router.get("/api/places/autocomplete")
def autocomplete_hotspots(query: str = Query(..., min_length=1)):
    return meeting_service.search_hotspots(query)

# 🌟 [수정] 장소 검색 API
@router.get("/api/places/search")
def search_places(
    query: str = Query(..., min_length=1), 
    main_category: str = Query(None, description="RESTAURANT, CAFE, PUB, BUSINESS, CULTURE"),
    db: Session = Depends(get_db)
):
    # main_category가 있으면 DB에서 직접 검색
    if main_category:
        places = db.query(models.Place).filter(
            models.Place.main_category == main_category.upper(),
            models.Place.name.ilike(f"%{query}%")
        ).limit(50).all()
        
        return [{
            "id": p.id,
            "title": p.name,
            "address": p.address or "",
            "category": p.cuisine_type or p.category or "",
            "main_category": p.main_category,
            "lat": p.lat,
            "lng": p.lng,
            "features": p.features or {},
            "vibe_tags": p.vibe_tags or [],
            "business_hours": p.business_hours or "",
            "link": ""
        } for p in places]
    
    # 기존 로직: data_provider 객체 사용
    results = data_provider.search_places_all_queries([query], "", 0.0, 0.0, db=db)
    
    response = []
    for place in results:
        lat = place.location[0] if isinstance(place.location, (list, tuple)) else place.location
        lng = place.location[1] if isinstance(place.location, (list, tuple)) else 0.0

        response.append({
            "title": place.name,
            "address": place.address or "",
            "category": place.category,
            "lat": lat,
            "lng": lng,
            "link": "" 
        })
    return response


# 🆕 카테고리별 장소 목록 API (비즈니스, 문화생활 등)
@router.get("/api/places/by-category")
def get_places_by_category(
    main_category: str = Query(..., description="RESTAURANT, CAFE, PUB, BUSINESS, CULTURE"),
    cuisine_type: str = Query(None, description="세부 유형 (공유오피스, 영화관 등)"),
    lat: float = Query(None, description="중심 위도"),
    lng: float = Query(None, description="중심 경도"),
    radius_km: float = Query(5.0, description="반경 (km)"),
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db)
):
    """카테고리별 장소 검색 (비즈니스: 회의실/공유오피스, 문화생활: 영화관/공연장)"""
    
    query = db.query(models.Place).filter(
        models.Place.main_category == main_category.upper()
    )
    
    # cuisine_type 필터
    if cuisine_type:
        query = query.filter(models.Place.cuisine_type.ilike(f"%{cuisine_type}%"))
    
    # 위치 기반 필터 (간단한 bounding box)
    if lat and lng:
        # 대략적인 반경 계산 (1도 ≈ 111km)
        delta = radius_km / 111.0
        query = query.filter(
            models.Place.lat.between(lat - delta, lat + delta),
            models.Place.lng.between(lng - delta, lng + delta)
        )
    
    places = query.limit(limit).all()
    
    return [{
        "id": p.id,
        "name": p.name,
        "address": p.address or "",
        "category": p.cuisine_type or p.category or "",
        "main_category": p.main_category,
        "lat": p.lat,
        "lng": p.lng,
        "features": p.features or {},
        "vibe_tags": p.vibe_tags or [],
        "business_hours": p.business_hours or "",
        "wemeet_rating": p.wemeet_rating or 0.0,
        "review_count": p.review_count or 0
    } for p in places]

@router.post("/api/recommend")
def get_recommendation(req: schemas.RecommendRequest, db: Session = Depends(get_db)):
    return meeting_service.get_recommendations_direct(db, req)

# --- 회의/모임 흐름 ---
@router.post("/api/meeting-flow")
async def run_meeting_flow(req: schemas.MeetingFlowRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    return await meeting_service.run_meeting_flow(db, req, background_tasks)

@router.post("/api/meeting-flow/vote")
async def vote_meeting(req: schemas.VoteRequest, db: Session = Depends(get_db)):
    return await meeting_service.vote_meeting(db, req)

@router.post("/api/meeting-flow/confirm")
async def confirm_meeting(req: schemas.ConfirmRequest, db: Session = Depends(get_db)):
    return await meeting_service.confirm_meeting(db, req)

# --- 일정 (Events) ---
@router.post("/api/events", response_model=schemas.EventSchema)
def create_event(
    event: schemas.EventSchema, 
    db: Session = Depends(get_db),
    # 👇 일정 생성 시 유저 정보 필수
    current_user: models.User = Depends(get_current_user)
):
    event.user_id = current_user.id
    return meeting_service.create_event(db, event)

@router.get("/api/events", response_model=List[schemas.EventSchema])
def get_events(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return meeting_service.get_events(db, current_user.id)

@router.delete("/api/events/{event_id}")
def delete_event(
    event_id: str, 
    db: Session = Depends(get_db), 
    user = Depends(get_current_user) # 🌟 유저 정보 주입 확인
):
    # 🌟 인자 3개를 정확히 전달: (db, user_id, event_id)
    return meeting_service.delete_event(db, user.id, event_id)