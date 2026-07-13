"""
저장 폴더 및 공유 API 라우터
- 폴더 CRUD
- 아이템 저장/삭제
- 공유 담기/바로 공유
- 채팅방으로 공유
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import desc, func
from typing import List, Optional
from pydantic import BaseModel
from datetime import datetime

from core.database import get_db
from domain import models
from api.dependencies import get_current_user

router = APIRouter()


# === Pydantic Schemas ===

class FolderCreate(BaseModel):
    name: str
    icon: str = "📁"
    color: str = "#7C3AED"

class FolderUpdate(BaseModel):
    name: Optional[str] = None
    icon: Optional[str] = None
    color: Optional[str] = None

class FolderResponse(BaseModel):
    id: int
    name: str
    icon: str
    color: str
    is_default: bool
    item_count: int
    created_at: str
    is_public: bool = False
    description: Optional[str] = None

    class Config:
        from_attributes = True

class SaveItemRequest(BaseModel):
    folder_id: int
    item_type: str  # "post" or "place"
    post_id: Optional[str] = None
    place_id: Optional[int] = None
    memo: Optional[str] = None

class SavedItemResponse(BaseModel):
    id: int
    folder_id: int
    item_type: str
    post_id: Optional[str]
    place_id: Optional[int]
    memo: Optional[str]
    created_at: str
    # 추가 정보
    item_name: Optional[str] = None
    item_image: Optional[str] = None

class AddToCartRequest(BaseModel):
    item_type: str  # "post" or "place"
    post_id: Optional[str] = None
    place_id: Optional[int] = None

class ShareToRoomRequest(BaseModel):
    room_id: str
    item_ids: List[int] = []  # share_cart ids, 비어있으면 cart 전체
    message: Optional[str] = None

class DirectShareRequest(BaseModel):
    room_id: str
    item_type: str
    post_id: Optional[str] = None
    place_id: Optional[int] = None
    message: Optional[str] = None


# === Helper Functions ===

def format_datetime(dt: datetime) -> str:
    if not dt:
        return ""
    return dt.strftime("%Y.%m.%d %H:%M")

def ensure_default_folder(db: Session, user_id: int) -> models.SaveFolder:
    """기본 폴더가 없으면 생성"""
    default = db.query(models.SaveFolder).filter(
        models.SaveFolder.user_id == user_id,
        models.SaveFolder.is_default == True
    ).first()
    
    if not default:
        default = models.SaveFolder(
            user_id=user_id,
            name="모든 저장",
            icon="💾",
            is_default=True
        )
        db.add(default)
        db.commit()
        db.refresh(default)
    
    return default


# === 폴더 API ===

@router.get("/api/folders", response_model=List[FolderResponse])
def get_folders(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """내 폴더 목록 조회"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    # 기본 폴더 확인
    ensure_default_folder(db, current_user.id)
    
    folders = db.query(models.SaveFolder)\
        .filter(models.SaveFolder.user_id == current_user.id)\
        .order_by(desc(models.SaveFolder.is_default), models.SaveFolder.created_at)\
        .all()

    # item_count는 저장된 카운터가 어긋날 수 있으므로 실제 항목 수로 계산(0으로 뜨던 버그 방지)
    counts = {}
    if folders:
        rows = db.query(models.SavedItem.folder_id, func.count(models.SavedItem.id))\
            .filter(models.SavedItem.folder_id.in_([f.id for f in folders]))\
            .group_by(models.SavedItem.folder_id).all()
        counts = {fid: n for fid, n in rows}

    return [FolderResponse(
        id=f.id,
        name=f.name,
        icon=f.icon,
        color=f.color,
        is_default=f.is_default,
        item_count=counts.get(f.id, 0),
        created_at=format_datetime(f.created_at),
        is_public=bool(getattr(f, "is_public", False)),
        description=getattr(f, "description", None),
    ) for f in folders]


