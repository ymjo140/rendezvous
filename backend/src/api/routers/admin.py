"""신고 처리 관리자 API — content_reports 조회/조치.
Apple 1.2 / Google UGC 정책(신고에 대한 24시간 내 실질 조치) 대응.
관리자 판별: env ADMIN_USER_IDS(콤마구분 user.id, 기본 '5'=창업자)."""
import os
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from api.dependencies import get_current_user

router = APIRouter()


def _admin_ids() -> set:
    raw = os.getenv("ADMIN_USER_IDS", "5")
    ids = set()
    for tok in raw.replace(" ", "").split(","):
        if tok.isdigit():
            ids.add(int(tok))
    return ids


def require_admin(user: models.User = Depends(get_current_user)) -> models.User:
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    if user.id not in _admin_ids():
        raise HTTPException(status_code=403, detail="관리자만 접근할 수 있습니다.")
    return user


@router.get("/api/admin/me")
def admin_me(admin: models.User = Depends(require_admin)):
    return {"is_admin": True, "id": admin.id, "name": admin.name}


@router.get("/api/admin/reports")
def list_reports(
    status: str = "pending",
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    q = db.query(models.ContentReport)
    if status in ("pending", "reviewed"):
        q = q.filter(models.ContentReport.status == status)
    reports = q.order_by(models.ContentReport.created_at.desc()).limit(200).all()

    reporter_ids = {r.reporter_id for r in reports}
    names = {}
    if reporter_ids:
        names = {u.id: u.name for u in db.query(models.User).filter(models.User.id.in_(reporter_ids)).all()}

    out = []
    for r in reports:
        preview = None
        target_user = None
        if r.target_type == "post":
            p = db.query(models.Post).filter(models.Post.id == r.target_id).first()
            preview = {
                "exists": bool(p),
                "content": (p.content or "")[:200] if p else None,
                "image_urls": (p.image_urls or [])[:1] if p else [],
                "media_type": p.media_type if p else None,
                "author_id": p.user_id if p else None,
            }
        elif r.target_type == "user" and str(r.target_id).isdigit():
            tu = db.query(models.User).filter(models.User.id == int(r.target_id)).first()
            target_user = {"id": tu.id, "name": tu.name} if tu else None

        out.append({
            "id": r.id,
            "target_type": r.target_type,
            "target_id": r.target_id,
            "reason": r.reason,
            "detail": r.detail,
            "status": r.status,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "reporter": {"id": r.reporter_id, "name": names.get(r.reporter_id)},
            "preview": preview,
            "target_user": target_user,
        })
    return out


@router.get("/api/admin/reports/summary")
def reports_summary(admin: models.User = Depends(require_admin), db: Session = Depends(get_db)):
    rows = db.query(models.ContentReport.status, func.count()).group_by(models.ContentReport.status).all()
    return {str(s or "pending"): int(c) for s, c in rows}


@router.post("/api/admin/reports/{report_id}/action")
def act_on_report(
    report_id: int,
    req: dict,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """action: 'delete_content'(대상 콘텐츠 삭제) | 'dismiss'(반려). 두 경우 모두 신고를 reviewed로."""
    action = str(req.get("action") or "").strip()
    if action not in ("delete_content", "dismiss"):
        raise HTTPException(status_code=400, detail="잘못된 조치입니다.")

    report = db.query(models.ContentReport).filter(models.ContentReport.id == report_id).first()
    if report is None:
        raise HTTPException(status_code=404, detail="신고를 찾을 수 없습니다.")

    deleted = False
    try:
        if action == "delete_content" and report.target_type == "post":
            post = db.query(models.Post).filter(models.Post.id == report.target_id).first()
            if post:
                db.delete(post)  # likes/comments는 cascade 삭제
                deleted = True

        # 같은 대상에 대한 pending 신고를 모두 reviewed 처리(중복 방지)
        db.query(models.ContentReport).filter(
            models.ContentReport.target_type == report.target_type,
            models.ContentReport.target_id == report.target_id,
            models.ContentReport.status == "pending",
        ).update({"status": "reviewed"}, synchronize_session=False)
        db.commit()
    except Exception as e:
        db.rollback()
        print(f"[admin] act_on_report 실패: {e}")
        raise HTTPException(status_code=500, detail="조치 처리 중 오류가 발생했습니다.")

    return {"status": "ok", "action": action, "deleted_content": deleted}
