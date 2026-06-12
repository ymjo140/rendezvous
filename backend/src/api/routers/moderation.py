"""콘텐츠 신고 + 사용자 차단 — 스토어 UGC 정책(Apple 1.2 / Google UGC) 대응."""
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from api.dependencies import get_current_user

router = APIRouter()

VALID_TARGETS = {"post", "comment", "user"}
VALID_REASONS = {"spam", "abuse", "adult", "false_info", "etc"}


@router.post("/api/reports")
def create_report(
    req: dict,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    target_type = str(req.get("target_type") or "").strip()
    target_id = str(req.get("target_id") or "").strip()
    reason = str(req.get("reason") or "etc").strip()
    if target_type not in VALID_TARGETS or not target_id:
        raise HTTPException(status_code=400, detail="신고 대상이 올바르지 않습니다.")
    if reason not in VALID_REASONS:
        reason = "etc"

    db.add(models.ContentReport(
        reporter_id=user.id,
        target_type=target_type,
        target_id=target_id,
        reason=reason,
        detail=str(req.get("detail") or "")[:500] or None,
    ))
    db.commit()
    return {"status": "reported", "message": "신고가 접수되었습니다. 검토 후 조치할게요."}


@router.post("/api/users/{user_id}/block")
def block_user(
    user_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    if user_id == user.id:
        raise HTTPException(status_code=400, detail="자신을 차단할 수 없습니다.")
    exists = db.query(models.UserBlock).filter(
        models.UserBlock.blocker_id == user.id,
        models.UserBlock.blocked_user_id == user_id,
    ).first()
    if exists:
        return {"status": "already_blocked"}
    db.add(models.UserBlock(blocker_id=user.id, blocked_user_id=user_id))
    db.commit()
    return {"status": "blocked", "message": "차단했어요. 이 사용자의 게시물이 더 이상 보이지 않습니다."}


@router.delete("/api/users/{user_id}/block")
def unblock_user(
    user_id: int,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    db.query(models.UserBlock).filter(
        models.UserBlock.blocker_id == user.id,
        models.UserBlock.blocked_user_id == user_id,
    ).delete()
    db.commit()
    return {"status": "unblocked"}


@router.get("/api/users/me/blocks")
def list_blocks(
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    rows = db.query(models.UserBlock).filter(models.UserBlock.blocker_id == user.id).all()
    ids = [r.blocked_user_id for r in rows]
    users = db.query(models.User).filter(models.User.id.in_(ids)).all() if ids else []
    return [{"user_id": u.id, "name": u.name} for u in users]
