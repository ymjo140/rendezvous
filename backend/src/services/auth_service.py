import requests
import httpx
from datetime import timedelta
from sqlalchemy.orm import Session
from fastapi import HTTPException

from core.config import settings
from domain import models
from schemas import user as schemas
from repositories.user_repository import UserRepository
from core.security import get_password_hash, create_access_token, verify_password

user_repo = UserRepository()

class AuthService:
    def get_address_from_coords(self, lat: float, lng: float) -> str:
        """네이버 API를 이용한 Reverse Geocoding"""
        try:
            url = "https://naveropenapi.apigw.ntruss.com/map-reversegeocode/v2/gc"
            headers = {
                "X-NCP-APIGW-API-KEY-ID": settings.NAVER_MAP_ID,
                "X-NCP-APIGW-API-KEY": settings.NAVER_MAP_SECRET
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

    def signup(self, db: Session, user_dto: schemas.UserCreate):
        # 1. 중복 체크
        if user_repo.get_by_email(db, user_dto.email):
            raise HTTPException(status_code=400, detail="Email already registered")

        # 2. 위치 정보 보정 (로직 분리)
        if user_dto.lat and user_dto.lng and not user_dto.location_name:
            user_dto.location_name = self.get_address_from_coords(user_dto.lat, user_dto.lng)
        
        if not user_dto.lat:
            user_dto.lat = 37.5665
            user_dto.lng = 126.9780
            user_dto.location_name = "서울 시청 (기본)"

        # 🌟 3. 트랜잭션 시작 (Atomicity 보장)
        try:
            hashed_pw = get_password_hash(user_dto.password)
            
            # 유저 생성
            new_user = user_repo.create(db, user_dto, hashed_pw, initial_balance=settings.SIGNUP_BONUS_AMOUNT)
            
            # 아바타 생성 (실패 시 유저 생성도 롤백됨)
            user_repo.create_default_avatar(db, new_user.id)
            
            db.commit() # 전체 성공 시 커밋
            db.refresh(new_user)
            
            # 토큰 발급
            access_token = create_access_token(data={"sub": new_user.email})
            return {
                "access_token": access_token,
                "token_type": "bearer",
                "user_id": new_user.id,
                "name": new_user.name
            }
        except Exception as e:
            db.rollback() # 실패 시 롤백
            raise e

    def login(self, db: Session, form_data):
        user = user_repo.get_by_email(db, form_data.username)
        if not user or not verify_password(form_data.password, user.hashed_password):
            raise HTTPException(status_code=400, detail="Incorrect email or password")
        
        return {
            "access_token": create_access_token(data={"sub": user.email}),
            "token_type": "bearer",
            "user_id": user.id,
            "name": user.name
        }

    async def kakao_login(self, db: Session, code: str, redirect_uri: str = None):
        token_url = "https://kauth.kakao.com/oauth/token"
        # 프론트가 authorize에 쓴 redirect_uri를 그대로 사용(없으면 환경변수 폴백) → 도메인 바뀌어도 일치
        data = { "grant_type": "authorization_code", "client_id": settings.KAKAO_REST_API_KEY, "redirect_uri": redirect_uri or settings.KAKAO_REDIRECT_URI, "code": code }
        
        async with httpx.AsyncClient() as client:
            token_res = await client.post(token_url, data=data)
            token_json = token_res.json()
            if token_res.status_code != 200 or "access_token" not in token_json:
                # 실제 원인(redirect_uri 불일치 KOE006, code 만료 등)을 로그+응답에 노출
                print(f"[kakao] 토큰 교환 실패: {token_res.status_code} {token_json}")
                detail = token_json.get("error_description") or token_json.get("error") or "카카오 토큰 실패"
                raise HTTPException(400, f"카카오 토큰 실패: {detail}")
            access_token = token_json.get("access_token")

            user_info_res = await client.get("https://kapi.kakao.com/v2/user/me", headers={"Authorization": f"Bearer {access_token}"})
            user_info = user_info_res.json()

            kakao_id = str(user_info.get("id"))
            nickname = user_info.get("properties", {}).get("nickname") or f"User_{kakao_id[-4:]}"
            email = f"kakao_{kakao_id}@wemeet.com"

            user = user_repo.get_by_email(db, email)
            if not user:
                # 🌟 카카오 신규 가입도 트랜잭션 처리
                try:
                    user = user_repo.create_kakao_user(db, email, nickname, get_password_hash("kakao"), settings.SIGNUP_BONUS_AMOUNT)
                    user_repo.create_default_avatar(db, user.id)
                    db.commit()
                    db.refresh(user)
                except Exception as e:
                    db.rollback()
                    print(f"[kakao] 신규 가입 실패: {e}")
                    raise HTTPException(500, f"가입 처리 실패: {e}")

            return { 
                "access_token": create_access_token(data={"sub": user.email}), 
                "token_type": "bearer", 
                "user_id": user.id, 
                "name": user.name 
            }