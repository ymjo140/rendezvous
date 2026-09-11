from datetime import datetime, timedelta
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import event, text
from sqlalchemy.exc import OperationalError

from api.dependencies import get_current_user
from api.routers import admin, system
from core import visit_time as clock
from core.database import get_db
from domain import models as m
from services.beta_metrics_service import get_beta_metrics

NOW = datetime(2026, 9, 11, 3, tzinfo=clock.UTC)


def visit(db, cid, at, place=1, status="verified", verified_at=None):
    if cid and not db.get(m.Community, cid):
        db.add(m.Community(id=cid, title="Private crew", host_id=1, member_ids=[2, 3], visibility="private"))
        db.flush()
    row = m.VisitEvent(
        id=str(uuid4()), community_id=cid, personal_user_id=None if cid else 1,
        scope_key=f"crew:{cid}" if cid else "user:1", place_id=place,
        visit_date_kst=clock.kst_date(at), occurred_at=at, status=status,
        verified_at=(verified_at or at) if status == "verified" else None,
    )
    db.add(row)
    db.flush()
    return row


def test_empty_is_observation_pending_not_zero_percent(db):
    data = get_beta_metrics(db, NOW)
    assert data["summary"]["repeat_crews"] == 0
    assert data["retention"]["second_visit_28d"]["rate"] is None
    assert len(data["series"]) == 28
    assert data["cohorts"] == []
    assert {x["key"] for x in data["coverage"]["unavailable"]} == {
        "activation_7d", "list_to_visit_14d", "decision_duration", "benefit_success_rate"}


def test_immature_early_success_does_not_inflate_mature_retention(db):
    visit(db, "success", NOW - timedelta(days=35))
    visit(db, "success", NOW - timedelta(days=10))
    visit(db, "failure", NOW - timedelta(days=35))
    visit(db, "failure", NOW - timedelta(days=6))  # 29 days, outside the window
    visit(db, "pending", NOW - timedelta(days=10))
    visit(db, "pending", NOW - timedelta(days=1))
    data = get_beta_metrics(db, NOW)
    assert data["retention"]["second_visit_28d"] == {
        "converted": 1, "eligible": 2, "pending": 1, "rate": .5, "observation_days": 28}
    assert data["summary"]["repeat_crews"] == 1
    assert data["summary"]["active_crews"] == 3
    assert data["summary"]["verified_visits"] == 4


@pytest.mark.parametrize("offset,eligible,converted", [(-1, 0, 0), (0, 1, 1), (1, 1, 0)])
def test_exact_28_day_boundary(db, offset, eligible, converted):
    first = NOW - timedelta(days=28, microseconds=offset)
    visit(db, "boundary", first)
    visit(db, "boundary", NOW)
    result = get_beta_metrics(db, NOW)["retention"]["second_visit_28d"]
    assert (result["eligible"], result["converted"]) == (eligible, converted)


def test_same_place_denominator_is_crew_place_pairs(db):
    db.add(m.Place(id=2, name="Second place", lat=37.5, lng=127.0)); db.flush()
    visit(db, "crew", NOW - timedelta(days=50), 1)
    visit(db, "crew", NOW - timedelta(days=40), 2)
    visit(db, "crew", NOW - timedelta(days=30), 1)
    visit(db, "crew", NOW - timedelta(days=5), 2)
    result = get_beta_metrics(db, NOW)["retention"]
    assert result["second_visit_28d"]["rate"] == 1
    assert result["same_place_28d"]["rate"] == .5
    assert result["same_place_28d"]["eligible"] == 2


def test_excludes_legacy_personal_pending_future_and_late_verification(db):
    visit(db, None, NOW - timedelta(days=5))
    visit(db, "pending", NOW - timedelta(days=5), status="pending")
    visit(db, "future", NOW + timedelta(seconds=1))
    visit(db, "not-yet-verified", NOW - timedelta(days=5), verified_at=NOW + timedelta(seconds=1))
    db.add(m.PlaceCheckin(user_id=1, place_id=1, community_id="pending", date="2026-09-01", party_size=3))
    db.flush()
    result = get_beta_metrics(db, NOW)
    assert result["summary"]["verified_visits"] == 0
    assert result["retention"]["second_visit_28d"]["eligible"] == 0


