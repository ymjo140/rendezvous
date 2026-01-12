import sys
import os
import fastapi
from fastapi import Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

# [경로 설정] src 폴더를 파이썬 경로에 추가 (Import Error 방지용 필수 설정)
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

app = fastapi.FastAPI()

# --- I. CORS 설정 ---
origins = [
    "http://localhost:3000",
    "https://v0-we-meet-app-features.vercel.app",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- II. 라우터 연결 (깔끔해진 버전) ---
try:
    # 🌟 모든 라우터를 api.routers 한 곳에서 가져옵니다.
    # (recommend.py를 api/routers 폴더로 옮겨야 작동합니다!)
    from api.routers import auth, users, coins, recommend
    
    # 1. 추천/비딩 라우터 연결
    app.include_router(recommend.router, prefix="/api", tags=["recommend"])

    # 2. 기존 라우터 연결
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(coins.router, prefix="/api/coins", tags=["coins"])
    
    # (meetings, community, sync 등 파일이 있다면 아래 주석 해제)
    # from api.routers import meetings, community, sync
    # app.include_router(meetings.router, tags=["meetings"])
    # app.include_router(community.router, tags=["community"])
    # app.include_router(sync.router, tags=["sync"])

    print("✅ 모든 라우터 로딩 성공 (api.routers)")

except ImportError as e:
    print(f"❌ 라우터 로딩 실패: {e}")
    print("👉 'recommend.py' 파일을 'backend/src/api/routers/' 폴더로 옮겼는지 확인해주세요.")


# --- III. 프론트 에러 방지용 더미 엔드포인트 ---
@app.get("/api/events")
async def get_events_dummy(): return []

@app.get("/api/communities")
async def get_communities_dummy(): return []

@app.get("/api/chat/rooms")
async def get_chat_rooms_dummy(): return []

@app.post("/api/sync/ical")
async def sync_ical_dummy(request: Request):
    return {"status": "success", "message": "disabled"}


# --- IV. 서버 상태 확인 ---
@app.get("/")
async def root():
    return {"message": "WeMeet Backend is running!", "status": "active"}


# --- V. 전역 500 에러 핸들러 ---
@app.exception_handler(500)
async def internal_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"message": f"Internal Server Error: {str(exc)}"},
    )