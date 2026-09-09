from datetime import datetime

import pytest

from core.config import settings
from domain import models


@pytest.mark.parametrize("path,payload", [
    ("/api/coins/charge", {"amount": 10000}),
    ("/api/coins/map-loot", {"lat": 37.5, "lng": 127}),
])
def test_disabled_credits_do_not_mutate_wallet(db, client_for, path, payload):
    assert client_for(None).post(path, json=payload).status_code == 401
    assert client_for(1).post(path, json=payload).status_code == 503
    db.expire_all()
    assert db.get(models.User, 1).wallet_balance == 100000
    assert db.query(models.CoinHistory).count() == 0


def test_wallet_requires_login_and_reports_server_capabilities(db, client_for):
    assert client_for(None).get("/api/coins/wallet").status_code == 401
    wallet = client_for(1).get("/api/coins/wallet").json()
    assert wallet == {"balance": 100000, "history": [], "can_charge": False, "can_pay": False, "mode": "disabled"}


@pytest.mark.parametrize("env,url,allowlist,enabled,allowed", [
    ("test", "sqlite://", frozenset({"1"}), True, True),
    ("production", "sqlite://", frozenset({"1"}), True, False),
    ("test", "postgresql://user:pass@remote.invalid/test", frozenset({"1"}), True, False),
    ("test", "sqlite://", frozenset({"2"}), True, False),
    ("test", "sqlite://", frozenset({"1"}), False, False),
])
def test_mock_requires_test_environment_local_db_and_named_account(db, client_for, monkeypatch, env, url, allowlist, enabled, allowed):
    monkeypatch.setattr(settings, "APP_ENV", env)
    monkeypatch.setattr(settings, "DATABASE_URL", url)
    monkeypatch.setattr(settings, "MOCK_PAYMENT_USER_IDS", allowlist)
    monkeypatch.setattr(settings, "MOCK_PAYMENTS_ENABLED", enabled)
    client = client_for(1)
    response = client.post("/api/coins/charge", json={"amount": 10000})
    assert response.status_code == (200 if allowed else 503)
    assert client.get("/api/coins/wallet").json()["can_charge"] == allowed
    assert db.get(models.User, 1).wallet_balance == (110000 if allowed else 100000)
    if allowed:
        assert db.query(models.CoinHistory).one().type == "mock_charge"
        assert client.post("/api/reservations", json={
            "place_id": 1, "place_name": "테스트", "date": "2026-10-01", "time": "12:00", "deposit_amount": 1000,
        }).status_code == 503
        assert db.get(models.User, 1).wallet_balance == 110000


@pytest.mark.parametrize("extra", [{"deposit_amount": 10000}, {"offer_rule_id": 1}])
def test_existing_balance_cannot_fund_cash_or_offer_reservations(db, client_for, extra):
    response = client_for(1).post("/api/reservations", json={
        "place_id": 1, "place_name": "테스트", "date": "2026-10-01", "time": "12:00", **extra,
    })
    assert response.status_code == 503
    assert db.query(models.Reservation).count() == 0
    assert db.query(models.CoinHistory).count() == 0
    assert db.get(models.User, 1).wallet_balance == 100000


def test_free_reservations_and_existing_refunds_remain_available(db, client_for):
    client = client_for(1)
    response = client.post("/api/reservations", json={
        "place_id": 1, "place_name": "테스트", "date": "2026-10-01", "time": "12:00", "deposit_amount": 0,
    })
    assert response.status_code == 200
    old = models.Reservation(id="old", user_id=1, place_name="과거 예약", deposit_amount=1000, status="confirmed")
    db.add(old)
    db.commit()
    assert client.post("/api/reservations/old/cancel").status_code == 200
    assert client.post("/api/reservations/old/cancel").status_code == 200
    assert db.get(models.User, 1).wallet_balance == 101000  # one refund only


@pytest.mark.parametrize("path", ["/api/chat/rooms/crew/splits", "/api/chat/splits/1/pay"])
def test_splits_cannot_spend_old_or_mock_balance(db, client_for, path):
    assert client_for(None).post(path, json={}).status_code == 401
    assert client_for(1).post(path, json={}).status_code == 503
    assert db.query(models.ChatSplitRequest).count() == 0
    assert db.get(models.User, 1).wallet_balance == 100000


def test_split_receipts_require_current_room_membership(db, client_for):
    db.add(models.ChatRoom(id="crew", title="테스트"))
    db.add(models.ChatRoomMember(room_id="crew", user_id=1))
    db.add(models.ChatSplitRequest(id=1, room_id="crew", creator_id=1, place_name="테스트", status="open"))
    db.commit()
    assert client_for(None).get("/api/chat/splits/1").status_code == 401
    assert client_for(3).get("/api/chat/splits/1").status_code == 403
    assert client_for(1).get("/api/chat/splits/1").status_code == 200


def test_wallet_uses_actual_jwt_validation(db, client_for):
    from api.dependencies import get_current_user
    from jose import jwt

    client = client_for(None)
    client.app.dependency_overrides.pop(get_current_user)
    assert client.get("/api/coins/wallet", headers={"Authorization": "Bearer forged"}).status_code == 401
    expired = jwt.encode({"sub": "test1@example.invalid", "exp": 0}, settings.SECRET_KEY, algorithm="HS256")
    assert client.get("/api/coins/wallet", headers={"Authorization": f"Bearer {expired}"}).status_code == 401
    valid = jwt.encode({"sub": "test1@example.invalid"}, settings.SECRET_KEY, algorithm="HS256")
    assert client.get("/api/coins/wallet", headers={"Authorization": f"Bearer {valid}"}).status_code == 200


@pytest.mark.parametrize("existing_receipt", [False, True])
def test_checkin_records_visit_without_issuing_real_benefit(db, client_for, existing_receipt):
    db.add(models.Community(id="crew", host_id=1, member_ids=[1], title="테스트"))
    db.add(models.CrewPartnership(id=1, place_id=1, title="제휴", benefit="10% 할인", status="active"))
    db.add(models.CrewPartnershipApp(id=1, partnership_id=1, community_id="crew", applicant_id=1, status="approved"))
    if existing_receipt:
        db.add(models.PlaceCheckin(user_id=1, place_id=1, community_id="crew",
                                   date=datetime.now().strftime("%Y-%m-%d"), partnership_app_id=1))
    db.commit()
    from core import visit_time as clock
    from services.checkin_service import issue_qr
    proof = issue_qr(db, 1, "merchant-1")["token"]
    result = client_for(1).post("/api/checkin", json={
        "place_id": 1, "community_id": "crew", "qr_token": proof,
        "lat": 37.5, "lng": 127, "accuracy_m": 10, "position_at": clock.utc_now().isoformat(),
    })
    assert result.status_code == 200, result.text
    data = result.json()
    assert data["already"] is False  # Legacy receipts never authenticate attendance.
    assert data["benefit"] is None
    assert data["crew_visits"] == 0  # One member is not a joint visit.
    assert db.query(models.PlaceCheckin).count() == int(existing_receipt)
    assert db.query(models.PartnershipRedemption).count() == 0
    assert client_for(1).post(f'/api/visits/{data["id"]}/redeem', json={
        "partnership_app_id": 1, "idempotency_key": "test-only-key",
    }).status_code == 503
