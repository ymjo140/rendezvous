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
from datetime import datetime
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
VALID_CREW_TYPES = {"friends", "university", "company", "community"}
# 인증이 필요한 크루 종류 → 인증 kind
CREW_TYPE_VERIFY = {"university": "university", "company": "company"}

# 주요 대학 도메인 → 표시명 (그 외 .ac.kr은 도메인 그대로 표시)
UNIV_NAMES = {
    "korea.ac.kr": "고려대학교", "snu.ac.kr": "서울대학교", "yonsei.ac.kr": "연세대학교",
    "kaist.ac.kr": "KAIST", "postech.ac.kr": "POSTECH", "hanyang.ac.kr": "한양대학교",
    "skku.edu": "성균관대학교", "sogang.ac.kr": "서강대학교", "cau.ac.kr": "중앙대학교",
    "khu.ac.kr": "경희대학교", "hufs.ac.kr": "한국외국어대학교", "uos.ac.kr": "서울시립대학교",
    "konkuk.ac.kr": "건국대학교", "dongguk.edu": "동국대학교", "hongik.ac.kr": "홍익대학교",
    "ewha.ac.kr": "이화여자대학교", "sookmyung.ac.kr": "숙명여자대학교", "inha.ac.kr": "인하대학교",
    "ajou.ac.kr": "아주대학교", "pusan.ac.kr": "부산대학교", "knu.ac.kr": "경북대학교",
    "jnu.ac.kr": "전남대학교", "cnu.ac.kr": "충남대학교", "kku.ac.kr": "건국대학교(글로컬)",
}
# 회사 인증에서 거부할 무료 메일
FREE_MAIL = {"gmail.com", "naver.com", "daum.net", "kakao.com", "hanmail.net", "nate.com",
             "outlook.com", "hotmail.com", "yahoo.com", "icloud.com", "proton.me"}

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
            "crew_type": getattr(c, "crew_type", None) or "friends",
            "org_name": getattr(c, "org_name", None),
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
            # 방문 = 통합 집계(체크인·피드백 포함), 지출은 실제 결제만
            e["visits"] = _crew_visits(db, e["id"])
            e["spent"] = int(sum((r.total_amount or 0) for r in rs))
            e["recent"] = [
                {"place": r.place_name, "date": r.date or "", "amount": int(r.total_amount or 0), "party": int(r.party_size or 0)}
                for r in rs[:3]
            ]

    # 크루별 제휴 배지 — 느낌표(안읽은 제안·승인)와 상태 한 줄
    if my_crews:
        crew_ids = [e["id"] for e in my_crews]
        p_rows = (
            db.query(models.CrewPartnershipApp)
            .filter(models.CrewPartnershipApp.community_id.in_(crew_ids))
            .all()
        )
        by_crew_apps: dict[str, list] = {}
        for r in p_rows:
            by_crew_apps.setdefault(r.community_id, []).append(r)
        for e in my_crews:
            rows = by_crew_apps.get(e["id"], [])
            invites = [r for r in rows if _direction(r) == "store_invite" and r.status == "pending"]
            approved = [r for r in rows if r.status == "approved"]
            pending = [r for r in rows if _direction(r) == "crew_apply" and r.status == "pending"]
            # 느낌표 = 아직 안 본 '받은 제안' 또는 '승인된 제휴'
            unread = any(getattr(r, "seen_at", None) is None for r in invites + approved)
            e["partnership"] = {
                "invites": len(invites),
                "active": len(approved),
                "pending": len(pending),
                "unread": bool(unread),
            }

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

    crew_type = req.get("crew_type") or "friends"
    if crew_type not in VALID_CREW_TYPES:
        raise HTTPException(status_code=400, detail="크루 종류가 올바르지 않아요.")
    org_domain = None
    org_name = None
    if crew_type in CREW_TYPE_VERIFY:
        # 인증 크루는 개설자가 해당 소속 인증을 갖고 있어야 하고, 크루에 도메인이 박힌다
        v = _user_verified_domain(db, user.id, CREW_TYPE_VERIFY[crew_type])
        if not v:
            raise HTTPException(
                status_code=403,
                detail={"code": "verify_required", "kind": CREW_TYPE_VERIFY[crew_type]},
            )
        org_domain = v.domain
        org_name = v.org_name

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
        crew_type=crew_type,
        org_domain=org_domain,
        org_name=org_name,
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
        "crew_type": crew_type,
        "org_name": org_name,
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

    # 인증 크루(대학/회사)는 같은 소속 인증이 있어야 합류 가능
    ctype = getattr(crew, "crew_type", None) or "friends"
    if ctype in CREW_TYPE_VERIFY and getattr(crew, "org_domain", None):
        v = _user_verified_domain(db, user.id, CREW_TYPE_VERIFY[ctype])
        if not v or v.domain != crew.org_domain:
            raise HTTPException(
                status_code=403,
                detail={
                    "code": "verify_required",
                    "kind": CREW_TYPE_VERIFY[ctype],
                    "domain": crew.org_domain,
                    "org_name": getattr(crew, "org_name", None) or crew.org_domain,
                },
            )

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


