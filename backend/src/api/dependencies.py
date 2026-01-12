from typing import Optional
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from jose import jwt, JWTError
from sqlalchemy.orm import Session

from core.config import settings
from core.database import get_db
from repositories.user_repository import UserRepository

# auto_error=False를 설정해야 토큰이 없어도 401 에러를 자동으로 던지지 않습니다.
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/login", auto_error=False)

def get_current_user(token: Optional[str] = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    """
    토큰이 있으면 유저 객체를 반환하고, 없거나 유효하지 않으면 None을 반환합니다.
    """
    # 1. 토큰이 없는 경우 (비로그인 상태)
    if not token:
        return None
    
    try:
        # 2. 토큰 디코딩
        payload = jwt.decode(token, settings.SECRET_KEY, algorithms=[settings.ALGORITHM])
        email: str = payload.get("sub")
        if email is None:
            return None
    except JWTError:
        # 토큰 변조나 만료 시 에러 대신 None 반환
        return None
    
    # 3. DB에서 유저 조회
    repo = UserRepository()
    user = repo.get_by_email(db, email=email)
    
    if user is None:
        return None
        
    return user