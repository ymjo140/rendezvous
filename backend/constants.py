import os
from dotenv import load_dotenv

# .env 파일 로드
load_dotenv()

# --- 보안 설정 ---
# 없으면 기본값(두번째 인자)을 쓰지만, 실제론 .env에서 가져옴
SECRET_KEY = os.getenv("SECRET_KEY", "unsafe_default_key")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 

# --- API 키 (하드코딩 제거) ---
NAVER_SEARCH_ID = os.getenv("NAVER_SEARCH_ID")
NAVER_SEARCH_SECRET = os.getenv("NAVER_SEARCH_SECRET")
NAVER_MAP_ID = os.getenv("NAVER_MAP_ID")
NAVER_MAP_SECRET = os.getenv("NAVER_MAP_SECRET")

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
ODSAY_API_KEY = os.getenv("ODSAY_API_KEY")
KAKAO_REST_API_KEY = os.getenv("KAKAO_REST_API_KEY")

# ODsay URL은 공개 정보라 하드코딩해도 됨
ODSAY_URL = "https://api.odsay.com/v1/api/searchPubTransPathT"

# --- 기존 설정 유지 ---
PURPOSE_CONFIG = {
    "식사": { "allowed": ["restaurant"], "keywords": ["한식", "중식", "양식", "일식", "아시안 음식", "밥집", "다이닝", "웨이팅맛집"] },
    "술/회식": { "allowed": ["pub", "restaurant"], "keywords": ["이자카야", "요리주점", "회식", "고기집", "곱창"] },
    "카페": { "allowed": ["cafe"], "keywords": ["카페", "디저트", "베이커리", "대형카페", "로스터리"] },
    "데이트/기념일": { "allowed": ["restaurant", "cafe", "pub", "culture", "activity"], "keywords": ["분위기좋은", "파스타", "와인", "데이트코스", "뷰맛집"] },
    "비즈니스/접대": { "allowed": ["restaurant", "cafe", "workspace"], "keywords": ["룸식당", "한정식", "일식코스", "회의실", "공유오피스"] },
    "스터디/작업": { "allowed": ["cafe", "workspace"], "keywords": ["스터디카페", "북카페", "노트북", "조용한카페"] }
}

TAG_KEYWORD_EXPANSIONS = {
    # ... (기존 키워드 사전 내용은 그대로 유지하세요. 길어서 생략합니다) ...
    "한식": ["한식", "한정식", "솥밥", "갈비", "불고기", "보쌈", "한우"],
    "양식": ["양식", "파스타", "스테이크", "브런치", "이탈리안", "뇨끼", "라자냐", "아메리칸", "이태리"],
    "일식": ["일식", "스시", "라멘", "돈카츠", "돈까스", "우동", "가이세키", "오마카세", "이자카야", "일식코스", "후토마키"],
    "중식": ["중식", "중국요리", "짜장면", "짬뽕", "탕수육", "중식당", "코스요리", "딤섬", "훠궈"],
    "식사미팅": ["룸식당", "한정식", "일식코스", "호텔다이닝", "조용한식당", "접대장소"],
    "술": ["이자카야", "와인바", "위스키바", "프라이빗룸"],
    "커피챗": ["호텔라운지", "조용한카페", "비즈니스카페", "대형카페", "로스터리"],
    "회의": ["회의실", "미팅룸", "세미나실", "공간대여", "스페이스클라우드", "쉐어잇", "비즈니스센터", "공유오피스"],
    "워크샵": ["파티룸", "공간대여", "워크샵장소", "아워플레이스", "세미나실"],
    "문화생활": ["영화관", "미술관", "박물관", "전시회", "공연장", "연극", "뮤지컬", "아트센터", "갤러리", "축제"],
    "영화관": ["CGV", "롯데시네마", "메가박스", "독립영화관", "자동차극장", "극장"],
    "전시회": ["미술관", "박물관", "갤러리", "전시", "팝업스토어", "소품샵"],
    "액티비티": ["방탈출", "보드게임카페", "볼링장", "오락실", "VR체험", "만화카페", "노래방", "공방", "원데이클래스"],
    "방탈출": ["방탈출", "방탈출카페", "이스케이프", "비트포비아", "키이스케이프"],
    "조용한": ["룸식당", "프라이빗", "칸막이", "방음", "조용한카페"],
    "주차": ["주차가능", "발렛파킹", "무료주차"],
    "고급진": ["파인다이닝", "호텔", "오마카세"],
    "가성비": ["저렴한", "착한가격", "무한리필"],
}

PURPOSE_DURATIONS = {
    "meal": 2.0, "식사": 2.0, "drinking": 3.0, "술/회식": 3.0,
    "date": 3.0, "데이트/기념일": 3.0, "cafe": 1.5, "카페": 1.5,
    "business": 1.5, "비즈니스/접대": 1.5, "study": 2.0, "스터디/작업": 2.0, "culture": 2.5
}
