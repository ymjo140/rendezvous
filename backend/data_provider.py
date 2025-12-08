import requests
import numpy as np
import random
import re
from typing import List, Tuple
from algorithm import POI 

class RealDataProvider:
    def __init__(self, search_id: str, search_secret: str, map_id: str, map_secret: str):
        self.search_client_id = search_id
        self.search_client_secret = search_secret
        self.map_client_id = map_id
        self.map_client_secret = map_secret
        
        self.search_api_url = "https://openapi.naver.com/v1/search/local.json"
        self.geocode_api_url = "https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode"

    def get_coordinates(self, address: str) -> Tuple[float, float]:
        if not self.map_client_id: return 0.0, 0.0
        headers = { "X-NCP-APIGW-API-KEY-ID": self.map_client_id, "X-NCP-APIGW-API-KEY": self.map_client_secret }
        try:
            resp = requests.get(self.geocode_api_url, headers=headers, params={"query": address})
            if resp.status_code == 200:
                data = resp.json()
                if data.get("addresses"): return float(data["addresses"][0]["y"]), float(data["addresses"][0]["x"])
        except: pass
        return 0.0, 0.0

    def _clean_html(self, text):
        return re.sub('<[^<]+?>', '', text)

    def _get_real_coordinates(self, address, center_lat, center_lng):
        lat, lng = self.get_coordinates(address)
        if lat != 0.0: return lat, lng
        return center_lat + random.uniform(-0.002, 0.002), center_lng + random.uniform(-0.002, 0.002)

    # 🌟 [핵심 수정] 카테고리 및 태그 분석 강화
    def _analyze_attributes(self, title, category):
        tags = set() # 중복 방지 set 사용
        price = 2
        cat_key = "junk" 
        
        # 카테고리 파싱 (예: "음식점>한식>고기요리")
        cats = category.split(">")
        for c in cats:
            c = c.strip()
            if c: tags.add(c) # 상세 카테고리를 모두 태그로 추가
        
        category_clean = category.replace(">", " ").strip()
        title_clean = title.replace(" ", "")
        
        # 1. 워크스페이스
        if any(kw in category_clean for kw in ["공간대여", "스터디", "오피스", "회의", "세미나", "사무실", "비즈니스", "파티룸"]):
            cat_key = "workspace"
            tags.add("조용한"); tags.add("회의실")
            price = 3
        # 2. 카페
        elif any(kw in category_clean for kw in ["카페", "커피", "디저트", "베이커리", "찻집"]):
            cat_key = "cafe"
            tags.add("카페")
            if "디저트" in category_clean: tags.add("디저트")
            price = 2
        # 3. 술집
        elif any(kw in category_clean for kw in ["술집", "주점", "이자카야", "포차", "바", "호프", "맥주", "와인"]):
            cat_key = "pub"
            tags.add("술"); tags.add("시끌벅적")
            if "이자카야" in category_clean: tags.add("이자카야")
            price = 3
        # 4. 식당
        elif any(kw in category_clean for kw in ["음식점", "식당", "한식", "양식", "일식", "중식", "분식", "뷔페", "레스토랑"]):
            cat_key = "restaurant"
            tags.add("맛집")
            if "한식" in category_clean: tags.add("한식")
            if "양식" in category_clean: tags.add("양식")
            if "일식" in category_clean: tags.add("일식")
            if "중식" in category_clean: tags.add("중식")
            price = 3
        
        return cat_key, list(tags), price

    def search_places_all_queries(self, queries: List[str], region_name: str, center_lat: float, center_lng: float, allowed_types: List[str] = None) -> List[POI]:
        all_pois = []
        seen_titles = set()

        for query in queries[:15]:
            try:
                final_query = f"{region_name.split('(')[0]} {query}"
                headers = { "X-Naver-Client-Id": self.search_client_id, "X-Naver-Client-Secret": self.search_client_secret }
                resp = requests.get(self.search_api_url, headers=headers, params={"query": final_query, "display": 10, "sort": "random"}, timeout=2)
                
                if resp.status_code != 200: continue
                items = resp.json().get('items', [])
                
                for item in items:
                    title = self._clean_html(item.get("title", ""))
                    cat_str = item.get("category", "")
                    
                    if not title or title in seen_titles: continue
                    seen_titles.add(title)
                    
                    cat_key, tags, price = self._analyze_attributes(title, cat_str)
                    
                    # 필터링
                    if cat_key == "junk": continue
                    if allowed_types:
                         if cat_key in allowed_types: pass
                         elif "culture" in allowed_types and cat_key in ["culture", "activity", "cafe"]: pass 
                         else: continue

                    # 🌟 주소 확보 (도로명 우선, 없으면 지번)
                    road_addr = item.get('roadAddress', '')
                    jibun_addr = item.get('address', '')
                    full_address = road_addr if road_addr else jibun_addr

                    # 좌표 확보
                    lat, lng = self._get_real_coordinates(full_address, center_lat, center_lng)
                    
                    # POI 객체 생성 (주소 정보는 POI 클래스에 없으므로, 임시로 tags에 넣거나 별도 관리 필요하지만, 여기서는 meetings.py에서 처리하도록 함)
                    # 여기서는 객체 속성으로 address를 슬쩍 끼워넣습니다.
                    poi = POI(
                        id=random.randint(100000, 999999),
                        name=title,
                        category=cat_key,
                        tags=tags,
                        price_level=price,
                        location=np.array([lat, lng]),
                        avg_rating=round(random.uniform(3.5, 5.0), 1)
                    )
                    poi.address = full_address # 🌟 주소 필드 추가 (동적 할당)
                    
                    all_pois.append(poi)
            except: continue
            
        return all_pois