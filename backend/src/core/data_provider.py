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
        self.location = location
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
            print(f"   ⚠️ [Geo Error] {e}")
        return 0.0, 0.0

    def search_places_all_queries(self, queries: List[str], region_name: str, center_lat: float, center_lng: float, db: Session = None) -> List[PlaceInfo]:
        from ..repositories.meeting_repository import MeetingRepository
        repo = MeetingRepository()
        
        results = []
        seen_names = set()

        print(f"\n🚀 [New Code Running] 검색 시작: {queries}")

        for q in queries:
            # 1. DB 조회
            if db:
                db_places = repo.search_places_by_keyword(db, q)
                print(f"   📚 DB 조회 결과: {len(db_places)}개")
                for p in db_places:
                    if p.name in seen_names: continue
                    # 거리 제한 해제됨
                    seen_names.add(p.name)
                    results.append(PlaceInfo(p.name, p.category, [p.lat, p.lng], p.wemeet_rating or 0.0, p.tags if isinstance(p.tags, list) else [], p.address))
            
            if len(results) >= 50:
                print("   ✅ DB 데이터로 충분하여 API 생략")
                continue

            # 2. API 호출
            search_query = f"{region_name} {q}" if region_name else q
            
            # 50개까지 검색 (거리 제한 없음)
            for start_idx in range(1, 50, 5):
                if len(results) >= 50: break

                try:
                    time.sleep(0.1) # API 보호
                    url = f"https://openapi.naver.com/v1/search/local.json?query={urllib.parse.quote(search_query)}&display=5&start={start_idx}&sort=random"
                    
                    res = requests.get(url, headers=self.search_headers)
                    if res.status_code == 200:
                        items = res.json().get('items', [])
                        print(f"   🔍 [Page {start_idx}] API 응답: {len(items)}건")

                        if not items: break

                        for item in items:
                            clean_name = item['title'].replace('<b>', '').replace('</b>', '')
                            
                            # 중복 체크 로그
                            if clean_name in seen_names:
                                # print(f"      [SKIP] 중복: {clean_name}")
                                continue
                            
                            address = item['roadAddress'] or item['address']
                            lat, lng = self.get_coordinates(address)
                            
                            # 좌표 변환 실패 로그
                            if lat == 0.0:
                                print(f"      🧨 [FAIL] 좌표 변환 실패: {clean_name}")
                                continue

                            # 🌟 [거리 제한 완전 해제]
                            # if center_lat != 0.0 and ... (삭제됨)

                            seen_names.add(clean_name)
                            category = item['category'].split('>')[0] if item['category'] else "기타"
                            
                            # DB 저장
                            if db:
                                try:
                                    if not repo.get_place_by_name(db, clean_name):
                                        repo.create_place(db, clean_name, category, lat, lng, [q], 0.0, address)
                                        db.commit()
                                        print(f"      💾 [SAVE] DB 저장: {clean_name}")
                                except: db.rollback()

                            results.append(PlaceInfo(clean_name, category, [lat, lng], 0.0, [q], address))
                    else:
                        print(f"   ❌ API Error: {res.status_code}")
                        break
                except Exception as e:
                    print(f"   ❌ Loop Error: {e}")
                    break
        
        print(f"🏁 [Result] 최종 반환 개수: {len(results)}개\n")
        return results