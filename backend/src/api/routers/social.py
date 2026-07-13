"""큐레이터 소셜 — 단방향 팔로우 + 큐레이터 프로필 + 공개 '맛집 리스트'.
친구(friendships, 양방향)와 별개. 인스타 팔로우 + 큐레이션 리스트 개념.
프로필/리스트 조회는 공개(비로그인 열람 가능), 팔로우/발행은 로그인 필요."""
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from api.dependencies import get_current_user

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
                "preview": preview,
            }
        )
    return {"items": out}


@router.get("/api/lists/{folder_id}")
def public_list_detail(folder_id: int, db: Session = Depends(get_db)):
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
    return {
        "id": f.id,
        "name": f.name,
        "icon": f.icon or "📁",
        "description": f.description or "",
        "owner": ({"id": owner.id, "name": owner.name, "avatar": owner.avatar or "🙂"} if owner else None),
        "count": len(entries),
        "items": entries,
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
