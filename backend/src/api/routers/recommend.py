import random
from typing import List, Optional
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()

# --- 1. 데이터 모델 정의 ---
class UserLocation(BaseModel):
    lat: float
    lng: float

class UserProfile(BaseModel):
    id: int
    name: str
    location: Optional[UserLocation] = None
    preferences: Optional[dict] = {}

class RecommendRequest(BaseModel):
    users: List[UserProfile]
    purpose: str
    location_name: str         # 프론트에서 보낸 지역명 (예: "강남역", "중간지점")
    manual_locations: List[str]
    user_selected_tags: List[str]
    current_lat: float         # 프론트에서 계산한 중간 지점 위도
    current_lng: float         # 프론트에서 계산한 중간 지점 경도

# --- 2. [Mock Data] 가짜 사장님 데이터 (지점명 제거하여 범용성 확보) ---
# 특정 지역명(강남점 등)을 빼서 어디서든 어색하지 않게 수정했습니다.
MOCK_PARTNERS = {
    "술/회식": [
        {"name": "와인어게인", "cat": "와인바", "benefit": "🍾 샴페인 1병 무료 증정!", "img": "https://images.unsplash.com/photo-1510812431401-41d2bd2722f3?w=200&h=200&fit=crop"},
        {"name": "청담이상", "cat": "이자카야", "benefit": "🍶 사케 주문시 모듬꼬치 서비스", "img": "https://images.unsplash.com/photo-1579871494447-9811cf80d66c?w=200&h=200&fit=crop"},
        {"name": "펀비어킹", "cat": "맥주", "benefit": "🍟 감자튀김 무한 리필", "img": "https://images.unsplash.com/photo-1575037614876-c38a4d44f5b8?w=200&h=200&fit=crop"},
    ],
    "식사": [
        {"name": "오봉집", "cat": "한식", "benefit": "🥓 고기 주문시 쟁반국수 서비스", "img": "https://images.unsplash.com/photo-1594834749740-74b3f6764be4?w=200&h=200&fit=crop"},
        {"name": "토끼정", "cat": "일식", "benefit": "🍹 에이드 1+1 쿠폰 증정", "img": "https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=200&h=200&fit=crop"},
        {"name": "땀땀", "cat": "베트남", "benefit": "🍜 곱창국수 사이즈 업그레이드", "img": "https://images.unsplash.com/photo-1582878826629-29b7ad1cdc43?w=200&h=200&fit=crop"},
    ],
    "데이트": [
        {"name": "무드서울", "cat": "다이닝", "benefit": "🌹 예약시 창가석 확정 & 꽃 한송이", "img": "https://images.unsplash.com/photo-1514362545857-3bc16c4c7d1b?w=200&h=200&fit=crop"},
        {"name": "아웃백", "cat": "양식", "benefit": "🍰 디저트 케이크 무료 제공", "img": "https://images.unsplash.com/photo-1544148103-0773bf10d330?w=200&h=200&fit=crop"},
    ],
    "카페": [
        {"name": "아우어베이커리", "cat": "카페", "benefit": "🥐 빵 2만원 이상 구매시 아메리카노", "img": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200&h=200&fit=crop"},
        {"name": "스타벅스 리저브", "cat": "카페", "benefit": "☕ 텀블러 지참시 사이즈업", "img": "https://images.unsplash.com/photo-1509042239860-f550ce710b93?w=200&h=200&fit=crop"},
    ]
}

# --- 3. 추천 로직 ---
@router.post("/recommend")
async def recommend_places(req: RecommendRequest):
    print(f"📡 추천 요청: 목적={req.purpose}, 중심좌표={req.current_lat}, {req.current_lng}")
    
    # 1. 지역명 결정 (하드코딩 제거)
    # 프론트에서 보낸 location_name이 있으면 쓰고, 없으면 "중간 지점"
    display_name = req.location_name if req.location_name and req.location_name.strip() != "" else "중간 지점"

    # 2. AI 추천 장소 생성 (좌표 기반 동적 생성)
    # 요청받은 current_lat/lng 주변에 좌표를 생성합니다.
    ai_places = [
        {
            "id": 101, 
            "name": f"AI 추천 {req.purpose} 맛집 1호", 
            "category": req.purpose, 
            "score": 4.8, 
            # 중심 좌표에서 아주 약간 떨어진 위치 (약 100~200m)
            "location": [req.current_lat + 0.0015, req.current_lng + 0.0010],
            "address": f"{display_name} 근처 1번가", 
            "tags": ["AI픽", "인기급상승"],
            "image": None
        },
        {
            "id": 102, 
            "name": f"AI 추천 {req.purpose} 핫플 2호", 
            "category": req.purpose, 
            "score": 4.5,
            # 중심 좌표에서 다른 방향으로 떨어진 위치
            "location": [req.current_lat - 0.0012, req.current_lng - 0.0008],
            "address": f"{display_name} 먹자골목 23", 
            "tags": ["가성비", "분위기"],
            "image": None
        },
        {
            "id": 103, 
            "name": f"숨은 {req.purpose} 명소", 
            "category": req.purpose, 
            "score": 4.6,
            "location": [req.current_lat + 0.0005, req.current_lng - 0.0020],
            "address": f"{display_name} 뒤쪽 골목", 
            "tags": ["조용한", "나만아는"],
            "image": None
        }
    ]

    # 3. 비딩 제안 생성 (Mock Data 활용)
    target_partners = MOCK_PARTNERS.get(req.purpose, MOCK_PARTNERS["식사"])
    count = min(len(target_partners), 2)
    selected_partners = random.sample(target_partners, count)
    
    bidding_offers = []
    for idx, p in enumerate(selected_partners):
        bidding_offers.append({
            "id": 200 + idx,
            "shopName": p["name"], # 지점명 제거된 이름 사용
            "category": p["cat"],
            "benefit": p["benefit"],
            "distance": f"{random.randint(50, 400)}m", 
            "timeLeft": random.randint(5, 30),
            "image": p["img"]
        })

    # 4. 응답 반환 (요청받은 좌표 그대로 반환)
    return [{
        "region_name": display_name,  # "강남" 하드코딩 제거됨
        "lat": req.current_lat,       # 요청받은 좌표 사용
        "lng": req.current_lng,       # 요청받은 좌표 사용
        "places": ai_places,
        "bidding_offers": bidding_offers,
        "transit_info": None
    }]