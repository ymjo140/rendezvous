# -*- coding: utf-8 -*-
"""듀오링고식 게이미피케이션 v2: XP/레벨 + 🔥스트릭 + 일일 퀘스트 + 뱃지 37종 + 주간 친구 리그.
캐시(wallet_balance, ₩)와 완전히 분리된 '게임 진행도'(현금 아님).

v2 변경점:
- 모든 날짜/주차 계산 KST 기준(서버 UTC 무관) — 스트릭이 한국 자정에 맞게 갱신
- game_state에 일일 리셋에서 살아남는 영속 영역(gs["p"]): 주간 XP, 평생 카운터, 대표 뱃지
- 행동별 일일 XP 상한(어뷰징 방어) — 예약만 무제한(실결제 행동)
- 주간 친구 리그: 이번 주 XP만 집계, 월요일 KST 리셋, 지난주 정산(왕관/우승 카운트)
- 뱃지 37종 + 진행도(progress/goal) 반환
"""
from datetime import datetime, date, timedelta, timezone

from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from domain import models

KST = timezone(timedelta(hours=9))

# 행동별 XP 보상
XP_REWARDS = {
    "daily_login": 5,
    "explore": 10,     # 새로운 장소 둘러보기
    "recommend": 10,   # 맞춤 추천 받기
    "review": 30,      # 리뷰 작성
    "reserve": 50,     # 예약 완료
    "share": 10,       # 공유
    "midpoint": 15,    # 중간지점 찾기(모임 핵심 행동)
}

# 행동별 일일 XP 지급 상한(횟수) — 없으면 무제한. 상한 초과여도 퀘스트/카운터는 진행됨.
XP_DAILY_CAPS = {
    "daily_login": 1,
    "explore": 3,
    "recommend": 2,
    "review": 3,
    "share": 2,
    "midpoint": 2,
    # reserve: 무제한(캐시 결제가 걸려 있어 자연 방어)
}

# 평생 카운터로 추적하는 행동(뱃지 조건용) — game_state["p"]["counters"]에 누적
COUNTER_ACTIONS = {"share", "midpoint"}

# 일일 퀘스트(매일 KST 리셋). action == record_activity의 action_type
DAILY_QUESTS = [
    {"key": "explore", "action": "explore", "title": "새로운 곳 2군데 둘러보기", "goal": 2, "reward": 20},
    {"key": "recommend", "action": "recommend", "title": "맞춤 추천 받아보기", "goal": 1, "reward": 20},
    {"key": "review", "action": "review", "title": "리뷰 1개 남기기", "goal": 1, "reward": 30},
]

