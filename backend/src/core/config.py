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

    # 신규 가입 보너스 코인. 미정의 시 settings.SIGNUP_BONUS_AMOUNT 접근에서
    # AttributeError → 카카오 신규가입이 "Login Failed"로 실패했음(기존 유저는 정상).
    SIGNUP_BONUS_AMOUNT: int = int(os.getenv("SIGNUP_BONUS_AMOUNT", "1000"))

    # 국세청 사업자등록 상태조회(공공데이터포털) — 점주 인증 진위확인용
    NTS_API_KEY: str = os.getenv("NTS_API_KEY", "")

    # 목적/필터 설정 (프론트에 전달용).
    # 설계 원칙(실용적 MECE): 종류=상호배타적 카테고리로 포괄, 분위기=서로 다른
    # 의미(가격/소음/무드/공간/관계 등 축)를 겹치지 않게 골고루 배치. 각 옵션 옆에
    # [축]을 주석으로 명시해 한쪽 편중/중복을 점검 가능하게 함.
    PURPOSE_CONFIG = {
        "식사": {
            "label": "식사",
            "mainCategory": "RESTAURANT",
            "tabs": {
                "MENU": {
                    "label": "메뉴",
                    # 요리 장르: 국가권(한/중/일/양/아시안) + 재료·형식(고기/해산물/면/분식/패스트푸드/뷔페)
                    "options": ["한식", "중식", "일식", "양식", "아시안", "고기/구이", "해산물", "면/국물", "분식", "패스트푸드", "뷔페"],
                },
                "VIBE": {
                    "label": "분위기",
                    # 가격[가성비·고급] · 격식[캐주얼] · 소음[조용·활기] · 무드[감성] · 공간[뷰]
                    "options": ["가성비", "고급스러운", "캐주얼", "조용한", "활기찬", "감성적인", "뷰맛집"],
                },
                "FACILITY": {
                    "label": "시설",
                    # 편의시설(캐치테이블/네이버 기준): 룸·단체·주차·발렛·콜키지·반려동물
                    "options": ["룸/프라이빗룸", "단체석", "주차", "발렛", "콜키지", "반려동물"],
                },
            },
        },
        "술": {
            "label": "술",
            "mainCategory": "PUB",
            "tabs": {
                "TYPE": {
                    "label": "주종",
                    # 주종(주류 종류) — 양주/고량주 포함해 포괄
                    "options": ["소주", "맥주", "막걸리", "와인", "위스키/양주", "하이볼", "칵테일", "사케", "고량주"],
                },
                "VIBE": {
                    "label": "분위기",
                    # 가격[가성비·프리미엄] · 소음[조용·시끌] · 무드[감성] · 공간[루프탑] · 특징[라이브·안주] · 인원[혼술]
                    "options": ["가성비", "프리미엄", "조용한", "시끌벅적", "감성적인", "루프탑/야외", "라이브/음악", "안주맛집", "혼술"],
                },
                "FACILITY": {
                    "label": "시설",
                    "options": ["룸/프라이빗룸", "단체석", "주차", "콜키지", "24시간"],
                },
            },
        },
        "카페": {
            "label": "카페",
            "mainCategory": "CAFE",
            "tabs": {
                "TYPE": {
                    "label": "종류",
                    # 메뉴 종류
                    "options": ["커피", "디저트", "베이커리", "브런치", "차/티", "빙수", "음료/스무디"],
                },
                "VIBE": {
                    "label": "분위기",
                    # 무드[감성·모던] · 소음[조용] · 용도[작업] · 규모[대형] · 공간[뷰·루프탑]
                    "options": ["감성/예쁜", "모던/힙", "조용한", "작업/스터디", "대형/넓은", "뷰맛집", "루프탑/야외"],
                },
                "FACILITY": {
                    "label": "시설",
                    "options": ["주차", "단체석", "콘센트/와이파이", "반려동물", "24시간"],
                },
            },
        },
        "데이트": {
            "label": "데이트",
            "mainCategory": "RESTAURANT",
            "tabs": {
                "COURSE": {
                    "label": "코스",
                    # 데이트 활동 유형
                    "options": ["맛집", "분위기카페", "산책/공원", "전시/공연", "영화", "액티비티", "드라이브"],
                },
                "VIBE": {
                    "label": "분위기",
                    # 무드[로맨틱·감성·이색] · 소음[조용·활기] · 공간[야경뷰]
                    "options": ["로맨틱", "감성적인", "조용한", "활기찬", "야경/뷰", "이색적인"],
                },
                "FACILITY": {
                    "label": "시설",
                    "options": ["룸/프라이빗룸", "주차", "예약가능", "기념일코스"],
                },
            },
        },
        "비즈니스": {
            "label": "비즈니스",
            "mainCategory": "BUSINESS",
            "tabs": {
                "TYPE": {
                    "label": "유형",
                    # 미팅 형태
                    "options": ["식사미팅", "카페미팅", "회의실", "코워킹", "세미나/행사"],
                },
                "VIBE": {
                    "label": "분위기",
                    # 소음[조용] · 격식[격식·캐주얼] · 무드[모던] · 접근성[교통편리]
                    "options": ["조용한", "격식있는", "캐주얼", "모던/깔끔", "교통편리"],
                },
                "FACILITY": {
                    "label": "시설",
                    # 미팅 핵심: 룸(별도 방) 유무 + 단체·주차·코스·콘센트
                    "options": ["룸/프라이빗룸", "단체석", "주차/발렛", "코스요리", "콘센트/와이파이"],
                },
            },
        },
        "문화활동": {
            "label": "문화활동",
            "mainCategory": "CULTURE",
            "tabs": {
                "TYPE": {
                    "label": "유형",
                    # 활동 종류
                    "options": ["영화관", "공연/뮤지컬", "전시/미술관", "콘서트", "축제/이벤트", "스포츠관람", "클래스/체험"],
                },
                "VIBE": {
                    "label": "함께",
                    # 관계·인원[혼자·데이트·친구·가족·단체] + 공간[야외] — 문화활동은 '누구와'가 핵심 축
                    "options": ["혼자", "데이트", "친구", "가족", "단체", "야외"],
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
