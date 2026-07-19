"""새 홈(발견 피드) — 크루·리스트 중심 홈의 데이터 공급.

한 번의 호출로 홈 전체 섹션을 내려준다 (비로그인도 동작, 취향 매칭만 빠짐):
- taste_matched: 나와 입맛 겹치는 공개 리스트 (유저 취향 centroid ↔ 리스트 centroid 코사인)
- my_crews: 내가 속한 크루(communities) + 크루 리스트 수
- crew_suggestions: 가입 유도용 공개 크루 추천
- racks: 맥락 태그(context_tag)별 발견 랙
- trending: 인기 리스트 (좋아요·댓글 스코어)

용어: '크루' = 리스트를 함께 쌓는 지속적 취향 집단(= communities).
"""
from collections import Counter
from typing import Optional

import numpy as np
from fastapi import APIRouter, Depends
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from api.dependencies import get_current_user

router = APIRouter()

# 맥락 태그 체계(C 확정) — 발견 랙·검색·광고 타깃 공통 뼈대
CONTEXT_TAGS = [
    {"tag": "date",    "label": "데이트하기 좋은",   "emoji": "💕"},
    {"tag": "work",    "label": "회식 실패 없는",    "emoji": "🥂"},
    {"tag": "drink",   "label": "술 한잔 하기 좋은", "emoji": "🍶"},
    {"tag": "cafe",    "label": "카페·디저트 성지",  "emoji": "☕"},
    {"tag": "solo",    "label": "혼밥·혼술 환영",    "emoji": "🍚"},
    {"tag": "friends", "label": "친구랑 가기 좋은",  "emoji": "🍻"},
    {"tag": "family",  "label": "가족 외식으로",     "emoji": "🍲"},
    {"tag": "special", "label": "기념일에 좋은",     "emoji": "🎂"},
]


def _area_of(addresses: list[str]) -> str:
    """주소들에서 최빈 '~구/~동' 토큰으로 리스트 대표 지역 추정."""
    tokens = []
    for a in addresses:
        if not a:
            continue
        for t in a.split()[:3]:
            if t.endswith(("구", "동", "읍", "면")) and len(t) >= 2:
                tokens.append(t)
                break
    if not tokens:
        return ""
    return Counter(tokens).most_common(1)[0][0]


def _folder_place_ids(db: Session, folder_ids: list[int]) -> dict[int, list[int]]:
    rows = (
        db.query(models.SavedItem.folder_id, models.SavedItem.place_id)
        .filter(models.SavedItem.folder_id.in_(folder_ids), models.SavedItem.place_id.isnot(None))
        .all()
    )
    out: dict[int, list[int]] = {}
    for fid, pid in rows:
        out.setdefault(fid, []).append(pid)
    return out


def _embeddings_for(db: Session, place_ids: list[int]) -> dict[int, np.ndarray]:
    if not place_ids:
        return {}
    rows = (
        db.query(models.PlaceEmbedding.place_id, models.PlaceEmbedding.embedding)
        .filter(models.PlaceEmbedding.place_id.in_(place_ids), models.PlaceEmbedding.embedding.isnot(None))
        .all()
    )
    return {pid: np.asarray(emb, dtype=float) for pid, emb in rows}


def _centroid(vecs: list[np.ndarray]) -> Optional[np.ndarray]:
    if not vecs:
        return None
    c = np.mean(vecs, axis=0)
    n = np.linalg.norm(c)
    return (c / n) if n else None


def _user_taste_centroid(db: Session, user_id: int) -> Optional[np.ndarray]:
    """유저 취향 = 저장 장소 + 재방문 의사 장소의 임베딩 평균."""
    saved = [
        r[0]
        for r in db.query(models.SavedItem.place_id)
        .filter(models.SavedItem.user_id == user_id, models.SavedItem.place_id.isnot(None))
        .limit(300)
        .all()
    ]
    revisit = [
        r[0]
        for r in db.query(models.PlaceVisitFeedback.place_id)
        .filter(models.PlaceVisitFeedback.user_id == user_id, models.PlaceVisitFeedback.personal_revisit == True)  # noqa: E712
        .limit(100)
        .all()
    ]
    ids = list({*saved, *revisit})
    if not ids:
        return None
    embs = _embeddings_for(db, ids)
    return _centroid(list(embs.values()))


