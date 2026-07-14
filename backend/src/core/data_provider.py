import os
import requests
import urllib.parse
import time
import json
import math
from typing import List, Any, Dict
from sqlalchemy.orm import Session
from sqlalchemy import text
from pyproj import Transformer # 🌟 [Fix] 최신 pyproj 방식 적용

class PlaceInfo:
    def __init__(self, name, category, location, wemeet_rating=0.0, tags=None, address=None, routes=None):
        # 🌟 [Fix] DB 컬럼명 wemeet_rating 반영
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
        # 키는 env로(하드코딩 금지) — geocode 등과 동일한 NAVER_SEARCH_* 사용
        self.search_headers = {
            "X-Naver-Client-Id": os.getenv("NAVER_SEARCH_ID", ""),
            "X-Naver-Client-Secret": os.getenv("NAVER_SEARCH_SECRET", ""),
        }
        
        # [Fix] Render/Linux Transformer setup
        try:
            # Naver Local Search uses TM128 (EPSG:5179) coordinates
            self.transformers = [
                Transformer.from_crs("epsg:5179", "epsg:4326", always_xy=True),
                Transformer.from_crs("epsg:2097", "epsg:4326", always_xy=True),
            ]
            self.fallback_transformer = Transformer.from_crs("epsg:2097", "epsg:4326", always_xy=True)
            print("[Init] Transformer setup complete")
        except Exception as e:
            print(f"[Warning] Transformer setup failed: {e}")
            self.transformers = []
            self.fallback_transformer = None

    def convert_katech_to_wgs84(self, mapx, mapy):
        """KATECH -> WGS84 conversion."""
        try:
            if not mapx or not mapy:
                return 0.0, 0.0
            mx, my = float(mapx), float(mapy)

            if 33 < my < 43 and 124 < mx < 132:
                return my, mx

            for transformer in self.transformers:
                lng, lat = transformer.transform(mx, my)
                if 33 < lat < 43 and 124 < lng < 132:
                    return lat, lng

            if self.fallback_transformer:
                lng, lat = self.fallback_transformer.transform(mx, my)
                if 33 < lat < 43 and 124 < lng < 132:
                    return lat, lng

            return 0.0, 0.0
        except:
            return 0.0, 0.0

    def calculate_distance_km(self, lat1, lon1, lat2, lon2):
        """하버사인 공식으로 두 좌표 간 거리 계산 (km)"""
        R = 6371 
        d_lat = math.radians(lat2 - lat1)
        d_lon = math.radians(lon2 - lon1)
        a = math.sin(d_lat / 2)**2 + \
            math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * \
            math.sin(d_lon / 2)**2
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
        return R * c

    def search_places_all_queries(self, queries: List[str], region_name: str, center_lat: float, center_lng: float, start_locations: List[Dict] = None, db: Session = None) -> List[PlaceInfo]:
        """
        네이버 지역 검색 API를 사용하여 장소를 검색하고 DB에 캐싱합니다.
        - Paging: 최대 100개까지 검색 (20개 * 5페이지)
        - Pre-fetch: 출발지에서의 소요 시간을 DB 캐시에서 미리 조회
        """
        
        # 🌟 [Fix] ImportError 해결을 위한 절대 경로 임포트 사용
        from repositories.meeting_repository import MeetingRepository
        repo = MeetingRepository()
        
        results = []
        seen_names = set()
        start_locations = start_locations or []

        # region_name 유무에 따라 추천 모드(1km 제한) vs 일반 검색 모드 결정
        is_recommendation_mode = bool(region_name and region_name.strip())

        # ---------------------------------------------------------
        # ⚡ [기존 기능 유지] 시간 정보 미리 조회 (Pre-fetch)
        # ---------------------------------------------------------
        preloaded_routes = {}
        
        if is_recommendation_mode and db and start_locations:
            print(f"⏳ [Pre-fetch] '{region_name}'까지의 소요시간 미리 조회 중...")
            for start in start_locations:
                s_name = start.get('name', '')
                if not s_name: continue
                
                try:
                    # travel_time_cache 테이블에서 소요 시간 조회
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
                # 결과가 50개 이상이면 조기 종료
                if len(results) >= 50: break
                
                search_query = f"{region_name} {q}" if is_recommendation_mode else q
                
                # 🌟 [기존 기능 유지] 20개씩 5페이지 페이징 (최대 100개 스캔)
                for start_idx in range(1, 100, 20): 
                    if len(results) >= 50: break
                    time.sleep(0.1) # API 호출 제한 방지
                    
                    url = f"https://openapi.naver.com/v1/search/local.json?query={urllib.parse.quote(search_query)}&display=20&start={start_idx}&sort=random"
                    
                    try:
                        res = requests.get(url, headers=self.search_headers, timeout=3)
                        if res.status_code != 200: break

                        items = res.json().get('items', [])
                        if not items: break

                        for item in items:
                            clean_name = clean_text(item['title'])
                            if clean_name in seen_names: continue
                            
                            lat, lng = self.convert_katech_to_wgs84(item.get('mapx'), item.get('mapy'))
                            if lat == 0.0 or lng == 0.0: continue

                            # 추천 모드일 때만 1km 반경 필터링
                            if is_recommendation_mode:
                                dist = self.calculate_distance_km(center_lat, center_lng, lat, lng)
                                if dist > 1.0: continue 
                            
                            seen_names.add(clean_name)
                            address = item['roadAddress'] or item['address']
                            category = item['category'].split('>')[0] if item['category'] else "기타"
                            
                            # 검색된 장소 DB에 저장 (캐싱)
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
                                wemeet_rating=0.0, # 기본값 0.0 (추후 로직에서 업데이트)
                                tags=[q], 
                                address=address,
                                routes=preloaded_routes # 🌟 Pre-fetch된 시간 정보 포함
                            ))
                    except Exception as req_err:
                        print(f"⚠️ API Request Error: {req_err}")
                        continue
                        
        except Exception as e:
            print(f"❌ [Error] {e}")
        
        print(f"🏁 [End] 총 {len(results)}개 장소 처리 완료")
        return results
