# backend/src/main.py

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

app = FastAPI()

# I. CORS 설정
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

# II. 라우터 로딩 (프로젝트 구조: src/api/routers)
# 전제: 아래 파일들이 존재해야 Pylance/런타임 모두 정상 인식
# - backend/src/__init__.py
# - backend/src/api/__init__.py
# - backend/src/api/routers/__init__.py
try:
    from .api.routers import auth, users, places, coins

    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(places.router, prefix="/api/places", tags=["places"])
    app.include_router(coins.router, prefix="/api/coins", tags=["coins"])

    print("✅ 라우터 로딩 성공: src/api/routers/*")

except Exception as e:
    # 서버가 아예 죽는 것을 방지하되, Render 로그에서 원인을 확인할 수 있게 출력
    print(f"❌ 라우터 로딩 실패: {repr(e)}")

# III. (임시) 프론트 에러 방지용 더미 엔드포인트
# 실제 라우터가 준비되면 제거/교체하세요.

@app.get("/api/events")
async def get_events_dummy():
    return []

@app.get("/api/communities")
async def get_communities_dummy():
    return []

@app.get("/api/chat/rooms")
async def get_chat_rooms_dummy():
    return []

@app.post("/api/sync/ical")
async def sync_ical_dummy(request: Request):
    return {"status": "success", "message": "iCal sync disabled for stability"}

# IV. 서버 상태 확인
@app.get("/")
async def root():
    return {"message": "WeMeet Backend is running!", "status": "active"}

# V. 전역 500 에러 핸들러
@app.exception_handler(500)
async def internal_exception_handler(request: Request, exc: Exception):
    return JSONResponse(
        status_code=500,
        content={"message": f"Internal Server Error: {str(exc)}"},
    )
