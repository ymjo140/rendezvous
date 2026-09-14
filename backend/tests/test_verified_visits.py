from datetime import datetime, timedelta

import pytest
from jose import jwt

from core import visit_time as clock
from core.config import settings
from domain import models as m
from services import checkin_service as checkin, visit_service, crew_kitchen_service as kitchen
from services import redemption_service, payment_policy


@pytest.fixture
def now(monkeypatch):
    value = {"at": datetime(2026, 9, 8, 3, tzinfo=clock.UTC)}
    monkeypatch.setattr(clock, "utc_now", lambda: value["at"])
    return value


@pytest.fixture
def crew(db):
    row = m.Community(id="crew", title="테스트 크루", host_id=1, member_ids=[2, 3], visibility="public")
    db.add(row)
    db.add(m.User(id=4, email="outsider@example.invalid", name="Outsider"))
    db.commit()
    return row


def payload(db, cid="crew", **changes):
    data = {"place_id": 1, "community_id": cid, "party_size": 2,
            "qr_token": checkin.issue_qr(db, 1, "merchant-1")["token"],
            "lat": 37.5, "lng": 127, "accuracy_m": 10, "position_at": clock.utc_now().isoformat()}
    data.update(changes)
    return data


def attend(db, uid, cid="crew", at=None, place_id=1):
    at = at or clock.utc_now()
    event, _ = checkin.record_attendance(db, db.get(m.User, uid), db.get(m.Place, place_id),
                                         cid, at, clock.utc_now(), "merchant_approval", "test-proof")
    db.commit()
    return event


def deal(db, conditions=None):
    d = m.CrewPartnership(id=1, place_id=1, title="제휴", benefit="테스트 혜택", status="active")
    app = m.CrewPartnershipApp(id=1, partnership_id=1, community_id="crew", applicant_id=1,
                               status="approved", terms_snapshot={"title": "제휴", "benefit": "테스트 혜택",
                               "conditions": conditions or {}, "expires_at": None})
    db.add_all([d, app]); db.commit()
    return d, app


def test_joint_visit_counts_once_across_every_surface(db, client_for, crew, now):
    first = client_for(1).post("/api/checkin", json=payload(db, party_size=50))
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "pending"
    assert first.json()["crew_visits"] == 0  # Reported headcount is not proof.
    again = client_for(1).post("/api/checkin", json=payload(db)).json()
    assert again["already"] and again["participant_count"] == 1
    second = client_for(2).post("/api/checkin", json=payload(db)).json()
    assert second["id"] == first.json()["id"]
    assert second["status"] == "verified" and second["crew_visits"] == 1
    assert db.query(m.VisitEvent).count() == 1
    assert db.query(m.VisitParticipant).count() == 2
    assert db.query(m.PlaceCheckin).count() == 0
    assert db.query(m.PartnershipRedemption).count() == 0
    d, app = deal(db)
    client = client_for(1, "merchant-1")
    assert client.get("/api/groups/crew").json()["member_visits"] == 1
    assert client.get("/api/groups/crew/kitchen").json()["total_visits"] == 1
    assert client.get("/api/groups/crew/showcase").json()["visits"][0]["visits"] == 1
    assert client.get("/api/groups/crew/missions").json()["steps"][1]["done"] is True
    assert client.get("/api/checkin/1").json()["crews"][0]["visits"] == 1
    assert client.get("/api/merchant/stores/1/partnerships").json()["performance"]["visits"] == 1
    assert client.get("/api/merchant/stores/1/crew-candidates").json()["items"][0]["visits"] == 1


@pytest.mark.parametrize("changes", [
    {"qr_token": "forged"}, {"lat": 38.5},
    {"position_at": "2026-09-08T02:58:29+00:00"},
    {"position_at": "2026-09-08T03:01:00+00:00"},
])
def test_invalid_proof_rejected_without_rows(db, client_for, crew, now, changes):
    result = client_for(1).post("/api/checkin", json=payload(db, **changes))
    assert result.status_code == 400, result.text
    assert db.query(m.VisitEvent).count() == 0


@pytest.mark.parametrize("changes", [
    {"qr_token": None}, {"lat": "NaN"}, {"lng": 181}, {"accuracy_m": 151}, {"accuracy_m": 0},
    {"position_at": "2026-09-08T03:00:00"}, {"party_size": 51}, {"context_tag": "forged"},
    {"partnership_app_id": 1}, {"visit_date_kst": "2025-01-01"},
])
def test_typed_validation_blocks_bad_fields(db, client_for, crew, now, changes):
    assert client_for(1).post("/api/checkin", json=payload(db, **changes)).status_code == 422
    assert db.query(m.VisitEvent).count() == 0


