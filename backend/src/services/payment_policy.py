"""No real payments until verified PG settlement and separate ledgers exist.

Mock credits are allowed only for named test users on a local test database.
They cannot fund reservations, split payments, items, or merchant benefits.
"""
from urllib.parse import urlparse

from fastapi import HTTPException

from core.config import settings

PAYMENT_UNAVAILABLE = "캐시 결제는 준비 중이에요. 기존 잔액과 거래내역은 보관됩니다."


def can_mock_charge(user):
    url = urlparse(settings.DATABASE_URL)
    local_db = url.scheme == "sqlite" or url.hostname in {"localhost", "127.0.0.1", "::1"}
    return bool(
        user and settings.APP_ENV == "test" and local_db
        and settings.MOCK_PAYMENTS_ENABLED
        and str(user.id) in settings.MOCK_PAYMENT_USER_IDS
    )


def require_mock_charge(user):
    if not can_mock_charge(user):
        raise HTTPException(status_code=503, detail="캐시 충전은 준비 중이에요.")


def require_cash_payments():
    # Deliberately no enable-by-env switch: the current ledger includes mock
    # money. Enabling real payments requires a verified PG + ledger migration.
    raise HTTPException(status_code=503, detail=PAYMENT_UNAVAILABLE)


def partnership_redemption_enabled():
    # Reopen after visit evidence and idempotent redemption are implemented.
    return False
