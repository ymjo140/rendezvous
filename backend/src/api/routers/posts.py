"""
SNS 게시물 API 라우터 (Instagram 스타일)
- 게시물 CRUD
- 좋아요/댓글
- 이미지 업로드 (Base64 → Supabase Storage)
"""

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from sqlalchemy.orm import Session
from sqlalchemy import desc
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime
import base64
import os
import uuid as _uuid

from core.database import get_db
from domain import models
from api.dependencies import get_current_user

router = APIRouter()

# 숏폼 영상 업로드 설정
ALLOWED_VIDEO_MIME = {"video/mp4", "video/quicktime", "video/webm"}
MAX_VIDEO_BYTES = 50 * 1024 * 1024  # 50MB
STORAGE_BUCKET = "post-media"


# --- Pydantic Schemas ---
class PostCreate(BaseModel):
    image_urls: List[str]  # Base64(이미지) 또는 Storage URL(영상)
    content: Optional[str] = None
    location_name: Optional[str] = None
    place_id: Optional[int] = None
    media_type: Optional[str] = "image"  # 'image' | 'video'

class PlaceSummary(BaseModel):
    id: int
    name: str
    category: Optional[str] = None
    main_category: Optional[str] = None
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    rating: Optional[float] = None
    review_count: Optional[int] = None
    phone: Optional[str] = None
    business_hours: Optional[str] = None
    price_range: Optional[str] = None
    tags: Optional[List[str]] = None

class PostResponse(BaseModel):
    id: str
    user_id: int
    user_name: str
    user_avatar: Optional[str]
    image_urls: List[str]
    media_type: str = "image"
    content: Optional[str]
    location_name: Optional[str]
    place_id: Optional[int] = None
    place_name: Optional[str] = None
    place_category: Optional[str] = None
    place_address: Optional[str] = None
    place_rating: Optional[float] = None
    place_review_count: Optional[int] = None
    place: Optional[PlaceSummary] = None
    likes_count: int
    comments_count: int
    is_liked: bool
    is_saved: bool
    created_at: str
    
    class Config:
        from_attributes = True

class CommentCreate(BaseModel):
    content: str

class CommentResponse(BaseModel):
    id: int
    user_id: int
    user_name: str
    content: str
    created_at: str


# --- Helper Functions ---
def upload_base64_image(base64_data: str, user_id: int) -> str:
    """
    Base64 이미지를 처리합니다.
    실제 프로덕션에서는 Supabase Storage에 업로드하고 URL을 반환합니다.
    여기서는 Base64 데이터를 그대로 반환합니다 (클라이언트에서 직접 표시 가능).
    """
    # Base64 데이터가 이미 URL 형태면 그대로 반환
    if base64_data.startswith("http://") or base64_data.startswith("https://"):
        return base64_data
    
    # data:image 형식이면 그대로 반환 (프론트엔드에서 렌더링 가능)
    if base64_data.startswith("data:image"):
        return base64_data
    
    # 순수 base64면 data URL 형식으로 변환
    return f"data:image/jpeg;base64,{base64_data}"


def format_time_ago(dt: datetime) -> str:
    """시간을 '몇 분 전', '몇 시간 전' 형식으로 변환"""
    now = datetime.now()
    diff = now - dt
    
    seconds = diff.total_seconds()
    if seconds < 60:
        return "방금 전"
    elif seconds < 3600:
        return f"{int(seconds // 60)}분 전"
    elif seconds < 86400:
        return f"{int(seconds // 3600)}시간 전"
    elif seconds < 604800:
        return f"{int(seconds // 86400)}일 전"
    else:
        return dt.strftime("%Y.%m.%d")


def build_place_summary(place: Optional[models.Place]):
    if not place:
        return None

    tags = []
    for tag in (place.tags or []) + (place.vibe_tags or []):
        if tag and tag not in tags:
            tags.append(tag)

    return {
        "id": place.id,
        "name": place.name,
        "category": place.cuisine_type or place.category or "",
        "main_category": place.main_category,
        "address": place.address or "",
        "lat": place.lat,
        "lng": place.lng,
        "rating": place.wemeet_rating or 0.0,
        "review_count": place.review_count or 0,
        "phone": place.phone or "",
        "business_hours": place.business_hours or "",
        "price_range": place.price_range or "",
        "tags": tags
    }

# --- API Endpoints ---

