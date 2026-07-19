"""큐레이터 소셜 — 단방향 팔로우 + 큐레이터 프로필 + 공개 '맛집 리스트'.
친구(friendships, 양방향)와 별개. 인스타 팔로우 + 큐레이션 리스트 개념.
프로필/리스트 조회는 공개(비로그인 열람 가능), 팔로우/발행은 로그인 필요."""
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified

from core.database import get_db
from domain import models
from api.dependencies import get_current_user
from services.gamification_service import GamificationService, week_start_utc_naive, week_key

_game = GamificationService()

router = APIRouter()


def _follow_counts(db: Session, uid: int):
    followers = db.query(models.UserFollow).filter(models.UserFollow.following_id == uid).count()
    following = db.query(models.UserFollow).filter(models.UserFollow.follower_id == uid).count()
    return followers, following


def _curator_meta(user: models.User) -> dict:
    """bio/큐레이터 배지는 별도 컬럼 없이 preferences JSON에 보관(무마이그레이션)."""
    prefs = user.preferences or {}
    cur = prefs.get("curator") or {}
    return {
        "bio": prefs.get("bio") or cur.get("tagline") or "",
        "tagline": cur.get("tagline") or "",
        "verified": bool(cur.get("verified")),
    }


# ✓ 자동 인증 기준: 팔로워 20+ AND 공개 리스트 3+ AND 리스트 좋아요 누적 50+
VERIFY_FOLLOWERS = 20
VERIFY_LISTS = 3
VERIFY_LIST_LIKES = 50


def _maybe_auto_verify(db: Session, target: models.User) -> bool:
    """기준 충족 시 인증 큐레이터 자동 부여(preferences.curator.verified). 부여했으면 True."""
    meta = _curator_meta(target)
    if meta["verified"]:
        return False
    followers = db.query(models.UserFollow).filter(models.UserFollow.following_id == target.id).count()
    if followers < VERIFY_FOLLOWERS:
        return False
    lists = (
        db.query(models.SaveFolder)
        .filter(models.SaveFolder.user_id == target.id, models.SaveFolder.is_public == True)  # noqa: E712
        .count()
    )
    if lists < VERIFY_LISTS:
        return False
    likes = (
        db.query(models.ListLike)
        .join(models.SaveFolder, models.ListLike.folder_id == models.SaveFolder.id)
        .filter(models.SaveFolder.user_id == target.id)
        .count()
    )
    if likes < VERIFY_LIST_LIKES:
        return False
    prefs = dict(target.preferences or {})
    cur = dict(prefs.get("curator") or {})
    cur["verified"] = True
    cur["verified_at"] = datetime.now().isoformat()
    prefs["curator"] = cur
    target.preferences = prefs
    flag_modified(target, "preferences")
    return True


