"""맛집 모임 — 채팅 모임(Community)을 공개 수준별로 탐색에 노출.
공개 수준: private(우리끼리) | list_only(리스트만) | public(모임공개) | open(오픈채팅).
모임 소유 맛집 리스트 = save_folders.community_id + is_public. 인기 = 팔로워+리스트좋아요+리스트수.
라우트 충돌 주의: /api/groups/{cid}가 그리디(String id)라 랭킹은 /api/group-ranking."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from api.dependencies import get_current_user

router = APIRouter()

VISIBLE = ("list_only", "public", "open")   # 탐색 노출되는 수준
ALLOWED_VIS = ("private", "list_only", "public", "open")


def _members(c: models.Community):
    ids = c.member_ids or []
    if c.host_id and c.host_id not in ids:
        ids = [c.host_id] + list(ids)
    return list(dict.fromkeys(ids))  # 중복 제거, 순서 유지


def _is_member(c: models.Community, user: Optional[models.User]) -> bool:
    return bool(user and (user.id == c.host_id or user.id in (c.member_ids or [])))


def _public_folder_ids(db: Session, cid: str):
    return [r[0] for r in db.query(models.SaveFolder.id).filter(
        models.SaveFolder.community_id == cid, models.SaveFolder.is_public == True).all()]  # noqa: E712


def _likes_for(db: Session, folder_ids):
    if not folder_ids:
        return 0, 0
    likes = db.query(models.ListLike).filter(models.ListLike.folder_id.in_(folder_ids)).count()
    comments = db.query(models.ListComment).filter(models.ListComment.folder_id.in_(folder_ids)).count()
    return likes, comments


def _followers(db: Session, cid: str):
    return db.query(models.CommunityFollow).filter(models.CommunityFollow.community_id == cid).count()


@router.get("/api/group-ranking")
def group_ranking(limit: int = 12, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    """인기 맛집 모임 랭킹 — 공개 수준이 노출인 모임만. score=팔로워x3+리스트좋아요x2+리스트수."""
    comms = db.query(models.Community).filter(models.Community.visibility.in_(VISIBLE)).all()
    if not comms:
        return {"count": 0, "items": []}
    my_follow = set()
    if user:
        my_follow = {r.community_id for r in db.query(models.CommunityFollow).filter(
            models.CommunityFollow.follower_id == user.id).all()}
    scored = []
    for c in comms:
        fids = _public_folder_ids(db, c.id)
        likes, _ = _likes_for(db, fids)
        followers = _followers(db, c.id)
        score = followers * 3 + likes * 2 + len(fids)
        scored.append((score, followers, likes, len(fids), c))
    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
    scored = scored[:limit]
    items = []
    for i, (score, followers, likes, nlists, c) in enumerate(scored):
        items.append({
            "rank": i + 1,
            "community_id": c.id,
            "title": c.title or "이름 없는 모임",
            "icon": c.icon or "🍽️",
            "visibility": c.visibility,
            "member_count": len(_members(c)),
            "follower_count": followers,
            "like_count": likes,
            "list_count": nlists,
            "score": score,
            "is_following": c.id in my_follow,
        })
    return {"count": len(items), "items": items}


@router.get("/api/groups/{cid}")
def group_detail(cid: str, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    c = db.query(models.Community).filter(models.Community.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="모임을 찾을 수 없어요.")
    member = _is_member(c, user)
    # 비공개는 멤버만 열람
    if c.visibility == "private" and not member:
        raise HTTPException(status_code=404, detail="비공개 모임이에요.")

    # 공개 리스트(모임 소유 폴더)
    folders = (db.query(models.SaveFolder)
               .filter(models.SaveFolder.community_id == cid, models.SaveFolder.is_public == True)  # noqa: E712
               .order_by(models.SaveFolder.updated_at.desc()).all())
    # 크루 리스트 전체 장소 → 멤버 방문/재방문 인증 집계용
    fids_all = [f.id for f in folders]
    all_items = (db.query(models.SavedItem.folder_id, models.SavedItem.place_id)
                 .filter(models.SavedItem.folder_id.in_(fids_all), models.SavedItem.place_id.isnot(None))
                 .all()) if fids_all else []
    pids_by_folder: dict = {}
    for fid, pid in all_items:
        pids_by_folder.setdefault(fid, []).append(pid)
    all_pids = list({pid for _, pid in all_items})
    mids_all = _members(c)
    # 크루 멤버가 크루 리스트 장소에 남긴 방문 피드백 (방문 인증 배지의 근거)
    fb_rows = (db.query(models.PlaceVisitFeedback.place_id, models.PlaceVisitFeedback.user_id,
                        models.PlaceVisitFeedback.personal_revisit)
               .filter(models.PlaceVisitFeedback.user_id.in_(mids_all),
                       models.PlaceVisitFeedback.place_id.in_(all_pids))
               .all()) if (mids_all and all_pids) else []
    member_visits = len({(r[0], r[1]) for r in fb_rows})
    member_revisits = len({(r[0], r[1]) for r in fb_rows if r[2]})
    revisit_by_place: dict = {}
    for pid, uid_, rev in fb_rows:
        if rev:
            revisit_by_place.setdefault(pid, set()).add(uid_)

    lists = []
    for f in folders:
        items = (db.query(models.SavedItem)
                 .filter(models.SavedItem.folder_id == f.id, models.SavedItem.place_id.isnot(None))
                 .order_by(models.SavedItem.created_at.desc()).limit(4).all())
        pids = [it.place_id for it in items if it.place_id]
        names = {p.id: p.name for p in db.query(models.Place).filter(models.Place.id.in_(pids)).all()} if pids else {}
        lk = db.query(models.ListLike).filter(models.ListLike.folder_id == f.id).count()
        cm = db.query(models.ListComment).filter(models.ListComment.folder_id == f.id).count()
        f_revisit = sum(len(revisit_by_place.get(p, ())) for p in pids_by_folder.get(f.id, []))
        lists.append({
            "id": f.id, "name": f.name, "icon": f.icon or "📁", "description": f.description or "",
            "item_count": f.item_count or 0, "like_count": lk, "comment_count": cm,
            "context_tag": getattr(f, "context_tag", None),
            "revisit": int(f_revisit),
            "preview": [{"place_id": it.place_id, "name": names.get(it.place_id, "장소")} for it in items if it.place_id],
        })

    fids = [f.id for f in folders]
    like_total, _ = _likes_for(db, fids)
    followers = _followers(db, cid)
    is_following = bool(user and db.query(models.CommunityFollow).filter_by(
        follower_id=user.id, community_id=cid).first())

    # 멤버 목록은 모임공개/오픈일 때만(리스트만 공개면 멤버 숨김)
    members = []
    show_members = c.visibility in ("public", "open") or member
    if show_members:
        mids = _members(c)[:20]
        us = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(mids)).all()} if mids else {}
        for mid in mids:
            mu = us.get(mid)
            if mu:
                members.append({"id": mu.id, "name": mu.name, "avatar": mu.avatar or "🙂",
                                "is_host": mid == c.host_id})

    # 인증 크루: 같은 도메인 인증을 가진 멤버 수 (가게에 주는 신뢰 신호)
    _ctype = getattr(c, "crew_type", None) or "friends"
    _org_domain = getattr(c, "org_domain", None)
    verified_members = 0
    if _org_domain and mids_all:
        verified_members = (
            db.query(models.UserVerification)
            .filter(
                models.UserVerification.user_id.in_(mids_all),
                models.UserVerification.domain == _org_domain,
                models.UserVerification.status == "verified",
            )
            .count()
        )

    return {
        "id": c.id,
        "title": c.title or "이름 없는 모임",
        "description": c.description or "",
        "icon": c.icon or "🍽️",
        "visibility": c.visibility,
        "crew_type": _ctype,
        "org_name": getattr(c, "org_name", None),
        "verified_members": int(verified_members),
        "member_count": len(_members(c)),
        "follower_count": followers,
        "like_count": like_total,
        "list_count": len(folders),
        "is_following": is_following,
        "is_member": member,
        "is_host": bool(user and user.id == c.host_id),
        "can_join_chat": c.visibility == "open",     # 오픈채팅만 자유 참여
        "members": members,                          # list_only면 빈 배열
        "lists": lists,
        # 방문 인증 배지 — 멤버가 크루 리스트 장소에 실제 남긴 방문/재방문 신호
        "member_visits": int(member_visits),
        "member_revisits": int(member_revisits),
        "visit_verified": member_visits >= 3,
        # 제휴 자격 — 회비 같은 신고제 대신 검증 가능한 두 트랙만 인정:
        #   org  = 소속 인증 크루(대학/회사 도메인)   activity = 활동 실적(멤버 3+ & 함께 방문 3회+)
        **(lambda _mc=len(_members(c)): {
            "partnership_eligible": bool(_org_domain) or (member_visits >= 3 and _mc >= 3),
            "partnership_track": ("org" if _org_domain else ("activity" if (member_visits >= 3 and _mc >= 3) else None)),
        })(),
    }


@router.post("/api/groups/{cid}/follow")
def follow_group(cid: str, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    c = db.query(models.Community).filter(models.Community.id == cid).first()
    if not c or c.visibility not in VISIBLE:
        raise HTTPException(status_code=404, detail="공개된 모임이 아니에요.")
    ex = db.query(models.CommunityFollow).filter_by(follower_id=user.id, community_id=cid).first()
    if not ex:
        db.add(models.CommunityFollow(follower_id=user.id, community_id=cid))
        db.commit()
    return {"following": True, "follower_count": _followers(db, cid)}


@router.delete("/api/groups/{cid}/follow")
def unfollow_group(cid: str, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    row = db.query(models.CommunityFollow).filter_by(follower_id=user.id, community_id=cid).first()
    if row:
        db.delete(row)
        db.commit()
    return {"following": False, "follower_count": _followers(db, cid)}


@router.patch("/api/groups/{cid}/visibility")
def set_group_visibility(cid: str, req: dict, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    """모임 공개 수준 변경 — 방장(host)만."""
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    c = db.query(models.Community).filter(models.Community.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="모임을 찾을 수 없어요.")
    if c.host_id != user.id:
        raise HTTPException(status_code=403, detail="모임장만 변경할 수 있어요.")
    v = (req.get("visibility") or "").strip()
    if v not in ALLOWED_VIS:
        raise HTTPException(status_code=400, detail="올바르지 않은 공개 수준이에요.")
    c.visibility = v
    if "icon" in req and req.get("icon"):
        c.icon = req.get("icon")
    db.commit()
    return {"id": c.id, "visibility": c.visibility, "icon": c.icon}


@router.patch("/api/groups/{cid}/profile")
def set_group_profile(cid: str, req: dict, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    """모임 이름/아이콘 변경 — 방장(host)만. 채팅방 제목도 함께 갱신(룸 id == 모임 id)."""
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    c = db.query(models.Community).filter(models.Community.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="모임을 찾을 수 없어요.")
    if c.host_id != user.id:
        raise HTTPException(status_code=403, detail="모임장만 변경할 수 있어요.")
    title = str(req.get("title") or "").strip()
    if title:
        c.title = title[:40]
        room = db.query(models.ChatRoom).filter(models.ChatRoom.id == cid).first()
        if room:
            room.title = f"[모임] {title[:40]}" if (room.title or "").startswith("[모임]") else title[:40]
    if req.get("icon"):
        c.icon = str(req.get("icon"))[:8]
    db.commit()
    return {"id": c.id, "title": c.title, "icon": c.icon}


@router.get("/api/me/groups")
def my_groups(user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    """내가 방장인 모임(공개 설정 관리용)."""
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    comms = db.query(models.Community).filter(models.Community.host_id == user.id).all()
    out = []
    for c in comms:
        fids = _public_folder_ids(db, c.id)
        out.append({
            "id": c.id, "title": c.title or "이름 없는 모임", "icon": c.icon or "🍽️",
            "visibility": c.visibility, "member_count": len(_members(c)),
            "public_list_count": len(fids), "follower_count": _followers(db, c.id),
        })
    return {"items": out}


@router.post("/api/groups/{cid}/folders")
def create_group_folder(cid: str, req: dict, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    """모임 소유 맛집 리스트 생성(방장/멤버). 기본 공개."""
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    c = db.query(models.Community).filter(models.Community.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="모임을 찾을 수 없어요.")
    if not _is_member(c, user):
        raise HTTPException(status_code=403, detail="모임 멤버만 만들 수 있어요.")
    name = (req.get("name") or "").strip()
    if not name:
        raise HTTPException(status_code=400, detail="리스트 이름이 필요해요.")
    _tag = req.get("context_tag")
    if _tag not in {"date", "work", "friends", "solo", "cafe", "drink", "family", "special"}:
        _tag = None
    folder = models.SaveFolder(
        user_id=user.id, community_id=cid, name=name,
        icon=req.get("icon") or "📁", description=req.get("description"),
        is_public=True, is_default=False, context_tag=_tag,
    )
    db.add(folder)
    db.commit()
    db.refresh(folder)
    return {"id": folder.id, "name": folder.name, "community_id": cid, "is_public": True}


@router.post("/api/groups/{cid}/save-place")
def save_place_to_group(cid: str, req: dict, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    """채팅에서 공유한 장소를 모임의 맛집 리스트에 저장(멤버). 모임 폴더 없으면 자동 생성."""
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    c = db.query(models.Community).filter(models.Community.id == cid).first()
    if not c:
        raise HTTPException(status_code=404, detail="모임을 찾을 수 없어요.")
    if not _is_member(c, user):
        raise HTTPException(status_code=403, detail="모임 멤버만 저장할 수 있어요.")
    place_id = req.get("place_id")
    if not place_id:
        raise HTTPException(status_code=400, detail="place_id가 필요해요.")
    # 모임 공개 폴더(첫번째) or 자동 생성
    folder = (db.query(models.SaveFolder)
              .filter(models.SaveFolder.community_id == cid, models.SaveFolder.is_public == True)  # noqa: E712
              .order_by(models.SaveFolder.id).first())
    if not folder:
        folder = models.SaveFolder(
            user_id=(c.host_id or user.id), community_id=cid,
            name=f"{c.title or '우리 모임'} 맛집 리스트", icon=c.icon or "🍽️",
            description=f"{c.title or '우리 모임'}이 추천하는 곳", is_public=True, is_default=False,
        )
        db.add(folder)
        db.flush()
    exists = (db.query(models.SavedItem)
              .filter(models.SavedItem.folder_id == folder.id, models.SavedItem.place_id == int(place_id)).first())
    if not exists:
        db.add(models.SavedItem(folder_id=folder.id, user_id=user.id, item_type="place",
                                place_id=int(place_id), memo=req.get("memo"), source="manual"))
    db.flush()
    cnt = db.query(models.SavedItem).filter(models.SavedItem.folder_id == folder.id).count()
    folder.item_count = cnt
    db.commit()
    return {"folder_id": folder.id, "folder_name": folder.name, "item_count": cnt, "saved": exists is None}
