import sys
import os
import fastapi
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# [경로 설정]
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

app = fastapi.FastAPI()

# --- CORS 설정 ---
origins = [
    "http://localhost:3000",
    "https://v0-we-meet-app-features.vercel.app",
    "https://wemeet-frontend.onrender.com", 
    "https://wemeet-frontend-*.onrender.com",
    "*"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- 기본 라우트 ---
@app.get("/")
async def root():
    return {"status": "ok", "message": "WeMeet Backend is Live."}

# --- 라우터 연결 ---

# 1. Events (기존 유지)
try:
    from api import events
    app.include_router(events.router, prefix="/api/events", tags=["events"])
    print("✅ Events 라우터 연결 성공")
except Exception:
    print("⚠️ Events 라우터 없음")

# 2. Routers 폴더 연결
from api.routers import sync, auth, users, coins, meetings

# ✅ [수정] 파일 안에 이미 '/api/...' 경로가 있는 애들은 prefix를 뺍니다.
app.include_router(auth.router, tags=["auth"])    # prefix 제거! (/api/auth/kakao 그대로 사용)
app.include_router(users.router, tags=["users"])  # prefix 제거! (/api/users/me 등 그대로 사용)
app.include_router(coins.router, tags=["coins"])  # prefix 제거! (/api/coins/wallet 그대로 사용)
app.include_router(meetings.router, tags=["meetings"])
# ✅ [유지] 파일 안에 경로가 짧은 애들은 prefix를 붙여줍니다.
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])  # (/ical -> /api/sync/ical)


print("✅ 모든 라우터(Sync, Auth, Users 등) 연결 성공")

# --- 커뮤니티 (임시) ---
class CommunityCreate(BaseModel):
    title: str
    class Config:
        extra = "allow"

@app.post("/api/communities")
async def create_community_dummy(comm: CommunityCreate):
    return {"status": "success", "message": "커뮤니티 생성"}