@router.post("/api/posts/upload-media")
async def upload_media(
    file: UploadFile = File(...),
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    """숏폼 영상 업로드 → Supabase Storage(post-media) → 공개 URL 반환.
    영상은 base64 DB저장이 비현실적이라 Storage에 올리고 URL만 게시물에 저장."""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_VIDEO_MIME:
        raise HTTPException(status_code=400, detail="mp4/mov/webm 영상만 업로드할 수 있어요.")

    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="빈 파일입니다.")
    if len(data) > MAX_VIDEO_BYTES:
        raise HTTPException(status_code=400, detail="영상은 50MB 이하만 올릴 수 있어요.")

    from core.config import settings
    supabase_url = (os.getenv("SUPABASE_URL") or "").rstrip("/")
    service_key = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")
    if not supabase_url or not service_key:
        raise HTTPException(status_code=503, detail="영상 저장소가 설정되지 않았습니다.")

    ext = {"video/mp4": "mp4", "video/quicktime": "mov", "video/webm": "webm"}.get(content_type, "mp4")
    path = f"videos/{current_user.id}/{_uuid.uuid4().hex}.{ext}"

    try:
        import requests as _rq
        headers = {
            "Authorization": f"Bearer {service_key}",
            "apikey": service_key,
            "Content-Type": content_type,
            "x-upsert": "true",
        }
        up = _rq.post(
            f"{supabase_url}/storage/v1/object/{STORAGE_BUCKET}/{path}",
            headers=headers,
            data=data,
            timeout=60,
        )
        if up.status_code not in (200, 201):
            print(f"[upload-media] storage {up.status_code}: {up.text[:200]}")
            raise HTTPException(status_code=502, detail="영상 업로드에 실패했어요. 잠시 후 다시 시도해주세요.")
    except HTTPException:
        raise
    except Exception as exc:
        print(f"[upload-media] 예외: {exc}")
        raise HTTPException(status_code=502, detail="영상 업로드 중 오류가 발생했어요.")

    public_url = f"{supabase_url}/storage/v1/object/public/{STORAGE_BUCKET}/{path}"
    return {"url": public_url, "media_type": "video"}


