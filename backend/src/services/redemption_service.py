"""Idempotent benefit use; app row lock serializes its monthly allowance.

The production switch stays closed. This ledger does not turn mock cash into
money, and check-in never calls redemption implicitly.
"""
from datetime import datetime, time
from uuid import uuid4

from fastapi import HTTPException

from core import visit_time as clock
from domain import models as m
from services import payment_policy, visit_service
from services.crew_access import is_member, members
from services.checkin_service import JOIN_WINDOW


def confirmed_party(db, visit_id):
    times = sorted(clock.as_utc(r.occurred_at) for r in db.query(m.VisitParticipant).filter_by(visit_id=visit_id).all())
    return max((sum(t <= x <= t + JOIN_WINDOW for x in times) for t in times), default=0)


def terms_for(app, deal):
    # An explicitly empty snapshot condition means no condition, not a fallback
    # to conditions the merchant added after the agreement.
    snap = app.terms_snapshot
    if snap:
        return dict(snap)
    return {"title": deal.title, "benefit": deal.benefit, "discount_pct": deal.discount_pct,
            "conditions": deal.conditions or {}, "expires_at": deal.expires_at.isoformat() if deal.expires_at else None}


def blocked_reason(db, app, deal, crew, now, party_size=None):
    terms = terms_for(app, deal)
    cond = terms.get("conditions") or {}
    if app.status != "approved" or deal.status != "active":
        return "inactive"
    try:
        if terms.get("expires_at") and clock.as_utc(datetime.fromisoformat(terms["expires_at"])) <= now:
            return "expired"
        if cond.get("max_members") is not None and len(members(crew)) > int(cond["max_members"]):
            return "members"
        local = now.astimezone(clock.KST)
        days = cond.get("days") or []
        if days and ("mon", "tue", "wed", "thu", "fri", "sat", "sun")[local.weekday()] not in days:
            return "days"
        tf, tt = cond.get("time_from"), cond.get("time_to")
        if tf or tt:
            start, end = time.fromisoformat(tf), time.fromisoformat(tt)
            current = local.time().replace(tzinfo=None)
            inside = start <= current < end if start <= end else current >= start or current < end
            if not inside:
                return "time"
        if party_size is not None and cond.get("min_party") is not None and party_size < int(cond["min_party"]):
            return "party"
        limit = cond.get("monthly_uses")
        if limit is not None and (int(limit) < 1 or visit_service.partnership_month_uses(db, app.id, clock.month_key(now)) >= int(limit)):
            return "limit"
    except (ValueError, TypeError, OverflowError):
        return "invalid_conditions"
    return None


def available_deal(db, place_id, community_id, party_size=None):
    if not community_id:
        return None
    row = (db.query(m.CrewPartnershipApp, m.CrewPartnership)
           .join(m.CrewPartnership, m.CrewPartnership.id == m.CrewPartnershipApp.partnership_id)
           .filter(m.CrewPartnershipApp.community_id == community_id,
                   m.CrewPartnershipApp.status == "approved", m.CrewPartnership.place_id == place_id,
                   m.CrewPartnership.status == "active")
           .order_by(m.CrewPartnershipApp.decided_at.desc().nullslast(), m.CrewPartnershipApp.id.desc()).first())
    if not row:
        return None
    app, deal = row
    terms = terms_for(app, deal)
    cond = terms.get("conditions") or {}
    now = clock.utc_now()
    blocked = ("unavailable" if not payment_policy.partnership_redemption_enabled() else
               blocked_reason(db, app, deal, db.get(m.Community, community_id), now, party_size))
    return {"app_id": app.id, "title": terms.get("title", deal.title),
            "benefit": terms.get("benefit", deal.benefit), "discount_pct": terms.get("discount_pct"),
            "used_this_month": visit_service.partnership_month_uses(db, app.id, clock.month_key(now)),
            "monthly_uses": cond.get("monthly_uses"), "conditions": cond,
            "max_members": cond.get("max_members"), "blocked": blocked}


def redeem(db, user, visit_id, req):
    if not payment_policy.partnership_redemption_enabled():
        raise HTTPException(503, "제휴 혜택 사용은 준비 중이에요.")
    now = clock.utc_now()
    try:
        visit = db.get(m.VisitEvent, visit_id)
        if not visit or not visit.community_id:
            raise HTTPException(404, "크루 방문을 찾을 수 없어요.")
        crew = db.query(m.Community).filter_by(id=visit.community_id).populate_existing().with_for_update().one()
        if not is_member(crew, user):
            raise HTTPException(403, "현재 크루 멤버만 사용할 수 있어요.")
        visit = db.query(m.VisitEvent).filter_by(id=visit_id).populate_existing().with_for_update().one()
        participant = db.query(m.VisitParticipant).filter_by(visit_id=visit.id, user_id=user.id).first()
        if not participant or visit.status != "verified" or visit.visit_date_kst != clock.kst_date(now):
            raise HTTPException(403, "오늘 함께 방문한 멤버만 사용할 수 있어요.")
        app = db.query(m.CrewPartnershipApp).filter_by(id=req.partnership_app_id).populate_existing().with_for_update().first()
        if not app or app.community_id != crew.id:
            raise HTTPException(404, "제휴를 찾을 수 없어요.")
        deal = db.get(m.CrewPartnership, app.partnership_id)
        if not deal or deal.place_id != visit.place_id:
            raise HTTPException(400, "방문 가게와 제휴가 달라요.")
        old = db.query(m.PartnershipRedemption).filter_by(app_id=app.id, idempotency_key=req.idempotency_key).first()
        if old and old.visit_id != visit.id:
            raise HTTPException(409, "다른 방문에 사용한 요청 키예요.")
        old = old or db.query(m.PartnershipRedemption).filter_by(app_id=app.id, visit_id=visit.id).first()
        if old:
            result = {"id": old.id, "already": True, "used_at": clock.as_utc(old.used_at).isoformat()}
        else:
            reason = blocked_reason(db, app, deal, crew, now, confirmed_party(db, visit.id))
            if reason:
                raise HTTPException(409, {"reason": reason, "message": "제휴 사용 조건을 충족하지 못했어요."})
            row = m.PartnershipRedemption(id=str(uuid4()), app_id=app.id, visit_id=visit.id,
                    user_id=user.id, idempotency_key=req.idempotency_key, used_at=now,
                    usage_month=clock.month_key(now), terms_snapshot=terms_for(app, deal))
            db.add(row)
            db.flush()
            result = {"id": row.id, "already": False, "used_at": now.isoformat()}
        result["used_this_month"] = visit_service.partnership_month_uses(db, app.id, clock.month_key(now))
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
