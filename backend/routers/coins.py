# backend/routers/coins.py

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, date
from pydantic import BaseModel

import models
from dependencies import get_db, get_current_user

router = APIRouter()

class CheckInRequest(BaseModel):
    place_name: str
    lat: float
    lng: float

@router.post("/api/coins/check-in")
def check_in_place(
    req: CheckInRequest, 
    current_user: models.User = Depends(get_current_user), 
    db: Session = Depends(get_db)
):
    # 1. 오늘 이미 방문했는지 확인 (자정 기준)
    today_start = datetime.combine(date.today(), datetime.min.time())
    
    existing = db.query(models.VisitLog).filter(
        models.VisitLog.user_id == current_user.id,
        models.VisitLog.place_name == req.place_name,
        models.VisitLog.created_at >= today_start
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="오늘은 이미 방문 보상을 받았습니다. 내일 다시 오세요!")

    # 2. 보상 지급 (기본 50코인)
    reward = 50 
    current_user.wallet_balance += reward
    
    # 3. 기록 저장
    log = models.VisitLog(user_id=current_user.id, place_name=req.place_name)
    history = models.CoinHistory(
        user_id=current_user.id, 
        amount=reward, 
        type="check_in", 
        description=f"{req.place_name} 방문 인증"
    )
    
    db.add(log)
    db.add(history)
    db.commit()
    
    return {
        "message": f"🎉 방문 인증 성공! {reward}코인을 획득했습니다.", 
        "new_balance": current_user.wallet_balance
    }