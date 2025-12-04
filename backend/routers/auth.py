import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel
import json

import models
from dependencies import get_db, verify_password, get_password_hash, create_access_token
from constants import KAKAO_REST_API_KEY

# Vercel 배포 주소와 일치해야 함
KAKAO_REDIRECT_URI = "https://v0-we-meet-app-features.vercel.app/auth/callback/kakao" 

router = APIRouter()

class UserCreate(BaseModel):
    email: str; password: str; name: str

class KakaoLoginRequest(BaseModel):
    code: str

@router.post("/api/register")
def register(user: UserCreate, db: Session = Depends(get_db)):
    if db.query(models.User).filter(models.User.email == user.email).first():
        raise HTTPException(400, "Email registered")
    db.add(models.User(email=user.email, hashed_password=get_password_hash(user.password), name=user.name, avatar="👤", preferences={}))
    db.commit()
    return {"message": "User created"}

@router.post("/api/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(400, "Incorrect info")
    return { "access_token": create_access_token({"sub": user.email}), "token_type": "bearer", "user_id": user.id, "name": user.name }

@router.post("/api/auth/kakao")
async def kakao_login(req: KakaoLoginRequest, db: Session = Depends(get_db)):
    token_url = "https://kauth.kakao.com/oauth/token"
    data = { "grant_type": "authorization_code", "client_id": KAKAO_REST_API_KEY, "redirect_uri": KAKAO_REDIRECT_URI, "code": req.code }
    
    async with httpx.AsyncClient() as client:
        token_res = await client.post(token_url, data=data)
        if token_res.status_code != 200: raise HTTPException(400, "카카오 토큰 실패")
        access_token = token_res.json().get("access_token")

        user_info_res = await client.get("https://kapi.kakao.com/v2/user/me", headers={"Authorization": f"Bearer {access_token}"})
        user_info = user_info_res.json()
        
        kakao_id = str(user_info.get("id"))
        properties = user_info.get("properties", {})
        kakao_account = user_info.get("kakao_account", {})
        profile = kakao_account.get("profile", {})
        
        nickname = profile.get("nickname") or properties.get("nickname") or f"User_{kakao_id[-4:]}"
        email = f"kakao_{kakao_id}@wemeet.com" 

        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            user = models.User(email=email, hashed_password=get_password_hash("kakao"), name=nickname, avatar="👤", preferences={}, wallet_balance=3000)
            db.add(user); db.commit(); db.refresh(user)
            db.add(models.UserAvatar(user_id=user.id, equipped={"body": "body_basic"}, inventory=[])); db.commit()

        access_token = create_access_token({"sub": user.email})
        return { "access_token": access_token, "token_type": "bearer", "user_id": user.id, "name": user.name }