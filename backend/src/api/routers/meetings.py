from fastapi import APIRouter, Depends, BackgroundTasks, Query
from sqlalchemy.orm import Session
from typing import List

from core.database import get_db
from domain import models
from schemas import meeting as schemas
from services.meeting_service import MeetingService, data_provider
from api.dependencies import get_current_user

router = APIRouter()
meeting_service = MeetingService()

# 🌟 [신규 추가] 지하철역 자동완성 API
@router.get("/api/places/autocomplete")
def autocomplete_hotspots(query: str = Query(..., min_length=1)):
    """
    입력된 검색어(예: '강남')가 포함된 지하철역/핫스팟 목록을 반환합니다.
    (TransportEngine에 정의된 좌표 DB 사용)
    """
    return meeting_service.search_hotspots(query)

# 🌟 [수정] 프론트엔드가 'lat', 'lng' 키를 사용하므로 키 이름 변경
@router.get("/api/places/search")
def search_places(query: str = Query(..., min_length=1), db: Session = Depends(get_db)):
    """
    네이버 로컬 검색 API를 통해 장소를 검색합니다.
    """
    # data_provider의 search_places_all_queries를 재활용
    results = data_provider.search_places_all_queries([query], "", 0.0, 0.0, db=db)
    
    response = []
    for place in results:
        # 좌표 배열 처리
        lat = place.location[0] if isinstance(place.location, (list, tuple)) else place.location
        lng = place.location[1] if isinstance(place.location, (list, tuple)) else 0.0

        response.append({
            "title": place.name,
            "address": place.address or "",
            "category": place.category,
            # 🌟 수정: mapx, mapy 대신 lat, lng 사용 (프론트엔드 호환)
            "lat": lat,
            "lng": lng,
            "link": "" 
        })
    return response

@router.post("/api/recommend")
def get_recommendation(req: schemas.RecommendRequest, db: Session = Depends(get_db)):
    """
    사용자 취향/목적 기반 단순 장소 추천
    (DB 검색 -> 없으면 네이버 검색 -> 점수 산정 -> 반환)
    """
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
    current_user: models.User = Depends(get_current_user) # 👈 유저 인증 추가
):
    # 🌟 로그인된 유저의 ID를 일정 정보에 할당
    event.user_id = current_user.id
    return meeting_service.create_event(db, event)

@router.get("/api/events", response_model=List[schemas.EventSchema])
def get_events(
    current_user: models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    return meeting_service.get_events(db, current_user.id)

@router.delete("/api/events/{event_id}")
def delete_event(event_id: str, db: Session = Depends(get_db)):
    meeting_service.delete_event(db, event_id)
    return {"detail": "Deleted"}