"""Only the attendee may answer; evidence locks serialize duplicate submissions."""
from datetime import timedelta
from fastapi import HTTPException
from core import visit_time as clock
from domain import models as m
from services import taste_service
from services.crew_access import is_member

DELAY = timedelta(hours=3)


def _evidence(db, user, req):
    if req.visit_id:
        proof = db.query(m.VisitParticipant).filter_by(visit_id=req.visit_id, user_id=user.id).with_for_update().first()
        visit = db.get(m.VisitEvent, req.visit_id) if proof else None
        place_id, cid = (visit.place_id, visit.community_id) if visit else (None, None)
        at = proof.occurred_at if proof else None
    else:
        proof = db.query(m.PlaceCheckin).filter_by(id=req.checkin_id, user_id=user.id).with_for_update().first()
        place_id, cid = (proof.place_id, proof.community_id) if proof else (None, None)
        at = proof.created_at if proof else None
    if not proof or place_id != req.place_id:
        raise HTTPException(404, "본인의 방문 기록을 찾을 수 없어요.")
    if clock.as_utc(at) + DELAY > clock.utc_now():
        raise HTTPException(409, "방문 3시간 뒤에 후기를 남길 수 있어요.")
    crew = db.get(m.Community, cid) if cid else None
    return crew if is_member(crew, user) else None


def _existing(db, user, req):
    if req.visit_id:
        return db.query(m.VerifiedVisitFeedback).filter_by(visit_id=req.visit_id, user_id=user.id).first()
    return db.query(m.PlaceVisitFeedback).filter_by(checkin_id=req.checkin_id, user_id=user.id).first()


def submit(db, user, req):
    crew = _evidence(db, user, req)
    if req.group_revisit is not None and not crew:
        raise HTTPException(400, "현재 함께하는 크루의 방문에만 모임 답변을 남길 수 있어요.")
    if _existing(db, user, req):
        db.commit()
        return {"status": "already", "message": "이미 응답했어요."}
    values = dict(user_id=user.id, personal_revisit=req.personal_revisit,
                  group_revisit=req.group_revisit,
                  dislike_reason=req.dislike_reason if not req.personal_revisit else None)
    if req.visit_id:
        row = m.VerifiedVisitFeedback(visit_id=req.visit_id, created_at=clock.utc_now(), **values)
    else:
        row = m.PlaceVisitFeedback(place_id=req.place_id, checkin_id=req.checkin_id,
                                  room_id=crew.id if crew else None, **values)
    db.add(row)
    taste_service.mark_dirty(db, user.id)
    db.commit()
    return {"status": "ok"}


def review(db, user, req):
    _evidence(db, user, req)
    feedback = _existing(db, user, req)
    if not feedback:
        raise HTTPException(409, "재방문 질문에 먼저 답해주세요.")
    previous = feedback.review_id if req.visit_id else (
        db.query(m.Review.id).filter_by(checkin_id=req.checkin_id, user_id=user.id).scalar())
    if previous:
        db.commit()
        return {"status": "already", "id": previous}
    place = db.get(m.Place, req.place_id)
    images = [url for url in req.image_urls if url.startswith(("https://", "data:image/jpeg;base64,", "data:image/png;base64,", "data:image/webp;base64,"))]
    row = m.Review(user_id=user.id, place_id=req.place_id, place_name=place.name,
                   checkin_id=req.checkin_id, rating=req.rating, comment=req.comment,
                   tags=req.tags, image_urls=images)
    db.add(row)
    db.flush()
    if req.visit_id:
        feedback.review_id = row.id
    promoted = bool(images and not (place.hero_image or "").strip() and req.rating >= 4)
    if promoted:
        place.hero_image = images[0]
    taste_service.mark_dirty(db, user.id)
    db.commit()
    return {"status": "ok", "id": row.id, "hero_promoted": promoted}


def pending(db, user):
    cutoff = clock.utc_now() - DELAY
    answered = db.query(m.VerifiedVisitFeedback.id).filter(
        m.VerifiedVisitFeedback.visit_id == m.VisitEvent.id, m.VerifiedVisitFeedback.user_id == user.id).exists()
    modern = (db.query(m.VisitEvent, m.VisitParticipant).join(m.VisitParticipant)
              .filter(m.VisitParticipant.user_id == user.id, m.VisitParticipant.occurred_at <= cutoff, ~answered)
              .order_by(m.VisitParticipant.occurred_at.desc()).limit(20).all())
    legacy_done = db.query(m.PlaceVisitFeedback.id).filter(
        m.PlaceVisitFeedback.checkin_id == m.PlaceCheckin.id, m.PlaceVisitFeedback.user_id == user.id).exists()
    legacy = (db.query(m.PlaceCheckin).filter(m.PlaceCheckin.user_id == user.id,
              m.PlaceCheckin.created_at <= cutoff.replace(tzinfo=None), ~legacy_done)
              .order_by(m.PlaceCheckin.created_at.desc()).limit(20).all())
    items = []
    for record, at, proof in ([(v, p.occurred_at, {"visit_id": v.id}) for v, p in modern]
                              + [(c, c.created_at, {"checkin_id": c.id}) for c in legacy]):
        crew = db.get(m.Community, record.community_id) if record.community_id else None
        if not is_member(crew, user):
            crew = None
        place = db.get(m.Place, record.place_id)
        items.append({**proof, "place_id": record.place_id, "place_name": place.name if place else "방문한 가게",
                      "date": clock.kst_date(at).isoformat(), "occurred_at": clock.as_utc(at).isoformat(),
                      "room_id": crew.id if crew else None, "crew_title": crew.title if crew else None,
                      "crew_icon": crew.icon if crew else None})
    items.sort(key=lambda x: x["occurred_at"], reverse=True)
    return {"count": len(items[:20]), "items": items[:20]}


def latest_answers(db, place_id):
    """Revisit intent: one latest answer per person, never a visit count."""
    rows = [(f.user_id, f.personal_revisit, f.group_revisit, f.room_id, clock.as_utc(f.created_at))
            for f in db.query(m.PlaceVisitFeedback).filter_by(place_id=place_id).all()]
    rows += [(f.user_id, f.personal_revisit, f.group_revisit, v.community_id, clock.as_utc(f.created_at))
             for f, v in db.query(m.VerifiedVisitFeedback, m.VisitEvent).join(m.VisitEvent)
             .filter(m.VisitEvent.place_id == place_id).all()]
    latest = {r[0]: r for r in sorted(rows, key=lambda r: r[4])}
    # Private crew activity must not be inferred through public place badges.
    visible = {c.id for c in db.query(m.Community).filter(m.Community.visibility.in_(("public", "open"))).all()}
    return list(latest.values()), visible
