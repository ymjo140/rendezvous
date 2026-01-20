import os
from dotenv import load_dotenv

# .env 로드
load_dotenv()


class Settings:
    PROJECT_NAME: str = "WeMeet API"
    VERSION: str = "2.0.0"

    # 보안
    SECRET_KEY: str = os.getenv("SECRET_KEY")
    if not SECRET_KEY:
        raise ValueError("SECRET_KEY is missing!")
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7일

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
    KAKAO_REDIRECT_URI: str = os.getenv("KAKAO_REDIRECT_URI")

    # 목적/필터 설정 (프론트에 전달용)
    PURPOSE_CONFIG = {
        "식사": {
            "label": "식사",
            "mainCategory": "RESTAURANT",
            "tabs": {
                "MENU": {
                    "label": "메뉴",
                    "options": ["한식", "양식", "일식", "중식", "고기/구이", "해산물", "치킨", "피자", "분식", "아시아음식"],
                },
                "VIBE": {
                    "label": "분위기",
                    "options": ["가성비", "조용한", "뷰맛집", "모임", "가족", "캐주얼"],
                },
            },
        },
        "술": {
            "label": "술",
            "mainCategory": "PUB",
            "tabs": {
                "TYPE": {
                    "label": "주종",
                    "options": ["소주", "맥주", "와인", "하이볼", "칵테일", "막걸리"],
                },
                "VIBE": {
                    "label": "분위기",
                    "options": ["안주맛집", "조용한", "루프탑", "이자카야", "포차", "음악"],
                },
            },
        },
        "카페": {
            "label": "카페",
            "mainCategory": "CAFE",
            "tabs": {
                "TYPE": {
                    "label": "목적",
                    "options": ["디저트", "브런치", "베이커리", "커피", "차"],
                },
                "VIBE": {
                    "label": "분위기",
                    "options": ["감성", "조용한", "뷰맛집", "공부", "루프탑", "반려동물"],
                },
            },
        },
        "데이트": {
            "label": "데이트",
            "mainCategory": "RESTAURANT",
            "tabs": {
                "COURSE": {
                    "label": "코스",
                    "options": ["맛집", "카페", "산책", "영화", "전시"],
                },
                "VIBE": {
                    "label": "분위기",
                    "options": ["로맨틱", "조용한", "야경", "야외", "커플"],
                },
            },
        },
        "비즈니스": {
            "label": "비즈니스",
            "mainCategory": "BUSINESS",
            "tabs": {
                "TYPE": {
                    "label": "유형",
                    "options": ["회의실", "식사미팅", "카페미팅", "코워킹스페이스", "프라이빗룸"],
                },
                "VIBE": {
                    "label": "분위기",
                    "options": ["조용한", "프라이빗", "격식", "비즈니스"],
                },
            },
        },
        "문화활동": {
            "label": "문화활동",
            "mainCategory": "CULTURE",
            "tabs": {
                "TYPE": {
                    "label": "유형",
                    "options": ["영화관", "공연/뮤지컬", "전시/미술관", "콘서트", "축제/이벤트", "스포츠경기"],
                },
                "VIBE": {
                    "label": "함께",
                    "options": ["데이트", "친구", "가족", "혼자", "단체", "야외"],
                },
            },
        },
    }

    TAG_KEYWORD_EXPANSIONS = {
        "한식": ["한식", "한정식", "국밥", "갈비", "불고기", "보쌈", "두부"],
        "양식": ["양식", "스테이크", "파스타", "이탈리안", "브런치", "리조또", "아메리칸"],
        "일식": ["일식", "스시", "라멘", "우동", "돈카츠", "오마카세", "이자카야", "규카츠"],
        "중식": ["중식", "중국요리", "짜장면", "짬뽕", "탕수육", "딤섬", "마라"],
        "가성비": ["가성비", "합리적", "만원", "무한리필", "착한가격"],
        "분위기": ["분위기", "감성", "데이트", "예쁜", "인스타", "뷰맛집", "루프탑"],
        "조용한": ["조용한", "차분", "룸식당", "룸술집", "프라이빗"],
        "주차": ["주차", "발렛", "주차가능"],
    }


settings = Settings()