@router.get("/api/home/feed")
def home_feed(
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    uid = user.id if user else None

    # ── 공개 리스트 후보 (담기 수 상위 위주로 제한해 임베딩 비용 억제) ──
    folders = (
        db.query(models.SaveFolder)
        .filter(models.SaveFolder.is_public == True, models.SaveFolder.item_count > 0)  # noqa: E712
        .all()
    )
    if uid:
        folders = [f for f in folders if f.user_id != uid]
    fids = [f.id for f in folders]

    saves_cnt: dict[int, int] = {}
    likes_cnt: dict[int, int] = {}
    cmts_cnt: dict[int, int] = {}
    if fids:
        saves_cnt = dict(
            db.query(models.ListSave.folder_id, func.count(models.ListSave.id))
            .filter(models.ListSave.folder_id.in_(fids)).group_by(models.ListSave.folder_id).all()
        )
        likes_cnt = dict(
            db.query(models.ListLike.folder_id, func.count(models.ListLike.id))
            .filter(models.ListLike.folder_id.in_(fids)).group_by(models.ListLike.folder_id).all()
        )
        cmts_cnt = dict(
            db.query(models.ListComment.folder_id, func.count(models.ListComment.id))
            .filter(models.ListComment.folder_id.in_(fids)).group_by(models.ListComment.folder_id).all()
        )

    # 후보 상한: 인기순 40개까지만 무겁게(centroid) 계산
    folders.sort(key=lambda f: (saves_cnt.get(f.id, 0), likes_cnt.get(f.id, 0)), reverse=True)
    heavy = folders[:40]
    heavy_ids = [f.id for f in heavy]

    fplaces = _folder_place_ids(db, heavy_ids)
    all_pids = list({p for pids in fplaces.values() for p in pids[:50]})
    embs = _embeddings_for(db, all_pids)

    # 장소 메타(지역·재방문) 일괄 조회
    addr_rows = (
        db.query(models.Place.id, models.Place.address)
        .filter(models.Place.id.in_(all_pids)).all()
    ) if all_pids else []
    addr = {pid: a for pid, a in addr_rows}
    revisit_rows = (
        db.query(models.PlaceVisitFeedback.place_id, func.count(func.distinct(models.PlaceVisitFeedback.user_id)))
        .filter(
            models.PlaceVisitFeedback.place_id.in_(all_pids),
            models.PlaceVisitFeedback.personal_revisit == True,  # noqa: E712
        )
        .group_by(models.PlaceVisitFeedback.place_id)
        .all()
    ) if all_pids else []
    revisit_by_place = dict(revisit_rows)

    # 소유자 표기: 크루(커뮤니티) 우선, 아니면 큐레이터(유저)
    comm_ids = list({f.community_id for f in heavy if f.community_id})
    comms = {c.id: c for c in db.query(models.Community).filter(models.Community.id.in_(comm_ids)).all()} if comm_ids else {}
    owner_ids = list({f.user_id for f in heavy})
    owners = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(owner_ids)).all()} if owner_ids else {}

    taste = _user_taste_centroid(db, uid) if uid else None

    def _list_card(f: models.SaveFolder) -> dict:
        pids = fplaces.get(f.id, [])[:50]
        vecs = [embs[p] for p in pids if p in embs]
        cen = _centroid(vecs)
        match = None
        if taste is not None and cen is not None:
            match = int(round(max(0.0, float(np.dot(taste, cen))) * 100))
        crew = comms.get(f.community_id) if f.community_id else None
        owner = owners.get(f.user_id)
        revisit = sum(revisit_by_place.get(p, 0) for p in pids)
        return {
            "folder_id": f.id,
            "name": f.name,
            "icon": f.icon or "📁",
            "description": f.description or "",
            "context_tag": getattr(f, "context_tag", None),
            "item_count": f.item_count or 0,
            "saves": int(saves_cnt.get(f.id, 0)),
            "revisit": int(revisit),
            "area": _area_of([addr.get(p) for p in pids]),
            "match": match,
            "by": (
                {"kind": "crew", "id": crew.id, "name": crew.title, "icon": crew.icon or "👥",
                 "members": len(crew.member_ids or [])}
                if crew
                else {"kind": "curator", "id": owner.id if owner else None,
                      "name": (owner.name if owner else "큐레이터"), "icon": (owner.avatar if owner else "🙂")}
            ),
        }

    cards = [_list_card(f) for f in heavy]

    # ── ① 취향 매칭: match 있으면 match순, 없으면(비로그인) 담기순 ──
    matched = sorted(
        cards, key=lambda c: ((c["match"] if c["match"] is not None else -1), c["saves"]), reverse=True
    )[:8]

    # ── ② 내 크루 + 크루 추천 ──
    my_crews, crew_suggestions = [], []
    communities = db.query(models.Community).all()
    crew_list_cnt: dict[str, int] = {}
    if communities:
        crew_list_cnt = dict(
            db.query(models.SaveFolder.community_id, func.count(models.SaveFolder.id))
            .filter(models.SaveFolder.community_id.isnot(None))
            .group_by(models.SaveFolder.community_id)
            .all()
        )
    for c in communities:
        members = c.member_ids or []
        entry = {
            "id": c.id, "title": c.title, "icon": c.icon or "👥",
            "members": len(members), "lists": int(crew_list_cnt.get(c.id, 0)),
            "visibility": c.visibility or "private",
        }
        if uid and uid in members:
            my_crews.append(entry)
        elif (c.visibility or "private") in ("public", "open", "list_only") and entry["lists"] > 0:
            crew_suggestions.append(entry)
    crew_suggestions.sort(key=lambda e: (e["lists"], e["members"]), reverse=True)
    crew_suggestions = crew_suggestions[:6]

    # ── ③ 맥락 랙: 태그별 인기 리스트 ──
    racks = []
    for t in CONTEXT_TAGS:
        items = [c for c in cards if c["context_tag"] == t["tag"]]
        items.sort(key=lambda c: (c["saves"], c["revisit"]), reverse=True)
        if items:
            racks.append({**t, "items": items[:6]})

    # ── ④ 급상승: 좋아요x3 + 댓글x2 ──
    scored = sorted(
        cards,
        key=lambda c: (likes_cnt.get(c["folder_id"], 0) * 3 + cmts_cnt.get(c["folder_id"], 0) * 2, c["saves"]),
        reverse=True,
    )[:5]
    trending = [
        {**c, "rank": i + 1, "up": i < 2}
        for i, c in enumerate(scored)
    ]

    return {
        "taste_matched": matched,
        "my_crews": my_crews,
        "crew_suggestions": crew_suggestions,
        "racks": racks,
        "trending": trending,
        "context_tags": CONTEXT_TAGS,
        "logged_in": bool(uid),
        "has_taste": taste is not None,
    }