@router.post("/api/users/{uid}/follow")
def follow_user(uid: int, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    if uid == user.id:
        raise HTTPException(status_code=400, detail="자기 자신은 팔로우할 수 없어요.")
    target = db.query(models.User).filter(models.User.id == uid).first()
    if not target:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없어요.")
    exists = db.query(models.UserFollow).filter_by(follower_id=user.id, following_id=uid).first()
    if not exists:
        db.add(models.UserFollow(follower_id=user.id, following_id=uid))
        db.commit()
    # 팔로워가 늘어난 시점에 자동 인증 기준 평가
    if _maybe_auto_verify(db, target):
        db.commit()
    followers, _ = _follow_counts(db, uid)
    return {"following": True, "follower_count": followers}


@router.delete("/api/users/{uid}/follow")
def unfollow_user(uid: int, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    row = db.query(models.UserFollow).filter_by(follower_id=user.id, following_id=uid).first()
    if row:
        db.delete(row)
        db.commit()
    followers, _ = _follow_counts(db, uid)
    return {"following": False, "follower_count": followers}


@router.get("/api/users/{uid}/profile")
def user_profile(uid: int, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    u = db.query(models.User).filter(models.User.id == uid).first()
    if not u:
        raise HTTPException(status_code=404, detail="사용자를 찾을 수 없어요.")
    followers, following = _follow_counts(db, uid)
    post_count = (
        db.query(models.Post)
        .filter(models.Post.user_id == uid, models.Post.is_public == True)  # noqa: E712
        .count()
    )
    list_count = (
        db.query(models.SaveFolder)
        .filter(models.SaveFolder.user_id == uid, models.SaveFolder.is_public == True)  # noqa: E712
        .count()
    )
    is_following = False
    if user:
        is_following = (
            db.query(models.UserFollow).filter_by(follower_id=user.id, following_id=uid).first() is not None
        )
    meta = _curator_meta(u)
    return {
        "id": u.id,
        "name": u.name,
        "avatar": u.avatar or "🙂",
        "bio": meta["bio"],
        "tagline": meta["tagline"],
        "verified": meta["verified"],
        "post_count": post_count,
        "list_count": list_count,
        "follower_count": followers,
        "following_count": following,
        "is_following": is_following,
        "is_me": bool(user and user.id == uid),
    }


@router.get("/api/users/{uid}/posts")
def user_posts(uid: int, limit: int = 30, db: Session = Depends(get_db)):
    posts = (
        db.query(models.Post)
        .filter(models.Post.user_id == uid, models.Post.is_public == True)  # noqa: E712
        .order_by(models.Post.created_at.desc())
        .limit(limit)
        .all()
    )
    return {
        "items": [
            {
                "id": p.id,
                "image_urls": p.image_urls or [],
                "media_type": p.media_type or "image",
                "content": p.content or "",
                "likes_count": p.likes_count or 0,
                "comments_count": p.comments_count or 0,
                "place_id": p.place_id,
                "location_name": p.location_name,
            }
            for p in posts
        ]
    }


@router.get("/api/users/{uid}/lists")
def user_lists(uid: int, db: Session = Depends(get_db)):
    folders = (
        db.query(models.SaveFolder)
        .filter(models.SaveFolder.user_id == uid, models.SaveFolder.is_public == True)  # noqa: E712
        .order_by(models.SaveFolder.updated_at.desc())
        .all()
    )
    out = []
    for f in folders:
        items = (
            db.query(models.SavedItem)
            .filter(models.SavedItem.folder_id == f.id, models.SavedItem.place_id.isnot(None))
            .order_by(models.SavedItem.created_at.desc())
            .limit(4)
            .all()
        )
        place_ids = [it.place_id for it in items if it.place_id]
        names = {}
        if place_ids:
            names = {p.id: p.name for p in db.query(models.Place).filter(models.Place.id.in_(place_ids)).all()}
        preview = [{"place_id": it.place_id, "name": names.get(it.place_id, "장소")} for it in items if it.place_id]
        out.append(
            {
                "id": f.id,
                "name": f.name,
                "icon": f.icon or "📁",
                "color": f.color or "#7C3AED",
                "description": f.description or "",
                "item_count": f.item_count or 0,
                "like_count": db.query(models.ListLike).filter(models.ListLike.folder_id == f.id).count(),
                "preview": preview,
            }
        )
    return {"items": out}


@router.get("/api/lists/{folder_id}")
def public_list_detail(folder_id: int, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    f = db.query(models.SaveFolder).filter(models.SaveFolder.id == folder_id).first()
    if not f or not f.is_public:
        raise HTTPException(status_code=404, detail="공개된 리스트가 아니에요.")
    owner = db.query(models.User).filter(models.User.id == f.user_id).first()
    items = (
        db.query(models.SavedItem)
        .filter(models.SavedItem.folder_id == f.id, models.SavedItem.place_id.isnot(None))
        .order_by(models.SavedItem.created_at.desc())
        .all()
    )
    place_ids = [it.place_id for it in items if it.place_id]
    places = {}
    if place_ids:
        places = {p.id: p for p in db.query(models.Place).filter(models.Place.id.in_(place_ids)).all()}
    entries = []
    for it in items:
        p = places.get(it.place_id)
        if not p:
            continue
        entries.append(
            {
                "place_id": p.id,
                "name": p.name,
                "category": p.cuisine_type or p.main_category,
                "address": p.address,
                "memo": it.memo or "",
            }
        )
    like_count = db.query(models.ListLike).filter(models.ListLike.folder_id == f.id).count()
    comment_count = db.query(models.ListComment).filter(models.ListComment.folder_id == f.id).count()
    save_count = db.query(models.ListSave).filter(models.ListSave.folder_id == f.id).count()
    is_liked = bool(user and db.query(models.ListLike).filter_by(folder_id=f.id, user_id=user.id).first())
    return {
        "id": f.id,
        "name": f.name,
        "icon": f.icon or "📁",
        "description": f.description or "",
        "owner": ({"id": owner.id, "name": owner.name, "avatar": owner.avatar or "🙂"} if owner else None),
        "count": len(entries),
        "items": entries,
        "like_count": like_count,
        "comment_count": comment_count,
        "save_count": save_count,
        "is_liked": is_liked,
    }


@router.patch("/api/folders/{folder_id}/publish")
def toggle_folder_publish(
    folder_id: int, req: dict, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)
):
    """폴더를 공개 맛집 리스트로 발행/비공개 전환 + 소개문구 수정."""
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    f = (
        db.query(models.SaveFolder)
        .filter(models.SaveFolder.id == folder_id, models.SaveFolder.user_id == user.id)
        .first()
    )
    if not f:
        raise HTTPException(status_code=404, detail="폴더를 찾을 수 없어요.")
    if f.is_default or getattr(f, "system_kind", None):
        raise HTTPException(status_code=400, detail="기본 폴더는 공개할 수 없어요. 새 폴더를 만들어 공개해 보세요.")
    if "is_public" in req:
        f.is_public = bool(req["is_public"])
    if "description" in req:
        f.description = req.get("description")
    db.commit()
    return {"id": f.id, "is_public": f.is_public, "description": f.description or ""}


@router.get("/api/me/following")
def my_following(user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    rows = db.query(models.UserFollow).filter(models.UserFollow.follower_id == user.id).all()
    ids = [r.following_id for r in rows]
    if not ids:
        return {"items": []}
    users = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(ids)).all()}
    out = []
    for uid in ids:
        u = users.get(uid)
        if not u:
            continue
        meta = _curator_meta(u)
        lc = (
            db.query(models.SaveFolder)
            .filter(models.SaveFolder.user_id == uid, models.SaveFolder.is_public == True)  # noqa: E712
            .count()
        )
        out.append(
            {
                "id": u.id,
                "name": u.name,
                "avatar": u.avatar or "🙂",
                "tagline": meta["tagline"],
                "verified": meta["verified"],
                "list_count": lc,
            }
        )
    return {"items": out}


@router.get("/api/curators/suggested")
def suggested_curators(limit: int = 8, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    """추천 큐레이터 — 공개 맛집 리스트 보유자, 팔로워·리스트 많은 순."""
    sub = (
        db.query(models.SaveFolder.user_id, func.count(models.SaveFolder.id).label("lists"))
        .filter(models.SaveFolder.is_public == True)  # noqa: E712
        .group_by(models.SaveFolder.user_id)
        .subquery()
    )
    rows = db.query(sub.c.user_id, sub.c.lists).all()
    my_follow = set()
    if user:
        my_follow = {
            r.following_id for r in db.query(models.UserFollow).filter(models.UserFollow.follower_id == user.id).all()
        }
    cands = []
    for uid, lists in rows:
        if user and uid == user.id:
            continue
        followers = db.query(models.UserFollow).filter(models.UserFollow.following_id == uid).count()
        cands.append((uid, int(lists), followers))
    cands.sort(key=lambda x: (x[2], x[1]), reverse=True)
    cands = cands[:limit]
    ids = [c[0] for c in cands]
    users = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(ids)).all()} if ids else {}
    out = []
    for uid, lists, followers in cands:
        u = users.get(uid)
        if not u:
            continue
        meta = _curator_meta(u)
        out.append(
            {
                "id": u.id,
                "name": u.name,
                "avatar": u.avatar or "🙂",
                "tagline": meta["tagline"],
                "verified": meta["verified"],
                "list_count": lists,
                "follower_count": followers,
                "is_following": uid in my_follow,
            }
        )
    return {"items": out}


@router.get("/api/curators/ranking")
def curator_ranking(
    scope: str = "all",
    limit: int = 10,
    user: Optional[models.User] = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """큐레이터 주간 영향력 랭킹(월요일 KST 리셋).
    점수 = 이번 주 신규 팔로워×5 + 리스트 좋아요×2 + 리스트 댓글×1.
    scope=all: 공개 리스트 보유 전체(금주의 큐레이터). scope=following: 내가 팔로우한 사람들 + 나."""
    ws = week_start_utc_naive()

    if scope == "following":
        if user is None:
            raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
        ids = {
            r.following_id
            for r in db.query(models.UserFollow).filter(models.UserFollow.follower_id == user.id).all()
        }
        ids.add(user.id)
        cand_ids = list(ids)
    else:
        rows = (
            db.query(models.SaveFolder.user_id)
            .filter(models.SaveFolder.is_public == True)  # noqa: E712
            .group_by(models.SaveFolder.user_id)
            .all()
        )
        cand_ids = [r[0] for r in rows]

    if not cand_ids:
        return {"week": week_key(), "items": []}

    # 주간 집계 3종 — 후보 전체를 각각 1쿼리로
    nf = dict(
        db.query(models.UserFollow.following_id, func.count(models.UserFollow.id))
        .filter(models.UserFollow.following_id.in_(cand_ids), models.UserFollow.created_at >= ws)
        .group_by(models.UserFollow.following_id)
        .all()
    )
    ll = dict(
        db.query(models.SaveFolder.user_id, func.count(models.ListLike.id))
        .join(models.ListLike, models.ListLike.folder_id == models.SaveFolder.id)
        .filter(models.SaveFolder.user_id.in_(cand_ids), models.ListLike.created_at >= ws)
        .group_by(models.SaveFolder.user_id)
        .all()
    )
    lc = dict(
        db.query(models.SaveFolder.user_id, func.count(models.ListComment.id))
        .join(models.ListComment, models.ListComment.folder_id == models.SaveFolder.id)
        .filter(models.SaveFolder.user_id.in_(cand_ids), models.ListComment.created_at >= ws)
        .group_by(models.SaveFolder.user_id)
        .all()
    )
    followers_total = dict(
        db.query(models.UserFollow.following_id, func.count(models.UserFollow.id))
        .filter(models.UserFollow.following_id.in_(cand_ids))
        .group_by(models.UserFollow.following_id)
        .all()
    )
    lists_total = dict(
        db.query(models.SaveFolder.user_id, func.count(models.SaveFolder.id))
        .filter(models.SaveFolder.user_id.in_(cand_ids), models.SaveFolder.is_public == True)  # noqa: E712
        .group_by(models.SaveFolder.user_id)
        .all()
    )

    my_follow = set()
    if user:
        my_follow = {
            r.following_id
            for r in db.query(models.UserFollow).filter(models.UserFollow.follower_id == user.id).all()
        }

    scored = []
    for uid in cand_ids:
        score = int(nf.get(uid, 0)) * 5 + int(ll.get(uid, 0)) * 2 + int(lc.get(uid, 0))
        scored.append((uid, score))
    # 동점 시 누적 팔로워 순
    scored.sort(key=lambda x: (x[1], followers_total.get(x[0], 0)), reverse=True)
    scored = scored[: max(1, min(limit, 50))]

    users_map = {
        u.id: u for u in db.query(models.User).filter(models.User.id.in_([s[0] for s in scored])).all()
    }
    items = []
    rank = 0
    for uid, score in scored:
        u = users_map.get(uid)
        if not u:
            continue
        rank += 1
        meta = _curator_meta(u)
        fb = _game.featured_badge_of(u)
        items.append({
            "rank": rank,
            "id": u.id,
            "name": u.name,
            "avatar": u.avatar or "🙂",
            "tagline": meta["tagline"],
            "verified": meta["verified"],
            "weekly_score": score,
            "weekly_new_followers": int(nf.get(uid, 0)),
            "weekly_list_likes": int(ll.get(uid, 0)),
            "follower_count": int(followers_total.get(uid, 0)),
            "list_count": int(lists_total.get(uid, 0)),
            "featured_badge": {"emoji": fb["emoji"], "title": fb["title"]} if fb else None,
            "is_following": uid in my_follow,
            "is_me": bool(user and uid == user.id),
        })
    return {"week": week_key(), "items": items}


# ===== 맛집 리스트 추천(좋아요) + 댓글 + 인기 랭킹 (#4) =====
# 라우트 순서 주의: /api/lists/{folder_id}가 그리디하므로 랭킹은 /api/list-ranking,
# 댓글 삭제는 /api/list-comments/{id}로 분리(충돌 회피).

def _list_counts(db: Session, folder_id: int):
    likes = db.query(models.ListLike).filter(models.ListLike.folder_id == folder_id).count()
    comments = db.query(models.ListComment).filter(models.ListComment.folder_id == folder_id).count()
    return likes, comments


@router.post("/api/lists/{folder_id}/like")
def like_list(folder_id: int, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    f = db.query(models.SaveFolder).filter(models.SaveFolder.id == folder_id).first()
    if not f or not f.is_public:
        raise HTTPException(status_code=404, detail="공개된 리스트가 아니에요.")
    ex = db.query(models.ListLike).filter_by(folder_id=folder_id, user_id=user.id).first()
    if not ex:
        db.add(models.ListLike(folder_id=folder_id, user_id=user.id))
        db.commit()
    # 좋아요 누적이 인증 기준을 넘었을 수 있음 → 리스트 주인 자동 인증 평가
    owner = db.query(models.User).filter(models.User.id == f.user_id).first()
    if owner and _maybe_auto_verify(db, owner):
        db.commit()
    likes, _ = _list_counts(db, folder_id)
    return {"liked": True, "like_count": likes}


@router.post("/api/lists/{folder_id}/save")
def save_list_to_my_folders(
    folder_id: int, req: dict, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)
):
    """공개 리스트(큐레이터/모임)의 장소를 통째로 내 폴더에 담기.
    body: {target_folder_id?: 기존 폴더 id} 없으면 새 폴더 생성(원본 이름/아이콘 계승).
    저장은 saved_items로 쌓여 급상승 '저장' 집계에 자연 합산된다."""
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    src = db.query(models.SaveFolder).filter(models.SaveFolder.id == folder_id).first()
    if not src or not src.is_public:
        raise HTTPException(status_code=404, detail="공개된 리스트가 아니에요.")

    items = (
        db.query(models.SavedItem)
        .filter(models.SavedItem.folder_id == src.id, models.SavedItem.place_id.isnot(None))
        .order_by(models.SavedItem.created_at.asc())
        .all()
    )
    if not items:
        raise HTTPException(status_code=400, detail="담을 장소가 없는 리스트예요.")

    # 🧑‍🤝‍🧑 크루에 담기: community_id가 오면 그 크루의 "새 리스트"로 복사 (멤버만)
    community_id = req.get("community_id")
    if community_id:
        crew = db.query(models.Community).filter(models.Community.id == str(community_id)).first()
        if not crew:
            raise HTTPException(status_code=404, detail="크루를 찾을 수 없어요.")
        members = crew.member_ids or []
        if user.id not in members and user.id != crew.host_id:
            raise HTTPException(status_code=403, detail="크루 멤버만 담을 수 있어요.")
        base = (src.name or "담아온 리스트").strip()[:40] or "담아온 리스트"
        name, n = base, 2
        while db.query(models.SaveFolder).filter(
            models.SaveFolder.community_id == crew.id, models.SaveFolder.name == name
        ).first():
            name = f"{base} ({n})"
            n += 1
        target = models.SaveFolder(
            user_id=user.id, community_id=crew.id, name=name,
            icon=src.icon or "📁",
            description=src.description,
            is_public=(crew.visibility or "private") != "private",
            is_default=False,
            context_tag=getattr(src, "context_tag", None),
        )
        db.add(target)
        db.flush()
        have = set()
        added = 0
        for it in items:
            if it.place_id in have:
                continue
            have.add(it.place_id)
            db.add(models.SavedItem(folder_id=target.id, user_id=user.id, item_type="place", place_id=it.place_id, memo=it.memo))
            added += 1
        target.item_count = added
        # 담은 사람 수 집계(1인 1회) — 개인 담기와 동일
        exists_save = db.query(models.ListSave).filter_by(folder_id=src.id, user_id=user.id).first()
        if not exists_save:
            db.add(models.ListSave(folder_id=src.id, user_id=user.id))
        db.commit()
        save_count = db.query(models.ListSave).filter(models.ListSave.folder_id == src.id).count()
        return {
            "folder_id": target.id,
            "folder_name": f"{crew.title} · {name}",
            "added": added, "skipped": 0,
            "save_count": save_count,
            "community_id": crew.id,
        }

    target_id = req.get("target_folder_id")
    if target_id:
        if int(target_id) == src.id:
            raise HTTPException(status_code=400, detail="같은 리스트에는 담을 수 없어요.")
        target = db.query(models.SaveFolder).filter(
            models.SaveFolder.id == int(target_id), models.SaveFolder.user_id == user.id
        ).first()
        if not target:
            raise HTTPException(status_code=404, detail="폴더를 찾을 수 없어요.")
        if getattr(target, "system_kind", None) == "post_default":
            raise HTTPException(status_code=400, detail="게시물 폴더에는 장소를 담을 수 없어요.")
    else:
        # 새 폴더: 원본 이름 계승 + 중복 시 (2), (3)...
        base = (req.get("new_folder_name") or src.name or "담아온 리스트").strip()[:40] or "담아온 리스트"
        name, n = base, 2
        while db.query(models.SaveFolder).filter(
            models.SaveFolder.user_id == user.id, models.SaveFolder.name == name
        ).first():
            name = f"{base} ({n})"
            n += 1
        from api.routers.saves import pick_folder_color
        target = models.SaveFolder(user_id=user.id, name=name, icon=src.icon or "📁", color=pick_folder_color(db, user.id))
        db.add(target)
        db.flush()

    have = {
        r[0]
        for r in db.query(models.SavedItem.place_id)
        .filter(models.SavedItem.folder_id == target.id, models.SavedItem.place_id.isnot(None))
        .all()
    }
    added = 0
    for it in items:
        if it.place_id in have:
            continue
        have.add(it.place_id)
        db.add(models.SavedItem(
            folder_id=target.id, user_id=user.id, item_type="place",
            place_id=it.place_id, memo=it.memo,
        ))
        added += 1
    target.item_count = len(have)
    # 담은 사람 수 집계 — 같은 사람이 여러 번 담아도 1명
    if not db.query(models.ListSave).filter_by(folder_id=src.id, user_id=user.id).first():
        db.add(models.ListSave(folder_id=src.id, user_id=user.id))
    db.commit()
    save_count = db.query(models.ListSave).filter(models.ListSave.folder_id == src.id).count()
    return {
        "folder_id": target.id,
        "folder_name": target.name,
        "added": added,
        "skipped": len(items) - added,
        "save_count": save_count,
    }


@router.delete("/api/lists/{folder_id}/like")
def unlike_list(folder_id: int, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    row = db.query(models.ListLike).filter_by(folder_id=folder_id, user_id=user.id).first()
    if row:
        db.delete(row)
        db.commit()
    likes, _ = _list_counts(db, folder_id)
    return {"liked": False, "like_count": likes}


@router.get("/api/lists/{folder_id}/comments")
def get_list_comments(folder_id: int, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    rows = (
        db.query(models.ListComment)
        .filter(models.ListComment.folder_id == folder_id)
        .order_by(models.ListComment.created_at.desc())
        .limit(100)
        .all()
    )
    uids = list({r.user_id for r in rows})
    users = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(uids)).all()} if uids else {}
    my_id = user.id if user else None
    out = []
    for r in rows:
        u = users.get(r.user_id)
        out.append(
            {
                "id": r.id,
                "user_id": r.user_id,
                "user_name": u.name if u else "익명",
                "user_avatar": (u.avatar if u else None) or "🙂",
                "content": r.content,
                "created_at": r.created_at.isoformat() if r.created_at else None,
                "is_mine": r.user_id == my_id,
            }
        )
    return {"count": len(out), "items": out}


@router.post("/api/lists/{folder_id}/comments")
def add_list_comment(folder_id: int, req: dict, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    content = (req.get("content") or "").strip()
    if not content:
        raise HTTPException(status_code=400, detail="댓글 내용을 입력해주세요.")
    f = db.query(models.SaveFolder).filter(models.SaveFolder.id == folder_id).first()
    if not f or not f.is_public:
        raise HTTPException(status_code=404, detail="공개된 리스트가 아니에요.")
    c = models.ListComment(folder_id=folder_id, user_id=user.id, content=content[:500])
    db.add(c)
    db.commit()
    db.refresh(c)
    return {
        "id": c.id,
        "user_id": user.id,
        "user_name": user.name,
        "user_avatar": user.avatar or "🙂",
        "content": c.content,
        "created_at": c.created_at.isoformat() if c.created_at else None,
        "is_mine": True,
    }


@router.delete("/api/list-comments/{comment_id}")
def delete_list_comment(comment_id: int, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    c = db.query(models.ListComment).filter(models.ListComment.id == comment_id).first()
    if not c:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없어요.")
    folder = db.query(models.SaveFolder).filter(models.SaveFolder.id == c.folder_id).first()
    if c.user_id != user.id and not (folder and folder.user_id == user.id):
        raise HTTPException(status_code=403, detail="삭제 권한이 없어요.")
    db.delete(c)
    db.commit()
    return {"status": "ok"}


@router.get("/api/list-ranking")
def list_ranking(limit: int = 10, user: Optional[models.User] = Depends(get_current_user), db: Session = Depends(get_db)):
    """인기 맛집 리스트 랭킹 — 추천x3 + 댓글x2 + 큐레이터 팔로워 보너스(상한20).
    팔로우·추천·댓글이 쌓일수록 랭크 상승."""
    folders = db.query(models.SaveFolder).filter(models.SaveFolder.is_public == True).all()  # noqa: E712
    if not folders:
        return {"count": 0, "items": []}
    fids = [f.id for f in folders]
    owner_ids = list({f.user_id for f in folders})

    like_rows = (
        db.query(models.ListLike.folder_id, func.count(models.ListLike.id))
        .filter(models.ListLike.folder_id.in_(fids))
        .group_by(models.ListLike.folder_id)
        .all()
    )
    likes = {fid: c for fid, c in like_rows}
    cmt_rows = (
        db.query(models.ListComment.folder_id, func.count(models.ListComment.id))
        .filter(models.ListComment.folder_id.in_(fids))
        .group_by(models.ListComment.folder_id)
        .all()
    )
    comments = {fid: c for fid, c in cmt_rows}
    fol_rows = (
        db.query(models.UserFollow.following_id, func.count(models.UserFollow.id))
        .filter(models.UserFollow.following_id.in_(owner_ids))
        .group_by(models.UserFollow.following_id)
        .all()
    )
    followers = {uid: c for uid, c in fol_rows}
    users = {u.id: u for u in db.query(models.User).filter(models.User.id.in_(owner_ids)).all()}

    scored = []
    for f in folders:
        lk = int(likes.get(f.id, 0))
        cm = int(comments.get(f.id, 0))
        fb = int(followers.get(f.user_id, 0))
        score = lk * 3 + cm * 2 + min(fb, 20)
        scored.append((score, lk, cm, f))
    scored.sort(key=lambda x: (x[0], x[1]), reverse=True)
    scored = scored[:limit]

    my_liked = set()
    if user:
        my_liked = {r.folder_id for r in db.query(models.ListLike).filter(models.ListLike.user_id == user.id).all()}

    items = []
    for i, (score, lk, cm, f) in enumerate(scored):
        owner = users.get(f.user_id)
        items.append(
            {
                "rank": i + 1,
                "folder_id": f.id,
                "name": f.name,
                "icon": f.icon or "📁",
                "description": f.description or "",
                "item_count": f.item_count or 0,
                "like_count": lk,
                "comment_count": cm,
                "score": score,
                "is_liked": f.id in my_liked,
                "curator": ({"id": owner.id, "name": owner.name, "avatar": owner.avatar or "🙂"} if owner else None),
            }
        )
    return {"count": len(items), "items": items}
