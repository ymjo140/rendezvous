# -*- coding: utf-8 -*-
"""듀오링고식 게이미피케이션: XP/레벨 + 🔥스트릭 + 일일 퀘스트 + 뱃지.
캐시(wallet_balance, ₩)와 완전히 분리된 '게임 진행도'(현금 아님)."""
from datetime import date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from domain import models

# 행동별 XP 보상
XP_REWARDS = {
    "daily_login": 5,
    "explore": 10,     # 새로운 장소 둘러보기
    "recommend": 10,   # 맞춤 추천 받기
    "review": 30,      # 리뷰 작성
    "reserve": 50,     # 예약 완료
    "share": 10,       # 공유
}

# 일일 퀘스트(매일 리셋). action == record_activity의 action_type
DAILY_QUESTS = [
    {"key": "explore", "action": "explore", "title": "새로운 곳 2군데 둘러보기", "goal": 2, "reward": 20},
    {"key": "recommend", "action": "recommend", "title": "맞춤 추천 받아보기", "goal": 1, "reward": 20},
    {"key": "review", "action": "review", "title": "리뷰 1개 남기기", "goal": 1, "reward": 30},
]

# 뱃지(업적) 정의 — 조건은 record_activity에서 평가
BADGES = [
    {"key": "first_step", "emoji": "👣", "title": "첫 발걸음", "desc": "첫 활동을 시작했어요"},
    {"key": "explorer_5", "emoji": "🍽️", "title": "탐험 입문", "desc": "리뷰 5곳 달성"},
    {"key": "explorer_10", "emoji": "🗺️", "title": "동네 탐험가", "desc": "리뷰 10곳 달성"},
    {"key": "explorer_20", "emoji": "🏆", "title": "미식 탐험가", "desc": "리뷰 20곳 달성"},
    {"key": "streak_3", "emoji": "🔥", "title": "불씨", "desc": "3일 연속 활동"},
    {"key": "streak_7", "emoji": "🔥", "title": "활활", "desc": "7일 연속 활동"},
    {"key": "streak_30", "emoji": "🌋", "title": "용암", "desc": "30일 연속 활동"},
    {"key": "gourmet_5", "emoji": "🎫", "title": "예약왕", "desc": "예약 5회 달성"},
]
BADGE_MAP = {b["key"]: b for b in BADGES}

LEVEL_STEP = 100  # 100 XP = 1레벨


def level_from_xp(xp: int) -> int:
    return 1 + max(0, int(xp)) // LEVEL_STEP


def _today() -> str:
    return date.today().isoformat()


def _yesterday() -> str:
    return (date.today() - timedelta(days=1)).isoformat()


class GamificationService:
    def _state(self, user: models.User) -> dict:
        gs = user.game_state if isinstance(user.game_state, dict) else {}
        today = _today()
        if gs.get("date") != today:
            gs = {"date": today, "progress": {}, "rewarded": []}
        gs.setdefault("progress", {})
        gs.setdefault("rewarded", [])
        return gs

    def _reservation_count(self, db: Session, user_id: int) -> int:
        try:
            return (
                db.query(models.Reservation)
                .filter(models.Reservation.user_id == user_id, models.Reservation.status != "cancelled")
                .count()
            )
        except Exception:
            return 0

    def _award_badges(self, db: Session, user: models.User) -> list:
        """조건 충족 뱃지 신규 지급. 새로 받은 뱃지 키 리스트 반환."""
        earned = {
            b.badge_key
            for b in db.query(models.UserBadge).filter(models.UserBadge.user_id == user.id).all()
        }
        reservations = self._reservation_count(db, user.id)
        rc = user.review_count or 0
        streak = user.streak_count or 0

        conditions = {
            "first_step": (user.xp or 0) > 0,
            "explorer_5": rc >= 5,
            "explorer_10": rc >= 10,
            "explorer_20": rc >= 20,
            "streak_3": streak >= 3,
            "streak_7": streak >= 7,
            "streak_30": streak >= 30,
            "gourmet_5": reservations >= 5,
        }
        newly = []
        for key, ok in conditions.items():
            if ok and key not in earned:
                db.add(models.UserBadge(user_id=user.id, badge_key=key))
                newly.append(key)
        return newly

    def record_activity(self, db: Session, user: models.User, action_type: str) -> dict:
        gs = self._state(user)
        today = _today()
        gained_xp = 0
        completed_quests = []

        # 1) 스트릭: 오늘 첫 활동이면 갱신
        if user.last_activity_date != today:
            if user.last_activity_date == _yesterday():
                user.streak_count = (user.streak_count or 0) + 1
            else:
                user.streak_count = 1
            user.best_streak = max(user.best_streak or 0, user.streak_count)
            user.last_activity_date = today

        # 2) 행동 XP
        gained_xp += XP_REWARDS.get(action_type, 0)

        # 3) 일일 퀘스트 진행
        for q in DAILY_QUESTS:
            if q["action"] != action_type:
                continue
            prog = int(gs["progress"].get(q["key"], 0))
            if prog < q["goal"]:
                prog += 1
                gs["progress"][q["key"]] = prog
                if prog >= q["goal"] and q["key"] not in gs["rewarded"]:
                    gs["rewarded"].append(q["key"])
                    gained_xp += q["reward"]
                    completed_quests.append(q["key"])

        # 4) XP/레벨 반영
        prev_level = level_from_xp(user.xp or 0)
        user.xp = (user.xp or 0) + gained_xp
        user.level = level_from_xp(user.xp)
        leveled_up = user.level > prev_level

        user.game_state = gs
        flag_modified(user, "game_state")

        # 5) 뱃지 평가
        new_badges = self._award_badges(db, user)

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

    def get_leaderboard(self, db: Session, user: models.User) -> dict:
        """친구 리그: 나 + 수락된 친구들을 XP 순으로 랭킹."""
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
        ranked = sorted(users, key=lambda u: (u.xp or 0), reverse=True)
        out = []
        for i, u in enumerate(ranked):
            out.append({
                "rank": i + 1,
                "user_id": u.id,
                "name": u.name,
                "xp": u.xp or 0,
                "level": level_from_xp(u.xp or 0),
                "streak_count": u.streak_count or 0,
                "is_me": u.id == user.id,
            })
        return {"entries": out, "total": len(out)}

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
        badges = []
        for b in BADGES:
            badges.append({**b, "earned": b["key"] in earned_keys})

        return {
            "xp": xp,
            "level": level,
            "level_progress": xp % LEVEL_STEP,
            "level_total": LEVEL_STEP,
            "xp_to_next": LEVEL_STEP - (xp % LEVEL_STEP),
            "streak_count": user.streak_count or 0,
            "best_streak": user.best_streak or 0,
            "active_today": user.last_activity_date == _today(),
            "quests": quests,
            "badges": badges,
            "earned_badge_count": len(earned_keys),
        }
