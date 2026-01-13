from typing import Optional
from fastapi import Depends, HTTPException, status
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