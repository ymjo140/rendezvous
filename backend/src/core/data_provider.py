import requests
import urllib.parse
from typing import List, Any
from sqlalchemy.orm import Session # DB 세션을 받기 위해 필요
from .config import settings

# 🌟 DB 접근을 위해 Repository 임포트 (순환 참조 방지를 위해 메서드 내부에서 임포트하거나 여기서 임포트)
# 여기서는 메서드 인자로 db 세션을 받고, 직접 쿼리를 날리거나 repo를 사용하도록 구조를 잡습니다.

class PlaceInfo:
    def __init__(self, name, category, location, avg_rating=0.0, tags=None, address=None):
        self.name = name
        self.category = category
        self.location = location  # [lat, lng]
        self.avg_rating = avg_rating
        self.tags = tags or []
        self.address = address or ""

class RealDataProvider:
    def __init__(self):
        self.search_headers = {
            "X-Naver-Client-Id": settings.NAVER_SEARCH_ID,
            "X-Naver-Client-Secret": settings.NAVER_SEARCH_SECRET
        }
        self.map_headers = {
            "X-NCP-APIGW-API-KEY-ID": settings.NAVER_MAP_ID,
            "X-NCP-APIGW-API-KEY": settings.NAVER_MAP_SECRET
        }

    def get_coordinates(self, query: str):
        try:
            url = f"https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query={urllib.parse.quote(query)}"
            res = requests.get(url, headers=self.map_headers)
            if res.status_code == 200:
                data = res.json()
                if data.get('addresses'):
                    item = data['addresses'][0]
                    return float(item['y']), float(item['x'])
        except:
            pass
        return 0.0, 0.0

    # 🌟 [핵심 수정] DB 세션을 인자로 받아서 "DB 조회 -> API 호출 -> DB 저장" 흐름 구현
    def search_places_all_queries(self, queries: List[str], region_name: str, center_lat: float, center_lng: float, db: Session = None) -> List[PlaceInfo]:
        from ..repositories.meeting_repository import MeetingRepository # 순환 참조 방지
        repo = MeetingRepository()
        
        results = []
        seen_names = set()

        for q in queries:
            # 1. 🌟 [DB 조회] 먼저 우리 DB에 있는지 확인
            if db:
                # DB에서 이름으로 검색 (부분 일치)
                db_places = repo.search_places_by_keyword(db, q)
                for p in db_places:
                    if p.name in seen_names: continue
                    
                    # 거리 필터링 (필요시)
                    if center_lat != 0.0 and ((p.lat - center_lat)**2 + (p.lng - center_lng)**2)**0.5 > 0.05:
                        continue

                    seen_names.add(p.name)
                    results.append(PlaceInfo(
                        name=p.name,
                        category=p.category,
                        location=[p.lat, p.lng],
                        avg_rating=p.wemeet_rating or 0.0,
                        tags=p.tags if isinstance(p.tags, list) else [],
                        address=p.address
                    ))
            
            # DB에서 충분히 찾았으면 API 호출 건너뜀 (예: 5개 이상이면)
            if len(results) >= 5:
                continue

            # 2. [API 호출] DB에 없거나 부족하면 네이버 검색
            if region_name:
                search_query = f"{region_name} {q}"
            else:
                search_query = q
            
            try:
                # 정확도순(random), 10개 검색
                url = f"https://openapi.naver.com/v1/search/local.json?query={urllib.parse.quote(search_query)}&display=50&sort=random"
                
                res = requests.get(url, headers=self.search_headers)
                if res.status_code == 200:
                    items = res.json().get('items', [])
                    for item in items:
                        clean_name = item['title'].replace('<b>', '').replace('</b>', '')
                        if clean_name in seen_names: continue
                        
                        address = item['address'] or item['roadAddress']
                        lat, lng = self.get_coordinates(address)
                        if lat == 0.0: continue

                        # 거리 필터링
                        if center_lat != 0.0 and ((lat - center_lat)**2 + (lng - center_lng)**2)**0.5 > 0.05:
                            continue

                        seen_names.add(clean_name)
                        category = item['category'].split('>')[0] if item['category'] else "기타"
                        
                        # 3. 🌟 [DB 저장] 새로 찾은 장소를 우리 DB에 저장 (Caching)
                        if db:
                            try:
                                if not repo.get_place_by_name(db, clean_name):
                                    repo.create_place(
                                        db, 
                                        name=clean_name, 
                                        category=category, 
                                        lat=lat, 
                                        lng=lng, 
                                        tags=[q], 
                                        rating=0.0,
                                        address=address
                                    )
                                    # 저장 후 커밋은 상위 서비스 레이어에서 하거나 여기서 부분 커밋
                                    db.commit() 
                            except Exception as e:
                                db.rollback()
                                # print(f"DB Save Error: {e}")

                        results.append(PlaceInfo(
                            name=clean_name,
                            category=category,
                            location=[lat, lng],
                            avg_rating=0.0,
                            tags=[q],
                            address=address
                        ))
            except Exception as e:
                print(f"Search Error: {e}")
                continue
        
        return results