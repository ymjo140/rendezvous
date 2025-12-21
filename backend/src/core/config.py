import os
from dotenv import load_dotenv

# .env 로드
load_dotenv()

class Settings:
    PROJECT_NAME: str = "WeMeet API"
    VERSION: str = "2.0.0"

    # 보안
    SECRET_KEY: str = os.getenv("SECRET_KEY", "unsafe_default_key")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7 # 7일

    # 데이터베이스
    DATABASE_URL: str = os.getenv("DATABASE_URL", "sqlite:///./wemeet.db")
    if DATABASE_URL.startswith("postgres://"):
        DATABASE_URL = DATABASE_URL.replace("postgres://", "postgresql://", 1)

    # API 키
    NAVER_SEARCH_ID: str = os.getenv("NAVER_SEARCH_ID")
    NAVER_SEARCH_SECRET: str = os.getenv("NAVER_SEARCH_SECRET")
    NAVER_MAP_ID: str = os.getenv("NAVER_MAP_ID")
    NAVER_MAP_SECRET: str = os.getenv("NAVER_MAP_SECRET")
    
    ODSAY_API_KEY: str = os.getenv("ODSAY_API_KEY")
    GEMINI_API_KEY: str = os.getenv("GEMINI_API_KEY")
    KAKAO_REST_API_KEY: str = os.getenv("KAKAO_REST_API_KEY")

    # 운영 상수 (constants.py 내용 통합)
    PURPOSE_CONFIG = {
        "식사": { "allowed": ["restaurant"], "keywords": ["한식", "중식", "양식", "일식", "아시안 음식", "밥집"] },
        "술/회식": { "allowed": ["bar", "restaurant"], "keywords": ["술집", "이자카야", "요리주점", "포차", "호프"] },
        "카페": { "allowed": ["cafe"], "keywords": ["카페", "디저트", "베이커리", "커피"] },
        "스터디": { "allowed": ["cafe", "workspace"], "keywords": ["스터디카페", "북카페", "노트북", "조용한카페"] }
    }

    TAG_KEYWORD_EXPANSIONS = {
        "한식": ["한식", "한정식", "솥밥", "갈비", "불고기", "보쌈", "한우"],
        "양식": ["양식", "파스타", "스테이크", "브런치", "이탈리안", "뇨끼", "라자냐", "아메리칸"],
        "일식": ["일식", "스시", "라멘", "돈카츠", "우동", "오마카세", "이자카야", "후토마키"],
        "중식": ["중식", "중국요리", "짜장면", "짬뽕", "탕수육", "딤섬", "훠궈"],
        "가성비": ["가성비", "저렴한", "만원", "무한리필", "착한가격"],
        "분위기": ["분위기", "감성", "데이트", "예쁜", "인스타", "뷰맛집", "루프탑"],
        "조용한": ["조용한", "차분한", "룸식당", "룸술집", "프라이빗"],
        "주차": ["주차", "발렛", "주차장"]
    }

settings = Settings()