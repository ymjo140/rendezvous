"""Crew beta metrics from server-verified facts, without inferring missing history."""
from collections import defaultdict
from datetime import datetime, timedelta

from sqlalchemy import case, func

from core import visit_time as clock
from domain import models as m
from services.visit_service import verified_events


def _rate(converted, eligible):
    return round(converted / eligible, 4) if eligible else None


def _retention(rows, now):
    converted = eligible = pending = 0
    cohorts = defaultdict(lambda: {"crews": 0, "eligible": 0, "converted": 0, "pending": 0})
    for row in rows:
        first = clock.as_utc(row.first_at)
        second = clock.as_utc(row.second_at) if row.second_at else None
        deadline = first + timedelta(days=28)
        cohort = cohorts[clock.week_start(first).astimezone(clock.KST).date().isoformat()]
        cohort["crews"] += 1
        if deadline > now:
            pending += 1
            cohort["pending"] += 1
            continue
        eligible += 1
        cohort["eligible"] += 1
        if second is not None and second <= deadline:
            converted += 1
            cohort["converted"] += 1
    return {
        "converted": converted, "eligible": eligible, "pending": pending,
        "rate": _rate(converted, eligible), "observation_days": 28,
    }, [
        {"week_start": key, **value, "rate": _rate(value["converted"], value["eligible"])}
        for key, value in sorted(cohorts.items(), reverse=True)[:12]
    ]


def get_beta_metrics(db, now=None):
    now = clock.as_utc(now or clock.utc_now())
    today = clock.kst_date(now)
    first_day = today - timedelta(days=27)
    start = datetime.combine(first_day, datetime.min.time(), clock.KST).astimezone(clock.UTC)

    # Share the product's verified status; ignore records not verified as of now.
    observed = verified_events(db).filter(
        m.VisitEvent.community_id.isnot(None),
        m.VisitEvent.occurred_at <= now, m.VisitEvent.verified_at <= now,
    )
    visits = observed.with_entities(
        m.VisitEvent.id, m.VisitEvent.community_id, m.VisitEvent.place_id,
        m.VisitEvent.occurred_at, m.VisitEvent.visit_date_kst,
    ).cte("observed_crew_visits")

    def first_two(partition):
        ranked = db.query(
            *partition, visits.c.occurred_at,
            func.row_number().over(partition_by=partition,
                                  order_by=(visits.c.occurred_at, visits.c.id)).label("position"),
        ).cte()
        groups = [ranked.c[column.name] for column in partition]
        # One aggregate row per crew/pair, without per-crew queries or visit dumps.
        return db.query(
            *groups, func.min(ranked.c.occurred_at).label("first_at"),
            func.min(case((ranked.c.position == 2, ranked.c.occurred_at))).label("second_at"),
        ).filter(ranked.c.position <= 2).group_by(*groups).all()

    crew_rows = first_two([visits.c.community_id])
    place_rows = first_two([visits.c.community_id, visits.c.place_id])
    second_visit, cohorts = _retention(crew_rows, now)
    same_place, _ = _retention(place_rows, now)

    recent = db.query(visits).filter(visits.c.occurred_at >= start).cte("recent_crew_visits")
    per_crew = db.query(recent.c.community_id, func.count().label("visits")).group_by(recent.c.community_id).cte()
    active, repeat, count = db.query(
        func.count(), func.sum(case((per_crew.c.visits >= 2, 1), else_=0)), func.sum(per_crew.c.visits),
    ).select_from(per_crew).one()
    days = db.query(
        recent.c.visit_date_kst, func.count().label("visits"),
        func.count(func.distinct(recent.c.community_id)).label("crews"),
    ).group_by(recent.c.visit_date_kst).all()
    daily = {row.visit_date_kst.isoformat(): row for row in days}
    first_visits = defaultdict(int)
    for row in crew_rows:
        if clock.as_utc(row.first_at) >= start:
            first_visits[clock.kst_date(row.first_at).isoformat()] += 1

    # Success counters are not funnel conversion rates.
    copied = db.query(func.count(m.ListCopyEvent.id)).filter(
        m.ListCopyEvent.creditable.is_(True),
        m.ListCopyEvent.created_at >= start, m.ListCopyEvent.created_at <= now,
    ).scalar()
    feedback = db.query(func.count(m.VerifiedVisitFeedback.id)).join(
        visits, visits.c.id == m.VerifiedVisitFeedback.visit_id,
    ).filter(m.VerifiedVisitFeedback.created_at >= start, m.VerifiedVisitFeedback.created_at <= now).scalar()

    return {
        "definition_version": "crew-beta-v1", "as_of": now.isoformat(), "timezone": "Asia/Seoul",
        "window": {"start": start.isoformat(), "end": now.isoformat(), "days": 28, "includes_partial_today": True},
        "summary": {"active_crews": active, "repeat_crews": repeat or 0, "verified_visits": count or 0,
                    "first_visit_crews": sum(first_visits.values()), "credited_list_copies": copied,
                    "verified_feedback_responses": feedback},
        "retention": {"second_visit_28d": second_visit, "same_place_28d": same_place},
        "cohorts": cohorts,
        "series": [
            {"date": day.isoformat(), "visits": daily[day.isoformat()].visits if day.isoformat() in daily else 0,
             "crews": daily[day.isoformat()].crews if day.isoformat() in daily else 0,
             "first_visit_crews": first_visits[day.isoformat()]}
            for day in (first_day + timedelta(days=i) for i in range(28))
        ],
        "coverage": {
            "source": "visit_events:verified", "cohort_scope": "all_observed_crews", "cohort_rows_limit": 12,
            "unavailable": [
                {"key": "activation_7d", "reason": "모집 시각과 당시 멤버 수 기록이 필요해요."},
                {"key": "list_to_visit_14d", "reason": "복사 당시 장소별 출처 기록이 필요해요."},
                {"key": "decision_duration", "reason": "투표의 최종 확정 시각 기록이 필요해요."},
                {"key": "benefit_success_rate", "reason": "실제 혜택 운영과 제시·처리 시도 기록이 필요해요."},
            ],
        },
    }
