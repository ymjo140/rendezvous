# -*- coding: utf-8 -*-
"""푸시 토큰 등록/해제 — 앱(Capacitor)에서 FCM 토큰을 받아 저장."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from api.dependencies import require_user
from services import push_service

router = APIRouter()


@router.post("/api/push/register")
def register_push_token(
    req: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user),
):
    token = str(req.get("token") or "").strip()
    if not token or len(token) > 512:
        raise HTTPException(status_code=400, detail="올바르지 않은 토큰이에요.")
    return push_service.register_token(db, current_user.id, token, str(req.get("platform") or "android"))


@router.delete("/api/push/register")
def unregister_push_token(
    req: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(require_user),
):
    token = str(req.get("token") or "").strip()
    if not token:
        raise HTTPException(status_code=400, detail="토큰이 필요해요.")
    return push_service.unregister_token(db, token)