def test_qr_expiry_place_binding_and_auth_audience(db, client_for, crew, now):
    proof = payload(db)
    now["at"] += timedelta(seconds=180)
    proof["position_at"] = clock.utc_now().isoformat()
    assert client_for(1).post("/api/checkin", json=proof).status_code == 400
    db.add(m.Place(id=2, name="다른 가게", lat=37.5, lng=127, owner_id="merchant-1")); db.commit()
    assert client_for(1).post("/api/checkin", json=payload(db, place_id=2)).status_code == 400
    auth = jwt.encode({"sub": "test1@example.invalid", "iat": int(clock.utc_now().timestamp()),
                       "exp": int(clock.utc_now().timestamp()) + 180}, settings.SECRET_KEY, algorithm="HS256")
    assert client_for(1).post("/api/checkin", json=payload(db, qr_token=auth)).status_code == 400


def test_attendance_and_merchant_permissions(db, client_for, crew, now):
    assert client_for(None).post("/api/checkin", json=payload(db)).status_code == 401
    assert client_for(4).post("/api/checkin", json=payload(db)).status_code == 403
    assert client_for(1).post("/api/merchant/stores/1/checkin-qr").status_code == 401
    assert client_for(1, "other-merchant").post("/api/merchant/stores/1/checkin-qr").status_code == 403
    assert client_for(None, "merchant-1").post("/api/merchant/stores/1/checkin-qr").status_code == 200
    result = client_for(1).post("/api/checkin", json=payload(db, cid=None)).json()
    assert result["status"] == "verified"
    assert client_for(2).get(f'/api/visits/{result["id"]}').status_code == 403
    assert client_for(1).get(f'/api/visits/{result["id"]}').status_code == 200
    repeat = client_for(1).post("/api/checkin", json=payload(db, cid=None)).json()
    assert repeat["already"] and repeat["id"] == result["id"]


def test_approval_ownership_expiry_and_repeat(db, client_for, crew, now):
    body = {"place_id": 1, "community_id": "crew"}
    req = client_for(1).post("/api/checkin/approval-requests", json=body).json()
    rid = req["request_id"]
    assert client_for(1).post("/api/checkin/approval-requests", json=body).json()["request_id"] == rid
    assert client_for(2).get(f"/api/checkin/approval-requests/{rid}").status_code == 404
    assert client_for(1, "other").post(f"/api/merchant/visit-requests/{rid}/approve").status_code == 403
    assert db.query(m.VisitEvent).count() == 0
    now["at"] += timedelta(minutes=15)
    assert client_for(None, "merchant-1").post(f"/api/merchant/visit-requests/{rid}/approve").status_code == 410
    client_for(1).post("/api/checkin/approval-requests", json=body)
    first = client_for(None, "merchant-1").post(f"/api/merchant/visit-requests/{rid}/approve")
    assert first.status_code == 200, first.text
    assert first.json()["status"] == "pending"
    assert client_for(None, "merchant-1").post(f"/api/merchant/visit-requests/{rid}/approve").json()["already"]
    assert client_for(1).get(f"/api/checkin/approval-requests/{rid}").json()["status"] == "approved"
    second = client_for(2).post("/api/checkin/approval-requests", json=body).json()["request_id"]
    crew.member_ids = [3]; db.commit()
    assert client_for(None, "merchant-1").post(f"/api/merchant/visit-requests/{second}/approve").status_code == 403
    assert db.query(m.VisitParticipant).count() == 1


def test_two_hour_window_is_independent_of_self_report(db, crew, now):
    first = attend(db, 1)
    now["at"] += timedelta(hours=2, seconds=1)
    attend(db, 2)
    assert first.status == "pending"
    assert visit_service.crew_visits(db, "crew") == 0
    attend(db, 3)
    assert first.status == "verified"
    assert visit_service.crew_visits(db, "crew") == 1