# 뱃지(업적) 37종 — metric은 _badge_metrics()가 계산, goal 도달 시 획득.
# 잠긴 뱃지도 progress/goal을 노출해 '다음 목표'가 보이게 한다.
BADGES = [
    {"key": "first_step", "emoji": "👣", "title": "첫 발걸음", "desc": "첫 활동을 시작했어요", "metric": "xp", "goal": 1},
    # ✍️ 리뷰(탐험)
    {"key": "review_1", "emoji": "✍️", "title": "첫 리뷰", "desc": "리뷰 1곳 남기기", "metric": "reviews", "goal": 1},
    {"key": "explorer_5", "emoji": "🍽️", "title": "탐험 입문", "desc": "리뷰 5곳 달성", "metric": "reviews", "goal": 5},
    {"key": "explorer_10", "emoji": "🗺️", "title": "동네 탐험가", "desc": "리뷰 10곳 달성", "metric": "reviews", "goal": 10},
    {"key": "explorer_20", "emoji": "🏆", "title": "미식 탐험가", "desc": "리뷰 20곳 달성", "metric": "reviews", "goal": 20},
    {"key": "explorer_50", "emoji": "🌟", "title": "미식 대가", "desc": "리뷰 50곳 달성", "metric": "reviews", "goal": 50},
    # 🔥 스트릭
    {"key": "streak_3", "emoji": "🔥", "title": "불씨", "desc": "3일 연속 활동", "metric": "streak", "goal": 3},
    {"key": "streak_7", "emoji": "🔥", "title": "활활", "desc": "7일 연속 활동", "metric": "streak", "goal": 7},
    {"key": "streak_30", "emoji": "🌋", "title": "용암", "desc": "30일 연속 활동", "metric": "streak", "goal": 30},
    {"key": "streak_100", "emoji": "🏔️", "title": "전설의 불꽃", "desc": "100일 연속 활동", "metric": "streak", "goal": 100},
    # 🎟️ 예약
    {"key": "reserve_1", "emoji": "🎟️", "title": "첫 예약", "desc": "첫 예약 완료", "metric": "reservations", "goal": 1},
    {"key": "gourmet_5", "emoji": "🎫", "title": "예약 단골", "desc": "예약 5회 달성", "metric": "reservations", "goal": 5},
    {"key": "reserve_20", "emoji": "💎", "title": "예약왕", "desc": "예약 20회 달성", "metric": "reservations", "goal": 20},
    # 🤝 친구
    {"key": "friend_1", "emoji": "🤝", "title": "첫 친구", "desc": "친구 1명 만들기", "metric": "friends", "goal": 1},
    {"key": "friend_5", "emoji": "🎉", "title": "인맥왕", "desc": "친구 5명 달성", "metric": "friends", "goal": 5},
    {"key": "friend_10", "emoji": "🌐", "title": "마당발", "desc": "친구 10명 달성", "metric": "friends", "goal": 10},
    # 📤 공유
    {"key": "share_5", "emoji": "📤", "title": "공유 요정", "desc": "공유 5회", "metric": "share", "goal": 5},
    {"key": "share_20", "emoji": "📣", "title": "전파왕", "desc": "공유 20회", "metric": "share", "goal": 20},
    # 📍 중간지점(모임 코어)
    {"key": "midpoint_1", "emoji": "📍", "title": "첫 중간지점", "desc": "중간지점 찾기 1회", "metric": "midpoint", "goal": 1},
    {"key": "midpoint_5", "emoji": "🧭", "title": "만남 설계자", "desc": "중간지점 찾기 5회", "metric": "midpoint", "goal": 5},
    {"key": "midpoint_20", "emoji": "🛰️", "title": "중간지점 마스터", "desc": "중간지점 찾기 20회", "metric": "midpoint", "goal": 20},
    # 👥 모임
    {"key": "group_1", "emoji": "👥", "title": "모임 개설자", "desc": "첫 모임 만들기", "metric": "groups_hosted", "goal": 1},
    {"key": "group_3", "emoji": "🏘️", "title": "모임 운영자", "desc": "모임 3개 운영", "metric": "groups_hosted", "goal": 3},
    # ⚡ 핫딜
    {"key": "hotdeal_1", "emoji": "⚡", "title": "첫 핫딜", "desc": "핫딜 예약 1회", "metric": "hotdeals", "goal": 1},
    {"key": "hotdeal_5", "emoji": "🏹", "title": "핫딜 헌터", "desc": "핫딜 예약 5회", "metric": "hotdeals", "goal": 5},
    {"key": "hotdeal_20", "emoji": "🔮", "title": "핫딜 마스터", "desc": "핫딜 예약 20회", "metric": "hotdeals", "goal": 20},
    # 📁 큐레이터
    {"key": "list_1", "emoji": "📁", "title": "첫 리스트", "desc": "맛집 리스트 공개 1개", "metric": "lists_public", "goal": 1},
    {"key": "listlikes_10", "emoji": "💖", "title": "취향 인정", "desc": "리스트 좋아요 10개 받기", "metric": "list_likes", "goal": 10},
    {"key": "listlikes_50", "emoji": "💝", "title": "취향 장인", "desc": "리스트 좋아요 50개 받기", "metric": "list_likes", "goal": 50},
    {"key": "follower_5", "emoji": "⭐", "title": "라이징 큐레이터", "desc": "팔로워 5명", "metric": "followers", "goal": 5},
    {"key": "follower_20", "emoji": "✨", "title": "인플루언서", "desc": "팔로워 20명", "metric": "followers", "goal": 20},
    # 💛 단골(재방문)
    {"key": "revisit_5", "emoji": "💛", "title": "진심 리뷰어", "desc": "'또 갈래요' 5회 응답", "metric": "revisits", "goal": 5},
    {"key": "revisit_20", "emoji": "💞", "title": "재방문 전도사", "desc": "'또 갈래요' 20회 응답", "metric": "revisits", "goal": 20},
    {"key": "regular_3", "emoji": "🏠", "title": "단골 인증", "desc": "같은 가게 3회 방문", "metric": "same_place_max", "goal": 3},
    # 🥇 주간 리그
    {"key": "league_1", "emoji": "🥇", "title": "첫 우승", "desc": "주간 리그 1위", "metric": "league_wins", "goal": 1},
    {"key": "league_3", "emoji": "🏆", "title": "리그 강자", "desc": "주간 리그 3회 우승", "metric": "league_wins", "goal": 3},
    {"key": "league_10", "emoji": "👑", "title": "리그의 전설", "desc": "주간 리그 10회 우승", "metric": "league_wins", "goal": 10},
]
BADGE_MAP = {b["key"]: b for b in BADGES}

