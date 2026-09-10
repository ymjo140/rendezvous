"""Visit timestamps are UTC; calendar boundaries are Asia/Seoul."""
from datetime import datetime, timedelta, timezone
from zoneinfo import ZoneInfo

UTC = timezone.utc
KST = ZoneInfo("Asia/Seoul")


def utc_now():
    return datetime.now(UTC)


def as_utc(value):
    # Legacy naive timestamps and SQLite's timezone-less round trips are UTC.
    return value.replace(tzinfo=UTC) if value.tzinfo is None else value.astimezone(UTC)


def kst_date(value=None):
    return as_utc(value or utc_now()).astimezone(KST).date()


def week_start(value=None):
    day = kst_date(value)
    monday = day - timedelta(days=day.weekday())
    return datetime.combine(monday, datetime.min.time(), KST).astimezone(UTC)


def month_key(value=None):
    return kst_date(value).strftime("%Y-%m")
