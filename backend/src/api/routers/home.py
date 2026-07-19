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
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from api.dependencies import get_current_user

router = APIRouter()

VALID_CONTEXT_TAGS = {"date", "work", "friends", "solo", "cafe", "drink", "family", "special"}
VALID_VISIBILITY = {"private", "list_only", "public", "open"}

# 음식 필터 키워드 — 리스트 안 장소들의 cuisine/category 문자열 매칭
FOOD_KEYWORDS = {
    "한식": ["한식", "국밥", "찌개", "고기", "한정식", "백반", "냉면", "삼겹"],
    "일식": ["일식", "초밥", "스시", "라멘", "돈카츠", "우동", "오마카세"],
    "양식": ["양식", "파스타", "피자", "스테이크", "버거", "브런치"],
    "중식": ["중식", "중국", "마라", "딤섬", "짜장", "양꼬치"],
    "카페": ["카페", "커피", "디저트", "케이크"],
    "빵": ["빵", "베이커리", "베이글", "도넛", "크루아상"],
    "술집": ["술집", "주점", "포차", "바", "펍", "호프", "와인", "맥주", "이자카야"],
    "분식": ["분식", "떡볶이", "김밥", "만두", "튀김"],
}

# 맥락 태그 이름-힌트 — 저장된 context_tag가 없어도 리스트 이름/설명/장소 이름으로 추정 매칭.
# (크롤 cuisine이 오염돼 있어 장소 "이름"이 가장 정직한 신호: 스시·라멘·빵·펍 등)
TAG_NAME_HINTS = {
    "date": ["데이트", "커플", "분위기", "오마카세", "와인", "이탈리안", "파스타", "스시", "기념일", "야경"],
    "work": ["회식", "단체", "회사", "부장", "고기", "한정식", "삼겹"],
    "drink": ["술", "펍", "포차", "이자카야", "와인바", "칵테일", "맥주", "와인", "호프", "하이볼", "안주", "크롤"],
    "cafe": ["카페", "빵", "디저트", "커피", "베이커리", "브런치", "케이크", "순례"],
    "solo": ["혼밥", "혼술", "1인", "국밥", "라멘", "백반", "덮밥"],
    "friends": ["친구", "수다", "미식", "맛집 투어", "동네", "지도"],
    "family": ["가족", "부모님", "한정식", "상견례", "어르신"],
    "special": ["기념일", "오마카세", "파인다이닝", "스페셜", "생일", "축하"],
}

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

    # 내 크루 방문 히스토리·지출 — 분담 결제 완료 건(room_id=크루 id) 기준
    if my_crews:
        crew_ids = [e["id"] for e in my_crews]
        sp_rows = (
            db.query(models.ChatSplitRequest)
            .filter(
                models.ChatSplitRequest.room_id.in_(crew_ids),
                models.ChatSplitRequest.status == "completed",
            )
            .order_by(models.ChatSplitRequest.date.desc())
            .all()
        )
        by_room: dict[str, list] = {}
        for r in sp_rows:
            by_room.setdefault(r.room_id, []).append(r)
        for e in my_crews:
            rs = by_room.get(e["id"], [])
            e["visits"] = len(rs)
            e["spent"] = int(sum((r.total_amount or 0) for r in rs))
            e["recent"] = [
                {"place": r.place_name, "date": r.date or "", "amount": int(r.total_amount or 0), "party": int(r.party_size or 0)}
                for r in rs[:3]
            ]

    # ── ③ 맥락 랙: 태그별 인기 리스트 (저장 태그 + 이름/설명 힌트 매칭) ──
    racks = []
    used_in_rack: set = set()
    for t in CONTEXT_TAGS:
        hints = TAG_NAME_HINTS.get(t["tag"], [])
        items = [
            c for c in cards
            if c["folder_id"] not in used_in_rack and (
                c["context_tag"] == t["tag"]
                or any(h in f"{c['name']} {c['description']}" for h in hints)
            )
        ]
        items.sort(key=lambda c: (c["saves"], c["revisit"]), reverse=True)
        if items:
            racks.append({**t, "items": items[:6]})
            used_in_rack.update(c["folder_id"] for c in items[:6])

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


