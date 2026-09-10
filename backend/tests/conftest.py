"""Isolated API tests: no production main/startup, credentials, or database.

Use real SQLAlchemy tables and FastAPI routers with only identity/DB overrides.
PostgreSQL-specific recommendation tables are outside this focused suite.
"""
import os

os.environ["SECRET_KEY"] = "test-only-secret-never-use-in-deployment"
os.environ["DATABASE_URL"] = "sqlite://"
os.environ["APP_ENV"] = "test"
os.environ["MOCK_PAYMENTS_ENABLED"] = "false"
os.environ["MOCK_PAYMENT_USER_IDS"] = ""

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool

from api.dependencies import get_current_user, get_current_merchant
from api.routers import coins, groups, home, reservations, saves, social, splits, visits, merchant
from core.database import Base, get_db
from domain import models


@pytest.fixture
def db():
    engine = create_engine("sqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    # Exclude the recommendation array/vector tables, which need PostgreSQL.
    names = ["User", "Community", "Place", "SaveFolder", "SavedItem", "Post",
             "ListLike", "ListSave", "ListComment", "CommunityFollow", "UserFollow",
             "UserVerification", "PlaceVisitFeedback", "PlaceCheckin", "CoinHistory",
             "Reservation", "CrewPartnership", "CrewPartnershipApp", "ChatRoom",
             "ChatRoomMember", "ChatSplitRequest", "ChatSplitShare", "UserPreferenceVector",
             "UserEmbedding", "PlaceEmbedding", "VisitEvent", "VisitParticipant",
             "VisitApprovalRequest", "PartnershipRedemption"]
    Base.metadata.create_all(engine, tables=[getattr(models, n).__table__ for n in names])
    with sessionmaker(bind=engine, expire_on_commit=False)() as session:
        session.add_all([models.User(id=i, email=f"test{i}@example.invalid", name=f"User {i}",
                                     wallet_balance=100000) for i in (1, 2, 3)])
        session.add(models.Place(id=1, name="테스트 국밥", lat=37.5, lng=127.0, address="테스트 주소", owner_id="merchant-1"))
        session.commit()
        yield session
    engine.dispose()


@pytest.fixture
def client_for(db, monkeypatch):
    # Recommendation cache invalidation uses PG-specific UPSERT; it is not the
    # authorization or payment behavior tested here.
    monkeypatch.setattr("services.taste_service.mark_dirty", lambda *args: None)
    app = FastAPI()
    for module in (coins, groups, home, reservations, saves, social, splits, visits, merchant):
        app.include_router(module.router, prefix="/api/merchant" if module is merchant else "")

    def provide_db():
        yield db

    app.dependency_overrides[get_db] = provide_db
    with TestClient(app) as client:
        def as_user(uid, merchant_uid=None):
            def merchant_identity():
                from fastapi import HTTPException
                if not merchant_uid:
                    raise HTTPException(401, "merchant auth required")
                return merchant_uid
            app.dependency_overrides[get_current_merchant] = merchant_identity
            app.dependency_overrides[get_current_user] = lambda: db.get(models.User, uid) if uid else None
            return client
        yield as_user
