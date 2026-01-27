import sys
import os
import fastapi
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# [寃쎈줈 ?ㅼ젙]
current_dir = os.path.dirname(os.path.abspath(__file__))
if current_dir not in sys.path:
    sys.path.append(current_dir)

app = fastapi.FastAPI()

# --- CORS ?ㅼ젙 ---
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

# --- 湲곕낯 ?쇱슦??---
@app.get("/")
async def root():
    return {"status": "ok", "message": "WeMeet Backend is Live."}

# --- ?쇱슦???곌껐 ---

# ??[??젣/二쇱꽍] 援щ쾭??events ?쇱슦?곌? ?붿껌??媛濡쒖콈吏 紐삵븯寃?留됱뒿?덈떎!
# try:
#     from api import events
#     app.include_router(events.router, prefix="/api/events", tags=["events"])
#     print("??Events ?쇱슦???곌껐 ?깃났")
# except Exception:
#     print("?좑툘 Events ?쇱슦???놁쓬")

# 2. Routers ?대뜑 ?곌껐
from api.routers import sync, auth, users, coins, meetings, community, chat, posts, system, offers

# ??[?섏젙] ?뚯씪 ?덉뿉 ?대? '/api/...' 寃쎈줈媛 ?덈뒗 ?좊뱾? prefix瑜?類띾땲??
app.include_router(auth.router, tags=["auth"])
app.include_router(users.router, tags=["users"])
app.include_router(coins.router, tags=["coins"])
app.include_router(chat.router, tags=["chat"])
# ?뙚 以묒슂: ?댁젣 meetings.py媛 '/api/events' ?붿껌??泥섎━?섍쾶 ?⑸땲??
app.include_router(meetings.router, tags=["meetings"]) 
app.include_router(community.router, tags=["community"])
# ?벝 SNS 寃뚯떆臾??쇱슦??(Instagram ?ㅽ???
app.include_router(posts.router, tags=["posts"])
app.include_router(offers.router, tags=["offers"])
app.include_router(system.router, tags=["system"])

# ?뮶 ???怨듭쑀 ?쒖뒪???쇱슦??
try:
    from api.routers import saves
    app.include_router(saves.router, tags=["saves"])
    print("?????怨듭쑀 ?쇱슦???곌껐 ?깃났")
except Exception as e:
    print(f"?좑툘 ???怨듭쑀 ?쇱슦??濡쒕뱶 ?ㅽ뙣: {e}")

# ?쨼 AI 異붿쿇 ?쒖뒪???쇱슦??
try:
    from api.routers import ai_recommendations
    app.include_router(ai_recommendations.router, tags=["ai"])
    print("??AI 異붿쿇 ?쇱슦???곌껐 ?깃났")
except Exception as e:
    print(f"?좑툘 AI 異붿쿇 ?쇱슦??濡쒕뱶 ?ㅽ뙣 (?쒕퉬?ㅻ뒗 怨꾩냽 ?숈옉): {e}")

# ?쭬 踰≫꽣 AI 異붿쿇 ?쒖뒪???쇱슦??(吏꾩쭨 AI!)
try:
    from api.routers import vector_ai
    app.include_router(vector_ai.router, tags=["vector-ai"])
    print("??踰≫꽣 AI ?쇱슦???곌껐 ?깃났")
except Exception as e:
    print(f"?좑툘 踰≫꽣 AI ?쇱슦??濡쒕뱶 ?ㅽ뙣: {e}")

# ??[?좎?] ?뚯씪 ?덉뿉 寃쎈줈媛 吏㏃? ?좊뱾? prefix瑜?遺숈뿬以띾땲??
app.include_router(sync.router, prefix="/api/sync", tags=["sync"])

print("??紐⑤뱺 ?쇱슦???곌껐 ?깃났")

# --- 而ㅻ??덊떚 (?꾩떆) ---
class CommunityCreate(BaseModel):
    title: str
    class Config:
        extra = "allow"

@app.post("/api/communities_dummy")
async def create_community_dummy(comm: CommunityCreate):
    return {"status": "success", "message": "而ㅻ??덊떚 ?앹꽦"}