@router.post("/api/crews")
def create_crew(
    req: dict,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """크루 생성(경량) — 약속형 커뮤니티 생성과 달리 날짜/인원 없이
    제목+이모지+공개수준(+선택: 첫 공유 리스트)만으로 만든다.
    body: {title, icon?, visibility?, first_list?: {name, icon?, context_tag?}}
    """
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    title = (req.get("title") or "").strip()
    if not title:
        raise HTTPException(status_code=400, detail="크루 이름이 필요해요.")
    if len(title) > 30:
        raise HTTPException(status_code=400, detail="크루 이름은 30자 이내로 해주세요.")
    visibility = req.get("visibility") or "list_only"
    if visibility not in VALID_VISIBILITY:
        raise HTTPException(status_code=400, detail="공개 수준이 올바르지 않아요.")

    crew = models.Community(
        host_id=user.id,
        title=title,
        category="크루",
        location="",
        date_time="",
        max_members=0,
        description=(req.get("description") or "").strip()[:200],
        tags=[],
        member_ids=[user.id],
        visibility=visibility,
        icon=(req.get("icon") or "🍽️")[:8],
    )
    db.add(crew)
    db.flush()

    # 크루 채팅방(1:1 매칭 규약 유지 — 기존 커뮤니티 생성과 동일)
    db.add(models.ChatRoom(id=crew.id, title=f"[크루] {title}", is_group=True))
    db.add(models.ChatRoomMember(room_id=crew.id, user_id=user.id))

    first = req.get("first_list") or None
    folder_out = None
    if first and (first.get("name") or "").strip():
        tag = first.get("context_tag")
        if tag and tag not in VALID_CONTEXT_TAGS:
            tag = None
        folder = models.SaveFolder(
            user_id=user.id,
            community_id=crew.id,
            name=first["name"].strip()[:40],
            icon=(first.get("icon") or crew.icon or "📁")[:8],
            description=(first.get("description") or "").strip()[:200] or None,
            is_public=(visibility != "private"),
            is_default=False,
            context_tag=tag,
        )
        db.add(folder)
        db.flush()
        folder_out = {"id": folder.id, "name": folder.name, "context_tag": folder.context_tag}

    db.commit()
    return {
        "id": crew.id,
        "title": crew.title,
        "icon": crew.icon,
        "visibility": crew.visibility,
        "first_list": folder_out,
    }


@router.get("/api/home/search")
def home_search(
    q: Optional[str] = None,
    region: Optional[str] = None,
    tag: Optional[str] = None,
    tags: Optional[str] = None,       # 콤마 구분 다중 태그(OR) — tag보다 우선
    foods: Optional[str] = None,      # 콤마 구분 음식 필터(OR) — 장소 카테고리 매칭
    regions: Optional[str] = None,    # 콤마 구분 다중 지역(OR) — 장소 주소 매칭, region보다 우선
    sort: Optional[str] = None,       # match | saves | revisit (기본: 로그인+취향=match, 아니면 saves)
    verified: bool = False,           # 재방문 검증만(재방문 1명 이상)
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """리스트 단위 검색 — 필터 4축(지역·맥락·정렬·재방문 검증).
    검색의 기본 단위는 장소가 아니라 '믿을 무리가 만든 리스트'다."""
    uid = user.id if user else None
    tag_set = set()
    if tags:
        tag_set = {t.strip() for t in tags.split(",") if t.strip() in VALID_CONTEXT_TAGS}
    elif tag and tag in VALID_CONTEXT_TAGS:
        tag_set = {tag}
    food_set = {f.strip() for f in (foods or "").split(",") if f.strip() in FOOD_KEYWORDS}

    folders = (
        db.query(models.SaveFolder)
        .filter(models.SaveFolder.is_public == True, models.SaveFolder.item_count > 0)  # noqa: E712
        .all()
    )
    if uid:
        folders = [f for f in folders if f.user_id != uid]
    # (태그 필터는 장소 이름까지 봐야 해서 fplaces 확보 후로 이동)
    if q:
        ql = q.strip().lower()
        if ql:
            folders = [
                f for f in folders
                if ql in (f.name or "").lower() or ql in (f.description or "").lower()
            ]

    fids = [f.id for f in folders]
    saves_cnt = dict(
        db.query(models.ListSave.folder_id, func.count(models.ListSave.id))
        .filter(models.ListSave.folder_id.in_(fids)).group_by(models.ListSave.folder_id).all()
    ) if fids else {}

    # 지역 필터: 폴더 장소 주소에 지역명 포함 여부 (다중=OR, heavy 계산 전에 후보 축소)
    fplaces = _folder_place_ids(db, fids) if fids else {}

    # 장소 이름/카테고리 맵 — 태그·음식 필터 공용 (cuisine 오염 대비, 이름이 최고 신호)
    _all_pids = list({p for pids in fplaces.values() for p in pids})
    _meta_rows = (
        db.query(models.Place.id, models.Place.name, models.Place.cuisine_type, models.Place.category)
        .filter(models.Place.id.in_(_all_pids)).all()
    ) if _all_pids else []
    _pname = {pid: (nm or "") for pid, nm, _, _ in _meta_rows}
    _pcat = {pid: f"{ct or ''} {cat or ''}" for pid, _, ct, cat in _meta_rows}

    if tag_set:
        def _tag_pass(f) -> bool:
            if getattr(f, "context_tag", None) in tag_set:
                return True
            blob = f"{f.name or ''} {f.description or ''}"
            for t in tag_set:
                hints = TAG_NAME_HINTS.get(t, [])
                if any(h in blob for h in hints):
                    return True
                # 장소 이름 2곳 이상에서 힌트가 보이면 그 성격의 리스트로 간주
                cnt = sum(1 for p in fplaces.get(f.id, []) if any(h in _pname.get(p, "") for h in hints))
                if cnt >= 2:
                    return True
            return False
        folders = [f for f in folders if _tag_pass(f)]
    region_set = [r.strip() for r in (regions or "").split(",") if r.strip()]
    if not region_set and region and region.strip():
        region_set = [region.strip()]
    if region_set:
        all_pids = list({p for pids in fplaces.values() for p in pids})
        addr_rows = (
            db.query(models.Place.id, models.Place.address)
            .filter(models.Place.id.in_(all_pids)).all()
        ) if all_pids else []
        addr_map = {pid: (a or "") for pid, a in addr_rows}
        folders = [
            f for f in folders
            if any(rg in f"{f.name or ''} {f.description or ''}" for rg in region_set)
            or any(any(rg in addr_map.get(p, "") for rg in region_set) for p in fplaces.get(f.id, []))
        ]

    # 음식 필터: 장소 cuisine/category + "장소 이름" + 리스트 이름/설명까지 키워드 매칭
    if food_set:
        kws = [k for f in food_set for k in FOOD_KEYWORDS[f]]
        def _food_pass(f) -> bool:
            blob = f"{f.name or ''} {f.description or ''}"
            if any(k in blob for k in kws):
                return True
            return any(
                any(k in _pcat.get(p, "") or k in _pname.get(p, "") for k in kws)
                for p in fplaces.get(f.id, [])
            )
        folders = [f for f in folders if _food_pass(f)]

    folders.sort(key=lambda f: saves_cnt.get(f.id, 0), reverse=True)
    heavy = folders[:40]
    heavy_ids = [f.id for f in heavy]

    hplaces = {fid: fplaces.get(fid, []) for fid in heavy_ids}
    all_pids = list({p for pids in hplaces.values() for p in pids[:50]})
    embs = _embeddings_for(db, all_pids)
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

    comm_ids = list({f.community_id for f in heavy if f.community_id})
    comms = {c.id: c for c in db.query(models.Community).filter(models.Community.id.in_(comm_ids)).all()} if comm_ids else {}
    owner_ids = list({f.user_id for f in heavy})
    owners = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(owner_ids)).all()} if owner_ids else {}

    taste = _user_taste_centroid(db, uid) if uid else None

    items = []
    for f in heavy:
        pids = hplaces.get(f.id, [])[:50]
        vecs = [embs[p] for p in pids if p in embs]
        cen = _centroid(vecs)
        match = None
        if taste is not None and cen is not None:
            match = int(round(max(0.0, float(np.dot(taste, cen))) * 100))
        crew = comms.get(f.community_id) if f.community_id else None
        owner = owners.get(f.user_id)
        revisit = sum(revisit_by_place.get(p, 0) for p in pids)
        if verified and revisit < 1:
            continue
        items.append({
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
        })

    eff_sort = sort or ("match" if taste is not None else "saves")
    if eff_sort == "match":
        items.sort(key=lambda c: ((c["match"] if c["match"] is not None else -1), c["saves"]), reverse=True)
    elif eff_sort == "revisit":
        items.sort(key=lambda c: (c["revisit"], c["saves"]), reverse=True)
    else:
        items.sort(key=lambda c: (c["saves"], c["revisit"]), reverse=True)

    return {
        "items": items,
        "count": len(items),
        "filters": {"q": q or "", "regions": region_set, "tags": sorted(tag_set), "foods": sorted(food_set), "sort": eff_sort, "verified": verified},
        "context_tags": CONTEXT_TAGS,
    }


