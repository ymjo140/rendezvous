import json
import math
import re
import random
import numpy as np
from uuid import UUID, uuid4
from datetime import datetime, timedelta, time
from typing import List, Optional, Dict, Any
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException, Depends, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from sqlalchemy import text 
from database import engine, SessionLocal
import models
from routers import auth, users, meetings, community, sync, coins
from dependencies import get_password_hash, get_current_user
from analytics import DemandIntelligenceEngine

# DB 테이블 생성
models.Base.metadata.create_all(bind=engine)

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

@asynccontextmanager
async def lifespan(app: FastAPI):
    db = SessionLocal()
    try:
        # 🌟 [DB 자동 패치] ID 컬럼들 String으로 변환
        try:
            db.execute(text("ALTER TABLE chat_rooms ALTER COLUMN id TYPE VARCHAR USING id::varchar"))
            print("✅ DB Fix: chat_rooms.id -> VARCHAR")
        except Exception: db.rollback() 

        try:
            db.execute(text("ALTER TABLE chat_room_members ALTER COLUMN room_id TYPE VARCHAR USING room_id::varchar"))
            print("✅ DB Fix: chat_room_members.room_id -> VARCHAR")
        except Exception: db.rollback() 
            
        try:
            db.execute(text("ALTER TABLE messages ALTER COLUMN room_id TYPE VARCHAR USING room_id::varchar"))
            print("✅ DB Fix: messages.room_id -> VARCHAR")
        except Exception: db.rollback()

        # 🌟 [위치 정보 컬럼 추가]
        try:
            db.execute(text("ALTER TABLE users ADD COLUMN location_name VARCHAR DEFAULT '서울 시청'"))
            print("✅ DB Update: location_name added")
        except Exception: db.rollback()

        try:
            db.execute(text("ALTER TABLE users ADD COLUMN lat FLOAT DEFAULT 37.5665"))
        except Exception: db.rollback()

        try:
            db.execute(text("ALTER TABLE users ADD COLUMN lng FLOAT DEFAULT 126.9780"))
        except Exception: db.rollback()

        try:
            db.execute(text("ALTER TABLE users ADD COLUMN gender VARCHAR DEFAULT 'unknown'"))
        except Exception: db.rollback() 

        try:
            db.execute(text("ALTER TABLE users ADD COLUMN age_group VARCHAR DEFAULT '20s'"))
        except Exception: db.rollback() 
        
        db.commit()

        # 데이터 초기화 (기존 코드)
        if db.query(models.AvatarItem).count() == 0:
            print("🛍️ [초기화] 아바타 아이템 주입...")
            items = [
                models.AvatarItem(id="body_basic", category="body", name="기본 피부", price_coin=0, image_url="/assets/avatar/body_basic.png"),
                models.AvatarItem(id="eyes_normal", category="eyes", name="기본 눈", price_coin=0, image_url="/assets/avatar/eyes_normal.png"),
                models.AvatarItem(id="brows_basic", category="eyebrows", name="기본 눈썹", price_coin=0, image_url="/assets/avatar/brows_basic.png"),
                models.AvatarItem(id="hair_01", category="hair", name="댄디컷", price_coin=500, image_url="/assets/avatar/hair_01.png"),
                models.AvatarItem(id="hair_02", category="hair", name="단발", price_coin=500, image_url="/assets/avatar/hair_02.png"),
                models.AvatarItem(id="top_tshirt", category="top", name="노란 티셔츠", price_coin=0, image_url="/assets/avatar/top_tshirt.png"),
                models.AvatarItem(id="top_hoodie", category="top", name="초록 후드", price_coin=1000, image_url="/assets/avatar/top_hoodie.png"),
                models.AvatarItem(id="bottom_jeans", category="bottom", name="청바지", price_coin=500, image_url="/assets/avatar/bottom_jeans.png"),
                models.AvatarItem(id="bottom_shorts", category="bottom", name="초록 반바지", price_coin=0, image_url="/assets/avatar/bottom_shorts.png"),
                models.AvatarItem(id="shoes_sneakers", category="shoes", name="스니커즈", price_coin=0, image_url="/assets/avatar/shoes_sneakers.png"),
                models.AvatarItem(id="pet_dog", category="pet", name="강아지", price_coin=2000, image_url="/assets/avatar/pet_dog.png"),
                models.AvatarItem(id="foot_dust", category="footprint", name="먼지 효과", price_coin=1000, image_url="/assets/avatar/footprint_dust.png"),
            ]
            db.add_all(items)
            db.commit()

        if db.query(models.User).count() == 0:
            print("🚀 [초기화] 유저 생성...")
            pw_hash = get_password_hash("1234")
            users = [
                models.User(email="me@test.com", hashed_password=pw_hash, name="나", avatar="👤", wallet_balance=5000, lat=37.586, lng=127.029, gender="male", age_group="20s"),
                models.User(email="cleo@test.com", hashed_password=pw_hash, name="클레오", avatar="👦", wallet_balance=500, lat=37.557, lng=126.924, gender="female", age_group="20s"),
                models.User(email="benji@test.com", hashed_password=pw_hash, name="벤지", avatar="🧑", wallet_balance=500, lat=37.498, lng=127.027, gender="male", age_group="30s"),
                models.User(email="logan@test.com", hashed_password=pw_hash, name="로건", avatar="👧", wallet_balance=500, lat=37.544, lng=127.056, gender="female", age_group="20s"),
            ]
            db.add_all(users)
            db.commit()
            
            my_user = db.query(models.User).filter(models.User.email == "me@test.com").first()
            if my_user:
                init_equip = {
                    "body": "body_basic", "eyes": "eyes_normal", "eyebrows": "brows_basic",
                    "hair": "hair_01", "top": "top_tshirt", "bottom": "bottom_shorts",
                    "shoes": "shoes_sneakers", "pet": "pet_dog", "footprint": "foot_dust"
                }
                init_inven = ["body_basic", "eyes_normal", "brows_basic", "hair_01", "top_tshirt", "bottom_shorts", "shoes_sneakers", "pet_dog", "foot_dust"]
                db.add(models.UserAvatar(user_id=my_user.id, equipped=init_equip, inventory=init_inven))
                db.commit()

    finally:
        db.close()
    yield

