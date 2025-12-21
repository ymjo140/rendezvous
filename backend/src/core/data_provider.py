import requests
import urllib.parse
from typing import List, Tuple
from .config import settings

class PlaceInfo:
    def __init__(self, name, category, location, avg_rating=0.0, tags=None, address=None):
        self.name = name
        self.category = category
        self.location = location
        self.avg_rating = avg_rating
        self.tags = tags or []
        self.address = address

class RealDataProvider:
    def __init__(self):
        self.headers_search = {
            "X-Naver-Client-Id": settings.NAVER_SEARCH_ID,
            "X-Naver-Client-Secret": settings.NAVER_SEARCH_SECRET
        }
        self.headers_map = {
            "X-NCP-APIGW-API-KEY-ID": settings.NAVER_MAP_ID,
            "X-NCP-APIGW-API-KEY": settings.NAVER_MAP_SECRET
        }

    def get_coordinates(self, address: str) -> Tuple[float, float]:
        if not settings.NAVER_MAP_ID: return 0.0, 0.0
        try:
            url = f"https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query={urllib.parse.quote(address)}"
            resp = requests.get(url, headers=self.headers_map)
            if resp.status_code == 200:
                data = resp.json()
                if data.get("addresses"):
                    return float(data["addresses"][0]["y"]), float(data["addresses"][0]["x"])
        except:
            pass
        return 0.0, 0.0

    def search_places(self, query: str, display: int = 5) -> List[PlaceInfo]:
        try:
            url = f"https://openapi.naver.com/v1/search/local.json?query={urllib.parse.quote(query)}&display={display}&sort=comment"
            resp = requests.get(url, headers=self.headers_search)
            if resp.status_code == 200:
                items = resp.json().get('items', [])
                results = []
                for item in items:
                    title = item['title'].replace('<b>', '').replace('</b>', '')
                    addr = item.get('roadAddress') or item.get('address')
                    lat, lng = self.get_coordinates(addr)
                    if lat == 0.0: continue
                    
                    results.append(PlaceInfo(
                        name=title,
                        category=item['category'],
                        location=[lat, lng],
                        tags=[query],
                        address=addr
                    ))
                return results
        except Exception as e:
            print(f"Search Error: {e}")
        return []