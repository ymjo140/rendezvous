import sys
import os
import fastapi
from fastapi.middleware.cors import CORSMiddleware
from SUPABASE import create_client, Client
from pydantic import BaseModel
from typing import Optional, List

# [경로 설정]
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

app = fastapi.FastAPI()

# --- CORS 설정 ---
origins = [
    "http://localhost:3000",
    "https://v0-we-meet-app-features.vercel.app",
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

# --- 라우터 연결 (Events, Sync, 기타 등등) ---
try:
    # 1. Events 라우터 연결 (방금 만든 파일)
    from api import events
    app.include_router(events.router, prefix="/api/events", tags=["events"])
    print("✅ Events 라우터 연결 성공")

    # 2. Sync 라우터 연결 (아까 만든 파일)
    from api import sync
    app.include_router(sync.router, prefix="/api/sync", tags=["sync"])
    print("✅ Sync 라우터 연결 성공")

    # 3. 기존 라우터들 (auth, users 등)
    from api.routers import auth, users, coins, recommend
    app.include_router(recommend.router, prefix="/api", tags=["recommend"])
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(coins.router, prefix="/api/coins", tags=["coins"])
    
except Exception as e:
    print(f"⚠️ 라우터 로드 중 경고: {e}")

# 커뮤니티는 아직 파일 분리가 안 되어 있다면 임시로 여기 둡니다 (삭제 가능)
# (이미 api/routers/communities.py가 있다면 거기서 불러오는 게 맞습니다)
class CommunityCreate(BaseModel):
    title: str
    class Config:
        extra = "allow"

@app.post("/api/communities")
async def create_community_dummy(comm: CommunityCreate):
    return {"status": "success", "message": "커뮤니티 생성"}