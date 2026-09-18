"""One definition of verified visits for crews, kitchens, missions and merchants."""
from collections import Counter
from datetime import timedelta
from typing import Optional

from sqlalchemy import func

from core import visit_time as clock
from domain import models as m
from services.crew_access import members

MIN_CREW_MEMBERS = 3
MIN_CREW_VISITS = 3
REGULAR_MIN_VISITS = 3
ORG_VALID_DAYS = 365  # OTP expires_at is not membership expiry.


def verified_events(db, community_id=None, place_id=None):
    q = db.query(m.VisitEvent).filter(m.VisitEvent.status == "verified")
    if community_id is not None:
        q = q.filter(m.VisitEvent.community_id == community_id)
    if place_id is not None:
        q = q.filter(m.VisitEvent.place_id == place_id)
    return q



def crew_visit_archive(db, community_id: str, limit: int = 12) -> tuple[list[dict], dict]:
    """Return the canonical verified-visit archive and its transparent summary.

    Pending attendance, reservations, legacy check-ins and self-reported party
    size never enter this archive. The archive is intentionally event-level so
    the UI can show the actual visit history without manufacturing activity in
    a sparse-data launch.
    """
    try:
        limit = max(1, min(int(limit), 50))
    except (TypeError, ValueError):
        limit = 12

    rows = (db.query(m.VisitEvent, m.Place)
            .join(m.Place, m.Place.id == m.VisitEvent.place_id)
            .filter(m.VisitEvent.community_id == str(community_id),
                    m.VisitEvent.status == "verified")
            .order_by(m.VisitEvent.occurred_at.asc(), m.VisitEvent.id.asc())
            .all())
    if not rows:
        return [], {
            "observed": False,
            "visits": 0,
            "unique_places": 0,
            "revisits": 0,
            "regular_places": 0,
            "last_visit": "",
            "source_counts": {},
        }

    event_ids = [event.id for event, _ in rows]
    participants = (db.query(m.VisitParticipant)
                    .filter(m.VisitParticipant.visit_id.in_(event_ids))
                    .all())
    participant_counts = Counter()
    source_types = {}
    source_counts = Counter()
    for participant in participants:
        participant_counts[participant.visit_id] += 1
        source_types.setdefault(participant.visit_id, set()).add(participant.evidence_type)
        source_counts[participant.evidence_type] += 1

    place_counts = Counter(event.place_id for event, _ in rows)
    visit_numbers = {}
    seen_by_place = Counter()
    for event, _ in rows:
        seen_by_place[event.place_id] += 1
        visit_numbers[event.id] = seen_by_place[event.place_id]

    archive_rows = list(reversed(rows[-limit:]))
    archive = []
    for event, place in archive_rows:
        sources = sorted(source_types.get(event.id, set()))
        archive.append({
            "id": event.id,
            "place_id": event.place_id,
            "place_name": place.name,
            "visit_date_kst": event.visit_date_kst.isoformat(),
            "occurred_at": clock.as_utc(event.occurred_at).isoformat(),
            "participant_count": int(participant_counts[event.id]),
            "source_label": sources[0] if len(sources) == 1 else ("mixed" if sources else "unknown"),
            "visit_number": int(visit_numbers[event.id]),
            "revisit": visit_numbers[event.id] > 1,
        })

    summary = {
        "observed": True,
        "visits": len(rows),
        "unique_places": len(place_counts),
        "revisits": sum(max(count - 1, 0) for count in place_counts.values()),
        "regular_places": sum(count >= REGULAR_MIN_VISITS for count in place_counts.values()),
        "last_visit": max(event.visit_date_kst.isoformat() for event, _ in rows),
        "source_counts": dict(source_counts),
    }
    return archive, summary