def test_legacy_counts_never_unlock_visits_or_org_track(db, client_for, crew, now):
    crew.org_domain = "example.ac.kr"; crew.crew_type = "university"
    for day in ("2026-09-01", "2026-09-02", "2026-09-03"):
        db.add(m.PlaceCheckin(place_id=1, user_id=1, community_id="crew", date=day, party_size=50))
    db.add(m.ChatSplitRequest(room_id="crew", creator_id=1, place_id=1, place_name="테스트",
                              status="completed", date="2026-09-01", total_amount=10000))
    db.commit()
    stats = visit_service.crew_visit_stats(db, "crew")
    assert stats["visits"] == 0 and stats["legacy_visits"] == 3 and stats["amount"] == 0
    assert kitchen.get_kitchen(db, "crew")["unlocked_count"] == 0
    assert visit_service.crew_eligibility(db, crew)["eligible"] is False
    assert client_for(1).get("/api/groups/crew").json()["visit_verified"] is False


@pytest.mark.parametrize("status,kind,uid,age,expected", [
    ("pending", "university", 1, 1, False), ("verified", "company", 1, 1, False),
    ("verified", "university", 4, 1, False), ("verified", "university", 1, 365, False),
    ("verified", "university", 1, -1, False), ("verified", "university", 1, 1, True),
])
def test_org_requires_current_valid_member_proof(db, crew, now, status, kind, uid, age, expected):
    crew.crew_type = "university"; crew.org_domain = "example.ac.kr"
    db.add(m.UserVerification(user_id=uid, email="member@example.ac.kr", domain=crew.org_domain, kind=kind, status=status,
                              verified_at=clock.utc_now() - timedelta(days=age),
                              expires_at=clock.utc_now() - timedelta(minutes=10)))  # Old OTP expiry is irrelevant.
    db.commit()
    assert visit_service.crew_eligibility(db, crew)["eligible"] is expected


def test_kst_day_week_month_boundaries():
    before = datetime(2026, 8, 31, 14, 59, 59, tzinfo=clock.UTC)
    after = before + timedelta(seconds=1)
    assert clock.kst_date(before).isoformat() == "2026-08-31"
    assert clock.kst_date(after).isoformat() == "2026-09-01"
    assert clock.month_key(before) == "2026-08" and clock.month_key(after) == "2026-09"
    sunday = datetime(2026, 9, 6, 14, 59, 59, tzinfo=clock.UTC)
    assert clock.week_start(sunday).isoformat() == "2026-08-30T15:00:00+00:00"
    assert clock.week_start(sunday + timedelta(seconds=1)).isoformat() == "2026-09-06T15:00:00+00:00"


def test_kst_midnight_creates_new_event(db, client_for, crew, now):
    now["at"] = datetime(2026, 9, 8, 14, 59, 59, tzinfo=clock.UTC)
    one = client_for(1).post("/api/checkin", json=payload(db)).json()
    now["at"] += timedelta(seconds=1)
    two = client_for(1).post("/api/checkin", json=payload(db)).json()
    assert one["id"] != two["id"]
    assert two["visit_date_kst"] == "2026-09-09"


def test_weekly_uses_occurrence_not_delayed_approval(db, crew, now):
    now["at"] = datetime(2026, 9, 6, 15, 1, tzinfo=clock.UTC)
    last_week = now["at"] - timedelta(minutes=2)
    for uid in (1, 2): attend(db, uid, at=last_week)
    missions = kitchen.get_missions(db, "crew", 1)
    assert missions["steps"][1]["done"] is True
    assert missions["weekly"][0]["done"] is False


def test_multiple_places_same_day_and_revisits_agree(db, crew, now):
    db.add(m.Place(id=2, name="테스트 커피", lat=37.5, lng=127)); db.commit()
    for day in range(3):
        for uid in (1, 2): attend(db, uid, at=clock.utc_now() - timedelta(days=day))
    for uid in (1, 2): attend(db, uid, place_id=2)
    stats = visit_service.crew_visit_stats(db, "crew")
    assert (stats["visits"], stats["revisits"], stats["regular_places"]) == (4, 2, 1)
    assert kitchen.get_kitchen(db, "crew")["total_visits"] == 4
    assert kitchen.get_missions(db, "crew", 1)["weekly"][2]["done"] is True
    assert visit_service.crew_eligibility(db, crew)["track"] == "activity"
    assert kitchen.regular_crew_count(db, 1) == 1
    crew.visibility = "list_only"; db.commit()
    assert kitchen.regular_crew_count(db, 1) == 0


def test_reservation_does_not_replace_proof_and_parses_kst(db, client_for, crew, now):
    db.add(m.Reservation(id="res", user_id=1, place_id=1, place_name="테스트", community_id="crew",
                         date="2026-09-08", time="12:00", status="confirmed")); db.commit()
    assert client_for(1).post("/api/checkin", json={"place_id": 1, "reservation_id": "res"}).status_code == 422
    assert client_for(2).post("/api/checkin", json=payload(db, reservation_id="res")).status_code == 404
    assert client_for(1).post("/api/checkin", json=payload(db, reservation_id="res")).status_code == 200
    db.get(m.Reservation, "res").time = "bad"; db.commit()
    assert client_for(1).post("/api/checkin", json=payload(db, reservation_id="res")).status_code == 400


