"""Real PostgreSQL transactions and the exact deploy migration, required in CI.
Local runs skip only when TEST_POSTGRES_URL is absent. Each test owns a random schema.
"""
import os
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta
from pathlib import Path
from threading import Barrier
from uuid import uuid4

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.engine import make_url
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import sessionmaker

from core import visit_time as clock
from core.database import Base
from domain import models as m
from schemas.visits import CheckinRequest, RedeemRequest
from services import checkin_service as checkin, redemption_service, payment_policy

SQL = Path(__file__).resolve().parents[1] / "src/migrations/20260908_verified_visits.sql"
NEW_TABLES = ("visit_events", "visit_participants", "visit_approval_requests", "partnership_redemptions")


@pytest.fixture
def pg(monkeypatch):
    url = os.environ.get("TEST_POSTGRES_URL")
    if not url:
        pytest.skip("TEST_POSTGRES_URL absent; PostgreSQL CI job is required")
    parsed = make_url(url)
    assert parsed.get_backend_name() == "postgresql"
    assert parsed.host in ("localhost", "127.0.0.1") and parsed.database.startswith("rdv_test")
    schema = "visit_test_" + uuid4().hex
    admin = create_engine(url)
    with admin.begin() as conn:
        conn.execute(text(f"CREATE SCHEMA {schema}"))
    engine = create_engine(url, connect_args={"options": f"-csearch_path={schema}"}, pool_size=8)
    names = ["User", "Community", "Place", "UserVerification", "PlaceVisitFeedback", "PlaceCheckin",
             "Reservation", "CrewPartnership", "CrewPartnershipApp", "ChatRoom", "ChatRoomMember",
             "ChatSplitRequest", "ChatSplitShare"]
    try:
        Base.metadata.create_all(engine, tables=[getattr(m, n).__table__ for n in names])
        with engine.begin() as conn:
            conn.exec_driver_sql(SQL.read_text())
            conn.exec_driver_sql(SQL.read_text())  # Deployment retry must be harmless.
        factory = sessionmaker(bind=engine, expire_on_commit=False)
        with factory() as db:
            db.add_all([m.User(id=i, email=f"test{i}@example.invalid", name=f"User {i}") for i in (1, 2, 3)])
            db.flush()
            db.add(m.Place(id=1, name="테스트 가게", lat=37.5, lng=127, owner_id="merchant-1"))
            db.add(m.Community(id="crew", title="테스트", host_id=1, member_ids=[2, 3], visibility="public"))
            db.commit()
        value = {"at": datetime(2026, 9, 8, 3, tzinfo=clock.UTC)}
        monkeypatch.setattr(clock, "utc_now", lambda: value["at"])
        yield engine, factory, value
    finally:
        engine.dispose()
        with admin.begin() as conn:
            conn.execute(text(f"DROP SCHEMA {schema} CASCADE"))
        admin.dispose()


def concurrent(items, fn):
    barrier = Barrier(len(items))
    def worker(item):
        barrier.wait(timeout=10)
        return fn(item)
    with ThreadPoolExecutor(max_workers=len(items)) as pool:
        return list(pool.map(worker, items, timeout=30))


@pytest.mark.parametrize("uids,cid,participants,status", [
    ([1, 1, 1, 1], "crew", 1, "pending"),
    ([1, 2, 1, 3], "crew", 3, "verified"),
    ([1, 1, 1, 1], None, 1, "verified"),
])
def test_concurrent_checkins_share_event_without_null_loophole(pg, uids, cid, participants, status):
    engine, factory, now = pg
    with factory() as db:
        req = CheckinRequest(place_id=1, community_id=cid, lat=37.5, lng=127, accuracy_m=10,
                             position_at=clock.utc_now(), qr_token=checkin.issue_qr(db, 1, "merchant-1")["token"])
    def submit(uid):
        with factory() as db:
            return checkin.checkin(db, db.get(m.User, uid), req)
    results = concurrent(uids, submit)
    assert len({r["id"] for r in results}) == 1
    with factory() as db:
        assert db.query(m.VisitEvent).count() == 1
        assert db.query(m.VisitParticipant).count() == participants
        assert db.query(m.VisitEvent).one().status == status
        assert sum(not r["already"] for r in results) == participants