app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth.router)
app.include_router(users.router)
app.include_router(meetings.router)
app.include_router(community.router)
app.include_router(sync.router)
app.include_router(coins.router)

@app.get("/")
def read_root():
    return {"status": "WeMeet API Running 🚀"}

# 채팅방 참여 API
@app.post("/api/communities/{room_id}/join")
def join_community(room_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    existing = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == room_id,
        models.ChatRoomMember.user_id == current_user.id
    ).first()
    
    if existing:
        return {"message": "Already joined"}
        
    new_member = models.ChatRoomMember(room_id=room_id, user_id=current_user.id)
    db.add(new_member)
    db.commit()
    return {"message": "Joined successfully"}

# 일정 조회 API
@app.get("/api/chat/rooms/{room_id}/available-dates")
def get_available_dates_for_room(room_id: str, db: Session = Depends(get_db)):
    room_members = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == room_id
    ).all()
    
    member_ids = [m.user_id for m in room_members]
    today = datetime.now().date()
    recommended_slots = []

    for i in range(14):
        target_date = today + timedelta(days=i)
        date_str = target_date.strftime("%Y-%m-%d")
        day_of_week = target_date.weekday()
        
        base_score = 90 if day_of_week >= 5 else 70 
        
        conflicts = 0
        if member_ids:
            events = db.query(models.Event).filter(
                models.Event.user_id.in_(member_ids), 
                models.Event.date == date_str
            ).all()
            
            for e in events:
                try:
                    h = int(e.time.split(":")[0])
                    if 18 <= h <= 21: conflicts += 1
                except: pass

        final_score = base_score - (conflicts * 30)
        
        if conflicts == 0: 
            label = "🔥 모두 가능"
            final_score += 10 
        else: 
            label = f"{conflicts}명 불가능"

        recommended_slots.append({
            "fullDate": date_str,
            "displayDate": f"{target_date.month}/{target_date.day} ({['월','화','수','목','금','토','일'][day_of_week]})",
            "time": "19:00",
            "label": label,
            "score": final_score
        })

    recommended_slots.sort(key=lambda x: x['score'], reverse=True)
    return recommended_slots

@app.get("/api/b2b/demand-forecast")
def get_b2b_forecast(
    region: str = "강남", 
    days: int = 7, 
    db: Session = Depends(get_db)
):
    engine = DemandIntelligenceEngine(db)
    result = engine.get_future_demand(region, days)
    return result