@router.post("/api/folders", response_model=FolderResponse)
def create_folder(
    req: FolderCreate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """새 폴더 생성"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    if not req.name.strip():
        raise HTTPException(status_code=400, detail="폴더 이름이 필요합니다.")
    
    folder = models.SaveFolder(
        user_id=current_user.id,
        name=req.name.strip(),
        icon=req.icon,
        color=req.color
    )
    
    db.add(folder)
    db.commit()
    db.refresh(folder)
    
    return FolderResponse(
        id=folder.id,
        name=folder.name,
        icon=folder.icon,
        color=folder.color,
        is_default=folder.is_default,
        item_count=0,
        created_at=format_datetime(folder.created_at),
        is_public=bool(getattr(folder, "is_public", False)),
        description=getattr(folder, "description", None),
    )


@router.put("/api/folders/{folder_id}", response_model=FolderResponse)
def update_folder(
    folder_id: int,
    req: FolderUpdate,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """폴더 수정"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    folder = db.query(models.SaveFolder).filter(
        models.SaveFolder.id == folder_id,
        models.SaveFolder.user_id == current_user.id
    ).first()
    
    if not folder:
        raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다.")
    
    if folder.is_default:
        raise HTTPException(status_code=400, detail="기본 폴더는 수정할 수 없습니다.")
    
    if req.name:
        folder.name = req.name.strip()
    if req.icon:
        folder.icon = req.icon
    if req.color:
        folder.color = req.color
    
    db.commit()
    db.refresh(folder)
    
    return FolderResponse(
        id=folder.id,
        name=folder.name,
        icon=folder.icon,
        color=folder.color,
        is_default=folder.is_default,
        item_count=folder.item_count,
        created_at=format_datetime(folder.created_at),
        is_public=bool(getattr(folder, "is_public", False)),
        description=getattr(folder, "description", None),
    )


@router.delete("/api/folders/{folder_id}")
def delete_folder(
    folder_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """폴더 삭제"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    folder = db.query(models.SaveFolder).filter(
        models.SaveFolder.id == folder_id,
        models.SaveFolder.user_id == current_user.id
    ).first()
    
    if not folder:
        raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다.")
    
    if folder.is_default:
        raise HTTPException(status_code=400, detail="기본 폴더는 삭제할 수 없습니다.")
    
    db.delete(folder)
    db.commit()
    
    return {"message": "폴더가 삭제되었습니다."}


# === 저장 아이템 API ===

@router.get("/api/folders/{folder_id}/items", response_model=List[SavedItemResponse])
def get_folder_items(
    folder_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """폴더 내 아이템 조회"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    folder = db.query(models.SaveFolder).filter(
        models.SaveFolder.id == folder_id,
        models.SaveFolder.user_id == current_user.id
    ).first()
    
    if not folder:
        raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다.")
    
    items = db.query(models.SavedItem)\
        .filter(models.SavedItem.folder_id == folder_id)\
        .order_by(desc(models.SavedItem.created_at))\
        .all()
    
    result = []
    for item in items:
        item_name = None
        item_image = None
        
        if item.item_type == "post" and item.post_id:
            post = db.query(models.Post).filter(models.Post.id == item.post_id).first()
            if post:
                item_name = post.content[:30] if post.content else "게시물"
                item_image = post.image_urls[0] if post.image_urls else None
        elif item.item_type == "place" and item.place_id:
            place = db.query(models.Place).filter(models.Place.id == item.place_id).first()
            if place:
                item_name = place.name
        
        result.append(SavedItemResponse(
            id=item.id,
            folder_id=item.folder_id,
            item_type=item.item_type,
            post_id=item.post_id,
            place_id=item.place_id,
            memo=item.memo,
            created_at=format_datetime(item.created_at),
            item_name=item_name,
            item_image=item_image
        ))
    
    return result


@router.post("/api/saves", response_model=SavedItemResponse)
def save_item(
    req: SaveItemRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """아이템 저장 (폴더에 추가)"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    # 폴더 확인
    folder = db.query(models.SaveFolder).filter(
        models.SaveFolder.id == req.folder_id,
        models.SaveFolder.user_id == current_user.id
    ).first()
    
    if not folder:
        raise HTTPException(status_code=404, detail="폴더를 찾을 수 없습니다.")
    
    # 유효성 검사
    if req.item_type not in ["post", "place"]:
        raise HTTPException(status_code=400, detail="item_type은 'post' 또는 'place'여야 합니다.")
    
    if req.item_type == "post" and not req.post_id:
        raise HTTPException(status_code=400, detail="post_id가 필요합니다.")
    if req.item_type == "place" and not req.place_id:
        raise HTTPException(status_code=400, detail="place_id가 필요합니다.")
    
    # 중복 확인
    existing = db.query(models.SavedItem).filter(
        models.SavedItem.folder_id == req.folder_id,
        models.SavedItem.item_type == req.item_type,
        models.SavedItem.post_id == req.post_id if req.item_type == "post" else True,
        models.SavedItem.place_id == req.place_id if req.item_type == "place" else True
    ).first()
    
    if existing:
        raise HTTPException(status_code=400, detail="이미 저장된 아이템입니다.")
    
    # 저장
    saved_item = models.SavedItem(
        folder_id=req.folder_id,
        user_id=current_user.id,
        item_type=req.item_type,
        post_id=req.post_id if req.item_type == "post" else None,
        place_id=req.place_id if req.item_type == "place" else None,
        memo=req.memo
    )
    
    db.add(saved_item)
    folder.item_count += 1
    db.commit()
    db.refresh(saved_item)
    
    return SavedItemResponse(
        id=saved_item.id,
        folder_id=saved_item.folder_id,
        item_type=saved_item.item_type,
        post_id=saved_item.post_id,
        place_id=saved_item.place_id,
        memo=saved_item.memo,
        created_at=format_datetime(saved_item.created_at),
        item_name=None,
        item_image=None
    )


@router.delete("/api/saves/{item_id}")
def unsave_item(
    item_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """저장 취소"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    item = db.query(models.SavedItem).filter(
        models.SavedItem.id == item_id,
        models.SavedItem.user_id == current_user.id
    ).first()
    
    if not item:
        raise HTTPException(status_code=404, detail="저장된 아이템을 찾을 수 없습니다.")
    
    # 폴더 카운트 감소
    folder = db.query(models.SaveFolder).filter(models.SaveFolder.id == item.folder_id).first()
    if folder:
        folder.item_count = max(0, folder.item_count - 1)
    
    db.delete(item)
    db.commit()
    
    return {"message": "저장이 취소되었습니다."}