def test_failed_commit_rolls_back_participants_and_event(db, client_for, crew, now, monkeypatch):
    original = checkin.visit_payload
    def broken(*args, **kwargs):
        raise RuntimeError("test interruption before commit")
    monkeypatch.setattr(checkin, "visit_payload", broken)
    with pytest.raises(RuntimeError):
        client_for(1).post("/api/checkin", json=payload(db))
    monkeypatch.setattr(checkin, "visit_payload", original)
    assert db.query(m.VisitEvent).count() == 0
    assert db.query(m.VisitParticipant).count() == 0


def test_redemption_is_separate_idempotent_and_counts_verified_party(db, client_for, crew, now, monkeypatch):
    d, app = deal(db, {"min_party": 3, "monthly_uses": 1})
    event = attend(db, 1); attend(db, 2)
    body = {"partnership_app_id": 1, "idempotency_key": "one-request"}
    endpoint = f"/api/visits/{event.id}/redeem"
    assert client_for(1).post(endpoint, json=body).status_code == 503
    monkeypatch.setattr(payment_policy, "partnership_redemption_enabled", lambda: True)  # Test-only closed feature.
    assert client_for(1).post(endpoint, json=body).json()["detail"]["reason"] == "party"
    attend(db, 3)
    one = client_for(1).post(endpoint, json=body)
    assert one.status_code == 200, one.text
    two = client_for(2).post(endpoint, json={**body, "idempotency_key": "another-key"})
    assert two.json()["id"] == one.json()["id"] and two.json()["already"]
    assert db.query(m.PartnershipRedemption).count() == 1
    assert visit_service.partnership_month_uses(db, 1, "2026-09") == 1
    assert db.get(m.User, 1).wallet_balance == 100000
    now["at"] += timedelta(days=1)
    new = attend(db, 1); attend(db, 2); attend(db, 3)
    new_endpoint = f"/api/visits/{new.id}/redeem"
    assert client_for(1).post(new_endpoint, json=body).status_code == 409  # key bound to old visit
    assert client_for(1).post(new_endpoint, json={**body, "idempotency_key": "next-day-key"}).json()["detail"]["reason"] == "limit"


def test_redemption_kst_conditions_and_snapshot(db, crew, now):
    now["at"] = datetime(2026, 8, 31, 15, 30, tzinfo=clock.UTC)  # Tuesday 00:30 KST
    d, app = deal(db, {"days": ["tue"], "time_from": "23:00", "time_to": "01:00"})
    assert redemption_service.blocked_reason(db, app, d, crew, clock.utc_now(), 2) is None
    app.terms_snapshot = {"conditions": {}}  # Explicitly empty agreed conditions stay empty.
    d.conditions = {"min_party": 100}; db.commit()
    assert redemption_service.blocked_reason(db, app, d, crew, clock.utc_now(), 2) is None


def test_visit_archive_uses_only_verified_events_and_preserves_sparse_state(db, client_for, crew, now):
    empty = client_for(1).get("/api/groups/crew/showcase").json()
    assert empty["visit_archive"] == []
    assert empty["visit_summary"] == {
        "observed": False,
        "visits": 0,
        "unique_places": 0,
        "revisits": 0,
        "regular_places": 0,
        "last_visit": "",
        "source_counts": {},
    }

    first = attend(db, 1)
    attend(db, 2)
    now["at"] += timedelta(days=1)
    second = attend(db, 1)
    attend(db, 2)
    db.add(m.PlaceCheckin(place_id=1, user_id=1, community_id="crew", date="2026-09-06", party_size=50))
    db.commit()

    data = client_for(1).get("/api/groups/crew/showcase").json()
    assert data["visit_summary"]["observed"] is True
    assert data["visit_summary"]["visits"] == 2
    assert data["visit_summary"]["unique_places"] == 1
    assert data["visit_summary"]["revisits"] == 1
    assert data["visit_archive"][0]["id"] == second.id
    assert data["visit_archive"][0]["revisit"] is True
    assert data["visit_archive"][0]["visit_number"] == 2
    assert data["visit_archive"][0]["source_label"] == "merchant_approval"
    assert data["visits"][0]["visits"] == 2