# ─────────────────────────────────────────────────────────────
# 소속 인증 (이메일 도메인) — 대학(.ac.kr/.edu) / 회사(무료메일 차단)
# SMTP 미설정 시 dev 모드: 응답에 dev_code 포함(베타용). SMTP_* env 넣으면 실메일 발송.
# ─────────────────────────────────────────────────────────────

def _org_name_for(kind: str, domain: str) -> str:
    if kind == "university":
        return UNIV_NAMES.get(domain, domain)
    return domain


def _send_verify_email(to_email: str, code: str) -> bool:
    """SMTP env가 있으면 발송, 없으면 False(dev 모드)."""
    import os
    host = os.getenv("SMTP_HOST")
    if not host:
        return False
    try:
        import smtplib
        from email.mime.text import MIMEText
        port = int(os.getenv("SMTP_PORT", "587"))
        user_ = os.getenv("SMTP_USER", "")
        pw = os.getenv("SMTP_PASS", "")
        sender = os.getenv("SMTP_FROM", user_)
        msg = MIMEText(f"랑데부 소속 인증 코드: {code}\n10분 안에 입력해주세요.")
        msg["Subject"] = f"[랑데부] 인증 코드 {code}"
        msg["From"] = sender
        msg["To"] = to_email
        with smtplib.SMTP(host, port, timeout=10) as sv:
            sv.starttls()
            if user_:
                sv.login(user_, pw)
            sv.sendmail(sender, [to_email], msg.as_string())
        return True
    except Exception as e:
        print(f"[verify] SMTP send failed: {e}")
        return False