@router.post("/api/posts", response_model=PostResponse)
def create_post(
    req: PostCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """게시물 생성"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    if not req.image_urls or len(req.image_urls) == 0:
        raise HTTPException(status_code=400, detail="이미지가 필요합니다.")
    
    # 이미지 처리 (Base64 → URL 변환 또는 그대로 저장)
    processed_urls = [upload_base64_image(url, current_user.id) for url in req.image_urls]
    place = None
    if req.place_id:
        place = db.query(models.Place).filter(models.Place.id == req.place_id).first()
        if not place:
            raise HTTPException(status_code=400, detail="Place not found")

    
    # 게시물 생성
    post = models.Post(
        user_id=current_user.id,
        image_urls=processed_urls,
        media_type=(req.media_type if req.media_type in ("image", "video") else "image"),
        content=req.content,
        location_name=req.location_name,
        place_id=req.place_id
    )
    
    db.add(post)
    db.commit()
    db.refresh(post)
    
    place_summary = build_place_summary(place)
    return PostResponse(
        id=post.id,
        user_id=post.user_id,
        user_name=current_user.name,
        user_avatar=current_user.avatar,
        image_urls=post.image_urls,
        content=post.content,
        location_name=post.location_name,
        place_id=place.id if place else None,
        place_name=place.name if place else None,
        place_category=(place.cuisine_type or place.category or "") if place else None,
        place_address=(place.address or "") if place else None,
        place_rating=(place.wemeet_rating or 0.0) if place else None,
        place_review_count=(place.review_count or 0) if place else None,
        place=place_summary,
        likes_count=0,
        comments_count=0,
        is_liked=False,
        is_saved=False,
        media_type=getattr(post, "media_type", None) or "image",
        created_at=format_time_ago(post.created_at)
    )


@router.get("/api/posts", response_model=List[PostResponse])
def get_posts(
    skip: int = 0,
    limit: int = 20,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """피드 조회 (최신순) — 차단한 사용자/내가 신고한 게시물 제외(UGC 정책)"""
    q = db.query(models.Post).filter(models.Post.is_public == True)
    if current_user:
        try:
            blocked = [
                b.blocked_user_id
                for b in db.query(models.UserBlock).filter(models.UserBlock.blocker_id == current_user.id).all()
            ]
            if blocked:
                q = q.filter(~models.Post.user_id.in_(blocked))
            reported = [
                r.target_id
                for r in db.query(models.ContentReport).filter(
                    models.ContentReport.reporter_id == current_user.id,
                    models.ContentReport.target_type == "post",
                ).all()
            ]
            if reported:
                q = q.filter(~models.Post.id.in_(reported))
        except Exception as e:
            print(f"[posts] 차단/신고 필터 스킵: {e}")
    posts = q.order_by(desc(models.Post.created_at)).offset(skip).limit(limit).all()
    place_map = {}
    place_ids = [p.place_id for p in posts if p.place_id]
    if place_ids:
        places = db.query(models.Place).filter(models.Place.id.in_(place_ids)).all()
        place_map = {p.id: p for p in places}

    
    result = []
    for post in posts:
        is_liked = False
        is_saved = False
        
        if current_user:
            # 좋아요 여부 확인
            like = db.query(models.PostLike)\
                .filter(models.PostLike.post_id == post.id, models.PostLike.user_id == current_user.id)\
                .first()
            is_liked = like is not None
            
            # 저장 여부 확인
            save = db.query(models.PostSave)\
                .filter(models.PostSave.post_id == post.id, models.PostSave.user_id == current_user.id)\
                .first()
            is_saved = save is not None
        
        # 작성자 정보
        user = db.query(models.User).filter(models.User.id == post.user_id).first()
        
        place = place_map.get(post.place_id) if post.place_id else None
        place_summary = build_place_summary(place)
        result.append(PostResponse(
            id=post.id,
            user_id=post.user_id,
            user_name=user.name if user else "Unknown",
            user_avatar=user.avatar if user else None,
            image_urls=post.image_urls or [],
            content=post.content,
            location_name=post.location_name,
            place_id=post.place_id,
            place_name=place.name if place else None,
            place_category=(place.cuisine_type or place.category or "") if place else None,
            place_address=(place.address or "") if place else None,
            place_rating=(place.wemeet_rating or 0.0) if place else None,
            place_review_count=(place.review_count or 0) if place else None,
            place=place_summary,
            likes_count=post.likes_count,
            comments_count=post.comments_count,
            is_liked=is_liked,
            is_saved=is_saved,
            media_type=getattr(post, "media_type", None) or "image",
            created_at=format_time_ago(post.created_at)
        ))
    
    return result


@router.get("/api/posts/me", response_model=List[PostResponse])
def get_my_posts(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """내 게시물 조회"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    posts = db.query(models.Post)\
        .filter(models.Post.user_id == current_user.id)\
        .order_by(desc(models.Post.created_at))\
        .all()
    place_map = {}
    place_ids = [p.place_id for p in posts if p.place_id]
    if place_ids:
        places = db.query(models.Place).filter(models.Place.id.in_(place_ids)).all()
        place_map = {p.id: p for p in places}

    
    result = []
    for post in posts:
        place = place_map.get(post.place_id) if post.place_id else None
        place_summary = build_place_summary(place)
        result.append(PostResponse(
            id=post.id,
            user_id=post.user_id,
            user_name=current_user.name,
            user_avatar=current_user.avatar,
            image_urls=post.image_urls or [],
            content=post.content,
            location_name=post.location_name,
            place_id=post.place_id,
            place_name=place.name if place else None,
            place_category=(place.cuisine_type or place.category or "") if place else None,
            place_address=(place.address or "") if place else None,
            place_rating=(place.wemeet_rating or 0.0) if place else None,
            place_review_count=(place.review_count or 0) if place else None,
            place=place_summary,
            likes_count=post.likes_count,
            comments_count=post.comments_count,
            is_liked=False,
            is_saved=False,
            media_type=getattr(post, "media_type", None) or "image",
            created_at=format_time_ago(post.created_at)
        ))
    
    return result


@router.get("/api/posts/{post_id}", response_model=PostResponse)
def get_post(
    post_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """게시물 상세 조회"""
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다.")
    
    is_liked = False
    is_saved = False
    
    if current_user:
        # 좋아요 여부
        like = db.query(models.PostLike)\
            .filter(models.PostLike.post_id == post.id, models.PostLike.user_id == current_user.id)\
            .first()
        is_liked = like is not None
        
        # 저장 여부
        save = db.query(models.PostSave)\
            .filter(models.PostSave.post_id == post.id, models.PostSave.user_id == current_user.id)\
            .first()
        is_saved = save is not None
    
    user = db.query(models.User).filter(models.User.id == post.user_id).first()
    
    place = db.query(models.Place).filter(models.Place.id == post.place_id).first() if post.place_id else None
    place_summary = build_place_summary(place)
    return PostResponse(
        id=post.id,
        user_id=post.user_id,
        user_name=user.name if user else "Unknown",
        user_avatar=user.avatar if user else None,
        image_urls=post.image_urls or [],
        content=post.content,
        location_name=post.location_name,
        place_id=post.place_id,
        place_name=place.name if place else None,
        place_category=(place.cuisine_type or place.category or "") if place else None,
        place_address=(place.address or "") if place else None,
        place_rating=(place.wemeet_rating or 0.0) if place else None,
        place_review_count=(place.review_count or 0) if place else None,
        place=place_summary,
        likes_count=post.likes_count,
        comments_count=post.comments_count,
        is_liked=is_liked,
        is_saved=is_saved,
        media_type=getattr(post, "media_type", None) or "image",
        created_at=format_time_ago(post.created_at)
    )


class PostUpdate(BaseModel):
    content: Optional[str] = None
    location_name: Optional[str] = None
    place_id: Optional[int] = None


@router.patch("/api/posts/{post_id}")
def update_post(
    post_id: str,
    req: PostUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """게시물 수정(내용/위치/장소 태그) — 작성자만"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다.")
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="수정 권한이 없습니다.")

    if req.content is not None:
        post.content = req.content
    if req.location_name is not None:
        post.location_name = req.location_name or None
    if req.place_id is not None:
        post.place_id = req.place_id or None
    db.commit()
    return {"message": "게시물이 수정되었습니다.", "id": post.id}


@router.delete("/api/posts/{post_id}")
def delete_post(
    post_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """게시물 삭제"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다.")
    
    if post.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다.")
    
    db.delete(post)
    db.commit()
    
    return {"message": "게시물이 삭제되었습니다."}


@router.post("/api/posts/{post_id}/like")
def toggle_like(
    post_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """좋아요 토글"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다.")
    
    # 기존 좋아요 확인
    existing_like = db.query(models.PostLike)\
        .filter(models.PostLike.post_id == post_id, models.PostLike.user_id == current_user.id)\
        .first()
    
    if existing_like:
        # 좋아요 취소
        db.delete(existing_like)
        post.likes_count = max(0, post.likes_count - 1)
        is_liked = False
    else:
        # 좋아요 추가
        new_like = models.PostLike(post_id=post_id, user_id=current_user.id)
        db.add(new_like)
        post.likes_count += 1
        is_liked = True
    
    db.commit()
    
    return {"is_liked": is_liked, "likes_count": post.likes_count}


@router.post("/api/posts/{post_id}/save")
def toggle_save(
    post_id: str,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """저장/찜 토글"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다.")
    
    # 기존 저장 확인
    existing_save = db.query(models.PostSave)\
        .filter(models.PostSave.post_id == post_id, models.PostSave.user_id == current_user.id)\
        .first()
    
    if existing_save:
        # 저장 취소
        db.delete(existing_save)
        is_saved = False
    else:
        # 저장 추가
        new_save = models.PostSave(post_id=post_id, user_id=current_user.id)
        db.add(new_save)
        is_saved = True
    
    db.commit()
    
    return {"is_saved": is_saved}


@router.get("/api/posts/{post_id}/comments", response_model=List[CommentResponse])
def get_comments(
    post_id: str,
    db: Session = Depends(get_db)
):
    """댓글 목록 조회"""
    comments = db.query(models.PostComment)\
        .filter(models.PostComment.post_id == post_id)\
        .order_by(models.PostComment.created_at)\
        .all()
    
    result = []
    for comment in comments:
        user = db.query(models.User).filter(models.User.id == comment.user_id).first()
        result.append(CommentResponse(
            id=comment.id,
            user_id=comment.user_id,
            user_name=user.name if user else "Unknown",
            content=comment.content,
            created_at=format_time_ago(comment.created_at)
        ))
    
    return result


@router.post("/api/posts/{post_id}/comments", response_model=CommentResponse)
def create_comment(
    post_id: str,
    req: CommentCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """댓글 작성"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if not post:
        raise HTTPException(status_code=404, detail="게시물을 찾을 수 없습니다.")
    
    if not req.content.strip():
        raise HTTPException(status_code=400, detail="댓글 내용이 필요합니다.")
    
    comment = models.PostComment(
        post_id=post_id,
        user_id=current_user.id,
        content=req.content.strip()
    )
    
    db.add(comment)
    post.comments_count += 1
    db.commit()
    db.refresh(comment)
    
    return CommentResponse(
        id=comment.id,
        user_id=comment.user_id,
        user_name=current_user.name,
        content=comment.content,
        created_at=format_time_ago(comment.created_at)
    )


@router.delete("/api/posts/{post_id}/comments/{comment_id}")
def delete_comment(
    post_id: str,
    comment_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """댓글 삭제"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    comment = db.query(models.PostComment)\
        .filter(models.PostComment.id == comment_id, models.PostComment.post_id == post_id)\
        .first()
    
    if not comment:
        raise HTTPException(status_code=404, detail="댓글을 찾을 수 없습니다.")
    
    if comment.user_id != current_user.id:
        raise HTTPException(status_code=403, detail="삭제 권한이 없습니다.")
    
    post = db.query(models.Post).filter(models.Post.id == post_id).first()
    if post:
        post.comments_count = max(0, post.comments_count - 1)
    
    db.delete(comment)
    db.commit()
    
    return {"message": "댓글이 삭제되었습니다."}
