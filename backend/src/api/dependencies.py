import os
from typing import Optional
import httpx
from fastapi import Depends, HTTPException, status, Header
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from core.config import settings
from core.database import get_db
from repositories.user_repository import UserRepository

# auto_error=False로 설정해야 토큰이 없을 때 바로 401이 안 뜨고 내부 로직을 탑니다.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login", auto_error=False)

def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    # 🔍 [디버그 로그] 토큰 수신 여부 확인
    if not token:
        print("❌ [Auth Debug] 토큰이 없음 (Authorization 헤더 누락)")
        return None
    
    # 토큰 앞부분만 살짝 출력해서 잘 들어왔는지 확인
    print(f"🧐 [Auth Debug] 토큰 수신됨: {token[:10]}...")

    try:
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        
        if email is None:
            print("❌ [Auth Debug] 토큰에 이메일 정보(sub)가 없음")
            return None
            
        print(f"✅ [Auth Debug] 토큰 디코딩 성공. Email: {email}")
        
    except JWTError as e:
        print(f"❌ [Auth Debug] 토큰 검증 실패 (만료되었거나 위조됨): {e}")
        return None
    
    # DB 조회
    repo = UserRepository()
    user = repo.get_by_email(db, email=email)
    
    if user is None:
        print(f"❌ [Auth Debug] DB에서 유저를 찾을 수 없음: {email}")
        return None

    return user


def require_user(current_user=Depends(get_current_user)):
    """로그인 필수 엔드포인트용 — 비로그인이면 500(NoneType.id) 대신 401.
    get_current_user는 게스트 허용 엔드포인트(추천 등)를 위해 None 반환을 유지."""
    if current_user is None:
        from fastapi import HTTPException
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    return current_user


# 머천트(사장님 콘솔) 인증 — Supabase Auth(uuid) 기반.
# B2C(get_current_user)는 FastAPI JWT라 머천트 토큰을 해독 못 함(인증 체계 분리).
# 머천트 토큰은 Supabase /auth/v1/user 로 검증해 uuid를 얻는다(별도 시크릿 불필요).
_SUPABASE_URL = os.getenv("SUPABASE_URL", "").rstrip("/")
_SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY") or ""


def get_current_merchant(authorization: Optional[str] = Header(default=None)) -> str:
    """머천트 Supabase 세션 검증 → merchant uuid(str) 반환. 실패 시 401(미설정 시 503)."""
    if not _SUPABASE_URL or not _SUPABASE_KEY:
        raise HTTPException(status_code=503, detail="머천트 인증이 구성되지 않았습니다.")
    if not authorization or not authorization.lower().startswith("bearer "):
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    token = authorization.split(" ", 1)[1].strip()
    try:
        resp = httpx.get(
            f"{_SUPABASE_URL}/auth/v1/user",
            headers={"apikey": _SUPABASE_KEY, "Authorization": f"Bearer {token}"},
            timeout=10.0,
        )
    except Exception:
        raise HTTPException(status_code=503, detail="인증 서버 연결에 실패했습니다.")
    if resp.status_code != 200:
        raise HTTPException(status_code=401, detail="유효하지 않은 세션입니다. 다시 로그인해주세요.")
    uid = (resp.json() or {}).get("id")
    if not uid:
        raise HTTPException(status_code=401, detail="유효하지 않은 세션입니다.")
    return str(uid)