@router.get("/api/home/search-places")
def home_search_places(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius_km: float = 2.0,
    tags: Optional[str] = None,     # 목적(콤마 OR) — 이름/카테고리 힌트 매칭
    foods: Optional[str] = None,    # 음식(콤마 OR)
    q: Optional[str] = None,
    limit: int = 30,
    db: Session = Depends(get_db),
):
    """전체 장소 DB(12만+)에서 지역(좌표 반경)×목적×음식으로 음식점 검색.
    공개 리스트 검색(/api/home/search)과 별개로, 필터 결과의 본체."""
    from sqlalchemy import or_

    tag_set = {t.strip() for t in (tags or "").split(",") if t.strip() in VALID_CONTEXT_TAGS}
    food_set = {f.strip() for f in (foods or "").split(",") if f.strip() in FOOD_KEYWORDS}
    limit = max(1, min(int(limit or 30), 60))

    # 주의: 크롤 음식 대분류의 본체는 "FOOD"(10만+) — RESTAURANT만 보면 대부분 빠진다
    query = db.query(models.Place).filter(
        models.Place.main_category.in_(["FOOD", "RESTAURANT", "CAFE", "PUB"])
    )

    # 지역: 좌표 반경 bbox (기존 지역검색 /api/geocode 선택값과 연동)
    if lat is not None and lng is not None:
        import math
        dlat = radius_km / 111.0
        dlng = radius_km / (111.0 * max(0.2, math.cos(math.radians(lat))))
        query = query.filter(
            models.Place.lat.between(lat - dlat, lat + dlat),
            models.Place.lng.between(lng - dlng, lng + dlng),
        )

    # 음식: cuisine/category/이름 ILIKE (OR)
    if food_set:
        kws = [k for f in food_set for k in FOOD_KEYWORDS[f]]
        conds = []
        for k in kws:
            like = f"%{k}%"
            conds += [
                models.Place.cuisine_type.ilike(like),
                models.Place.category.ilike(like),
                models.Place.name.ilike(like),
            ]
        query = query.filter(or_(*conds))

    # 목적: 이름/카테고리 힌트 (OR)
    # 음식 필터와 병행 시엔 하드필터가 아니라 "정렬 부스트"로 (우동집 이름에 '데이트'가 없다고 떨구면 결과가 텅 빔)
    tag_hints = [h for t in tag_set for h in TAG_NAME_HINTS.get(t, [])]
    if tag_set and not food_set:
        conds = []
        for h in tag_hints:
            like = f"%{h}%"
            conds += [
                models.Place.name.ilike(like),
                models.Place.category.ilike(like),
                models.Place.cuisine_type.ilike(like),
            ]
        query = query.filter(or_(*conds))

    if q and q.strip():
        query = query.filter(models.Place.name.ilike(f"%{q.strip()}%"))

    rows = (
        query.order_by(models.Place.wemeet_rating.desc().nullslast(), models.Place.review_count.desc().nullslast())
        .limit(limit * 3)
        .all()
    )

    # 반경 정밀 컷 + 정렬
    import math as _m
    def _dist(p):
        if lat is None or lng is None or not p.lat or not p.lng:
            return None
        dx = (p.lng - lng) * 111.0 * _m.cos(_m.radians(lat))
        dy = (p.lat - lat) * 111.0
        return round(_m.sqrt(dx * dx + dy * dy), 2)

    def _tag_hit(p) -> bool:
        if not tag_hints:
            return False
        blob = f"{p.name or ''} {p.category or ''} {p.cuisine_type or ''}"
        return any(h in blob for h in tag_hints)

    items = []
    for p in rows:
        d = _dist(p)
        if d is not None and d > radius_km:
            continue
        items.append({
            "tag_match": _tag_hit(p),
            "id": p.id,
            "name": p.name,
            "cuisine": p.cuisine_type or "",
            "category": p.category or "",
            "address": p.address or "",
            "rating": float(p.wemeet_rating or 0),
            "review_count": int(p.review_count or 0),
            "image": getattr(p, "hero_image", None) or getattr(p, "image_url", None),
            "dist_km": d,
        })
    # 목적 힌트 맞는 곳 우선, 그 안에서 평점·리뷰순
    items.sort(key=lambda x: (x["tag_match"], x["rating"], x["review_count"]), reverse=True)
    items = items[:limit]

    return {"items": items, "count": len(items)}


