from datetime import datetime, timedelta

import pytest

from core import visit_time as clock
from domain import models as m


@pytest.fixture
def fixed_time(db, monkeypatch):
    now = datetime(2026, 9, 12, 3, tzinfo=clock.UTC)
    monkeypatch.setattr(clock, "utc_now", lambda: now)
    db.add(m.Community(id="crew", title="비공개 크루", host_id=1, member_ids=[2], visibility="private"))
    db.add(m.Place(id=2, name="다른 가게", owner_id="merchant-2", lat=37.5, lng=127.0))
    db.commit()
    return now


def request(client_for, uid=1, place_id=1, cid="crew"):
    response = client_for(uid).post("/api/checkin/approval-requests", json={"place_id": place_id, "community_id": cid})
    assert response.status_code == 200, response.text
    assert "no-store" in response.headers["cache-control"]
    return response.json()


def test_guest_and_merchant_share_code_and_authoritative_expiry(client_for, fixed_time):
    created = request(client_for)
    queue = client_for(None, "merchant-1").get("/api/merchant/stores/1/visit-requests")
    assert queue.status_code == 200
    assert "no-store" in queue.headers["cache-control"]
    data = queue.json()
    assert data["store"] == {"id": 1, "name": "테스트 국밥"}
    assert data["server_time"] == fixed_time.isoformat()
    item = data["items"][0]
    assert item["verification_code"] == created["verification_code"] == created["request_id"].replace("-", "")[:8].upper()
    assert item["expires_at"] == created["expires_at"] == (fixed_time + timedelta(minutes=15)).isoformat()
    assert item["name"] == "User 1"
    assert "email" not in queue.text and "비공개 크루" not in queue.text and "user_id" not in item
    status = client_for(1).get(f'/api/checkin/approval-requests/{item["id"]}')
    assert status.json()["verification_code"] == item["verification_code"]
    assert "no-store" in status.headers["cache-control"]


def test_queue_excludes_other_stores_expired_and_departed_members(db, client_for, fixed_time):
    request(client_for, place_id=2)
    departed = request(client_for, uid=2)
    expired = request(client_for, uid=1, cid=None)
    db.get(m.Community, "crew").member_ids = []
    db.get(m.VisitApprovalRequest, expired["request_id"]).expires_at = fixed_time
    db.commit()
    queue = client_for(None, "merchant-1").get("/api/merchant/stores/1/visit-requests").json()
    assert queue["items"] == []
    response = client_for(None, "merchant-1").post(f'/api/merchant/visit-requests/{departed["request_id"]}/approve')
    assert response.status_code == 403
    assert db.query(m.VisitEvent).count() == 0


def test_two_actual_approvals_record_one_joint_visit_and_retries_do_not_duplicate(db, client_for, fixed_time):
    first, second = request(client_for, uid=1), request(client_for, uid=2)
    client = client_for(None, "merchant-1")
    one = client.post(f'/api/merchant/visit-requests/{first["request_id"]}/approve')
    assert one.json()["status"] == "pending"
    assert "no-store" in one.headers["cache-control"]
    assert len(client.get("/api/merchant/stores/1/visit-requests").json()["items"]) == 1
    two = client.post(f'/api/merchant/visit-requests/{second["request_id"]}/approve').json()
    repeat = client.post(f'/api/merchant/visit-requests/{second["request_id"]}/approve').json()
    assert two["status"] == "verified" and repeat["already"]
    assert two["id"] == one.json()["id"] == repeat["id"]
    assert client.get("/api/merchant/stores/1/visit-requests").json()["items"] == []
    assert db.query(m.VisitEvent).count() == 1 and db.query(m.VisitParticipant).count() == 2
    assert db.query(m.PartnershipRedemption).count() == 0


@pytest.mark.parametrize("merchant,status", [(None, 401), ("merchant-2", 403)])
def test_merchant_desk_requires_store_owner(client_for, fixed_time, merchant, status):
    rid = request(client_for)["request_id"]
    client = client_for(None, merchant)
    assert client.get("/api/merchant/stores/1/visit-requests").status_code == status
    assert client.post("/api/merchant/stores/1/checkin-qr").status_code == status
    assert client.post(f"/api/merchant/visit-requests/{rid}/approve").status_code == status


def test_qr_has_server_clock_and_never_uses_query_parameters(client_for, fixed_time):
    response = client_for(None, "merchant-1").post("/api/merchant/stores/1/checkin-qr")
    data = response.json()
    assert "no-store" in response.headers["cache-control"]
    assert data["server_time"] == fixed_time.isoformat()
    assert data["expires_at"] == (fixed_time + timedelta(seconds=180)).isoformat()
    assert data["checkin_path"] == f'/checkin/1#qr={data["token"]}'


def test_deleted_crew_is_hidden_and_cannot_be_approved(db, client_for, fixed_time):
    rid = request(client_for)["request_id"]
    # SQLite deliberately retains this orphan to exercise the service's missing-crew guard.
    db.query(m.Community).filter_by(id="crew").delete(synchronize_session=False)
    db.commit()
    db.expire_all()
    client = client_for(None, "merchant-1")
    assert client.get("/api/merchant/stores/1/visit-requests").json()["items"] == []
    assert client.post(f"/api/merchant/visit-requests/{rid}/approve").status_code == 403


def test_stale_confirmation_cannot_approve_a_renewed_request(db, client_for, fixed_time, monkeypatch):
    rid = request(client_for)["request_id"]
    updated = fixed_time + timedelta(minutes=16)
    monkeypatch.setattr(clock, "utc_now", lambda: updated)
    assert request(client_for)["request_id"] == rid
    client = client_for(None, "merchant-1")
    stale = client.post(f"/api/merchant/visit-requests/{rid}/approve", json={"expected_created_at": fixed_time.isoformat()})
    assert stale.status_code == 409
    assert db.query(m.VisitEvent).count() == 0
    bad = client.post(f"/api/merchant/visit-requests/{rid}/approve", json={"expected_created_at": "2026-09-12T03:16:00"})
    assert bad.status_code == 422
    fresh = client.post(f"/api/merchant/visit-requests/{rid}/approve", json={"expected_created_at": updated.isoformat()})
    assert fresh.status_code == 200
    assert db.query(m.VisitParticipant).count() == 1
