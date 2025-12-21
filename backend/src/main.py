from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager
from sqlalchemy import text 

from .core.config import settings
from .core.database import engine, SessionLocal
from .domain import models

# 🌟 모든 라우터 Import
from .api.routers import auth, users, meetings, community, sync, coins

# DB 테이블 생성
models.Base.metadata.create_all(bind=engine)

@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        # DB 마이그레이션 및 초기화 (기존 로직 유지)
        try:
            db.execute(text("ALTER TABLE chat_room_members ALTER COLUMN room_id TYPE VARCHAR USING room_id::varchar"))
            db.commit()
        except: db.rollback() 
        # ... (나머지 마이그레이션 로직 생략, 필요시 기존 코드 붙여넣기) ...
        
        # 🌟 필수: users 테이블에 location_name이 없다면 추가하는 로직은 꼭 유지해주세요.
        try:
            db.execute(text("ALTER TABLE users ADD COLUMN location_name VARCHAR DEFAULT '서울 시청'"))
            db.commit()
        except: db.rollback()

    finally:
        db.close()
    yield

app = FastAPI(
    title=settings.PROJECT_NAME,
    version=settings.VERSION,
    lifespan=lifespan
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 🌟 모든 라우터 등록
app.include_router(auth.router, tags=["Authentication"])
app.include_router(users.router, tags=["Users"])
app.include_router(meetings.router, tags=["Meetings"])
app.include_router(community.router, tags=["Community"])
app.include_router(sync.router, tags=["Sync"])
app.include_router(coins.router, tags=["Coins & Wallet"])

@app.get("/")
def read_root():
    return {"status": f"{settings.PROJECT_NAME} Running 🚀"}