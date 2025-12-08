import time
import random
import requests
import re
import numpy as np
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from typing import List, Tuple

# 🌟 기존 모듈 임포트
import models
from database import Base, DATABASE_URL
from constants import NAVER_SEARCH_ID, NAVER_SEARCH_SECRET, NAVER_MAP_ID, NAVER_MAP_SECRET

# --- 설정 ---
SEARCH_API_URL = "https://openapi.naver.com/v1/search/local.json"
GEOCODE_API_URL = "https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode"

engine = create_engine(DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

# 🌟 [사용자 요청] 전체 키워드 사전 (그대로 반영)
TARGET_KEYWORDS_DICT = {
    "한식": ["한식", "한정식", "솥밥", "갈비", "불고기", "보쌈", "한우"],
    "양식": ["양식", "파스타", "스테이크", "브런치", "이탈리안", "뇨끼", "라자냐", "아메리칸", "이태리"],
    "일식": ["일식", "스시", "라멘", "돈카츠", "돈까스", "우동", "가이세키", "오마카세", "이자카야", "일식코스", "후토마키"],
    "중식": ["중식", "중국요리", "짜장면", "짬뽕", "탕수육", "중식당", "코스요리", "딤섬", "훠궈"],
    "식사미팅": ["룸식당", "한정식", "일식코스", "호텔다이닝", "조용한식당", "접대장소"],
    "술": ["이자카야", "와인바", "위스키바", "프라이빗룸"],
    "커피챗": ["호텔라운지", "조용한카페", "비즈니스카페", "대형카페", "로스터리"],
    "회의": ["회의실", "미팅룸", "세미나실", "공간대여", "스페이스클라우드", "쉐어잇", "비즈니스센터", "공유오피스"],
    "워크샵": ["파티룸", "공간대여", "워크샵장소", "스튜디오", "아워플레이스", "렌탈스튜디오", "세미나실"],
    "문화생활": ["영화관", "미술관", "박물관", "전시회", "공연장", "연극", "뮤지컬", "아트센터", "갤러리", "축제"],
    "영화관": ["CGV", "롯데시네마", "메가박스", "독립영화관", "자동차극장", "극장"],
    "전시회": ["미술관", "박물관", "갤러리", "전시", "팝업스토어", "소품샵"],
    "액티비티": ["방탈출", "보드게임카페", "볼링장", "오락실", "VR체험", "만화카페", "노래방", "공방", "원데이클래스"],
    "방탈출": ["방탈출", "방탈출카페", "이스케이프", "비트포비아", "키이스케이프"],
    "조용한": ["룸식당", "프라이빗", "칸막이", "방음", "조용한카페"],
    "주차": ["주차가능", "발렛파킹", "무료주차"],
    "고급진": ["파인다이닝", "호텔", "오마카세"],
    "가성비": ["저렴한", "착한가격", "무한리필"]
}

# 🌟 [사용자 요청] 전체 지역 리스트 (그대로 반영)
TARGET_REGIONS = [
    # 1호선
    "서울역", "시청", "종각", "종로3가", "종로5가", "동대문", "동묘앞", "신설동", "제기동",
    "청량리", "회기", "용산", "노량진", "영등포", "신도림", "구로", "부천", "부평", "안양", "수원",
    # 2호선
    "강남", "역삼", "신논현", "삼성", "잠실", "건대입구", "성수", "왕십리", "을지로3가", "을지로입구",
    "홍대입구", "합정", "신촌", "이대", "당산", "구로디지털단지", "신림", "사당", "서초", "교대",
    # 3호선
    "연신내", "불광", "경복궁", "안국", "충무로", "약수", "옥수", "압구정", "신사", "고속터미널", "양재", "수서",
    # 4호선
    "노원", "창동", "성신여대입구", "혜화", "명동", "회현", "삼각지", "이촌", "이수", "과천", "범계",
    # 5호선
    "김포공항", "여의도", "공덕", "광화문", "청구", "군자", "천호", "올림픽공원",
    # 6호선
    "이태원", "한강진", "안암", "고려대", "석계", "망원",
    # 7호선
    "강남구청", "논현", "내방", "가산디지털단지", "철산", "상봉",
    # 8호선
    "암사", "석촌", "가락시장", "문정", "모란",
    # 9호선
    "마곡나루", "선정릉", "봉은사", "종합운동장",
    # 경기/인천
    "판교", "분당", "일산", "송도", "의정부"
]

class Preloader:
    def __init__(self):
        self.db = SessionLocal()

    def get_coordinates(self, address: str) -> Tuple[float, float]:
        if not NAVER_MAP_ID: return 0.0, 0.0
        headers = { "X-NCP-APIGW-API-KEY-ID": NAVER_MAP_ID, "X-NCP-APIGW-API-KEY": NAVER_MAP_SECRET }
        try:
            resp = requests.get(GEOCODE_API_URL, headers=headers, params={"query": address})
            if resp.status_code == 200:
                data = resp.json()
                if data.get("addresses"):
                    return float(data["addresses"][0]["y"]), float(data["addresses"][0]["x"])
        except: pass
        return 0.0, 0.0

    def clean_html(self, text):
        return re.sub('<[^<]+?>', '', text)

    def analyze_attributes(self, title, category):
        """네이버 카테고리 + 사용자 정의 키워드 매칭"""
        tags = set()
        price = 2
        
        # 1. 네이버 카테고리 파싱
        cats = category.split(">")
        for c in cats:
            c = c.strip()
            if c: tags.add(c)
        
        category_clean = category.replace(">", " ").strip()
        
        # 2. 메인 카테고리 결정 (기본 로직)
        final_cat = "restaurant"
        if any(k in category_clean for k in ["카페", "커피", "디저트", "베이커리"]):
            final_cat = "cafe"
        elif any(k in category_clean for k in ["술집", "주점", "이자카야", "바", "호프", "포차"]):
            final_cat = "pub"
            price = 3
        elif any(k in category_clean for k in ["스터디", "독서실", "오피스", "회의", "공간대여"]):
            final_cat = "workspace"
        
        # 3. 🌟 [핵심] 사용자 정의 키워드 전체 매칭
        # 제목이나 카테고리에 키워드가 포함되면 해당 키워드와 상위 카테고리(Key)를 태그에 추가
        for key, keywords in TARGET_KEYWORDS_DICT.items():
            for kw in keywords:
                if kw in title or kw in category_clean:
                    tags.add(kw) # 상세 키워드 (예: 솥밥)
                    tags.add(key) # 상위 키워드 (예: 한식)
        
        return final_cat, list(tags)

    def save_to_db(self, item, lat, lng):
        title = self.clean_html(item['title'])
        
        # 중복 체크 (이름 + 좌표 50m 반경)
        existing = self.db.query(models.Place).filter(models.Place.name == title).all()
        for ex in existing:
            if abs(ex.lat - lat) < 0.0005 and abs(ex.lng - lng) < 0.0005:
                # print(f"  ⏭️ 중복 건너뜀: {title}")
                return 

        category_raw = item.get('category', '')
        final_cat, tags = self.analyze_attributes(title, category_raw)
        
        address = item.get('roadAddress') or item.get('address')
        
        new_place = models.Place(
            name=title,
            category=final_cat,
            address=address,
            lat=lat,
            lng=lng,
            tags=tags,
            wemeet_rating=round(random.uniform(3.5, 5.0), 1),
            external_link=item.get('link')
        )
        self.db.add(new_place)
        try:
            self.db.commit()
            print(f"  ✅ 저장: {title} ({final_cat}) - {tags[:3]}...")
        except Exception as e:
            self.db.rollback()
            # print(f"  ❌ 에러: {e}")

    def run(self):
        # 검색할 모든 키워드 리스트 생성 (중복 제거)
        all_keywords = list(set([k for sublist in TARGET_KEYWORDS_DICT.values() for k in sublist]))
        
        print(f"🚀 [전국구 데이터 수집] 시작합니다.")
        print(f"📍 수집 대상 지역: {len(TARGET_REGIONS)}곳")
        print(f"🔑 수집 대상 키워드: {len(all_keywords)}개")
        print("--------------------------------------------------")
        
        total_saved = 0
        
        for region in TARGET_REGIONS:
            print(f"\n📍 [{region}] 지역 탐색 중...")
            
            # 모든 키워드를 다 돌립니다. (시간이 오래 걸릴 수 있음)
            for keyword in all_keywords:
                query = f"{region} {keyword}"
                try:
                    headers = { 
                        "X-Naver-Client-Id": NAVER_SEARCH_ID, 
                        "X-Naver-Client-Secret": NAVER_SEARCH_SECRET 
                    }
                    # 검색 결과 5개씩 가져옴
                    resp = requests.get(SEARCH_API_URL, headers=headers, params={"query": query, "display": 5, "sort": "comment"}, timeout=3)
                    
                    if resp.status_code != 200: continue
                    items = resp.json().get('items', [])
                    
                    for item in items:
                        addr = item.get('roadAddress') or item.get('address')
                        if not addr: continue
                        lat, lng = self.get_coordinates(addr)
                        if lat == 0.0: continue
                        
                        self.save_to_db(item, lat, lng)
                        total_saved += 1
                        
                    # 쿼터 관리를 위해 약간의 딜레이
                    time.sleep(0.05) 
                except Exception as e:
                    print(f"Error processing {query}: {e}")
        
        print(f"\n✨ 총 {total_saved}개 장소 데이터 저장 완료!")

if __name__ == "__main__":
    # 테이블이 없으면 생성
    models.Base.metadata.create_all(bind=engine)
    
    loader = Preloader()
    loader.run()