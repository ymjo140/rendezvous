import requests
import urllib.parse
from typing import List, Any
from .config import settings  # 🌟 설정 파일 임포트

class PlaceInfo:
    def __init__(self, name, category, location, avg_rating=0.0, tags=None):
        self.name = name
        self.category = category
        self.location = location  # [lat, lng]
        self.avg_rating = avg_rating
        self.tags = tags or []

class RealDataProvider:
    # 🌟 [수정] 인자 제거 (settings에서 직접 가져옴)
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

    def search_places_all_queries(self, queries: List[str], region_name: str, center_lat: float, center_lng: float) -> List[PlaceInfo]:
        results = []
        seen_names = set()

        for q in queries:
            search_query = f"{region_name} {q}"
            try:
                url = f"https://openapi.naver.com/v1/search/local.json?query={urllib.parse.quote(search_query)}&display=5&sort=comment"
                res = requests.get(url, headers=self.search_headers)
                if res.status_code == 200:
                    items = res.json().get('items', [])
                    for item in items:
                        clean_name = item['title'].replace('<b>', '').replace('</b>', '')
                        if clean_name in seen_names: continue
                        
                        lat, lng = self.get_coordinates(item['address'] or item['roadAddress'])
                        if lat == 0.0: continue

                        if ((lat - center_lat)**2 + (lng - center_lng)**2)**0.5 > 0.05:
                            continue

                        seen_names.add(clean_name)
                        category = item['category'].split('>')[0] if item['category'] else "기타"
                        
                        results.append(PlaceInfo(
                            name=clean_name,
                            category=category,
                            location=[lat, lng],
                            avg_rating=0.0,
                            tags=[q.replace(" 맛집", "")]
                        ))
            except Exception as e:
                print(f"Search Error: {e}")
                continue
        
        return results

    # 🌟 [추가] 단일 검색 메서드 (search_places API용)
    def search_places(self, query: str, display: int = 5) -> List[PlaceInfo]:
        results = []
        try:
            url = f"https://openapi.naver.com/v1/search/local.json?query={urllib.parse.quote(query)}&display={display}&sort=comment"
            res = requests.get(url, headers=self.search_headers)
            if res.status_code == 200:
                items = res.json().get('items', [])
                for item in items:
                    clean_name = item['title'].replace('<b>', '').replace('</b>', '')
                    lat, lng = self.get_coordinates(item['address'] or item['roadAddress'])
                    
                    if lat == 0.0: continue
                    
                    results.append(PlaceInfo(
                        name=clean_name,
                        category=item['category'],
                        location=[lat, lng],
                        avg_rating=0.0,
                        tags=[query]
                    ))
        except Exception as e:
            print(f"Search Error: {e}")
        return results