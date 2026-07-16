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


@router.get("/api/admin/metrics")
def metrics(
    days: int = 14,
    admin: models.User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """운영 지표 — QA/초기 운영용. KST 기준 일별 DAU + 기능별 사용량.
    DAU = action_logs ∪ user_interaction_logs ∪ messages ∪ user_reservations의 distinct user."""
    from sqlalchemy import text as _t
    from datetime import date, timedelta, datetime, timezone

    days = max(1, min(days, 60))
    KST = timezone(timedelta(hours=9))
    today_kst = datetime.now(KST).date()

    def scalar(sql, **p):
        try:
            return int(db.execute(_t(sql), p).scalar() or 0)
        except Exception as e:
            print(f"[metrics] {e}")
            return 0

    totals = {
        "total_users": scalar("select count(*) from users"),
        "push_devices": scalar("select count(*) from user_push_tokens"),
        "active_today": scalar("select count(*) from users where last_activity_date = :d", d=today_kst.isoformat()),
        "active_7d": scalar("select count(*) from users where last_activity_date >= :d", d=(today_kst - timedelta(days=6)).isoformat()),
        "active_30d": scalar("select count(*) from users where last_activity_date >= :d", d=(today_kst - timedelta(days=29)).isoformat()),
        "reservations_total": scalar("select count(*) from user_reservations"),
        "polls_total": scalar("select count(*) from chat_polls"),
        "polls_confirmed": scalar("select count(*) from chat_polls where status = 'confirmed'"),
        "messages_total": scalar("select count(*) from messages"),
        "posts_total": scalar("select count(*) from posts"),
        "reviews_total": scalar("select count(*) from reviews"),
        "revisit_feedback": scalar("select count(*) from place_visit_feedback"),
        "friendships": scalar("select count(*) from friendships where status = 'accepted'"),
    }

    # 일별 DAU (여러 이벤트 소스 union, KST 날짜)
    daily = {}
    try:
        rows = db.execute(_t("""
            select d, count(distinct uid) from (
                select user_id as uid, (created_at + interval '9 hours')::date as d
                  from action_logs where user_id is not null and created_at > now() - (:days || ' days')::interval
                union all
                select user_id, (created_at + interval '9 hours')::date
                  from user_interaction_logs where created_at > now() - (:days || ' days')::interval
                union all
                select user_id, (timestamp + interval '9 hours')::date
                  from messages where user_id is not null and timestamp > now() - (:days || ' days')::interval
                union all
                select user_id, (created_at + interval '9 hours')::date
                  from user_reservations where created_at > now() - (:days || ' days')::interval
            ) t group by d order by d
        """), {"days": str(days)}).fetchall()
        daily = {str(r[0]): int(r[1]) for r in rows}
    except Exception as e:
        print(f"[metrics] dau: {e}")

    def daily_count(table, ts_col):
        try:
            rows = db.execute(_t(f"""
                select ({ts_col} + interval '9 hours')::date as d, count(*)
                from {table} where {ts_col} > now() - (:days || ' days')::interval
                group by d order by d
            """), {"days": str(days)}).fetchall()
            return {str(r[0]): int(r[1]) for r in rows}
        except Exception as e:
            print(f"[metrics] {table}: {e}")
            return {}

    msg_daily = daily_count("messages", "timestamp")
    res_daily = daily_count("user_reservations", "created_at")
    poll_daily = daily_count("chat_polls", "created_at")

    series = []
    for i in range(days - 1, -1, -1):
        d = (today_kst - timedelta(days=i)).isoformat()
        series.append({
            "date": d,
            "dau": daily.get(d, 0),
            "messages": msg_daily.get(d, 0),
            "reservations": res_daily.get(d, 0),
            "polls": poll_daily.get(d, 0),
        })

    return {"totals": totals, "series": series}


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
