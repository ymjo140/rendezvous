"""Verified attendance. All writers lock crew -> visit, then commit together."""
from datetime import datetime, timedelta
from math import asin, cos, isfinite, radians, sin, sqrt
from uuid import uuid4

from fastapi import HTTPException
from jose import JWTError, jwt

from core.config import settings
from core import visit_time as clock
from domain import models as m
from services.crew_access import is_member
from services import beta_event_service

QR_TTL_SECONDS = 180
APPROVAL_TTL_MINUTES = 15
JOIN_WINDOW = timedelta(hours=2)
CHECKIN_RADIUS_M = 300


def insert_once(db, model, values, columns):
    if db.bind.dialect.name == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    elif db.bind.dialect.name == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    else:
        raise RuntimeError("Visits require PostgreSQL (SQLite is for tests only)")
    return db.execute(insert(model).values(**values).on_conflict_do_nothing(index_elements=columns)).rowcount == 1


def owned_place(db, place_id, merchant):
    place = db.get(m.Place, place_id)
    if not place:
        raise HTTPException(404, "가게를 찾을 수 없어요.")
    if not merchant or str(place.owner_id or "") != str(merchant):
        raise HTTPException(403, "본인 가게에서만 방문을 확인할 수 있어요.")
    return place


def issue_qr(db, place_id, merchant):
    owned_place(db, place_id, merchant)
    now = clock.utc_now()
    expiry = now + timedelta(seconds=QR_TTL_SECONDS)
    token = jwt.encode({
        "iss": "rendezvous-checkin", "aud": "visit-proof", "kind": "place-qr",
        "place_id": place_id, "merchant": merchant, "jti": str(uuid4()),
        "iat": int(now.timestamp()), "exp": int(expiry.timestamp()),
    }, settings.SECRET_KEY, algorithm="HS256")
    # Fragment keeps the proof out of HTTP access logs and referrer URLs.
    return {"token": token, "server_time": now.isoformat(), "expires_at": expiry.isoformat(),
            "checkin_path": f"/checkin/{place_id}#qr={token}"}


def verify_qr(token, place, now):
    try:
        claims = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"],
                            audience="visit-proof", issuer="rendezvous-checkin",
                            options={"verify_exp": False})
        # One injected clock for expiry, visit date, and tests. Signature/aud/iss
        # remain checked by jose; expiry and issuance are checked here.
        issued, expires = claims["iat"], claims["exp"]
        if type(issued) is not int or type(expires) is not int:
            raise ValueError()
        if not (issued <= now.timestamp() < expires <= issued + QR_TTL_SECONDS):
            raise ValueError()
        if (claims.get("aud") != "visit-proof" or claims.get("kind") != "place-qr"
                or type(claims.get("place_id")) is not int or claims["place_id"] != place.id
                or claims.get("merchant") != str(place.owner_id or "")
                or not isinstance(claims.get("jti"), str) or not claims["jti"]):
            raise ValueError()
        return claims["jti"]
    except (JWTError, ValueError, TypeError, KeyError):
        raise HTTPException(400, "QR이 유효하지 않거나 만료됐어요. 매장의 새 QR을 스캔해주세요.")


def distance_m(lat, lng, place):
    if (place.lat is None or place.lng is None or not isfinite(place.lat) or not isfinite(place.lng)
            or not -90 <= place.lat <= 90 or not -180 <= place.lng <= 180):
        raise HTTPException(400, "가게 위치를 확인할 수 없어요. 직원에게 방문 승인을 요청해주세요.")
    a, b, c, d = map(radians, (lat, lng, place.lat, place.lng))
    h = sin((c - a) / 2) ** 2 + cos(a) * cos(c) * sin((d - b) / 2) ** 2
    return 6371000 * 2 * asin(min(1.0, sqrt(h)))