# === 공유 담기 API ===

@router.get("/api/share-cart")
def get_share_cart(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """공유 담기 목록 조회"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    cart_items = db.query(models.ShareCart)\
        .filter(models.ShareCart.user_id == current_user.id)\
        .order_by(desc(models.ShareCart.created_at))\
        .all()
    
    result = []
    for item in cart_items:
        item_data = {
            "id": item.id,
            "item_type": item.item_type,
            "post_id": item.post_id,
            "place_id": item.place_id,
            "name": None,
            "image": None
        }
        
        if item.item_type == "post" and item.post_id:
            post = db.query(models.Post).filter(models.Post.id == item.post_id).first()
            if post:
                item_data["name"] = post.content[:30] if post.content else "게시물"
                item_data["image"] = post.image_urls[0] if post.image_urls else None
        elif item.item_type == "place" and item.place_id:
            place = db.query(models.Place).filter(models.Place.id == item.place_id).first()
            if place:
                item_data["name"] = place.name
        
        result.append(item_data)
    
    return {"items": result, "count": len(result)}


@router.post("/api/share-cart")
def add_to_cart(
    req: AddToCartRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """담기에 추가"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    # 중복 확인
    existing = db.query(models.ShareCart).filter(
        models.ShareCart.user_id == current_user.id,
        models.ShareCart.item_type == req.item_type,
        models.ShareCart.post_id == req.post_id if req.item_type == "post" else True,
        models.ShareCart.place_id == req.place_id if req.item_type == "place" else True
    ).first()
    
    if existing:
        return {"message": "이미 담겨있습니다.", "already_added": True}
    
    cart_item = models.ShareCart(
        user_id=current_user.id,
        item_type=req.item_type,
        post_id=req.post_id if req.item_type == "post" else None,
        place_id=req.place_id if req.item_type == "place" else None
    )
    
    db.add(cart_item)
    db.commit()
    
    return {"message": "담기에 추가되었습니다.", "id": cart_item.id}


@router.delete("/api/share-cart/{item_id}")
def remove_from_cart(
    item_id: int,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """담기에서 제거"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    item = db.query(models.ShareCart).filter(
        models.ShareCart.id == item_id,
        models.ShareCart.user_id == current_user.id
    ).first()
    
    if item:
        db.delete(item)
        db.commit()
    
    return {"message": "담기에서 제거되었습니다."}


@router.delete("/api/share-cart")
def clear_cart(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """담기 비우기"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    db.query(models.ShareCart)\
        .filter(models.ShareCart.user_id == current_user.id)\
        .delete()
    db.commit()
    
    return {"message": "담기가 비워졌습니다."}


# === 공유하기 API ===

@router.get("/api/share/rooms")
def get_shareable_rooms(
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """공유 가능한 채팅방 목록"""
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    # 내가 속한 채팅방 조회
    memberships = db.query(models.ChatRoomMember)\
        .filter(models.ChatRoomMember.user_id == current_user.id)\
        .all()
    
    room_ids = [m.room_id for m in memberships]
    
    rooms = db.query(models.ChatRoom)\
        .filter(models.ChatRoom.id.in_(room_ids))\
        .all()
    
    result = []
    for room in rooms:
        # 채팅방 멤버 수 조회
        member_count = db.query(models.ChatRoomMember)\
            .filter(models.ChatRoomMember.room_id == room.id)\
            .count()
        
        result.append({
            "id": room.id,
            "title": room.title or "채팅방",
            "is_group": room.is_group,
            "member_count": member_count
        })
    
    return {"rooms": result}


@router.post("/api/share/direct")
def share_direct(
    req: DirectShareRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """바로 공유 (단일 아이템)"""
    import json
    
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    # 채팅방 멤버인지 확인
    membership = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == req.room_id,
        models.ChatRoomMember.user_id == current_user.id
    ).first()
    
    if not membership:
        raise HTTPException(status_code=403, detail="해당 채팅방에 접근할 수 없습니다.")
    
    # 아이템 상세 정보 조회
    item_detail = {
        "type": req.item_type,
        "post_id": req.post_id,
        "place_id": req.place_id,
        "name": "아이템",
        "image": None,
        "content": None
    }
    
    if req.item_type == "post" and req.post_id:
        post = db.query(models.Post).filter(models.Post.id == req.post_id).first()
        if post:
            item_detail["name"] = post.content[:30] if post.content else "게시물"
            item_detail["content"] = post.content[:100] if post.content else ""
            item_detail["image"] = post.image_urls[0] if post.image_urls else None
    elif req.item_type == "place" and req.place_id:
        place = db.query(models.Place).filter(models.Place.id == req.place_id).first()
        if place:
            item_detail["name"] = place.name
            item_detail["content"] = place.address if hasattr(place, 'address') else ""
    
    # 공유 내역 저장
    shared_msg = models.SharedMessage(
        sender_id=current_user.id,
        room_id=req.room_id,
        shared_items=[item_detail],
        message=req.message
    )
    
    db.add(shared_msg)
    
    # 채팅 메시지 생성 (JSON 형식으로 카드 렌더링용)
    chat_content = json.dumps({
        "type": "shared_items",
        "items": [item_detail],
        "message": req.message,
        "sender_name": current_user.name
    }, ensure_ascii=False)
    
    chat_msg = models.Message(
        room_id=req.room_id,
        user_id=current_user.id,
        content=chat_content
    )
    
    db.add(chat_msg)
    db.commit()
    
    return {"message": "공유되었습니다.", "shared_message_id": shared_msg.id}


@router.post("/api/share/cart")
def share_cart(
    req: ShareToRoomRequest,
    current_user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """담기 공유 (여러 아이템)"""
    import json
    
    if not current_user:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    
    # 채팅방 멤버인지 확인
    membership = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == req.room_id,
        models.ChatRoomMember.user_id == current_user.id
    ).first()
    
    if not membership:
        raise HTTPException(status_code=403, detail="해당 채팅방에 접근할 수 없습니다.")
    
    # 담기 아이템 가져오기
    if req.item_ids:
        cart_items = db.query(models.ShareCart).filter(
            models.ShareCart.id.in_(req.item_ids),
            models.ShareCart.user_id == current_user.id
        ).all()
    else:
        cart_items = db.query(models.ShareCart).filter(
            models.ShareCart.user_id == current_user.id
        ).all()
    
    if not cart_items:
        raise HTTPException(status_code=400, detail="담기에 아이템이 없습니다.")
    
    # 아이템 상세 정보 조회
    item_details = []
    for item in cart_items:
        item_detail = {
            "type": item.item_type,
            "post_id": item.post_id,
            "place_id": item.place_id,
            "name": "아이템",
            "image": None,
            "content": None
        }
        
        if item.item_type == "post" and item.post_id:
            post = db.query(models.Post).filter(models.Post.id == item.post_id).first()
            if post:
                item_detail["name"] = post.content[:30] if post.content else "게시물"
                item_detail["content"] = post.content[:100] if post.content else ""
                item_detail["image"] = post.image_urls[0] if post.image_urls else None
        elif item.item_type == "place" and item.place_id:
            place = db.query(models.Place).filter(models.Place.id == item.place_id).first()
            if place:
                item_detail["name"] = place.name
                item_detail["content"] = place.address if hasattr(place, 'address') else ""
        
        item_details.append(item_detail)
    
    # 공유 내역 저장
    shared_msg = models.SharedMessage(
        sender_id=current_user.id,
        room_id=req.room_id,
        shared_items=item_details,
        message=req.message
    )
    
    db.add(shared_msg)
    
    # 채팅 메시지 생성 (JSON 형식으로 카드 렌더링용)
    chat_content = json.dumps({
        "type": "shared_items",
        "items": item_details,
        "message": req.message,
        "sender_name": current_user.name
    }, ensure_ascii=False)
    
    chat_msg = models.Message(
        room_id=req.room_id,
        user_id=current_user.id,
        content=chat_content
    )
    
    db.add(chat_msg)
    
    # 담기 비우기
    for item in cart_items:
        db.delete(item)
    
    db.commit()
    
    return {"message": f"{len(cart_items)}개 아이템이 공유되었습니다.", "shared_message_id": shared_msg.id}
