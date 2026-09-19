"""메일함 집계 API.

메일은 별도의 복제 테이블이 아니라 이미 서비스에서 권위 있게 관리하는
친구 요청, 채팅방, 크루 제휴, 리워드 원장을 한 화면에서 묶어 보여준다.
덕분에 메일함에서 처리한 상태가 기존 기능(친구/제휴/채팅)과 바로 일치하고,
새로운 공개 테이블이나 별도 동기화 작업도 필요하지 않다.
"""

import json
from datetime import datetime
from typing import Any, Dict, Iterable, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from api.dependencies import require_user
from api.routers import chat as chat_router
from core.database import get_db
from domain import models


router = APIRouter()

MAIL_CATEGORIES = {"all", "friend", "crew", "partnership", "reward", "notice"}


def _iso(value: Optional[datetime]) -> Optional[str]:
    return value.isoformat() if value else None


def _member_ids(crew: models.Community) -> set[str]:
    """JSON member_ids의 과거 int/string 혼용까지 허용한다."""
    raw: List[Any] = []
    if crew.host_id is not None:
        raw.append(crew.host_id)
    raw.extend(crew.member_ids or [])
    return {str(value) for value in raw if value is not None}


def _crews_for_user(db: Session, user_id: int) -> List[models.Community]:
    return [crew for crew in db.query(models.Community).all() if str(user_id) in _member_ids(crew)]


def _message_preview(content: Optional[str]) -> str:
    """채팅의 구조화 메시지도 메일 카드에서는 한 줄로 읽히게 한다."""
    raw = content or ""
    try:
        payload = json.loads(raw)
    except (TypeError, ValueError):
        return raw[:80]

    labels = {
        "poll": "🗳️ 투표",
        "poll_confirmed": "📍 장소가 확정됐어요",
        "split": "💳 예약금 분담 요청",
        "split_completed": "🎉 예약이 확정됐어요",
        "split_cancelled": "분담 요청이 취소됐어요",
        "settlement": "💸 정산",
        "image": "📷 사진",
        "video": "🎬 동영상",
        "shared_items": "📍 장소를 공유했어요",
        "system": (payload.get("text") or "")[:80],
    }
    return labels.get(payload.get("type"), (payload.get("text") or "메시지")[:80])


def _base_item(
    *,
    item_id: str,
    category: str,
    item_type: str,
    title: str,
    preview: str,
    created_at: Optional[datetime],
    is_unread: bool = False,
    **extra: Any,
) -> Dict[str, Any]:
    item = {
        "id": item_id,
        "category": category,
        "type": item_type,
        "title": title,
        "preview": preview,
        "created_at": _iso(created_at),
        "is_unread": bool(is_unread),
        "unread": bool(is_unread),
    }
    item.update(extra)
    # 내부 정렬용 값은 응답 직전에 제거한다.
    item["_sort_at"] = created_at or datetime.min
    return item


def _partnership_item(
    app: models.CrewPartnershipApp,
    deal: models.CrewPartnership,
    place: Optional[models.Place],
    crew: models.Community,
) -> Dict[str, Any]:
    place_name = place.name if place else "가게"
    is_pending = app.status == "pending"
    conditions = deal.conditions or {}
    return _base_item(
        item_id=f"partnership:{app.id}",
        category="partnership",
        item_type="partnership_inquiry" if is_pending else "partnership_update",
        title=f"{place_name}에서 제휴를 제안했어요" if is_pending else f"{place_name} 제휴가 진행 중이에요",
        preview=app.message or deal.benefit or "크루 전용 제휴 조건을 확인해보세요.",
        created_at=app.created_at,
        is_unread=app.seen_at is None,
        app_id=app.id,
        partnership_id=deal.id,
        community_id=crew.id,
        conversation_room_id=crew.id,
        status=app.status,
        status_label="검토 필요" if is_pending else "제휴 중",
        can_respond=is_pending,
        crew={
            "id": crew.id,
            "title": crew.title or "우리 크루",
            "icon": crew.icon or "👥",
            "members": len(_member_ids(crew)),
        },
        store={
            "place_id": deal.place_id,
            "name": place_name,
            "address": place.address if place else "",
            "category": (place.cuisine_type or place.category or "") if place else "",
        },
        terms={
            "title": deal.title,
            "benefit": deal.benefit,
            "discount_pct": deal.discount_pct,
            "conditions": conditions,
            "expires_at": _iso(deal.expires_at),
        },
        message=app.message,
    )