def resolve_visit(db, user, req, now):
    place = db.get(m.Place, req.place_id)
    if not place:
        raise HTTPException(404, "가게를 찾을 수 없어요.")
    cid = req.community_id
    if req.reservation_id:
        reservation = db.get(m.Reservation, req.reservation_id)
        if not reservation or reservation.user_id != user.id:
            raise HTTPException(404, "예약을 찾을 수 없어요.")
        if reservation.place_id != place.id or reservation.status not in ("confirmed", "completed"):
            raise HTTPException(400, "체크인할 수 없는 예약이에요.")
        try:
            scheduled = datetime.fromisoformat(f"{reservation.date}T{reservation.time}")
            if scheduled.tzinfo is not None:
                raise ValueError()
            scheduled = scheduled.replace(tzinfo=clock.KST)
        except (TypeError, ValueError):
            raise HTTPException(400, "예약 시간을 확인할 수 없어요.")
        if abs(clock.as_utc(scheduled) - now) > JOIN_WINDOW:
            raise HTTPException(400, "예약 시간 전후 2시간 안에 체크인해주세요.")
        if cid is not None and cid != reservation.community_id:
            raise HTTPException(400, "예약의 크루와 요청한 크루가 달라요.")
        cid = reservation.community_id
    if cid:
        crew = db.query(m.Community).filter_by(id=cid).populate_existing().with_for_update().first()
        if not is_member(crew, user):
            raise HTTPException(403, "현재 크루 멤버만 체크인할 수 있어요.")
    return place, cid


def scope_key(cid, uid):
    return f"crew:{cid}" if cid else f"user:{uid}"


def approval_code(request_id):
    """Display alongside the name to distinguish guests; this is not an auth secret."""
    return request_id.replace("-", "")[:8].upper()


def record_attendance(db, user, place, cid, occurred_at, verified_at, evidence_type,
                      evidence_ref, party_size=1, context_tag=None, distance=None):
    scope = scope_key(cid, user.id)
    day = clock.kst_date(occurred_at)
    insert_once(db, m.VisitEvent, {
        "id": str(uuid4()), "scope_key": scope, "place_id": place.id,
        "community_id": cid, "personal_user_id": None if cid else user.id,
        "visit_date_kst": day, "occurred_at": occurred_at, "status": "pending",
    }, ["scope_key", "place_id", "visit_date_kst"])
    event = (db.query(m.VisitEvent).filter_by(scope_key=scope, place_id=place.id, visit_date_kst=day)
             .populate_existing().with_for_update().one())
    added = insert_once(db, m.VisitParticipant, {
        "id": str(uuid4()), "visit_id": event.id, "user_id": user.id,
        "evidence_type": evidence_type, "evidence_ref": evidence_ref,
        "occurred_at": occurred_at, "verified_at": verified_at,
        "reported_party_size": party_size, "context_tag": context_tag, "distance_m": distance,
    }, ["visit_id", "user_id"])
    rows = db.query(m.VisitParticipant).filter_by(visit_id=event.id).all()
    times = sorted(clock.as_utc(p.occurred_at) for p in rows)
    joint = any(b - a <= JOIN_WINDOW for a, b in zip(times, times[1:]))
    was_verified = event.status == "verified"
    if event.status != "verified" and (not cid or joint):
        event.status = "verified"
        event.verified_at = verified_at
    event.occurred_at = min(clock.as_utc(event.occurred_at), occurred_at)
    if not was_verified and event.status == "verified":
        beta_event_service.record_event(
            db,
            user.id,
            "visit_verified",
            entity_type="visit",
            entity_id=event.id,
            metadata={"surface": "checkin", "source": evidence_type},
            request_id=f"visit_verified:{event.id}",
        )
    db.flush()
    if added:
        from services.taste_service import mark_dirty
        mark_dirty(db, user.id)
    return event, not added


def visit_payload(db, event, already=False):
    from services import visit_service
    stats = visit_service.crew_visit_stats(db, event.community_id) if event.community_id else {"visits": 0}
    eligibility = visit_service.crew_eligibility(db, db.get(m.Community, event.community_id)) if event.community_id else {}
    return {
        "id": event.id, "already": already, "status": event.status,
        "participant_count": db.query(m.VisitParticipant).filter_by(visit_id=event.id).count(),
        "required_participants": 2 if event.community_id else 1,
        "visit_date_kst": event.visit_date_kst.isoformat(),
        "occurred_at": clock.as_utc(event.occurred_at).isoformat(),
        "crew_visits": stats["visits"], "eligible_now": eligibility.get("eligible", False),
        "eligibility": eligibility,
        "benefit": None, "benefit_blocked": None,
    }


