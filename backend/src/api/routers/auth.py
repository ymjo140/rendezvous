from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm
from sqlalchemy.orm import Session

from ...core.database import get_db
from ...schemas import user as schemas
from ...services.auth_service import AuthService

router = APIRouter()
auth_service = AuthService()

@router.post("/api/auth/signup", response_model=schemas.Token)
def signup(user: schemas.UserCreate, db: Session = Depends(get_db)):
    return auth_service.signup(db, user)

@router.post("/api/login")
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    return auth_service.login(db, form_data)

@router.post("/api/auth/kakao")
async def kakao_login(req: schemas.KakaoLoginRequest, db: Session = Depends(get_db)):
    return await auth_service.kakao_login(db, req.code)