def _room_items(
    db: Session,
    user: models.User,
    crews: Iterable[models.Community],
) -> List[Dict[str, Any]]:
    """기존 채팅방을 메일의 '대화' 카드로 노출한다."""
    crew_by_id = {crew.id: crew for crew in crews}
    room_ids = {
        room_id
        for (room_id,) in db.query(models.ChatRoomMember.room_id)
        .filter(models.ChatRoomMember.user_id == user.id)
        .all()
        if room_id
    }

    # 커뮤니티 멤버십만 있고 ChatRoomMember가 누락된 레거시 방도 기존 채팅과
    # 같은 자가 복구 경로를 사용한다.
    for crew in crews:
        room_ids.add(crew.id)
        try:
            chat_router._sync_room_members_from_community(db, crew.id)
        except Exception as exc:  # 메일함 전체가 채팅 데이터 때문에 실패하지 않도록
            print(f"[mail] crew room sync skipped: {exc}")

    if not room_ids:
        return []

    rooms = db.query(models.ChatRoom).filter(models.ChatRoom.id.in_(list(room_ids))).all()
    items: List[Dict[str, Any]] = []
    for room in rooms:
        last = (
            db.query(models.Message)
            .filter(models.Message.room_id == room.id)
            .order_by(models.Message.timestamp.desc())
            .first()
        )
        member = (
            db.query(models.ChatRoomMember)
            .filter(
                models.ChatRoomMember.room_id == room.id,
                models.ChatRoomMember.user_id == user.id,
            )
            .first()
        )
        read_since = (getattr(member, "last_read_at", None) if member else None) or (
            getattr(member, "joined_at", None) if member else None
        )
        unread_query = db.query(models.Message).filter(
            models.Message.room_id == room.id,
            models.Message.user_id != user.id,
        )
        if read_since is not None:
            unread_query = unread_query.filter(models.Message.timestamp > read_since)
        unread = unread_query.count()

        crew = crew_by_id.get(room.id)
        is_group = bool(room.is_group or crew)
        title = (room.title or (crew.title if crew else "새 대화")).strip()
        for prefix in ("[크루] ", "[모임] "):
            if title.startswith(prefix):
                title = title[len(prefix):]
        items.append(
            _base_item(
                item_id=f"chat:{room.id}",
                category="crew" if is_group else "friend",
                item_type="conversation",
                title=title or ("크루 대화" if is_group else "친구 대화"),
                preview=_message_preview(last.content) if last else "새로운 대화를 시작해보세요.",
                created_at=last.timestamp if last else room.created_at,
                is_unread=unread > 0,
                room_id=room.id,
                is_group=is_group,
                unread_count=unread,
                crew=(
                    {
                        "id": crew.id,
                        "title": crew.title or title,
                        "icon": crew.icon or "👥",
                    }
                    if crew
                    else None
                ),
            )
        )
    return items


