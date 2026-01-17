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

# ❌ [삭제/주석] 구버전 events 라우터가 요청을 가로채지 못하게 막습니다!
# try:
#     from api import events
#     app.include_router(events.router, prefix="/api/events", tags=["events"])
#     print("✅ Events 라우터 연결 성공")
# except Exception:
#     print("⚠️ Events 라우터 없음")

# 2. Routers 폴더 연결
from api.routers import sync, auth, users, coins, meetings, community, chat, posts

# ✅ [수정] 파일 안에 이미 '/api/...' 경로가 있는 애들은 prefix를 뺍니다.
app.include_router(auth.router, tags=["auth"])
app.include_router(users.router, tags=["users"])
app.include_router(coins.router, tags=["coins"])
app.include_router(chat.router, tags=["chat"])
# 🌟 중요: 이제 meetings.py가 '/api/events' 요청을 처리하게 됩니다.
app.include_router(meetings.router, tags=["meetings"]) 
app.include_router(community.router, tags=["community"])
# 📸 SNS 게시물 라우터 (Instagram 스타일)
app.include_router(posts.router, tags=["posts"])

# 💾 저장/공유 시스템 라우터
try:
    from api.routers import saves
    app.include_router(saves.router, tags=["saves"])
    print("✅ 저장/공유 라우터 연결 성공")
except Exception as e:
    print(f"⚠️ 저장/공유 라우터 로드 실패: {e}")

# 🤖 AI 추천 시스템 라우터
try:
    from api.routers import ai_recommendations
    app.include_router(ai_recommendations.router, tags=["ai"])
    print("✅ AI 추천 라우터 연결 성공")
except Exception as e:
    print(f"⚠️ AI 추천 라우터 로드 실패 (서비스는 계속 동작): {e}")

# ✅ [유지] 파일 안에 경로가 짧은 애들은 prefix를 붙여줍니다.
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])

print("✅ 모든 라우터 연결 성공")

# --- 커뮤니티 (임시) ---
class CommunityCreate(BaseModel):
    title: str
    class Config:
        extra = "allow"

@app.post("/api/communities_dummy")
async def create_community_dummy(comm: CommunityCreate):
    return {"status": "success", "message": "커뮤니티 생성"}