@router.post("/api/verify/email/request")
def verify_email_request(
    req: dict,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """인증 코드 요청. body: {kind: university|company, email}"""
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    kind = req.get("kind")
    email = (req.get("email") or "").strip().lower()
    if kind not in ("university", "company"):
        raise HTTPException(status_code=400, detail="인증 종류가 올바르지 않아요.")
    if "@" not in email or "." not in email.split("@")[-1]:
        raise HTTPException(status_code=400, detail="이메일 형식이 올바르지 않아요.")
    domain = email.split("@")[-1]

    if kind == "university":
        if not (domain.endswith(".ac.kr") or domain.endswith(".edu") or domain in UNIV_NAMES):
            raise HTTPException(status_code=400, detail="학교 이메일(@OO.ac.kr)로만 인증할 수 있어요.")
    else:  # company
        if domain in FREE_MAIL or domain.endswith(".ac.kr"):
            raise HTTPException(status_code=400, detail="회사 이메일로만 인증할 수 있어요. (개인 메일 불가)")

    import random
    from datetime import timedelta
    code = f"{random.randint(0, 999999):06d}"

    # 기존 pending 정리 후 새로 발급
    db.query(models.UserVerification).filter(
        models.UserVerification.user_id == user.id,
        models.UserVerification.kind == kind,
        models.UserVerification.status == "pending",
    ).delete()
    v = models.UserVerification(
        user_id=user.id, kind=kind, email=email, domain=domain,
        org_name=_org_name_for(kind, domain), code=code,
        status="pending", expires_at=datetime.now() + timedelta(minutes=10),
    )
    db.add(v)
    db.commit()

    sent = _send_verify_email(email, code)
    out = {"requested": True, "email": email, "domain": domain, "org_name": v.org_name, "sent": sent}
    if not sent:
        # ⚠️ dev 모드(베타): SMTP 미설정이라 코드를 응답으로 반환. 정식 오픈 전 SMTP_* env 필수.
        out["dev_code"] = code
    return out


@router.post("/api/verify/email/confirm")
def verify_email_confirm(
    req: dict,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """코드 확인. body: {kind, code}"""
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    kind = req.get("kind")
    code = (req.get("code") or "").strip()
    v = (
        db.query(models.UserVerification)
        .filter(
            models.UserVerification.user_id == user.id,
            models.UserVerification.kind == kind,
            models.UserVerification.status == "pending",
        )
        .order_by(models.UserVerification.id.desc())
        .first()
    )
    if not v:
        raise HTTPException(status_code=404, detail="진행 중인 인증이 없어요. 다시 요청해주세요.")
    if v.expires_at and v.expires_at < datetime.now():
        raise HTTPException(status_code=400, detail="코드가 만료됐어요. 다시 요청해주세요.")
    if v.code != code:
        raise HTTPException(status_code=400, detail="코드가 일치하지 않아요.")

    v.status = "verified"
    v.verified_at = datetime.now()
    v.code = None
    db.commit()
    return {"verified": True, "kind": v.kind, "domain": v.domain, "org_name": v.org_name}


@router.get("/api/verify/me")
def verify_me(
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """내 인증 현황 — 크루 생성/합류 화면에서 사용."""
    if user is None:
        return {"verifications": []}
    rows = (
        db.query(models.UserVerification)
        .filter(models.UserVerification.user_id == user.id, models.UserVerification.status == "verified")
        .all()
    )
    return {
        "verifications": [
            {"kind": r.kind, "domain": r.domain, "org_name": r.org_name, "email": r.email}
            for r in rows
        ]
    }


def _user_verified_domain(db: Session, user_id: int, kind: str) -> Optional[models.UserVerification]:
    return (
        db.query(models.UserVerification)
        .filter(
            models.UserVerification.user_id == user_id,
            models.UserVerification.kind == kind,
            models.UserVerification.status == "verified",
        )
        .order_by(models.UserVerification.id.desc())
        .first()
    )


# ─────────────────────────────────────────────────────────────
# 🤝 크루 제휴 딜 (B2C) — 자격 크루가 딜을 탐색·신청
# ─────────────────────────────────────────────────────────────

@router.get("/api/home/hot-deals")
def home_hot_deals(
    lat: float = 37.5665,
    lng: float = 126.978,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """🔥 핫딜 — 지금 빈자리가 있는 가게를 '내 취향'과 '우리 크루 취향'으로 정렬.

    공실은 사장님에겐 손실, 손님에겐 기회다. 거리순으로만 뿌리면 광고지가 되니
    ① 우리 크루가 다녀온 곳 ② 제휴 중인 곳 ③ 취향 매칭 순으로 이유를 붙여 내보낸다.
    """
    from sqlalchemy import text as _t

    rows = db.execute(_t("""
        SELECT p.id, p.name, COALESCE(p.cuisine_type, p.category), p.address, p.hero_image,
               (6371 * acos(LEAST(1, cos(radians(:lat)) * cos(radians(p.lat))
                    * cos(radians(p.lng) - radians(:lng))
                    + sin(radians(:lat)) * sin(radians(p.lat))))) AS dist_km,
               EXTRACT(EPOCH FROM (p.vacancy_until - NOW()))/60 AS remain_min,
               (SELECT COUNT(*) FROM store_tables t WHERE t.place_id = p.id AND t.status = 'empty') AS empty_tables,
               (SELECT COALESCE(SUM(t.capacity),0) FROM store_tables t WHERE t.place_id = p.id AND t.status = 'empty') AS empty_seats,
               (SELECT MAX(t.deal_percent) FROM store_tables t WHERE t.place_id = p.id AND t.status = 'empty') AS best_deal
        FROM places p
        WHERE p.vacancy_until IS NOT NULL AND p.vacancy_until > NOW()
        ORDER BY dist_km ASC
        LIMIT 30
    """), {"lat": lat, "lng": lng}).fetchall()

    if not rows:
        return {"items": [], "count": 0, "logged_in": user is not None}

    pids = [r[0] for r in rows]
    uid = user.id if user else None

    # 내 취향 / 크루 취향 centroid
    taste = _user_taste_centroid(db, uid) if uid else None
    my_crews = []
    crew_taste = None
    crew_visited: dict[int, tuple[str, int]] = {}   # place_id → (크루명, 방문수)
    if uid:
        for c in db.query(models.Community).all():
            members = list(dict.fromkeys(([c.host_id] if c.host_id else []) + list(c.member_ids or [])))
            if uid in members:
                my_crews.append(c)
        crew_ids = [c.id for c in my_crews]
        if crew_ids:
            # 크루 리스트에 담긴 장소 = 크루 취향
            folders = (
                db.query(models.SaveFolder)
                .filter(models.SaveFolder.community_id.in_(crew_ids)).all()
            )
            fpids = _folder_place_ids(db, [f.id for f in folders])
            crew_pids = list({p for v in fpids.values() for p in v[:50]})
            if crew_pids:
                cembs = _embeddings_for(db, crew_pids)
                crew_taste = _centroid(list(cembs.values()))
            # 크루가 실제로 다녀온 곳 — 가장 강한 신호
            titles = {c.id: c.title for c in my_crews}
            for r in (
                db.query(models.ChatSplitRequest)
                .filter(models.ChatSplitRequest.room_id.in_(crew_ids),
                        models.ChatSplitRequest.status == "completed",
                        models.ChatSplitRequest.place_id.in_(pids)).all()
            ):
                name, n = crew_visited.get(r.place_id, (titles.get(r.room_id, "우리 크루"), 0))
                crew_visited[r.place_id] = (name, n + 1)
            try:
                for c in (
                    db.query(models.PlaceCheckin)
                    .filter(models.PlaceCheckin.community_id.in_(crew_ids),
                            models.PlaceCheckin.place_id.in_(pids)).all()
                ):
                    name, n = crew_visited.get(c.place_id, (titles.get(c.community_id, "우리 크루"), 0))
                    crew_visited[c.place_id] = (name, n + 1)
            except Exception:
                pass

    # 우리 크루가 제휴 중인 가게
    partnered: dict[int, str] = {}
    if my_crews:
        crew_ids = [c.id for c in my_crews]
        apps = (
            db.query(models.CrewPartnershipApp)
            .filter(models.CrewPartnershipApp.community_id.in_(crew_ids),
                    models.CrewPartnershipApp.status == "approved").all()
        )
        if apps:
            deals = {
                d.id: d for d in db.query(models.CrewPartnership)
                .filter(models.CrewPartnership.id.in_([a.partnership_id for a in apps]),
                        models.CrewPartnership.status == "active").all()
            }
            for a in apps:
                d = deals.get(a.partnership_id)
                if d and d.place_id in pids:
                    partnered[d.place_id] = d.benefit

    embs = _embeddings_for(db, pids) if (taste is not None or crew_taste is not None) else {}

    items = []
    for r in rows:
        pid = r[0]
        emb = embs.get(pid)
        match = int(round(max(0.0, float(np.dot(taste, emb))) * 100)) if (taste is not None and emb is not None) else None
        cmatch = int(round(max(0.0, float(np.dot(crew_taste, emb))) * 100)) if (crew_taste is not None and emb is not None) else None

        visited = crew_visited.get(pid)
        benefit = partnered.get(pid)
        best_deal = int(r[9]) if r[9] else None

        # 이유 — 강한 연고부터
        if visited:
            reason, kind = f"{visited[0]}가 {visited[1]}번 간 곳", "crew_visit"
        elif benefit:
            reason, kind = f"제휴 혜택 · {benefit}", "partner"
        elif cmatch is not None and cmatch >= 55:
            reason, kind = f"우리 크루 취향과 {cmatch}% 맞아요", "crew_taste"
        elif match is not None and match >= 55:
            reason, kind = f"내 입맛과 {match}% 맞아요", "taste"
        else:
            reason, kind = "지금 자리 있어요", "vacancy"

        items.append({
            "place_id": pid,
            "name": r[1],
            "category": r[2] or "",
            "address": r[3] or "",
            "image": r[4],
            "dist_km": round(float(r[5] or 0), 1),
            "remain_min": max(0, int(r[6] or 0)),
            "empty_tables": int(r[7] or 0),
            "empty_seats": int(r[8] or 0),
            "best_deal": best_deal,
            "match": match,
            "crew_match": cmatch,
            "reason": reason,
            "reason_kind": kind,
            "benefit": benefit,
        })

    # 연고 > 제휴 > 할인폭 > 취향 > 거리
    rank = {"crew_visit": 4, "partner": 3, "crew_taste": 2, "taste": 1, "vacancy": 0}
    items.sort(key=lambda x: (
        rank[x["reason_kind"]],
        x["best_deal"] or 0,
        max(x["crew_match"] or 0, x["match"] or 0),
        -x["dist_km"],
    ), reverse=True)

    return {"items": items[:12], "count": len(items), "logged_in": user is not None}


def _crew_visit_stats(db: Session, community_id: str) -> dict:
    """크루의 '함께 방문' 통합 집계.

    한 가지 소스(분담결제)만 세면 그냥 밥만 먹고 온 모임은 영원히 실적이 0이라
    세 가지 증거를 모두 인정한다. 같은 가게·같은 날은 어느 경로든 1회로 친다.
      · 분담결제 완료 — 가장 강한 증거(돈이 오감)
      · QR 체크인 — 크루를 지정한 현장 방문
      · 모임 방문 피드백 — 방문 후 '또 갈래요?' 응답
    """
    keys: set = set()          # (place_id or 이름, 날짜) — 중복 제거 키
    by_source = {"split": 0, "checkin": 0, "feedback": 0}
    amount = 0

    for r in (
        db.query(models.ChatSplitRequest)
        .filter(models.ChatSplitRequest.room_id == community_id,
                models.ChatSplitRequest.status == "completed").all()
    ):
        keys.add((r.place_id or r.place_name or "", r.date or ""))
        by_source["split"] += 1
        amount += int(r.total_amount or 0)

    try:
        for c in (
            db.query(models.PlaceCheckin)
            .filter(models.PlaceCheckin.community_id == community_id).all()
        ):
            keys.add((c.place_id, c.date or ""))
            by_source["checkin"] += 1
    except Exception:
        pass  # 테이블 생성 전에도 죽지 않게

    for f in (
        db.query(models.PlaceVisitFeedback)
        .filter(models.PlaceVisitFeedback.room_id == community_id).all()
    ):
        keys.add((f.place_id, f.created_at.strftime("%Y-%m-%d") if f.created_at else ""))
        by_source["feedback"] += 1

    return {"visits": len(keys), "amount": amount, "by_source": by_source}


def _crew_visits(db: Session, community_id: str) -> int:
    return _crew_visit_stats(db, community_id)["visits"]


@router.get("/api/checkin/{place_id}")
def checkin_context(
    place_id: int,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """QR 스캔 직후 화면 — 가게 정보 + 체크인할 내 크루 목록 + 오늘 이미 찍었는지."""
    place = db.query(models.Place).filter(models.Place.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="가게를 찾을 수 없어요.")
    out = {
        "place": {
            "id": place.id, "name": place.name,
            "category": place.cuisine_type or place.category or "",
            "address": place.address or "",
        },
        "logged_in": user is not None,
        "crews": [],
        "today": [],
    }
    if user is None:
        return out

    today = datetime.now().strftime("%Y-%m-%d")
    done = set()
    try:
        done = {
            c.community_id for c in db.query(models.PlaceCheckin).filter(
                models.PlaceCheckin.place_id == place_id,
                models.PlaceCheckin.user_id == user.id,
                models.PlaceCheckin.date == today,
            ).all()
        }
    except Exception:
        pass

    for c in db.query(models.Community).all():
        members = list(dict.fromkeys(([c.host_id] if c.host_id else []) + list(c.member_ids or [])))
        if user.id not in members:
            continue
        st = _crew_visit_stats(db, c.id)
        out["crews"].append({
            "id": c.id, "title": c.title, "icon": c.icon or "👥",
            "members": len(members),
            "visits": st["visits"],
            "checked_today": c.id in done,
        })
    out["crews"].sort(key=lambda x: x["visits"], reverse=True)
    out["today"] = sorted(x for x in done if x)
    return out


@router.post("/api/checkin")
def create_checkin(
    req: dict,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """방문 체크인 — 크루를 지정하면 그 크루의 '함께 방문'으로 쌓인다."""
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    place_id = req.get("place_id")
    if not place_id:
        raise HTTPException(status_code=400, detail="가게 정보가 없어요.")
    place = db.query(models.Place).filter(models.Place.id == int(place_id)).first()
    if not place:
        raise HTTPException(status_code=404, detail="가게를 찾을 수 없어요.")

    community_id = req.get("community_id") or None
    if community_id:
        crew = db.query(models.Community).filter(models.Community.id == str(community_id)).first()
        if not crew:
            raise HTTPException(status_code=404, detail="크루를 찾을 수 없어요.")
        members = list(dict.fromkeys(([crew.host_id] if crew.host_id else []) + list(crew.member_ids or [])))
        if user.id not in members:
            raise HTTPException(status_code=403, detail="크루 멤버만 체크인할 수 있어요.")

    today = datetime.now().strftime("%Y-%m-%d")
    dup = (
        db.query(models.PlaceCheckin)
        .filter(
            models.PlaceCheckin.place_id == place.id,
            models.PlaceCheckin.user_id == user.id,
            models.PlaceCheckin.community_id == community_id,
            models.PlaceCheckin.date == today,
        ).first()
    )
    if dup:
        stats = _crew_visit_stats(db, community_id) if community_id else {"visits": 0}
        return {"id": dup.id, "already": True, "crew_visits": stats["visits"]}

    row = models.PlaceCheckin(
        place_id=place.id, user_id=user.id, community_id=community_id,
        party_size=int(req.get("party_size") or 1), date=today,
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    result = {"id": row.id, "already": False, "crew_visits": 0, "eligible_now": False}
    if community_id:
        crew = db.query(models.Community).filter(models.Community.id == str(community_id)).first()
        stats = _crew_visit_stats(db, community_id)
        result["crew_visits"] = stats["visits"]
        if crew is not None:
            result["eligible_now"] = _crew_eligibility(db, crew)["eligible"]
    return result


def _crew_eligibility(db: Session, crew: models.Community) -> dict:
    """제휴 자격 판정 — org(소속 인증) or activity(멤버 3+ & 함께 방문 3회+)."""
    members = list(dict.fromkeys(([crew.host_id] if crew.host_id else []) + list(crew.member_ids or [])))
    org_domain = getattr(crew, "org_domain", None)
    visits = _crew_visits(db, crew.id)   # 분담결제 + 체크인 + 방문 피드백 통합
    eligible = bool(org_domain) or (visits >= 3 and len(members) >= 3)
    track = "org" if org_domain else ("activity" if (visits >= 3 and len(members) >= 3) else None)
    return {"eligible": eligible, "track": track, "members": len(members), "visits": visits}


def _direction(app_row) -> str:
    """구 데이터(컬럼 추가 전 행)는 direction이 비어 있음 → 크루 신청으로 간주."""
    return getattr(app_row, "direction", None) or "crew_apply"


def _assert_crew_member(db: Session, community_id: str, user) -> models.Community:
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    crew = db.query(models.Community).filter(models.Community.id == str(community_id or "")).first()
    if not crew:
        raise HTTPException(status_code=404, detail="크루를 찾을 수 없어요.")
    members = list(dict.fromkeys(([crew.host_id] if crew.host_id else []) + list(crew.member_ids or [])))
    if user.id not in members:
        raise HTTPException(status_code=403, detail="크루 멤버만 볼 수 있어요.")
    return crew


def _deal_payload(d: models.CrewPartnership, place: Optional[models.Place]) -> dict:
    return {
        "partnership_id": d.id,
        "title": d.title,
        "benefit": d.benefit,
        "discount_pct": d.discount_pct,
        "target": d.target,
        "conditions": d.conditions or {},
        "expires_at": d.expires_at.isoformat() if d.expires_at else None,
        "store": {
            "place_id": d.place_id,
            "name": place.name if place else "가게",
            "address": (place.address or "") if place else "",
            "category": (place.cuisine_type or "") if place else "",
        },
    }


def _crew_member_ids(crew) -> list:
    return list(dict.fromkeys(([crew.host_id] if crew.host_id else []) + list(crew.member_ids or [])))


def _notify_crew(crew, title: str, body: str, data: dict = None, exclude: int = None):
    """크루 멤버 전원에게 푸시 — 제휴는 양쪽 응답이 있어야 성립하므로 알림이 루프의 일부다."""
    try:
        from services import push_service
        push_service.notify_users_async(
            _crew_member_ids(crew), title, body, data=data or {}, exclude_user_id=exclude
        )
    except Exception as exc:
        print("[partnership] crew push skip: %s" % exc)


@router.get("/api/crew-partnerships/summary")
def crew_partnership_summary(
    community_id: str,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """제휴 관리 화면 — 받은 제안 / 제휴 중 / 신청 중 / 신청 가능 / 지난 기록."""
    crew = _assert_crew_member(db, community_id, user)
    elig = _crew_eligibility(db, crew)

    apps = (
        db.query(models.CrewPartnershipApp)
        .filter(models.CrewPartnershipApp.community_id == crew.id)
        .order_by(models.CrewPartnershipApp.created_at.desc())
        .all()
    )
    app_deal_ids = [a.partnership_id for a in apps]
    deals_by_id = {
        d.id: d for d in db.query(models.CrewPartnership)
        .filter(models.CrewPartnership.id.in_(app_deal_ids)).all()
    } if app_deal_ids else {}

    # 신청 가능 후보 — 활성 딜 중 이미 관계가 없는 것
    open_deals = (
        db.query(models.CrewPartnership)
        .filter(models.CrewPartnership.status == "active")
        .order_by(models.CrewPartnership.created_at.desc())
        .limit(60)
        .all()
    )
    related = {a.partnership_id for a in apps if a.status in ("pending", "approved")}
    pids = list({d.place_id for d in open_deals} | {d.place_id for d in deals_by_id.values()})
    places = {p.id: p for p in db.query(models.Place).filter(models.Place.id.in_(pids)).all()} if pids else {}

    # 우리 크루가 가본 가게 — '신청 가능' 정렬의 연고 신호
    visited = dict(
        db.query(models.ChatSplitRequest.place_id, func.count(models.ChatSplitRequest.id))
        .filter(
            models.ChatSplitRequest.room_id == crew.id,
            models.ChatSplitRequest.status == "completed",
            models.ChatSplitRequest.place_id.isnot(None),
        )
        .group_by(models.ChatSplitRequest.place_id)
        .all()
    )

    now = datetime.now()
    invites, active, pending, past = [], [], [], []
    for a in apps:
        d = deals_by_id.get(a.partnership_id)
        if not d:
            continue
        item = _deal_payload(d, places.get(d.place_id))
        item.update({
            "app_id": a.id,
            "status": a.status,
            "direction": _direction(a),
            "message": a.message,
            "created_at": a.created_at.isoformat() if a.created_at else None,
            "is_new": getattr(a, "seen_at", None) is None,
        })
        if a.status == "approved":
            days_left = None
            if d.expires_at:
                days_left = max(0, (d.expires_at - now).days)
            item["days_left"] = days_left
            item["ended"] = d.status != "active"
            item["uses"] = int(visited.get(d.place_id, 0))
            (past if item["ended"] else active).append(item)
        elif a.status == "pending":
            (invites if _direction(a) == "store_invite" else pending).append(item)
        else:
            past.append(item)

    available = []
    for d in open_deals:
        if d.id in related:
            continue
        if d.target in ("university", "company") and getattr(crew, "crew_type", None) != d.target:
            continue
        item = _deal_payload(d, places.get(d.place_id))
        item["visits"] = int(visited.get(d.place_id, 0))  # 가본 가게가 위로
        available.append(item)
    available.sort(key=lambda x: x["visits"], reverse=True)

    return {
        "crew": {
            "id": crew.id, "title": crew.title, "icon": crew.icon or "👥",
            "crew_type": getattr(crew, "crew_type", None) or "friends",
        },
        "eligibility": elig,
        "invites": invites,
        "active": active,
        "pending": pending,
        "available": available[:12],
        "past": past,
        "unread": any(i["is_new"] for i in invites) or any(a["is_new"] for a in active),
    }


@router.post("/api/crew-partnerships/{app_id}/respond")
def respond_crew_invite(
    app_id: int,
    req: dict,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """가게가 보낸 제안에 크루가 수락/거절."""
    a = db.query(models.CrewPartnershipApp).filter(models.CrewPartnershipApp.id == app_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="제안을 찾을 수 없어요.")
    _assert_crew_member(db, a.community_id, user)
    if _direction(a) != "store_invite":
        raise HTTPException(status_code=400, detail="크루가 응답할 제안이 아니에요.")
    if a.status != "pending":
        return {"id": a.id, "status": a.status, "already": True}
    action = (req.get("action") or "").strip()
    if action not in ("accept", "decline"):
        raise HTTPException(status_code=400, detail="action은 accept 또는 decline이어야 해요.")
    a.status = "approved" if action == "accept" else "rejected"
    a.decided_at = datetime.now()
    a.seen_at = datetime.now()
    db.commit()

    crew = db.query(models.Community).filter(models.Community.id == a.community_id).first()
    if crew is not None and action == "accept":
        d = db.query(models.CrewPartnership).filter(models.CrewPartnership.id == a.partnership_id).first()
        place = db.query(models.Place).filter(models.Place.id == d.place_id).first() if d else None
        _notify_crew(
            crew,
            "🤝 제휴가 시작됐어요",
            "%s — %s. 이제 멤버 누구나 쓸 수 있어요." % (
                (place.name if place else "가게"), (d.benefit if d else "혜택")),
            data={"type": "partnership_active", "community_id": crew.id},
            exclude=user.id,
        )
    return {"id": a.id, "status": a.status, "already": False}


@router.post("/api/crew-partnerships/{app_id}/cancel")
def cancel_crew_application(
    app_id: int,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """크루가 낸 신청을 승인 전에 취소."""
    a = db.query(models.CrewPartnershipApp).filter(models.CrewPartnershipApp.id == app_id).first()
    if not a:
        raise HTTPException(status_code=404, detail="신청을 찾을 수 없어요.")
    _assert_crew_member(db, a.community_id, user)
    if _direction(a) != "crew_apply":
        raise HTTPException(status_code=400, detail="크루가 낸 신청이 아니에요.")
    if a.status != "pending":
        raise HTTPException(status_code=400, detail="이미 처리된 신청이에요.")
    db.delete(a)   # 같은 딜에 다시 신청할 수 있도록 삭제(유니크 제약 회피)
    db.commit()
    return {"ok": True}


@router.post("/api/crew-partnerships/seen")
def mark_partnerships_seen(
    req: dict,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """제휴 관리 화면 진입 — 느낌표 해제."""
    crew = _assert_crew_member(db, req.get("community_id"), user)
    rows = (
        db.query(models.CrewPartnershipApp)
        .filter(
            models.CrewPartnershipApp.community_id == crew.id,
            models.CrewPartnershipApp.seen_at.is_(None),
        ).all()
    )
    now = datetime.now()
    for r in rows:
        r.seen_at = now
    db.commit()
    return {"ok": True, "marked": len(rows)}


@router.get("/api/crew-deals")
def crew_deals(
    community_id: Optional[str] = None,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """활성 제휴 딜 목록. community_id를 주면 그 크루의 자격·대상 매칭·신청 상태 포함."""
    deals = (
        db.query(models.CrewPartnership)
        .filter(models.CrewPartnership.status == "active")
        .order_by(models.CrewPartnership.created_at.desc())
        .limit(50)
        .all()
    )
    pids = [d.place_id for d in deals]
    places = {p.id: p for p in db.query(models.Place).filter(models.Place.id.in_(pids)).all()} if pids else {}

    crew = None
    elig = None
    my_apps: dict = {}
    if community_id:
        crew = db.query(models.Community).filter(models.Community.id == community_id).first()
        if crew:
            elig = _crew_eligibility(db, crew)
            rows = (
                db.query(models.CrewPartnershipApp)
                .filter(models.CrewPartnershipApp.community_id == community_id)
                .all()
            )
            my_apps = {r.partnership_id: r.status for r in rows}

    items = []
    for d in deals:
        p = places.get(d.place_id)
        target_ok = True
        if crew is not None and d.target in ("university", "company"):
            target_ok = (getattr(crew, "crew_type", None) == d.target)
        items.append({
            "id": d.id,
            "title": d.title,
            "benefit": d.benefit,
            "discount_pct": d.discount_pct,
            "target": d.target,
            "conditions": d.conditions or {},
            "store": {
                "place_id": d.place_id,
                "name": p.name if p else "가게",
                "address": (p.address or "") if p else "",
                "category": (p.cuisine_type or "") if p else "",
            },
            "target_ok": target_ok,
            "my_status": my_apps.get(d.id),
        })

    return {
        "items": items,
        "crew_eligibility": elig,
        "count": len(items),
    }


@router.post("/api/crew-deals/{pid}/apply")
def apply_crew_deal(
    pid: int,
    req: dict,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """크루로 제휴 신청 — 멤버만, 자격·대상 충족 필수."""
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    community_id = req.get("community_id")
    crew = db.query(models.Community).filter(models.Community.id == str(community_id or "")).first()
    if not crew:
        raise HTTPException(status_code=404, detail="크루를 찾을 수 없어요.")
    members = list(dict.fromkeys(([crew.host_id] if crew.host_id else []) + list(crew.member_ids or [])))
    if user.id not in members:
        raise HTTPException(status_code=403, detail="크루 멤버만 신청할 수 있어요.")

    d = db.query(models.CrewPartnership).filter(
        models.CrewPartnership.id == pid, models.CrewPartnership.status == "active"
    ).first()
    if not d:
        raise HTTPException(status_code=404, detail="진행 중인 딜이 아니에요.")

    elig = _crew_eligibility(db, crew)
    if not elig["eligible"]:
        raise HTTPException(status_code=403, detail={"code": "not_eligible", "need": "멤버 3명+ · 함께 방문 3회+ 또는 소속 인증"})
    if d.target in ("university", "company") and getattr(crew, "crew_type", None) != d.target:
        raise HTTPException(status_code=403, detail="이 딜의 대상 크루 종류가 아니에요.")

    exists = (
        db.query(models.CrewPartnershipApp)
        .filter(
            models.CrewPartnershipApp.partnership_id == pid,
            models.CrewPartnershipApp.community_id == crew.id,
        ).first()
    )
    if exists:
        return {"id": exists.id, "status": exists.status, "already": True}

    a = models.CrewPartnershipApp(
        partnership_id=pid, community_id=crew.id, applicant_id=user.id,
        message=(req.get("message") or "").strip()[:200] or None,
    )
    db.add(a)
    db.commit()
    db.refresh(a)

    place = db.query(models.Place).filter(models.Place.id == d.place_id).first()
    _notify_crew(
        crew,
        "제휴를 신청했어요",
        "%s에 %s 신청 — 사장님 승인을 기다리는 중이에요." % (
            (place.name if place else "가게"), d.benefit),
        data={"type": "partnership_applied", "community_id": crew.id},
        exclude=user.id,
    )
    return {"id": a.id, "status": a.status, "already": False}