def test_kst_daily_window_and_cohort_monday(db):
    start = datetime(2026, 8, 14, 15, tzinfo=clock.UTC)  # Aug 15 KST midnight
    visit(db, "outside", start - timedelta(microseconds=1))
    visit(db, "inside", start)
    visit(db, "sunday", datetime(2026, 9, 6, 14, 59, 59, tzinfo=clock.UTC))
    visit(db, "monday", datetime(2026, 9, 6, 15, tzinfo=clock.UTC))
    result = get_beta_metrics(db, NOW)
    assert result["summary"]["verified_visits"] == 3
    assert result["series"][0] == {"date": "2026-08-15", "visits": 1, "crews": 1, "first_visit_crews": 1}
    assert result["cohorts"][0]["week_start"] == "2026-09-07"
    assert result["cohorts"][1]["week_start"] == "2026-08-31"


def test_query_count_stays_constant_when_more_crews_are_added(db):
    for i in range(25):
        visit(db, f"crew-{i}", NOW - timedelta(days=40))
        visit(db, f"crew-{i}", NOW - timedelta(days=15))
    statements = []
    def capture(conn, cursor, statement, *args):
        statements.append(statement)
    event.listen(db.bind, "before_cursor_execute", capture)
    try:
        assert get_beta_metrics(db, NOW)["retention"]["second_visit_28d"]["eligible"] == 25
    finally:
        event.remove(db.bind, "before_cursor_execute", capture)
    assert len(statements) == 6


@pytest.fixture
def ops_client(db, monkeypatch):
    monkeypatch.setenv("ADMIN_USER_IDS", "1")
    monkeypatch.setattr(clock, "utc_now", lambda: NOW)
    app = FastAPI()
    app.include_router(admin.router)
    app.include_router(system.router)
    app.dependency_overrides[get_db] = lambda: db
    with TestClient(app) as client:
        def as_user(uid):
            app.dependency_overrides[get_current_user] = lambda: db.get(m.User, uid) if uid else None
            return client
        yield as_user


def test_admin_only_no_personal_details_and_no_cache(db, ops_client):
    visit(db, "do-not-publish", NOW - timedelta(days=1))
    assert ops_client(None).get("/api/admin/beta-metrics").status_code == 401
    assert ops_client(2).get("/api/admin/beta-metrics").status_code == 403
    response = ops_client(1).get("/api/admin/beta-metrics")
    assert response.status_code == 200
    assert response.headers["cache-control"] == "no-store"
    assert "do-not-publish" not in response.text and "test1@" not in response.text


def test_missing_schema_is_service_unavailable_not_empty_success(db, ops_client):
    db.execute(text("DROP TABLE list_copy_events")); db.commit()
    response = ops_client(1).get("/api/admin/beta-metrics")
    assert response.status_code == 503
    assert "summary" not in response.json()
    assert "list_copy_events" not in response.text


def test_live_and_ready_have_validated_revision_and_no_cache(ops_client, monkeypatch):
    monkeypatch.delenv("RENDER_GIT_COMMIT", raising=False)
    monkeypatch.setenv("APP_REVISION", "a" * 40)
    client = ops_client(None)
    for path, status in (("live", "ok"), ("ready", "ready")):
        response = client.get(f"/api/health/{path}")
        assert response.status_code == 200 and response.json()["status"] == status
        assert response.json()["revision"] == "a" * 40
        assert response.headers["cache-control"] == "no-store"
    monkeypatch.setenv("APP_REVISION", "postgres://secret@example.invalid")
    assert client.get("/api/health/live").json()["revision"] == "unknown"


def test_readiness_failure_hides_db_details_and_liveness_stays_available(ops_client, monkeypatch):
    def fail(_):
        raise OperationalError("private query", {}, Exception("private password"))
    monkeypatch.setattr(system, "probe_database", fail)
    client = ops_client(None)
    response = client.get("/api/health/ready")
    assert response.status_code == 503 and response.json()["status"] == "not_ready"
    assert "private" not in response.text
    assert client.get("/api/health/live").status_code == 200


def test_readiness_detects_unapplied_migration(db, ops_client):
    db.execute(text("DROP TABLE verified_visit_feedback")); db.commit()
    assert ops_client(None).get("/api/health/ready").status_code == 503
