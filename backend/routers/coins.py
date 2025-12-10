import random
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, date
from pydantic import BaseModel
from typing import List

import models
from dependencies import get_db, get_current_user

router = APIRouter()

# --- Models ---
class CheckInRequest(BaseModel):
    place_name: str
    lat: float
    lng: float

class LootRequest(BaseModel):
    lat: float
    lng: float

class ClaimLootRequest(BaseModel):
    loot_id: str # 보물 고유 ID (좌표 기반 해시값 등)
    amount: int

# --- Helper ---
def generate_random_loot(center_lat: float, center_lng: float, count: int = 5):
    loots = []
    for i in range(count):
        # 대략 500m 반경 내 랜덤 좌표 생성 (0.005도 ≈ 500m)
        lat_offset = random.uniform(-0.004, 0.004)
        lng_offset = random.uniform(-0.004, 0.004)
        
        loot_lat = center_lat + lat_offset
        loot_lng = center_lng + lng_offset
        
        # 고유 ID 생성 (날짜_위도_경도)
        loot_id = f"{date.today()}_{round(loot_lat, 5)}_{round(loot_lng, 5)}"
        
        loots.append({
            "id": loot_id,
            "lat": loot_lat,
            "lng": loot_lng,
            "amount": random.choice([10, 20, 30, 50, 100]) # 랜덤 코인 액수
        })
    return loots

# --- APIs ---

# 1. 방문 인증 (기존 유지)
@router.post("/api/coins/check-in")
def check_in_place(req: CheckInRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    today_start = datetime.combine(date.today(), datetime.min.time())
    existing = db.query(models.VisitLog).filter(
        models.VisitLog.user_id == current_user.id,
        models.VisitLog.place_name == req.place_name,
        models.VisitLog.created_at >= today_start
    ).first()
    
    if existing: raise HTTPException(status_code=400, detail="오늘은 이미 방문 보상을 받았습니다.")

    reward = 50 
    current_user.wallet_balance += reward
    log = models.VisitLog(user_id=current_user.id, place_name=req.place_name)
    history = models.CoinHistory(user_id=current_user.id, amount=reward, type="check_in", description=f"{req.place_name} 방문 인증")
    
    db.add(log); db.add(history); db.commit()
    return {"message": f"🎉 방문 인증 성공! {reward}코인을 획득했습니다.", "new_balance": current_user.wallet_balance}

# 🌟 2. [신규] 지도 보물 생성 (주변 랜덤 좌표)
@router.post("/api/coins/map-loot")
def get_map_loot(req: LootRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 이미 오늘 주운 보물인지 확인하는 로직은 생략 (간단하게 매번 랜덤 생성)
    # 실제 서비스에선 DB에 Loot 테이블을 만들어서 관리해야 함
    loots = generate_random_loot(req.lat, req.lng)
    return loots

# 🌟 3. [신규] 보물 줍기 (코인 획득)
@router.post("/api/coins/claim-loot")
def claim_loot(req: ClaimLootRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # 중복 획득 방지 (오늘 같은 ID의 보물을 먹었는지 확인)
    today_start = datetime.combine(date.today(), datetime.min.time())
    
    # description에 loot_id를 저장해서 중복 체크
    existing = db.query(models.CoinHistory).filter(
        models.CoinHistory.user_id == current_user.id,
        models.CoinHistory.type == "game_drop",
        models.CoinHistory.description.contains(req.loot_id),
        models.CoinHistory.created_at >= today_start
    ).first()

    if existing:
        raise HTTPException(status_code=400, detail="이미 획득한 보물입니다.")

    current_user.wallet_balance += req.amount
    history = models.CoinHistory(
        user_id=current_user.id, 
        amount=req.amount, 
        type="game_drop", 
        description=f"지도 보물찾기 ({req.loot_id})"
    )
    
    db.add(history); db.commit()
    return {"message": f"💎 {req.amount}코인을 주웠습니다!", "new_balance": current_user.wallet_balance}