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
    db_only: bool = Query(False, description="Return DB results only when true"),
    db: Session = Depends(get_db)
):
    results = []
    seen = set()

    db_query = db.query(models.Place).filter(models.Place.name.ilike(f"%{query}%"))
    if main_category:
        db_query = db_query.filter(models.Place.main_category == main_category.upper())

    db_places = db_query.limit(50).all()
    for p in db_places:
        name = p.name or ""
        if name and name not in seen:
            seen.add(name)
            results.append({
                "id": p.id,
                "name": name,
                "title": name,
                "address": p.address or "",
                "category": p.cuisine_type or p.category or "",
                "main_category": p.main_category,
                "lat": p.lat,
                "lng": p.lng,
                "features": p.features or {},
                "vibe_tags": p.vibe_tags or [],
                "business_hours": p.business_hours or "",
                "phone": p.phone or "",
                "price_range": p.price_range or "",
                "wemeet_rating": p.wemeet_rating or 0.0,
                "review_count": p.review_count or 0,
                "external_link": p.external_link or "",
                "source": "db"
            })

    if db_only:
        return results

    ext_results = data_provider.search_places_all_queries([query], "", 0.0, 0.0, db=db)
    for place in ext_results:
        name = place.name or ""
        if not name or name in seen:
            continue
        lat = place.location[0] if isinstance(place.location, (list, tuple)) else place.location
        lng = place.location[1] if isinstance(place.location, (list, tuple)) else 0.0
        results.append({
            "id": None,
            "name": name,
            "title": name,
            "address": place.address or "",
            "category": place.category or "",
            "main_category": "",
            "lat": lat,
            "lng": lng,
            "features": {},
            "vibe_tags": [],
            "business_hours": "",
            "phone": "",
            "price_range": "",
            "wemeet_rating": 0.0,
            "review_count": 0,
            "external_link": "",
            "source": "external"
        })

    return results


@router.get("/api/places/{place_id}")
def get_place_detail(
    place_id: int,
    reviews_limit: int = Query(20, le=50),
    db: Session = Depends(get_db)
):
    place = db.query(models.Place).filter(models.Place.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    reviews_query = db.query(models.Review).filter(models.Review.place_name == place.name)
    total_reviews = reviews_query.count()
    reviews = reviews_query.order_by(models.Review.created_at.desc()).limit(reviews_limit).all()

    users_map = {}
    user_ids = {r.user_id for r in reviews}
    if user_ids:
        users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
        users_map = {u.id: u for u in users}

    review_items = []
    for r in reviews:
        user = users_map.get(r.user_id)
        review_items.append({
            "id": r.id,
            "user_id": r.user_id,
            "user_name": user.name if user else "Unknown",
            "rating": r.rating,
            "scores": {
                "taste": r.score_taste,
                "service": r.score_service,
                "price": r.score_price,
                "vibe": r.score_vibe
            },
            "comment": r.comment,
            "tags": r.tags or [],
            "image_urls": r.image_urls or [],
            "created_at": r.created_at.strftime("%Y-%m-%d")
        })

    avg_rating = place.wemeet_rating or 0.0
    if total_reviews > 0:
        avg_rating = sum(r.rating for r in reviews) / max(len(reviews), 1)

    features = place.features or {}
    raw_menus = features.get("menus") or features.get("menu") or []
    menus = []
    if isinstance(raw_menus, list):
        for item in raw_menus:
            if isinstance(item, dict):
                name = item.get("name") or item.get("title") or ""
                price = item.get("price")
                menus.append({"name": name, "price": price})
            elif isinstance(item, str):
                menus.append({"name": item, "price": None})
    elif isinstance(raw_menus, dict):
        name = raw_menus.get("name") or raw_menus.get("title") or ""
        menus.append({"name": name, "price": raw_menus.get("price")})

    tags = []
    for tag in (place.tags or []) + (place.vibe_tags or []):
        if tag and tag not in tags:
            tags.append(tag)

    return {
        "id": place.id,
        "name": place.name,
        "category": place.cuisine_type or place.category or "",
        "main_category": place.main_category,
        "address": place.address or "",
        "lat": place.lat,
        "lng": place.lng,
        "rating": avg_rating,
        "review_count": total_reviews if total_reviews > 0 else (place.review_count or 0),
        "phone": place.phone or "",
        "business_hours": place.business_hours or "",
        "price_range": place.price_range or "",
        "external_link": place.external_link or "",
        "tags": tags,
        "menus": menus,
        "reviews": review_items
    }

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
def get_recommendation(
    req: schemas.RecommendRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # 로그인 시 개인 취향 벡터로 재랭킹(미로그인이면 None → 지리/태그 추천 유지)
    user_id = current_user.id if current_user else None
    return meeting_service.get_recommendations_direct(db, req, user_id=user_id)

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
