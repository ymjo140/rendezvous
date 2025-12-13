import httpx
import requests
from datetime import timedelta
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session
from pydantic import BaseModel

import models
from database import SessionLocal
from dependencies import get_db, verify_password, get_password_hash, create_access_token
from constants import KAKAO_REST_API_KEY, ACCESS_TOKEN_EXPIRE_MINUTES, NAVER_MAP_ID, NAVER_MAP_SECRET

# Vercel 배포 주소 (카카오 리다이렉트용)
KAKAO_REDIRECT_URI = "https://v0-we-meet-app-features.vercel.app/auth/callback/kakao" 

router = APIRouter()

# --- Schemas ---
class Token(BaseModel):
    access_token: str
    token_type: str
    user_id: int
    name: str

class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    gender: Optional[str] = "unknown"
    age_group: Optional[str] = "20s"
    # 🌟 위치 정보 (선택)
    lat: Optional[float] = None
    lng: Optional[float] = None
    location_name: Optional[str] = None

class KakaoLoginRequest(BaseModel):
    code: str

# --- Helper: 좌표 -> 주소 변환 (Reverse Geocoding) ---
def get_address_from_coords(lat: float, lng: float) -> str:
    try:
        url = "https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc"
        headers = {
            "X-NCP-APIGW-API-KEY-ID": NAVER_MAP_ID,
            "X-NCP-APIGW-API-KEY": NAVER_MAP_SECRET
        }
        params = {
            "coords": f"{lng},{lat}",
            "output": "json",
            "orders": "legalcode,admcode,addr,roadaddr"
        }
        response = requests.get(url, headers=headers, params=params, timeout=3)
        if response.status_code == 200:
            data = response.json()
            if data["status"]["code"] == 0:
                for result in data["results"]:
                    region = result["region"]
                    return f"{region['area1']['name']} {region['area2']['name']} {region['area3']['name']}".strip()
    except Exception as e:
        print(f"Geo Error: {e}")
    return ""

# --- Endpoints ---

# 🌟 [수정됨] 회원가입 (위치 정보 저장 포함)
# 프론트엔드와 맞추기 위해 경로를 /api/auth/signup 으로 설정 (또는 기존 /api/register 사용 가능)
@router.post("/api/auth/signup", response_model=Token)
def signup(user: UserCreate, db: Session = Depends(get_db)):
    # 1. 이메일 중복 체크
    if db.query(models.User).filter(models.User.email == user.email).first():
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # 2. 위치 정보 처리
    final_location_name = user.location_name
    
    # 좌표는 있는데 주소명이 없으면 -> 자동 변환
    if user.lat and user.lng and not final_location_name:
        final_location_name = get_address_from_coords(user.lat, user.lng)
    
    # 좌표도 없고 주소명도 없으면 -> 기본값 (서울 시청)
    if not user.lat:
        user.lat = 37.5665
        user.lng = 126.9780
        if not final_location_name:
            final_location_name = "서울 시청 (기본)"

    # 3. 유저 생성
    hashed_pw = get_password_hash(user.password)
    new_user = models.User(
        email=user.email,
        hashed_password=hashed_pw,
        name=user.name,
        gender=user.gender,
        age_group=user.age_group,
        lat=user.lat,
        lng=user.lng,
        location_name=final_location_name, # 🌟 주소 저장
        wallet_balance=3000, # 가입 축하금
        avatar="👤"
    )
    
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    
    # 4. 기본 아바타 지급
    db_avatar = models.UserAvatar(
        user_id=new_user.id,
        equipped={"body": "body_basic", "eyes": "eyes_normal", "eyebrows": "brows_basic", "top": "top_tshirt", "bottom": "bottom_shorts", "shoes": "shoes_sneakers"},
        inventory=["body_basic", "eyes_normal", "brows_basic", "hair_01", "top_tshirt", "bottom_shorts", "shoes_sneakers"]
    )
    db.add(db_avatar)
    db.commit()

    # 5. 토큰 발급 (자동 로그인)
    access_token = create_access_token(data={"sub": new_user.email})
    return {
        "access_token": access_token, 
        "token_type": "bearer",
        "user_id": new_user.id,
        "name": new_user.name
    }

# 기존 일반 로그인
@router.post("/api/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(models.User).filter(models.User.email == form_data.username).first()
    if not user or not verify_password(form_data.password, user.hashed_password):
        raise HTTPException(status_code=400, detail="Incorrect email or password")
    
    return { 
        "access_token": create_access_token(data={"sub": user.email}), 
        "token_type": "bearer", 
        "user_id": user.id, 
        "name": user.name 
    }

# 기존 카카오 로그인 (유지)
@router.post("/api/auth/kakao")
async def kakao_login(req: KakaoLoginRequest, db: Session = Depends(get_db)):
    token_url = "https://kauth.kakao.com/oauth/token"
    data = { "grant_type": "authorization_code", "client_id": KAKAO_REST_API_KEY, "redirect_uri": KAKAO_REDIRECT_URI, "code": req.code }
    
    async with httpx.AsyncClient() as client:
        token_res = await client.post(token_url, data=data)
        if token_res.status_code != 200: raise HTTPException(400, "카카오 토큰 발급 실패")
        access_token = token_res.json().get("access_token")

        user_info_res = await client.get("https://kapi.kakao.com/v2/user/me", headers={"Authorization": f"Bearer {access_token}"})
        user_info = user_info_res.json()
        
        kakao_id = str(user_info.get("id"))
        kakao_account = user_info.get("kakao_account", {})
        profile = kakao_account.get("profile", {})
        
        nickname = profile.get("nickname") or f"User_{kakao_id[-4:]}"
        email = f"kakao_{kakao_id}@wemeet.com" 

        user = db.query(models.User).filter(models.User.email == email).first()
        if not user:
            # 신규 가입 (카카오)
            user = models.User(
                email=email, 
                hashed_password=get_password_hash("kakao"), 
                name=nickname, 
                avatar="👤", 
                lat=37.5665, # 카카오는 위치 정보 바로 못 받으므로 기본값
                lng=126.9780,
                location_name="위치 미설정",
                wallet_balance=3000
            )
            db.add(user); db.commit(); db.refresh(user)
            # 아바타 초기화
            db.add(models.UserAvatar(user_id=user.id, equipped={"body": "body_basic"}, inventory=[]))
            db.commit()

        return { 
            "access_token": create_access_token(data={"sub": user.email}), 
            "token_type": "bearer", 
            "user_id": user.id, 
            "name": user.name 
        }