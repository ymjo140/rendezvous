"""방문 후 재방문 의향 설문 — 개인 취향 + 모임 적합 2축.
'또 갈래요?'라는 진성 신호를 먼저 받고, 더 남길 사람에게만 별점·한 줄을 받는다.
트리거: 체크인 3시간 뒤. 예약은 오겠다는 의도일 뿐이라 안 온 사람에게 묻지 않는다."""
from datetime import date, datetime, timedelta
from typing import Optional
import numpy as np
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import text
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from services import feedback_service
from schemas.feedback import FeedbackRequest, ReviewRequest
from api.dependencies import get_current_user

router = APIRouter()

REGULARS_MIN = 3          # '단골' 배지 노출 최소 인원
LOOKALIKE_SIM = 0.5       # 나와 '취향 비슷' 판정 코사인 임계


def _cos(a, b) -> float:
    na = float(np.linalg.norm(a)); nb = float(np.linalg.norm(b))
    if na == 0 or nb == 0:
        return 0.0
    return float(np.dot(a, b) / (na * nb))


@router.get("/api/feedback/pending")
def pending_feedback(user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user is None:
        raise HTTPException(401, "로그인이 필요합니다.")
    return feedback_service.pending(db, user)


@router.post("/api/feedback")
def submit_feedback(req: FeedbackRequest, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user is None:
        raise HTTPException(401, "로그인이 필요합니다.")
    return feedback_service.submit(db, user, req)


@router.post("/api/feedback/review")
def submit_review(req: ReviewRequest, user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if user is None:
        raise HTTPException(401, "로그인이 필요합니다.")
    return feedback_service.review(db, user, req)


@router.get("/api/feedback/place/{place_id}")
def place_revisit_stats(place_id: int, db: Session = Depends(get_db)):
    """장소 재방문 의향 집계(배지용). '단골' 배지는 최소 3명 이상일 때만."""
    rows, visible = feedback_service.latest_answers(db, place_id)
    personal_yes = sum(r[1] is True for r in rows)
    group_yes = sum(r[2] is True and r[3] in visible for r in rows)
    return {
        "total": len(rows),
        "personal_revisit_yes": personal_yes,
        "group_revisit_yes": group_yes,
        "personal_regulars": personal_yes if personal_yes >= 3 else 0,  # 배지 노출용
        "group_regulars": group_yes if group_yes >= 3 else 0,
    }


@router.get("/api/feedback/place/{place_id}/badges")
def place_badges(
    place_id: int,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """장소 상세 신뢰 배지 2종.
    · 개인축: 나와 취향 비슷한(lookalike) 재방문자 수(개인화). 로그인·임베딩 있을 때.
      개인화가 3명 미만이면 전체 재방문 '예' 수로 폴백.
    · 모임축: 모임 장소로 '또 추천'한 팀 수(group_revisit=yes)."""
    rows, visible = feedback_service.latest_answers(db, place_id)
    my_id = user.id if user else None
    personal_uids = [r[0] for r in rows if r[1] is True and r[0] != my_id]
    group_yes = sum(r[2] is True and r[3] in visible for r in rows)

    result = {"personal": None, "group": None}

    # --- 개인축: 나와 취향 비슷한 재방문자 ---
    personalized = None
    if my_id and personal_uids:
        try:
            mine = (
                db.query(models.UserEmbedding)
                .filter(models.UserEmbedding.user_id == my_id)
                .first()
            )
            if mine is not None and mine.preference_embedding is not None:
                mv = np.asarray(mine.preference_embedding, dtype=float)
                voter_embs = (
                    db.query(models.UserEmbedding)
                    .filter(models.UserEmbedding.user_id.in_(personal_uids))
                    .all()
                )
                personalized = sum(
                    1
                    for ve in voter_embs
                    if ve.preference_embedding is not None
                    and _cos(mv, np.asarray(ve.preference_embedding, dtype=float)) >= LOOKALIKE_SIM
                )
        except Exception as ex:
            print(f"[badges] 개인화 실패(폴백): {str(ex)[:60]}")

    total_personal = len(personal_uids)
    if personalized is not None and personalized >= REGULARS_MIN:
        result["personal"] = {
            "count": personalized, "personalized": True,
            "text": f"나와 취향 비슷한 {personalized}명이 또 오고 싶어해요",
        }
    elif total_personal >= REGULARS_MIN:
        result["personal"] = {
            "count": total_personal, "personalized": False,
            "text": f"{total_personal}명이 또 오고 싶어해요",
        }

    # --- 모임축 ---
    if group_yes >= REGULARS_MIN:
        result["group"] = {"count": group_yes, "text": f"모임 장소로 {group_yes}명이 추천했어요"}

    return result


# (SQL, 가중치, 라벨) — created_at + place_id 있는 관여 신호. 별점 아닌 실제 행동.
_TREND_SOURCES = [
    ("select place_id, count(*) c from user_reservations where created_at >= :s and created_at < :u and place_id is not null group by place_id", 3, "예약"),
    ("select place_id, count(*) c from place_visit_feedback where created_at >= :s and created_at < :u and personal_revisit = true and place_id is not null group by place_id", 3, "재방문"),
    ("select place_id, count(*) c from saved_items where created_at >= :s and created_at < :u and place_id is not null group by place_id", 2, "저장"),
    ("select place_id, count(*) c from posts where created_at >= :s and created_at < :u and place_id is not null group by place_id", 2, "게시물"),
]


@router.get("/api/trending/places")
def trending_places(days: int = 7, limit: int = 10, db: Session = Depends(get_db)):
    """실시간 급상승 장소 — 최근 N일 관여(예약·재방문·저장·게시물) 가중합 순위 +
    직전 동일기간 대비 순위 변동(▲/NEW). 앱 안에서 실제로 쌓이는 정직한 신호."""
    now = datetime.now()
    cutoff = now - timedelta(days=days)
    prev_cutoff = now - timedelta(days=days * 2)

    def collect(since, until):
        agg = {}  # pid -> {"score": x, "q": {label: count}}
        for sql, w, label in _TREND_SOURCES:
            try:
                for pid, c in db.execute(text(sql), {"s": since, "u": until}):
                    if pid is None:
                        continue
                    a = agg.setdefault(int(pid), {"score": 0, "q": {}})
                    a["score"] += int(c) * w
                    a["q"][label] = a["q"].get(label, 0) + int(c)
            except Exception as ex:
                print(f"[trending] source skip: {str(ex)[:60]}")
                db.rollback()
        return agg

    cur = collect(cutoff, now)
    prev = collect(prev_cutoff, cutoff)

    ranked = sorted(cur.items(), key=lambda kv: kv[1]["score"], reverse=True)[:limit]
    prev_order = [pid for pid, _ in sorted(prev.items(), key=lambda kv: kv[1]["score"], reverse=True)]
    prev_rank = {pid: i for i, pid in enumerate(prev_order)}

    pids = [pid for pid, _ in ranked]
    names = {}
    if pids:
        names = {p.id: p.name for p in db.query(models.Place).filter(models.Place.id.in_(pids)).all()}

    items = []
    for i, (pid, data) in enumerate(ranked):
        top_label, top_cnt = max(data["q"].items(), key=lambda x: x[1]) if data["q"] else ("관심", 0)
        if pid not in prev_rank:
            move = {"type": "new", "delta": 0}
        else:
            delta = prev_rank[pid] - i  # +면 상승
            move = {"type": ("up" if delta > 0 else "down" if delta < 0 else "same"), "delta": abs(delta)}
        items.append({
            "rank": i + 1,
            "place_id": pid,
            "name": names.get(pid, "장소"),
            "signal": f"{top_label} +{top_cnt}",
            "move": move,
        })
    return {"days": days, "count": len(items), "items": items}