def test_migration_enforces_uniqueness_scope_and_rls(pg):
    engine, factory, now = pg
    assert set(NEW_TABLES) <= set(inspect(engine).get_table_names())
    with engine.connect() as conn:
        policies = conn.execute(text("SELECT relname, relrowsecurity FROM pg_class WHERE relnamespace = current_schema()::regnamespace")).all()
        assert all(dict(policies)[table] for table in NEW_TABLES)
    with factory() as db:
        checkin.record_attendance(db, db.get(m.User, 1), db.get(m.Place, 1), None,
                                  clock.utc_now(), clock.utc_now(), "merchant_approval", "test")
        db.commit()
        with pytest.raises(IntegrityError):
            db.execute(text("INSERT INTO visit_events SELECT 'duplicate', place_id, community_id, personal_user_id, scope_key, visit_date_kst, occurred_at, verified_at, status FROM visit_events"))
            db.commit()
        db.rollback()
        with pytest.raises(IntegrityError):
            db.execute(text("UPDATE visit_events SET scope_key = 'forged'"))
            db.commit()
        db.rollback()
        assert db.query(m.VisitEvent).count() == 1


def test_concurrent_merchant_approval_and_qr_dedupe(pg):
    from schemas.visits import VisitInput
    engine, factory, now = pg
    with factory() as db:
        rid = checkin.request_approval(db, db.get(m.User, 1), VisitInput(place_id=1, community_id="crew"))["request_id"]
        req = CheckinRequest(place_id=1, community_id="crew", lat=37.5, lng=127, accuracy_m=10,
                             position_at=clock.utc_now(), qr_token=checkin.issue_qr(db, 1, "merchant-1")["token"])
    def submit(kind):
        with factory() as db:
            if kind == "qr": return checkin.checkin(db, db.get(m.User, 1), req)
            return checkin.approve_visit(db, rid, "merchant-1")
    results = concurrent(["qr", "approve", "approve"], submit)
    assert len({r["id"] for r in results}) == 1
    with factory() as db:
        assert db.query(m.VisitParticipant).count() == 1
        assert db.query(m.VisitApprovalRequest).one().approved_at is not None


def test_redemption_last_monthly_slot_under_concurrency(pg, monkeypatch):
    engine, factory, now = pg
    monkeypatch.setattr(payment_policy, "partnership_redemption_enabled", lambda: True)
    with factory() as db:
        db.add(m.CrewPartnership(id=1, place_id=1, title="제휴", benefit="테스트", status="active")); db.flush()
        db.add(m.CrewPartnershipApp(id=1, partnership_id=1, community_id="crew", applicant_id=1, status="approved",
                                    terms_snapshot={"conditions": {"monthly_uses": 2, "min_party": 2}})); db.flush()
        for day in (1, 0):
            at = clock.utc_now() - timedelta(days=day)
            for uid in (1, 2):
                event, _ = checkin.record_attendance(db, db.get(m.User, uid), db.get(m.Place, 1), "crew", at, at, "merchant_approval", "seed")
            if day:
                db.add(m.PartnershipRedemption(id="old", app_id=1, visit_id=event.id, user_id=1, used_at=at,
                                               usage_month=clock.month_key(at), idempotency_key="yesterday", terms_snapshot={}))
            else: visit_id = event.id
        db.commit()
    def redeem(uid):
        with factory() as db:
            return redemption_service.redeem(db, db.get(m.User, uid), visit_id,
                       RedeemRequest(partnership_app_id=1, idempotency_key=f"request-user-{uid}"))
    results = concurrent([1, 2, 1, 2], redeem)
    assert sum(not r["already"] for r in results) == 1
    assert all(r["used_this_month"] == 2 for r in results)
    with factory() as db:
        assert db.query(m.PartnershipRedemption).count() == 2


def test_postgres_rollback_leaves_no_partial_attendance(pg, monkeypatch):
    engine, factory, now = pg
    def fail(*args, **kwargs): raise RuntimeError("interrupted")
    monkeypatch.setattr(checkin, "visit_payload", fail)
    with factory() as db:
        req = CheckinRequest(place_id=1, community_id="crew", lat=37.5, lng=127, accuracy_m=10,
                             position_at=clock.utc_now(), qr_token=checkin.issue_qr(db, 1, "merchant-1")["token"])
        with pytest.raises(RuntimeError): checkin.checkin(db, db.get(m.User, 1), req)
    with factory() as db:
        assert db.query(m.VisitEvent).count() == 0
        assert db.query(m.VisitParticipant).count() == 0
