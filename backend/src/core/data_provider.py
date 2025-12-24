import requests
import urllib.parse
import time
from typing import List, Any
from sqlalchemy.orm import Session
from .config import settings

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
        if not query: return 0.0, 0.0
        try:
            url = f"https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query={urllib.parse.quote(query)}"
            res = requests.get(url, headers=self.map_headers)
            if res.status_code == 200:
                data = res.json()
                if data.get('addresses'):
                    item = data['addresses'][0]
                    return float(item['y']), float(item['x'])
        except Exception as e:
            print(f"Geocoding Error ({query}): {e}")
        return 0.0, 0.0

    def search_places_all_queries(self, queries: List[str], region_name: str, center_lat: float, center_lng: float, db: Session = None) -> List[PlaceInfo]:
        from ..repositories.meeting_repository import MeetingRepository
        repo = MeetingRepository()
        
        results = []
        seen_names = set()

        for q in queries:
            # 1. [DB 조회]
            if db:
                # DB에서 넉넉하게 50개까지 찾아봄
                db_places = repo.search_places_by_keyword(db, q) 
                for p in db_places:
                    if p.name in seen_names: continue
                    
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
            
            # DB만으로 30개 넘으면 API 호출 생략
            if len(results) >= 30:
                continue

            # 2. [API 호출] 부족하면 네이버 검색
            search_query = f"{region_name} {q}" if region_name else q
            
            # 🌟 최대 10페이지(50개)까지 조회 (기존 5페이지 -> 10페이지)
            # display=5 (Max)
            for start_idx in range(1, 50, 5):
                if len(results) >= 30: # 목표 달성 시 중단
                    break

                try:
                    # 🌟 약간의 딜레이로 API 안정성 확보
                    time.sleep(0.05) 
                    
                    url = f"https://openapi.naver.com/v1/search/local.json?query={urllib.parse.quote(search_query)}&display=5&start={start_idx}&sort=random"
                    res = requests.get(url, headers=self.search_headers)
                    
                    if res.status_code == 200:
                        items = res.json().get('items', [])
                        if not items: break 

                        for item in items:
                            clean_name = item['title'].replace('<b>', '').replace('</b>', '')
                            
                            if clean_name in seen_names: continue
                            
                            # 도로명 주소 우선, 없으면 지번 주소
                            address = item['roadAddress'] or item['address']
                            lat, lng = self.get_coordinates(address)
                            
                            # 좌표 변환 실패 시 로그 출력 (디버깅용)
                            if lat == 0.0: 
                                # print(f"⚠️ 좌표 변환 실패: {clean_name} ({address})")
                                continue

                            if center_lat != 0.0 and ((lat - center_lat)**2 + (lng - center_lng)**2)**0.5 > 0.05:
                                continue

                            seen_names.add(clean_name)
                            category = item['category'].split('>')[0] if item['category'] else "기타"
                            
                            # DB 저장
                            if db:
                                try:
                                    if not repo.get_place_by_name(db, clean_name):
                                        repo.create_place(
                                            db, name=clean_name, category=category, 
                                            lat=lat, lng=lng, tags=[q], rating=0.0, address=address
                                        )
                                        db.commit() 
                                except Exception:
                                    db.rollback()

                            results.append(PlaceInfo(
                                name=clean_name,
                                category=category,
                                location=[lat, lng],
                                avg_rating=0.0,
                                tags=[q],
                                address=address
                            ))
                except Exception as e:
                    print(f"Search API Error: {e}")
                    break
        
        return results