from datetime import datetime, timedelta

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from api.dependencies import get_current_user
from api.routers import analytics
from core import visit_time as clock
from core.database import get_db
from domain import models as m
from services import beta_event_service
from services.beta_metrics_service import get_beta_metrics


@pytest.fixture
def analytics_client(db):
    app = FastAPI()
    app.include_router(analytics.router)
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        def as_user(uid):
            app.dependency_overrides[get_current_user] = lambda: db.get(m.User, uid) if uid else None
            return client
        yield as_user


def test_event_endpoint_requires_login(analytics_client):
    response = analytics_client(None).post("/api/analytics/events", json={
        "event_name": "village_viewed",
    })
    assert response.status_code == 401


def test_event_endpoint_allowlist_and_idempotency(db, analytics_client):
    payload = {
        "event_name": "village_viewed",
        "entity_type": "crew",
        "entity_id": "crew-1",
        "request_id": "request-1",
        "metadata": {"surface": "crew_profile", "action": "view"},
    }
    first = analytics_client(1).post("/api/analytics/events", json=payload)
    second = analytics_client(1).post("/api/analytics/events", json=payload)
    assert first.status_code == second.status_code == 200
    assert first.headers["cache-control"] == second.headers["cache-control"] == "no-store"
    assert first.json()["duplicate"] is False
    assert second.json()["duplicate"] is True
    assert db.query(m.ActionLog).count() == 1
    row = db.query(m.ActionLog).one()
    assert row.action_type == "village_viewed"
    assert row.entity_type == "crew"
    assert row.metadata_json == {"surface": "crew_profile", "action": "view"}


def test_event_endpoint_rejects_unknown_events_and_metadata(db, analytics_client):
    unknown = analytics_client(1).post("/api/analytics/events", json={"event_name": "raw_body"})
    server_fact = analytics_client(1).post("/api/analytics/events", json={"event_name": "visit_verified"})
    assert unknown.status_code == 422
    assert server_fact.status_code == 422
    unsafe = analytics_client(1).post("/api/analytics/events", json={
        "event_name": "village_viewed",
        "metadata": {"raw": "secret"},
    })
    assert unsafe.status_code == 422
    assert db.query(m.ActionLog).count() == 0


def test_verified_visit_is_logged_once(db, monkeypatch):
    from services import checkin_service

    monkeypatch.setattr("services.taste_service.mark_dirty", lambda *args: None)
    db.add(m.Community(id="event-crew", title="이벤트 크루", host_id=1, member_ids=[1, 2], visibility="private"))
    db.commit()
    at = datetime(2026, 9, 10, 3, tzinfo=clock.UTC)
    first, _ = checkin_service.record_attendance(db, db.get(m.User, 1), db.get(m.Place, 1),
        "event-crew", at, at, "merchant_approval", "request-1")
    second, _ = checkin_service.record_attendance(db, db.get(m.User, 2), db.get(m.Place, 1),
        "event-crew", at + timedelta(minutes=10), at + timedelta(minutes=10),
        "merchant_approval", "request-2")
    db.commit()
    assert first.id == second.id and second.status == "verified"
    rows = db.query(m.ActionLog).filter_by(action_type="visit_verified").all()
    assert len(rows) == 1
    assert rows[0].request_id == f"visit_verified:{second.id}"


def test_beta_metrics_exposes_event_counts(db):
    at = datetime(2026, 9, 10, 3, tzinfo=clock.UTC)
    for name, total in (("village_viewed", 2), ("mission_action_started", 3), ("list_place_saved", 1)):
        for index in range(total):
            beta_event_service.record_event(
                db, 1, name, entity_type="crew", entity_id=f"crew-{name}-{index}",
                request_id=f"{name}-{index}", created_at=at + timedelta(minutes=index),
            )
    db.commit()
    result = get_beta_metrics(db, datetime(2026, 9, 11, 3, tzinfo=clock.UTC))
    counts = result["behavior_events"]["counts"]
    assert counts["village_viewed"] == 2
    assert counts["mission_action_started"] == 3
    assert counts["list_place_saved"] == 1
    assert counts["visit_verified"] == 0
    assert result["behavior_events"]["source"] == "action_logs"
