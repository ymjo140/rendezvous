import sys
import os
import fastapi
from fastapi.middleware.cors import CORSMiddleware
from supabase import create_client, Client
from pydantic import BaseModel
from typing import Optional, List

# [경로 설정]
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

app = fastapi.FastAPI()

# --- CORS 설정 (기존 유지) ---
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

# --- 라우터 연결 (수정됨) ---
# 주의: try-except를 제거했습니다. 에러가 나면 서버가 켜지지 않고 로그에 원인이 뜹니다.

# 1. Events 라우터 (위치: src/api/events.py 라고 가정)
from api import events
app.include_router(events.router, prefix="/api/events", tags=["events"])
print("✅ Events 라우터 연결 성공")

# 2. Routers 폴더 내 파일들 연결 (sync, auth, users 등)
# 위치: src/api/routers/ 폴더 안
from api.routers import sync
from api.routers import auth
from api.routers import users
from api.routers import coins
from api.routers import recommend

app.include_router(sync.router, prefix="/api/sync", tags=["sync"])
app.include_router(recommend.router, prefix="/api", tags=["recommend"])
app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
app.include_router(users.router, prefix="/api/users", tags=["users"])
app.include_router(coins.router, prefix="/api/coins", tags=["coins"])

print("✅ 모든 라우터(Sync, Auth, Users 등) 연결 성공")


# --- 커뮤니티 (임시 코드 유지) ---
class CommunityCreate(BaseModel):
    title: str
    class Config:
        extra = "allow"

@app.post("/api/communities")
async def create_community_dummy(comm: CommunityCreate):
    return {"status": "success", "message": "커뮤니티 생성"}