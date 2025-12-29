import requests
import urllib.parse
import time
import json
import math
from typing import List, Any, Dict
from sqlalchemy.orm import Session
from sqlalchemy import text
from pyproj import Proj, transform 

class PlaceInfo:
    def __init__(self, name, category, location, avg_rating=0.0, tags=None, address=None, routes=None):
        self.name = name
        self.category = category
        self.location = location 
        self.avg_rating = avg_rating
        self.tags = tags or []
        self.address = address or ""
        self.routes = routes or {} 

class RealDataProvider:
    def __init__(self):
        self.search_headers = {
            "X-Naver-Client-Id": "7hzPrrLNl9CqLaAffBDb", 
            "X-Naver-Client-Secret": "aijs1MO01i"
        }
        
        try:
            self.proj_katech = Proj('epsg:2097') 
            self.proj_wgs84 = Proj('epsg:4326')
            print("✅ [Init] 좌표 변환기 설정 완료")
        except Exception as e:
            print(f"⚠️ [Warning] pyproj 설정 실패: {e}")
            self.proj_katech = None
            self.proj_wgs84 = None

    def convert_katech_to_wgs84(self, mapx, mapy):
        try:
            if not self.proj_katech or not mapx or not mapy:
                return 0.0, 0.0
            mx, my = float(mapx), float(mapy)
            lng, lat = transform(self.proj_katech, self.proj_wgs84, mx, my)
            if not (33 < lat < 43) or not (124 < lng < 132):
                return 0.0, 0.0
            return lat, lng
        except Exception as e:
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
        from ..repositories.meeting_repository import MeetingRepository
        repo = MeetingRepository()
        
        results = []
        seen_names = set()
        start_locations = start_locations or []

        # ---------------------------------------------------------
        # ⚡ [최적화] 루프 밖에서 시간 정보 미리 조회 (Pre-fetch)
        # 햄버거집 개수만큼 DB를 조회하지 않고, 사람 수만큼(3~4번)만 조회해서 저장해둠
        # ---------------------------------------------------------
        preloaded_routes = {}
        
        if db and start_locations and region_name:
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
                    print(f"⚠️ DB Error for {s_name}: {e}")
                    preloaded_routes[s_name] = {"time": 0, "transportation": "error"}

        print(f"\n🚀 [Start] '{region_name}' 주변 1km 검색 시작: {queries}")

        try:
            for q in queries:
                if len(results) >= 50: break
                
                search_query = f"{region_name} {q}" if region_name else q
                
                for start_idx in range(1, 100, 20): 
                    if len(results) >= 50: break
                    time.sleep(0.1) 
                    
                    url = f"https://openapi.naver.com/v1/search/local.json?query={urllib.parse.quote(search_query)}&display=20&start={start_idx}&sort=random"
                    
                    res = requests.get(url, headers=self.search_headers)
                    if res.status_code != 200: break

                    items = res.json().get('items', [])
                    if not items: break

                    for item in items:
                        clean_name = item['title'].replace('<b>', '').replace('</b>', '')
                        if clean_name in seen_names: continue
                        
                        address = item['roadAddress'] or item['address']
                        mapx = item.get('mapx')
                        mapy = item.get('mapy')
                        
                        lat, lng = 0.0, 0.0
                        if mapx and mapy:
                            lat, lng = self.convert_katech_to_wgs84(mapx, mapy)
                        
                        if lat == 0.0 or lng == 0.0: continue

                        # 1km 거리 필터링
                        dist_from_center = self.calculate_distance_km(center_lat, center_lng, lat, lng)
                        if dist_from_center > 1.0: continue 
                        
                        seen_names.add(clean_name)
                        category = item['category'].split('>')[0] if item['category'] else "기타"
                        
                        # DB 저장
                        if db:
                            try:
                                if not repo.get_place_by_name(db, clean_name):
                                    repo.create_place(db, clean_name, category, lat, lng, [q], 0.0, address)
                                    db.commit()
                                    # print(f"   ✅ [Saved] {clean_name}")
                            except: 
                                db.rollback()

                        # ✅ 미리 조회해둔(preloaded_routes) 정보를 그대로 할당 (속도 매우 빠름)
                        results.append(PlaceInfo(
                            name=clean_name, 
                            category=category, 
                            location=[lat, lng], 
                            avg_rating=0.0, 
                            tags=[q], 
                            address=address,
                            routes=preloaded_routes # 👈 여기가 핵심
                        ))
                        
        except Exception as e:
            print(f"❌ [Error] {e}")
        
        print(f"🏁 [End] 총 {len(results)}개 장소 처리 완료")
        return results