@router.post("/api/crews/{cid}/join")
def join_crew(
    cid: str,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """크루 합류 — 초대 링크 전용(링크를 안다 = 초대받았다). 멱등.
    비공개 크루도 링크 소지자는 합류 가능(카톡으로 멤버가 직접 보낸 링크라서)."""
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    crew = db.query(models.Community).filter(models.Community.id == cid).first()
    if not crew:
        raise HTTPException(status_code=404, detail="크루를 찾을 수 없어요.")

    members = list(crew.member_ids or [])
    already = user.id in members
    if not already:
        members.append(user.id)
        crew.member_ids = members
        try:
            from sqlalchemy.orm.attributes import flag_modified
            flag_modified(crew, "member_ids")
        except Exception:
            pass
        # 크루 채팅방 멤버로도 추가 (방 id = 크루 id 규약)
        exists = (
            db.query(models.ChatRoomMember)
            .filter(models.ChatRoomMember.room_id == cid, models.ChatRoomMember.user_id == user.id)
            .first()
        )
        if not exists:
            db.add(models.ChatRoomMember(room_id=cid, user_id=user.id))
        db.commit()

    return {
        "id": crew.id,
        "title": crew.title,
        "icon": crew.icon or "👥",
        "member_count": len(members),
        "joined": True,
        "already_member": already,
    }
