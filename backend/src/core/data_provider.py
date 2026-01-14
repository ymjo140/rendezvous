import requests
import urllib.parse
import time
import json
import math
from typing import List, Any, Dict
from sqlalchemy.orm import Session
from sqlalchemy import text
from pyproj import Transformer # 🌟 [수정] Deprecated된 transform 대신 Transformer 사용 (500 에러 해결)

class PlaceInfo:
    def __init__(self, name, category, location, wemeet_rating=0.0, tags=None, address=None, routes=None):
        # 🌟 [수정] avg_rating을 DB 컬럼명인 wemeet_rating으로 변경
        self.name = clean_text(name)
        self.category = category
        self.location = location 
        self.wemeet_rating = wemeet_rating
        self.tags = tags or []
        self.address = address or ""
        self.routes = routes or {} 

def clean_text(text: str) -> str:
    """HTML 태그 제거 및 텍스트 정제"""
    if not text: return ""
    return text.replace('<b>', '').replace('</b>', '').replace('&amp;', '&')

class RealDataProvider:
    def __init__(self):
        self.search_headers = {
            "X-Naver-Client-Id": "7hzPrrLNl9CqLaAffBDb", 
            "X-Naver-Client-Secret": "aijs1MO01i"
        }
        
        # 🌟 [수정] Render(Python 3.13) 환경에 최적화된 Transformer 설정
        try:
            self.transformer = Transformer.from_crs("epsg:2097", "epsg:4326", always_xy=True)
            print("✅ [Init] 최신 좌표 변환기(Transformer) 설정 완료")
        except Exception as e:
            print(f"⚠️ [Warning] Transformer 설정 실패: {e}")
            self.transformer = None

    def convert_katech_to_wgs84(self, mapx, mapy):
        """네이버 KATECH 좌표를 위경도로 변환"""
        try:
            if not self.transformer or not mapx or not mapy:
                return 0.0, 0.0
            mx, my = float(mapx), float(mapy)
            # 🌟 Transformer.transform 사용 (반환값: lng, lat)
            lng, lat = self.transformer.transform(mx, my)
            if not (33 < lat < 43) or not (124 < lng < 132):
                return 0.0, 0.0
            return lat, lng
        except:
            return 0.0, 0.0

    def calculate_distance_km(self, lat1, lon1, lat2, lon2):
        R = 6371 
        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)
        a = math.sin(d_lat / 2) * math.sin(d_lat / 2) + \
            math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
            math.sin(d_lon / 2) * math.sin(d_lon / 2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

    def search_places_all_queries(self, queries: List[str], region_name: str, center_lat: float, center_lng: float, start_locations: List[Dict] = None, db: Session = None) -> List[PlaceInfo]:
        # 🌟 [수정] ImportError 해결을 위한 절대 경로 임포트
        from repositories.meeting_repository import MeetingRepository
        repo = MeetingRepository()
        
        results = []
        seen_names = set()
        start_locations = start_locations or []

        # region_name이 있으면 -> 추천 모드 (1km 제한)
        # region_name이 없으면 -> 일반 검색 모드 (거리 제한 없음)
        is_recommendation_mode = bool(region_name and region_name.strip())

        # ---------------------------------------------------------
        # ⚡ [Pre-fetch] 시간 정보 미리 조회 (기존 로직 유지)
        # ---------------------------------------------------------
        preloaded_routes = {}
        
        if is_recommendation_mode and db and start_locations:
            print(f"⏳ [Pre-fetch] '{region_name}'까지의 소요시간 미리 조회 중...")
            for start in start_locations:
                s_name = start.get('name', '')
                if not s_name: continue
                
                try:
                    sql = text("""
                        SELECT total_time 
                        FROM public.travel_time_cache 
                        WHERE start_name = :start AND end_name = :end
                        LIMIT 1
                    """)
                    row = db.execute(sql, {"start": s_name, "end": region_name}).fetchone()
                    
                    if row:
                        preloaded_routes[s_name] = {
                            "time": row[0],
                            "transportation": "public",
                            "source": "db_cache"
                        }
                    else:
                        preloaded_routes[s_name] = {
                            "time": 0, 
                            "transportation": "unknown", 
                            "source": "not_found"
                        }
                except Exception as e:
                    preloaded_routes[s_name] = {"time": 0, "transportation": "error"}

        mode_str = f"'{region_name}' 주변 1km" if is_recommendation_mode else "일반(전국)"
        print(f"\n🚀 [Start] {mode_str} 검색 시작: {queries}")

        try:
            for q in queries:
                if len(results) >= 50: break
                
                search_query = f"{region_name} {q}" if is_recommendation_mode else q
                
                # 기존의 20개씩 5페이지 페이징 로직 보존
                for start_idx in range(1, 100, 20): 
                    if len(results) >= 50: break
                    time.sleep(0.1) 
                    
                    url = f"https://openapi.naver.com/v1/search/local.json?query={urllib.parse.quote(search_query)}&display=20&start={start_idx}&sort=random"
                    
                    res = requests.get(url, headers=self.search_headers, timeout=3)
                    if res.status_code != 200: break

                    items = res.json().get('items', [])
                    if not items: break

                    for item in items:
                        clean_name = clean_text(item['title'])
                        if clean_name in seen_names: continue
                        
                        lat, lng = self.convert_katech_to_wgs84(item.get('mapx'), item.get('mapy'))
                        if lat == 0.0 or lng == 0.0: continue

                        # 거리 필터링 (추천 모드일 때만 1km 컷)
                        if is_recommendation_mode:
                            dist = self.calculate_distance_km(center_lat, center_lng, lat, lng)
                            if dist > 1.0: continue 
                        
                        seen_names.add(clean_name)
                        address = item['roadAddress'] or item['address']
                        category = item['category'].split('>')[0] if item['category'] else "기타"
                        
                        # DB 저장 (Caching)
                        if db:
                            try:
                                if not repo.get_place_by_name(db, clean_name):
                                    repo.create_place(db, clean_name, category, lat, lng, [q], 0.0, address)
                                    db.commit()
                            except: 
                                db.rollback()

                        results.append(PlaceInfo(
                            name=clean_name, 
                            category=category, 
                            location=[lat, lng], 
                            wemeet_rating=0.0, # 🌟 avg_rating 대신 wemeet_rating 사용
                            tags=[q], 
                            address=address,
                            routes=preloaded_routes 
                        ))
                        
        except Exception as e:
            print(f"❌ [Error] {e}")
        
        print(f"🏁 [End] 총 {len(results)}개 장소 처리 완료")
        return results