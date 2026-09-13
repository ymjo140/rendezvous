"""Allowlisted beta observation events backed by the existing action_logs table."""
from datetime import datetime, timezone
import math
import re
from typing import Any

from sqlalchemy import func

from domain import models as m


BETA_EVENT_NAMES = (
    "crew_created",
    "crew_member_joined",
    "poll_created",
    "decision_confirmed",
    "visit_verified",
    "village_viewed",
    "menu_unlocked",
    "mission_action_started",
    "list_place_saved",
    "partnership_benefit_confirmed",
)
BETA_EVENT_NAME_SET = frozenset(BETA_EVENT_NAMES)

# Only compact, predefined dimensions are accepted. No body, token, URL, email,
# or free-form user text belongs in beta observation metadata.
BETA_METADATA_KEYS = frozenset({
    "surface",
    "source",
    "action",
    "result",
    "experiment_group",
    "place_category",
    "position",
    "crew_size",
    "added_count",
    "mode",
})
_ID_PATTERN = re.compile(r"^[A-Za-z0-9:_-]{1,128}$")


def _utc_naive(value: datetime | None = None) -> datetime:
    value = value or datetime.now(timezone.utc)
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _safe_identifier(value: str | None, label: str, max_length: int = 128) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str) or len(value) > max_length or not _ID_PATTERN.fullmatch(value):
        raise ValueError(f"{label} 형식이 올바르지 않습니다.")
    return value


def sanitize_metadata(metadata: dict[str, Any] | None) -> dict[str, Any]:
    if metadata is None:
        return {}
    if not isinstance(metadata, dict):
        raise ValueError("metadata는 객체여야 합니다.")
    if len(metadata) > 8:
        raise ValueError("metadata 항목은 8개 이하만 보낼 수 있습니다.")

    clean: dict[str, Any] = {}
    for key, value in metadata.items():
        if key not in BETA_METADATA_KEYS:
            raise ValueError(f"허용하지 않는 metadata key입니다: {key}")
        if value is None:
            continue
        if isinstance(value, bool):
            clean[key] = value
        elif isinstance(value, int) and not isinstance(value, bool):
            clean[key] = value
        elif isinstance(value, float) and math.isfinite(value):
            clean[key] = value
        elif isinstance(value, str) and 0 < len(value) <= 64 and "\n" not in value and "\r" not in value:
            if "://" in value or "@" in value:
                raise ValueError("metadata에 URL·이메일을 저장할 수 없습니다.")
            clean[key] = value
        else:
            raise ValueError("metadata 값은 짧은 문자열·숫자·불리언만 허용합니다.")
    return clean


def record_event(
    db,
    user_id: int | None,
    event_name: str,
    *,
    entity_type: str | None = None,
    entity_id: str | None = None,
    metadata: dict[str, Any] | None = None,
    request_id: str | None = None,
    created_at: datetime | None = None,
):
    if event_name not in BETA_EVENT_NAME_SET:
        raise ValueError("지원하지 않는 베타 이벤트입니다.")
    if user_id is not None and (type(user_id) is not int or user_id <= 0):
        raise ValueError("user_id가 올바르지 않습니다.")

    entity_type = _safe_identifier(entity_type, "entity_type", 32)
    entity_id = _safe_identifier(entity_id, "entity_id")
    request_id = _safe_identifier(request_id, "request_id")
    clean = sanitize_metadata(metadata)

    if request_id:
        existing = db.query(m.ActionLog).filter(
            m.ActionLog.user_id == user_id,
            m.ActionLog.action_type == event_name,
            m.ActionLog.request_id == request_id,
        ).first()
        if existing:
            return existing, True

    row = m.ActionLog(
        user_id=user_id,
        action_type=event_name,
        request_id=request_id,
        entity_type=entity_type,
        entity_id=entity_id,
        metadata_json=clean,
        created_at=_utc_naive(created_at),
    )
    db.add(row)
    return row, False


def count_events(db, start: datetime, end: datetime) -> dict[str, int]:
    counts = {name: 0 for name in BETA_EVENT_NAMES}
    rows = db.query(m.ActionLog.action_type, func.count(m.ActionLog.id)).filter(
        m.ActionLog.action_type.in_(BETA_EVENT_NAMES),
        m.ActionLog.created_at >= _utc_naive(start),
        m.ActionLog.created_at <= _utc_naive(end),
    ).group_by(m.ActionLog.action_type).all()
    counts.update({name: int(total) for name, total in rows})
    return counts
