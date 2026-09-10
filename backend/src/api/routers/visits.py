from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from api.dependencies import require_user, get_current_merchant
from core.database import get_db
from core import visit_time as clock
from domain import models as m
from schemas.visits import VisitInput, RedeemRequest
from services import checkin_service, redemption_service
from services.crew_access import is_member

router = APIRouter()


def _can_read_visit(db, event, user):
    if not event:
        raise HTTPException(404, "방문을 찾을 수 없어요.")
    if event.community_id:
        allowed = is_member(db.get(m.Community, event.community_id), user)
    else:
        allowed = event.personal_user_id == user.id
    if not allowed:
        raise HTTPException(403, "이 방문을 볼 수 없어요.")


@router.get("/api/visits/{visit_id}")
def visit_status(visit_id: str, user=Depends(require_user), db: Session = Depends(get_db)):
    event = db.get(m.VisitEvent, visit_id)
    _can_read_visit(db, event, user)
    return checkin_service.visit_payload(db, event)


@router.post("/api/merchant/stores/{place_id}/checkin-qr")
def create_qr(place_id: int, merchant: str = Depends(get_current_merchant), db: Session = Depends(get_db)):
    return checkin_service.issue_qr(db, place_id, merchant)


@router.post("/api/checkin/approval-requests")
def request_approval(req: VisitInput, user=Depends(require_user), db: Session = Depends(get_db)):
    return checkin_service.request_approval(db, user, req)


@router.get("/api/checkin/approval-requests/{request_id}")
def approval_status(request_id: str, user=Depends(require_user), db: Session = Depends(get_db)):
    row = db.get(m.VisitApprovalRequest, request_id)
    if not row or row.user_id != user.id:
        raise HTTPException(404, "방문 요청을 찾을 수 없어요.")
    if row.community_id and not is_member(db.get(m.Community, row.community_id), user):
        raise HTTPException(403, "크루를 떠난 사용자의 요청이에요.")
    state = "approved" if row.approved_at else ("expired" if clock.as_utc(row.expires_at) <= clock.utc_now() else "pending")
    return {"request_id": row.id, "status": state,
            "visit": checkin_service.visit_payload(db, db.get(m.VisitEvent, row.visit_id)) if row.visit_id else None}


@router.get("/api/merchant/stores/{place_id}/visit-requests")
def pending_requests(place_id: int, merchant: str = Depends(get_current_merchant), db: Session = Depends(get_db)):
    checkin_service.owned_place(db, place_id, merchant)
    rows = (db.query(m.VisitApprovalRequest, m.User.name).join(m.User, m.User.id == m.VisitApprovalRequest.user_id)
            .filter(m.VisitApprovalRequest.place_id == place_id, m.VisitApprovalRequest.approved_at.is_(None),
                    m.VisitApprovalRequest.expires_at > clock.utc_now())
            .order_by(m.VisitApprovalRequest.created_at).limit(100).all())
    return {"items": [{"id": r.id, "name": name, "community_id": r.community_id,
                       "created_at": clock.as_utc(r.created_at).isoformat()} for r, name in rows]}


@router.post("/api/merchant/visit-requests/{request_id}/approve")
def approve(request_id: str, merchant: str = Depends(get_current_merchant), db: Session = Depends(get_db)):
    return checkin_service.approve_visit(db, request_id, merchant)


@router.post("/api/visits/{visit_id}/redeem")
def redeem(visit_id: str, req: RedeemRequest, user=Depends(require_user), db: Session = Depends(get_db)):
    return redemption_service.redeem(db, user, visit_id, req)