LEVEL_STEP = 100  # 100 XP = 1레벨


def level_from_xp(xp: int) -> int:
    return 1 + max(0, int(xp)) // LEVEL_STEP


def _now_kst() -> datetime:
    return datetime.now(KST)


def _today() -> str:
    return _now_kst().date().isoformat()


def _yesterday() -> str:
    return (_now_kst().date() - timedelta(days=1)).isoformat()


def week_key(d: date = None) -> str:
    iso = (d or _now_kst().date()).isocalendar()
    return f"{iso[0]}-W{iso[1]:02d}"


def last_week_key() -> str:
    return week_key(_now_kst().date() - timedelta(days=7))


def week_start_utc_naive() -> datetime:
    """이번 주 월요일 00:00 KST를 UTC naive datetime으로 — created_at(서버 naive) 비교용."""
    today = _now_kst().date()
    monday = today - timedelta(days=today.weekday())
    return datetime(monday.year, monday.month, monday.day) - timedelta(hours=9)


class GamificationService:
    # ── 상태 관리 ──────────────────────────────────────────────
    def _state(self, user: models.User) -> dict:
        """game_state 로드. 일일 영역(date/progress/rewarded/xp_counts)은 KST 날짜 바뀌면 리셋,
        영속 영역(p: 주간 XP/카운터/대표 뱃지/정산 플래그)은 보존 + 주차 롤오버."""
        gs = user.game_state if isinstance(user.game_state, dict) else {}
        today = _today()
        p = gs.get("p") if isinstance(gs.get("p"), dict) else {}
        if gs.get("date") != today:
            gs = {"date": today, "progress": {}, "rewarded": [], "xp_counts": {}, "p": p}
        gs.setdefault("progress", {})
        gs.setdefault("rewarded", [])
        gs.setdefault("xp_counts", {})
        gs["p"] = p
        p.setdefault("counters", {})
        # 주차 롤오버: 지난 주 XP를 히스토리에 보관(최근 2주만)
        cur = week_key()
        if p.get("week") != cur:
            weeks = p.get("weeks") if isinstance(p.get("weeks"), dict) else {}
            if p.get("week") and isinstance(p.get("weekly_xp"), int):
                weeks[p["week"]] = p["weekly_xp"]
            # 최근 2주만 유지
            for k in sorted(weeks.keys(), reverse=True)[2:]:
                weeks.pop(k, None)
            p["weeks"] = weeks
            p["week"] = cur
            p["weekly_xp"] = 0
        p.setdefault("weekly_xp", 0)
        p.setdefault("weeks", {})
        return gs

    def _weekly_xp_of(self, u: models.User, wk: str) -> int:
        """다른 유저의 특정 주차 XP — 그 유저 game_state를 읽기만(수정 X)."""
        gs = u.game_state if isinstance(u.game_state, dict) else {}
        p = gs.get("p") if isinstance(gs.get("p"), dict) else {}
        if p.get("week") == wk:
            return int(p.get("weekly_xp") or 0)
        weeks = p.get("weeks") if isinstance(p.get("weeks"), dict) else {}
        return int(weeks.get(wk) or 0)

    # ── 뱃지 ──────────────────────────────────────────────────
    def _badge_metrics(self, db: Session, user: models.User, gs: dict) -> dict:
        counters = gs["p"].get("counters", {})

        def q(fn, default=0):
            try:
                return fn()
            except Exception:
                return default

        reservations = q(lambda: db.query(models.Reservation).filter(
            models.Reservation.user_id == user.id, models.Reservation.status != "cancelled").count())
        hotdeals = q(lambda: db.query(models.Reservation).filter(
            models.Reservation.user_id == user.id, models.Reservation.status != "cancelled",
            models.Reservation.offer_rule_id.isnot(None)).count())
        friends = q(lambda: db.query(models.Friendship).filter(
            ((models.Friendship.requester_id == user.id) | (models.Friendship.receiver_id == user.id)),
            models.Friendship.status == "accepted").count())
        followers = q(lambda: db.query(models.UserFollow).filter(
            models.UserFollow.following_id == user.id).count())
        lists_public = q(lambda: db.query(models.SaveFolder).filter(
            models.SaveFolder.user_id == user.id, models.SaveFolder.is_public == True).count())  # noqa: E712
        list_likes = q(lambda: db.query(models.ListLike).join(
            models.SaveFolder, models.ListLike.folder_id == models.SaveFolder.id).filter(
            models.SaveFolder.user_id == user.id).count())
        revisits = q(lambda: db.query(models.PlaceVisitFeedback).filter(
            models.PlaceVisitFeedback.user_id == user.id).count())
        same_place_max = q(lambda: (
            db.query(func.count(models.Reservation.id))
            .filter(models.Reservation.user_id == user.id, models.Reservation.status != "cancelled")
            .group_by(models.Reservation.place_id)
            .order_by(func.count(models.Reservation.id).desc())
            .limit(1).scalar() or 0))
        groups_hosted = q(lambda: db.query(models.Community).filter(
            models.Community.host_id == user.id).count())

        return {
            "xp": user.xp or 0,
            "reviews": user.review_count or 0,
            "streak": max(user.best_streak or 0, user.streak_count or 0),
            "reservations": reservations,
            "hotdeals": hotdeals,
            "friends": friends,
            "followers": followers,
            "lists_public": lists_public,
            "list_likes": list_likes,
            "revisits": revisits,
            "same_place_max": same_place_max,
            "groups_hosted": groups_hosted,
            "share": int(counters.get("share") or 0),
            "midpoint": int(counters.get("midpoint") or 0),
            "league_wins": int(counters.get("league_wins") or 0),
        }

    def _award_badges(self, db: Session, user: models.User, metrics: dict) -> list:
        """조건 충족 뱃지 신규 지급. 새로 받은 뱃지 키 리스트 반환. (커밋은 호출자)"""
        earned = {
            b.badge_key
            for b in db.query(models.UserBadge).filter(models.UserBadge.user_id == user.id).all()
        }
        newly = []
        for b in BADGES:
            if b["key"] in earned:
                continue
            if metrics.get(b["metric"], 0) >= b["goal"]:
                db.add(models.UserBadge(user_id=user.id, badge_key=b["key"]))
                newly.append(b["key"])
        return newly

    # ── 활동 기록 ──────────────────────────────────────────────
    def record_activity(self, db: Session, user: models.User, action_type: str) -> dict:
        gs = self._state(user)
        today = _today()
        gained_xp = 0
        completed_quests = []

        # 1) 스트릭: 오늘(KST) 첫 활동이면 갱신
        if user.last_activity_date != today:
            if user.last_activity_date == _yesterday():
                user.streak_count = (user.streak_count or 0) + 1
            else:
                user.streak_count = 1
            user.best_streak = max(user.best_streak or 0, user.streak_count)
            user.last_activity_date = today

        # 2) 행동 XP — 일일 상한 내에서만 지급(상한 넘어도 퀘스트/카운터는 진행)
        base = XP_REWARDS.get(action_type, 0)
        if base > 0:
            cap = XP_DAILY_CAPS.get(action_type)
            cnt = int(gs["xp_counts"].get(action_type, 0))
            if cap is None or cnt < cap:
                gained_xp += base
                gs["xp_counts"][action_type] = cnt + 1

        # 2-1) 평생 카운터(뱃지 조건용)
        if action_type in COUNTER_ACTIONS:
            c = gs["p"]["counters"]
            c[action_type] = int(c.get(action_type) or 0) + 1

        # 3) 일일 퀘스트 진행
        for quest in DAILY_QUESTS:
            if quest["action"] != action_type:
                continue
            prog = int(gs["progress"].get(quest["key"], 0))
            if prog < quest["goal"]:
                prog += 1
                gs["progress"][quest["key"]] = prog
                if prog >= quest["goal"] and quest["key"] not in gs["rewarded"]:
                    gs["rewarded"].append(quest["key"])
                    gained_xp += quest["reward"]
                    completed_quests.append(quest["key"])

        # 4) XP/레벨 + 주간 리그 XP 반영
        prev_level = level_from_xp(user.xp or 0)
        user.xp = (user.xp or 0) + gained_xp
        user.level = level_from_xp(user.xp)
        leveled_up = user.level > prev_level
        gs["p"]["weekly_xp"] = int(gs["p"].get("weekly_xp") or 0) + gained_xp

        user.game_state = gs
        flag_modified(user, "game_state")

        # 5) 뱃지 평가
        metrics = self._badge_metrics(db, user, gs)
        new_badges = self._award_badges(db, user, metrics)

        db.commit()
        db.refresh(user)

        profile = self.get_profile(db, user)
        profile.update({
            "gained_xp": gained_xp,
            "leveled_up": leveled_up,
            "completed_quests": completed_quests,
            "new_badges": [BADGE_MAP.get(k, {"key": k}) for k in new_badges],
        })
        return profile

    # ── 대표 뱃지 ─────────────────────────────────────────────
    def set_featured_badge(self, db: Session, user: models.User, badge_key: str) -> dict:
        earned = {
            b.badge_key
            for b in db.query(models.UserBadge).filter(models.UserBadge.user_id == user.id).all()
        }
        if badge_key and badge_key not in earned:
            return {"ok": False, "detail": "획득한 뱃지만 대표로 설정할 수 있어요."}
        gs = self._state(user)
        gs["p"]["featured_badge"] = badge_key or None
        user.game_state = gs
        flag_modified(user, "game_state")
        db.commit()
        return {"ok": True, "featured_badge": badge_key or None}

    @staticmethod
    def featured_badge_of(u: models.User):
        gs = u.game_state if isinstance(u.game_state, dict) else {}
        p = gs.get("p") if isinstance(gs.get("p"), dict) else {}
        key = p.get("featured_badge")
        return BADGE_MAP.get(key) if key else None

    # ── 주간 친구 리그 ─────────────────────────────────────────
    def get_leaderboard(self, db: Session, user: models.User) -> dict:
        """주간 친구 리그: 나 + 수락된 친구들을 '이번 주 XP'로 랭킹. 동점 시 스트릭 우선.
        지난주 정산(1회): 결과 요약 + 1위면 우승 카운트/뱃지."""
        gs = self._state(user)
        cur_wk = week_key()
        last_wk = last_week_key()

        rels = (
            db.query(models.Friendship)
            .filter(
                ((models.Friendship.requester_id == user.id) | (models.Friendship.receiver_id == user.id)),
                models.Friendship.status == "accepted",
            )
            .all()
        )
        ids = {user.id}
        for r in rels:
            ids.add(r.receiver_id if r.requester_id == user.id else r.requester_id)

        users = db.query(models.User).filter(models.User.id.in_(list(ids))).all()

        # 지난주 랭킹(왕관/정산용)
        last_ranked = sorted(
            users,
            key=lambda u: (self._weekly_xp_of(u, last_wk), u.streak_count or 0),
            reverse=True,
        )
        last_winner_id = None
        if last_ranked and self._weekly_xp_of(last_ranked[0], last_wk) > 0:
            last_winner_id = last_ranked[0].id

        # 이번 주 랭킹
        ranked = sorted(
            users,
            key=lambda u: (self._weekly_xp_of(u, cur_wk), u.streak_count or 0),
            reverse=True,
        )
        entries = []
        for i, u in enumerate(ranked):
            fb = self.featured_badge_of(u)
            entries.append({
                "rank": i + 1,
                "user_id": u.id,
                "name": u.name,
                "weekly_xp": self._weekly_xp_of(u, cur_wk),
                "xp": u.xp or 0,
                "level": level_from_xp(u.xp or 0),
                "streak_count": u.streak_count or 0,
                "featured_badge": {"key": fb["key"], "emoji": fb["emoji"], "title": fb["title"]} if fb else None,
                "crown": u.id == last_winner_id,
                "is_me": u.id == user.id,
            })

        # 지난주 정산(중복 방지 플래그) — 지난주에 누군가 XP가 있었을 때만 팝업 데이터 제공
        settlement = None
        new_badges = []
        if gs["p"].get("settled_week") != last_wk:
            gs["p"]["settled_week"] = last_wk
            if last_winner_id is not None:
                my_last = self._weekly_xp_of(user, last_wk)
                my_rank = next(
                    (i + 1 for i, u in enumerate(last_ranked) if u.id == user.id), None
                )
                i_won = last_winner_id == user.id
                if i_won:
                    c = gs["p"]["counters"]
                    c["league_wins"] = int(c.get("league_wins") or 0) + 1
                settlement = {
                    "week": last_wk,
                    "i_won": i_won,
                    "my_rank": my_rank,
                    "my_xp": my_last,
                    "top": [
                        {"name": u.name, "xp": self._weekly_xp_of(u, last_wk), "is_me": u.id == user.id}
                        for u in last_ranked[:3]
                    ],
                }
            user.game_state = gs
            flag_modified(user, "game_state")
            metrics = self._badge_metrics(db, user, gs)
            new_badge_keys = self._award_badges(db, user, metrics)
            new_badges = [BADGE_MAP.get(k, {"key": k}) for k in new_badge_keys]
            db.commit()

        return {
            "week": cur_wk,
            "entries": entries,
            "total": len(entries),
            "settlement": settlement,
            "new_badges": new_badges,
        }

    # ── 프로필 ─────────────────────────────────────────────────
    def get_profile(self, db: Session, user: models.User) -> dict:
        gs = self._state(user)
        xp = user.xp or 0
        level = level_from_xp(xp)

        quests = []
        for q in DAILY_QUESTS:
            prog = int(gs["progress"].get(q["key"], 0))
            quests.append({
                "key": q["key"],
                "title": q["title"],
                "goal": q["goal"],
                "progress": min(prog, q["goal"]),
                "done": prog >= q["goal"],
                "reward": q["reward"],
            })

        earned_rows = db.query(models.UserBadge).filter(models.UserBadge.user_id == user.id).all()
        earned_keys = {b.badge_key for b in earned_rows}
        metrics = self._badge_metrics(db, user, gs)
        badges = []
        for b in BADGES:
            cur = int(metrics.get(b["metric"], 0))
            badges.append({
                "key": b["key"], "emoji": b["emoji"], "title": b["title"], "desc": b["desc"],
                "goal": b["goal"],
                "progress": min(cur, b["goal"]),
                "earned": b["key"] in earned_keys,
            })

        fb = gs["p"].get("featured_badge")
        return {
            "xp": xp,
            "level": level,
            "level_progress": xp % LEVEL_STEP,
            "level_total": LEVEL_STEP,
            "xp_to_next": LEVEL_STEP - (xp % LEVEL_STEP),
            "streak_count": user.streak_count or 0,
            "best_streak": user.best_streak or 0,
            "active_today": user.last_activity_date == _today(),
            "weekly_xp": int(gs["p"].get("weekly_xp") or 0),
            "week": gs["p"].get("week"),
            "featured_badge": fb if fb in BADGE_MAP else None,
            "quests": quests,
            "badges": badges,
            "earned_badge_count": len(earned_keys),
        }
