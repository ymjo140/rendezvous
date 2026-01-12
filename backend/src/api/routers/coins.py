from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from core.database import get_db
from domain import models
from schemas import coins as schemas
from services.coin_service import CoinService
from dependencies import get_current_user

router = APIRouter()
service = CoinService()

@router.get("/api/coins/wallet", response_model=schemas.WalletResponse)
def get_wallet(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.get_wallet_info(db, user)

@router.post("/api/coins/charge")
def charge_coins(req: schemas.CoinChargeRequest, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return service.charge_coins(db, user, req)

@router.post("/api/coins/map-loot")
def loot_coin(payload: dict, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    # payload: {"lat": 37.xxx, "lng": 127.xxx}
    return service.loot_coin(db, user, payload.get('lat'), payload.get('lng'))