def legacy_visit_stats(db, community_id, place_id=None):
    """Old reports remain separate; never promote them to verified attendance."""
    keys = set()
    amount = 0
    q = db.query(m.ChatSplitRequest).filter_by(room_id=community_id, status="completed")
    if place_id is not None:
        q = q.filter_by(place_id=place_id)
    for row in q.all():
        keys.add((row.place_id or row.place_name, row.date))
        amount += row.total_amount or 0
    q = db.query(m.PlaceCheckin).filter_by(community_id=community_id)
    if place_id is not None:
        q = q.filter_by(place_id=place_id)
    for row in q.all():
        keys.add((row.place_id, row.date))
    q = db.query(m.PlaceVisitFeedback).filter_by(room_id=community_id)
    if place_id is not None:
        q = q.filter_by(place_id=place_id)
    for row in q.all():
        keys.add((row.place_id, clock.kst_date(row.created_at).isoformat() if row.created_at else ""))
    return {"visits": len(keys), "amount": int(amount)}


def crew_visit_stats(db, community_id: str, place_id: Optional[int] = None) -> dict:
    rows = verified_events(db, community_id, place_id).all() if community_id else []
    counts = Counter(row.place_id for row in rows)
    legacy = legacy_visit_stats(db, community_id, place_id) if community_id else {"visits": 0, "amount": 0}
    return {
        "visits": len(rows), "unique_places": len(counts),
        "revisits": sum(max(n - 1, 0) for n in counts.values()),
        "regular_places": sum(n >= REGULAR_MIN_VISITS for n in counts.values()),
        "regular_visits": sum(n for n in counts.values() if n >= REGULAR_MIN_VISITS),
        "last_visit": max((r.visit_date_kst.isoformat() for r in rows), default=""),
        "amount": 0,  # Existing split balances are not verified PG revenue.
        "legacy_visits": legacy["visits"], "legacy_amount": legacy["amount"],
        "by_source": {"verified": len(rows)},
    }


def crew_visits(db, community_id: str, place_id: Optional[int] = None) -> int:
    return verified_events(db, community_id, place_id).count() if community_id else 0


def crew_eligibility(db, crew, now=None):
    if crew is None:
        return {"eligible": False, "track": None, "members": 0, "visits": 0,
                "verified_members": 0, "next_action": "create_crew"}
    now = clock.as_utc(now or clock.utc_now())
    ids = members(crew)
    visits = crew_visits(db, crew.id)
    domain = crew.org_domain
    verified = set()
    if domain and crew.crew_type in ("university", "company"):
        rows = db.query(m.UserVerification).filter(
            m.UserVerification.user_id.in_(ids), m.UserVerification.domain == domain,
            m.UserVerification.kind == crew.crew_type, m.UserVerification.status == "verified",
        ).all()
        verified = {r.user_id for r in rows if r.verified_at and
                    now - timedelta(days=ORG_VALID_DAYS) < clock.as_utc(r.verified_at) <= now}
    # One current, verified member sustains the original org track. A domain
    # string alone, former members, pending OTPs and stale proofs do not.
    org_ok = bool(verified)
    members_ok, visits_ok = len(ids) >= MIN_CREW_MEMBERS, visits >= MIN_CREW_VISITS
    eligible = org_ok or (members_ok and visits_ok)
    return {"eligible": eligible, "track": "org" if org_ok else ("activity" if eligible else None),
            "members": len(ids), "visits": visits, "verified_members": len(verified),
            "members_ok": members_ok, "visits_ok": visits_ok,
            "members_required": MIN_CREW_MEMBERS, "visits_required": MIN_CREW_VISITS,
            "next_action": "apply_partnership" if eligible else ("invite_members" if not members_ok else "verify_joint_visit")}


def partnership_month_uses(db, app_id: int, month: str) -> int:
    return db.query(m.PartnershipRedemption).filter_by(app_id=app_id, usage_month=month).count()


def partnership_uses_by_app(db, app_ids: list, month: Optional[str] = None) -> dict:
    if not app_ids:
        return {}
    q = db.query(m.PartnershipRedemption.app_id, func.count(m.PartnershipRedemption.id)).filter(
        m.PartnershipRedemption.app_id.in_(app_ids))
    if month:
        q = q.filter(m.PartnershipRedemption.usage_month == month)
    return dict(q.group_by(m.PartnershipRedemption.app_id).all())
