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

# --- 라우터 연결 (경로 수정 완료) ---
try:
    # 1. Events 라우터 연결 (위치: src/api/events.py)
    from api import events
    app.include_router(events.router, prefix="/api/events", tags=["events"])
    print("✅ Events 라우터 연결 성공")

    # 2. Sync 라우터 연결 (위치: src/api/routers/sync.py) 
    # 🌟 [수정됨] api 폴더가 아니라 api.routers 폴더에서 가져옵니다.
    from api.routers import sync
    app.include_router(sync.router, prefix="/api/sync", tags=["sync"])
    print("✅ Sync 라우터 연결 성공")

    # 3. 기존 라우터들 (위치: src/api/routers/...)
    from api.routers import auth, users, coins, recommend
    app.include_router(recommend.router, prefix="/api", tags=["recommend"])
    app.include_router(auth.router, prefix="/api/auth", tags=["auth"])
    app.include_router(users.router, prefix="/api/users", tags=["users"])
    app.include_router(coins.router, prefix="/api/coins", tags=["coins"])
    
except Exception as e:
    # 에러 발생 시 원인 상세 출력
    import traceback
    traceback.print_exc()
    print(f"⚠️ 라우터 로드 중 경고: {e}")

# 커뮤니티 (임시)
class CommunityCreate(BaseModel):
    title: str
    class Config:
        extra = "allow"

@app.post("/api/communities")
async def create_community_dummy(comm: CommunityCreate):
    return {"status": "success", "message": "커뮤니티 생성"}