def checkin(db, user, req):
    now = clock.utc_now()
    try:
        place, cid = resolve_visit(db, user, req, now)
        ref = verify_qr(req.qr_token, place, now)
        age = (now - clock.as_utc(req.position_at)).total_seconds()
        if not -10 <= age <= 90:
            raise HTTPException(400, "위치 확인 시간이 지났어요. 위치를 다시 확인해주세요.")
        distance = distance_m(req.lat, req.lng, place)
        if distance > CHECKIN_RADIUS_M:
            raise HTTPException(400, "가게 근처에서 체크인해주세요.")
        event, already = record_attendance(db, user, place, cid, now, now, "signed_qr", ref,
                                           req.party_size, req.context_tag, round(distance))
        payload = visit_payload(db, event, already)
        db.commit()
        return payload
    except Exception:
        db.rollback()
        raise


def request_approval(db, user, req):
    now = clock.utc_now()
    try:
        place, cid = resolve_visit(db, user, req, now)
        scope, day = scope_key(cid, user.id), clock.kst_date(now)
        insert_once(db, m.VisitApprovalRequest, {
            "id": str(uuid4()), "scope_key": scope, "place_id": place.id,
            "user_id": user.id, "community_id": cid, "visit_date_kst": day,
            "created_at": now, "expires_at": now + timedelta(minutes=APPROVAL_TTL_MINUTES),
            "reported_party_size": req.party_size, "context_tag": req.context_tag,
        }, ["scope_key", "place_id", "user_id", "visit_date_kst"])
        row = db.query(m.VisitApprovalRequest).filter_by(scope_key=scope, place_id=place.id,
                user_id=user.id, visit_date_kst=day).with_for_update().one()
        if not row.approved_at and clock.as_utc(row.expires_at) <= now:
            row.created_at, row.expires_at = now, now + timedelta(minutes=APPROVAL_TTL_MINUTES)
            row.reported_party_size, row.context_tag = req.party_size, req.context_tag
        db.commit()
        return {"request_id": row.id, "status": "approved" if row.approved_at else "pending",
                "verification_code": approval_code(row.id),
                "expires_at": clock.as_utc(row.expires_at).isoformat(), "visit_id": row.visit_id}
    except Exception:
        db.rollback()
        raise


def approve_visit(db, request_id, merchant, expected_created_at=None):
    now = clock.utc_now()
    try:
        # Read the ID first, then lock crew -> request -> visit in a fixed order.
        row = db.get(m.VisitApprovalRequest, request_id)
        if not row:
            raise HTTPException(404, "방문 요청을 찾을 수 없어요.")
        place = owned_place(db, row.place_id, merchant)
        user = db.get(m.User, row.user_id)
        if row.community_id:
            crew = db.query(m.Community).filter_by(id=row.community_id).populate_existing().with_for_update().first()
            if not is_member(crew, user):
                raise HTTPException(403, "크루를 떠난 사용자의 요청이에요.")
        row = db.query(m.VisitApprovalRequest).filter_by(id=request_id).populate_existing().with_for_update().one()
        if expected_created_at is not None and clock.as_utc(row.created_at) != clock.as_utc(expected_created_at):
            raise HTTPException(409, "방문 요청이 갱신됐어요. 손님의 새 요청을 다시 확인해주세요.")
        if row.approved_at:
            result = visit_payload(db, db.get(m.VisitEvent, row.visit_id), True)
        else:
            if clock.as_utc(row.expires_at) <= now:
                raise HTTPException(410, "방문 요청이 만료됐어요.")
            event, already = record_attendance(db, user, place, row.community_id,
                clock.as_utc(row.created_at), now, "merchant_approval", row.id,
                row.reported_party_size, row.context_tag)
            row.approved_at, row.approved_by, row.visit_id = now, merchant, event.id
            result = visit_payload(db, event, already)
        db.commit()
        return result
    except Exception:
        db.rollback()
        raise
