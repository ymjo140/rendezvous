import requests
import urllib.parse
import time
import json
from typing import List, Any
from sqlalchemy.orm import Session
# 👇 좌표 변환용 라이브러리 (pip install pyproj 필수)
from pyproj import Proj, transform 

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
        # ✅ Search API 키 (이건 잘 작동하는 키!)
        self.search_headers = {
            "X-Naver-Client-Id": "7hzPrrLNl9CqLaAffBDb", 
            "X-Naver-Client-Secret": "aijs1MO01i"
        }
        
        # ✅ KATECH(네이버) -> WGS84(위도/경도) 변환기 설정
        # 네이버 Search API의 mapx, mapy는 KATECH(TM128) 좌표계입니다.
        try:
            # EPSG:2097 (KATECH) -> EPSG:4326 (WGS84, 구글지도/네이버지도 GPS)
            self.proj_katech = Proj('epsg:2097') 
            self.proj_wgs84 = Proj('epsg:4326')
            print("✅ [Init] 좌표 변환기 설정 완료 (KATECH -> WGS84)")
        except Exception as e:
            print(f"⚠️ [Warning] pyproj 설정 실패: {e}")
            self.proj_katech = None
            self.proj_wgs84 = None

    def convert_katech_to_wgs84(self, mapx, mapy):
        """
        네이버 Search API가 주는 mapx, mapy(KATECH)를 위도(lat), 경도(lng)로 변환
        API 호출 없이 수학으로 계산하므로 210 에러가 절대 안 남.
        """
        try:
            if not self.proj_katech or not mapx or not mapy:
                return 0.0, 0.0
            
            # 네이버 mapx, mapy는 정수형 문자열로 옴 (예: "313438")
            mx, my = float(mapx), float(mapy)
            
            # 변환 실행 (API 호출 아님! 수학 계산임!)
            lng, lat = transform(self.proj_katech, self.proj_wgs84, mx, my)
            
            # 한국 좌표 범위 대충 맞는지 체크 (이상한 값이면 0.0)
            if not (33 < lat < 43) or not (124 < lng < 132):
                return 0.0, 0.0
                
            return lat, lng
        except Exception as e:
            # print(f"변환 에러: {e}") # 디버깅용
            return 0.0, 0.0

    def search_places_all_queries(self, queries: List[str], region_name: str, center_lat: float, center_lng: float, db: Session = None) -> List[PlaceInfo]:
        from ..repositories.meeting_repository import MeetingRepository
        repo = MeetingRepository()
        
        results = []
        seen_names = set()

        print(f"\n🚀 [Start] API 우회 모드: Geocoding 없이 좌표 자체 변환 시작: {queries}")

        try:
            for q in queries:
                if len(results) >= 50: break
                
                search_query = f"{region_name} {q}" if region_name else q
                
                # 빠르게 5페이지(25개)만 검색
                for start_idx in range(1, 100, 50): 
                    if len(results) >= 50: break
                    time.sleep(0.1) 
                    
                    url = f"https://openapi.naver.com/v1/search/local.json?query={urllib.parse.quote(search_query)}&display=100&start={start_idx}&sort=random"
                    
                    # ✅ 오직 Search API만 호출 (권한 문제 없음)
                    res = requests.get(url, headers=self.search_headers)
                    if res.status_code != 200:
                        print(f"🛑 [Search API Error] {res.status_code}")
                        break

                    items = res.json().get('items', [])
                    if not items: break

                    for item in items:
                        clean_name = item['title'].replace('<b>', '').replace('</b>', '')
                        if clean_name in seen_names: continue
                        
                        address = item['roadAddress'] or item['address']
                        
                        # 🔥 [핵심] 210 에러 나는 Geocoding API 대신 -> 내부 수학 변환 사용!
                        mapx = item.get('mapx')
                        mapy = item.get('mapy')
                        
                        lat, lng = 0.0, 0.0
                        if mapx and mapy:
                            lat, lng = self.convert_katech_to_wgs84(mapx, mapy)
                        
                        # 좌표 변환에 실패했더라도, DB에는 저장 (주소라도 있으니까)
                        
                        seen_names.add(clean_name)
                        category = item['category'].split('>')[0] if item['category'] else "기타"
                        
                        # ✅ DB 저장 (이제 좌표까지 포함해서 저장됩니다!)
                        if db:
                            try:
                                if not repo.get_place_by_name(db, clean_name):
                                    repo.create_place(db, clean_name, category, lat, lng, [q], 0.0, address)
                                    db.commit()
                                    print(f"   ✅ [Saved] {clean_name} (Lat: {lat:.5f}, Lng: {lng:.5f})")
                            except Exception as e: 
                                db.rollback()
                                # print(f"   ⚠️ [DB Error] {e}")

                        results.append(PlaceInfo(clean_name, category, [lat, lng], 0.0, [q], address))
                        
        except Exception as e:
            print(f"❌ [Error] {e}")
        
        print(f"🏁 [End] 총 {len(results)}개 장소 DB 저장 완료")
        return results