@router.get("/api/mail/inbox")
def get_mail_inbox(
    category: str = Query("all"),
    user: models.User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """친구·크루·제휴·보상을 한 우편함으로 집계한다.

    공지/이벤트 보상 전용 테이블이 아직 없는 초기 서비스에서는 실제 원장만
    보여준다. 그래서 실제 데이터가 적어도 가짜 알림이 쌓이지 않고, 나중에
    보상/공지 원장이 추가되면 같은 응답 형태로 바로 확장할 수 있다.
    """
    if category not in MAIL_CATEGORIES:
        raise HTTPException(status_code=400, detail="지원하지 않는 메일 분류입니다.")

    crews = _crews_for_user(db, user.id)
    items: List[Dict[str, Any]] = []

    friendships = (
        db.query(models.Friendship)
        .filter(
            models.Friendship.receiver_id == user.id,
            models.Friendship.status == "pending",
        )
        .order_by(models.Friendship.created_at.desc())
        .limit(50)
        .all()
    )
    requester_ids = {row.requester_id for row in friendships if row.requester_id is not None}
    requesters = (
        {
            user_row.id: user_row
            for user_row in db.query(models.User).filter(models.User.id.in_(list(requester_ids))).all()
        }
        if requester_ids
        else {}
    )
    for friendship in friendships:
        requester = requesters.get(friendship.requester_id)
        requester_name = (requester.name if requester else None) or "새로운 친구"
        items.append(
            _base_item(
                item_id=f"friendship:{friendship.id}",
                category="friend",
                item_type="friend_request",
                title=f"{requester_name}님이 친구 요청을 보냈어요",
                preview="친구가 되면 바로 1:1 대화를 시작할 수 있어요.",
                created_at=friendship.created_at,
                is_unread=True,
                request_id=friendship.id,
                requester={
                    "id": requester.id if requester else friendship.requester_id,
                    "name": requester_name,
                    "avatar": requester.avatar if requester else None,
                },
                action="accept_friend",
            )
        )

    crew_ids = [crew.id for crew in crews]
    if crew_ids:
        apps = (
            db.query(models.CrewPartnershipApp)
            .filter(
                models.CrewPartnershipApp.community_id.in_(crew_ids),
                models.CrewPartnershipApp.direction == "store_invite",
                models.CrewPartnershipApp.status.in_(["pending", "approved"]),
            )
            .order_by(models.CrewPartnershipApp.created_at.desc())
            .limit(50)
            .all()
        )
        deal_ids = {app.partnership_id for app in apps if app.partnership_id is not None}
        deals = (
            {
                deal.id: deal
                for deal in db.query(models.CrewPartnership)
                .filter(models.CrewPartnership.id.in_(list(deal_ids))).all()
            }
            if deal_ids
            else {}
        )
        place_ids = {deal.place_id for deal in deals.values() if deal.place_id is not None}
        places = (
            {
                place.id: place
                for place in db.query(models.Place).filter(models.Place.id.in_(list(place_ids))).all()
            }
            if place_ids
            else {}
        )
        crew_by_id = {crew.id: crew for crew in crews}
        for app in apps:
            deal = deals.get(app.partnership_id)
            crew = crew_by_id.get(app.community_id)
            if not deal or not crew:
                continue
            items.append(_partnership_item(app, deal, places.get(deal.place_id), crew))

    rewards = (
        db.query(models.CoinHistory)
        .filter(
            models.CoinHistory.user_id == user.id,
            models.CoinHistory.type == "reward",
            models.CoinHistory.amount > 0,
        )
        .order_by(models.CoinHistory.created_at.desc())
        .limit(30)
        .all()
    )
    for reward in rewards:
        amount = int(reward.amount or 0)
        items.append(
            _base_item(
                item_id=f"reward:{reward.id}",
                category="reward",
                item_type="reward_history",
                title=reward.description or "활동 보상을 받았어요",
                preview=f"+{amount:,}원 · 수령 완료",
                created_at=reward.created_at,
                is_unread=False,
                amount=amount,
                reward_status="claimed",
            )
        )

    items.extend(_room_items(db, user, crews))

    counts = {key: 0 for key in MAIL_CATEGORIES if key != "all"}
    for item in items:
        if item["category"] in counts:
            counts[item["category"]] += 1
    counts["all"] = len(items)

    def sort_value(item: Dict[str, Any]) -> float:
        value = item.get("_sort_at")
        if not isinstance(value, datetime):
            return 0.0
        try:
            return value.timestamp()
        except (OSError, OverflowError, ValueError):
            return 0.0

    items.sort(key=sort_value, reverse=True)
    for item in items:
        item.pop("_sort_at", None)
    visible = items if category == "all" else [item for item in items if item["category"] == category]
    return {
        "items": visible,
        "counts": counts,
        "unread_count": sum(1 for item in items if item.get("is_unread")),
    }


@router.post("/api/mail/friend/{friendship_id}/accept")
def accept_friend_from_mail(
    friendship_id: int,
    user: models.User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """메일 카드에서 친구 수락 후 바로 이어갈 1:1 방을 준비한다."""
    friendship = (
        db.query(models.Friendship)
        .filter(
            models.Friendship.id == friendship_id,
            models.Friendship.receiver_id == user.id,
            models.Friendship.status == "pending",
        )
        .first()
    )
    if not friendship:
        raise HTTPException(status_code=404, detail="처리할 친구 요청을 찾을 수 없어요.")

    friendship.status = "accepted"
    db.flush()
    room = chat_router._find_or_create_dm(db, user.id, friendship.requester_id)
    db.commit()
    return {"ok": True, "room_id": room.id, "title": room.title, "status": "accepted"}


def _get_partnership_for_user(
    app_id: int,
    user: models.User,
    db: Session,
) -> models.CrewPartnershipApp:
    app = db.query(models.CrewPartnershipApp).filter(models.CrewPartnershipApp.id == app_id).first()
    if not app:
        raise HTTPException(status_code=404, detail="제휴 메일을 찾을 수 없어요.")
    crew = db.query(models.Community).filter(models.Community.id == app.community_id).first()
    if not crew or str(user.id) not in _member_ids(crew):
        raise HTTPException(status_code=403, detail="이 크루의 제휴 메일을 볼 수 없어요.")
    return app


@router.post("/api/mail/partnership/{app_id}/read")
def mark_partnership_mail_read(
    app_id: int,
    user: models.User = Depends(require_user),
    db: Session = Depends(get_db),
):
    app = _get_partnership_for_user(app_id, user, db)
    app.seen_at = datetime.now()
    db.commit()
    return {"ok": True, "app_id": app.id}
