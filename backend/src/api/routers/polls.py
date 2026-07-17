# -*- coding: utf-8 -*-
"""채팅방 투표 카드 API — 장소/일정 조율.
- 생성: 만든 사람이 옵션 시드(AI 추천 상위 N)와 함께 생성 → 채팅에 poll 메시지 발행
- 후보: 멤버 누구나 실시간 추가, 내가 추가한 건 삭제 가능(만든 사람은 전부 삭제 가능)
- 투표: 1인 1표(변경 가능)
- 확정: 만든 사람만. 확정 시 카드 잠금 + 시스템 메시지
모든 변경은 기존 채팅 WS로 poll_update 브로드캐스트 → 전원 실시간 반영.
"""
import json
from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from api.dependencies import get_current_user
from api.routers.chat import manager, _sync_room_members_from_community, kst_hhmm

router = APIRouter()


def _require_member(db: Session, room_id: str, user_id: int):
    _sync_room_members_from_community(db, room_id)
    ok = (
        db.query(models.ChatRoomMember)
        .filter(models.ChatRoomMember.room_id == room_id, models.ChatRoomMember.user_id == user_id)
        .first()
    )
    if not ok:
        raise HTTPException(status_code=403, detail="채팅방 멤버만 가능합니다.")


def _serialize_poll(db: Session, poll: models.ChatPoll, me_id: Optional[int] = None) -> dict:
    options = (
        db.query(models.ChatPollOption)
        .filter(models.ChatPollOption.poll_id == poll.id)
        .order_by(models.ChatPollOption.created_at)
        .all()
    )
    votes = db.query(models.ChatPollVote).filter(models.ChatPollVote.poll_id == poll.id).all()
    vote_count: dict = {}
    my_vote = None
    for v in votes:
        vote_count[v.option_id] = vote_count.get(v.option_id, 0) + 1
        if me_id is not None and v.user_id == me_id:
            my_vote = v.option_id

    uids = {o.added_by for o in options if o.added_by} | {poll.creator_id}
    users = {u.id: u.name for u in db.query(models.User).filter(models.User.id.in_(list(uids))).all()}

    opts = [
        {
            "id": o.id,
            "label": o.label,
            "place_id": o.place_id,
            "meta": o.meta or {},
            "added_by": o.added_by,
            "added_by_name": None if o.added_by is None else users.get(o.added_by, ""),
            "votes": vote_count.get(o.id, 0),
            "voted_by_me": my_vote == o.id,
        }
        for o in options
    ]
    # 표 많은 순 → 먼저 담긴 순
    opts.sort(key=lambda x: (-x["votes"], x["id"]))
    return {
        "id": poll.id,
        "room_id": poll.room_id,
        "kind": poll.kind,
        "title": poll.title or ("어디서 만날까요?" if poll.kind == "place" else "언제 만날까요?"),
        "meta": poll.meta or {},
        "status": poll.status,
        "confirmed_option_id": poll.confirmed_option_id,
        "creator_id": poll.creator_id,
        "creator_name": users.get(poll.creator_id, ""),
        "is_creator": me_id == poll.creator_id,
        "total_votes": len(votes),
        "options": opts,
    }


async def _broadcast_poll(db: Session, poll: models.ChatPoll):
    await manager.broadcast({"type": "poll_update", "poll": _serialize_poll(db, poll)}, poll.room_id)


@router.post("/api/chat/rooms/{room_id}/polls")
async def create_poll(
    room_id: str,
    req: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    _require_member(db, room_id, current_user.id)

    kind = str(req.get("kind") or "place")
    if kind not in ("place", "schedule"):
        raise HTTPException(status_code=400, detail="kind는 place|schedule")

    poll = models.ChatPoll(
        room_id=room_id,
        creator_id=current_user.id,
        kind=kind,
        title=req.get("title"),
        meta=req.get("meta") or {},
    )
    db.add(poll)
    db.flush()

    # 시드 옵션(프론트가 AI 추천 상위 N 전달; added_by_ai=True면 AI 뱃지)
    for o in (req.get("options") or [])[:10]:
        if not o.get("label"):
            continue
        db.add(models.ChatPollOption(
            poll_id=poll.id,
            added_by=None if o.get("added_by_ai") else current_user.id,
            place_id=o.get("place_id"),
            label=str(o["label"])[:80],
            meta=o.get("meta") or {},
        ))

    # 채팅 스트림에 poll 메시지 발행
    content = json.dumps({"type": "poll", "poll_id": poll.id, "kind": kind}, ensure_ascii=False)
    msg = models.Message(room_id=room_id, user_id=current_user.id, content=content)
    db.add(msg)
    db.commit()

    await manager.broadcast(
        {
            "id": msg.id,
            "user_id": current_user.id,
            "name": current_user.name,
            "content": content,
            "timestamp": kst_hhmm(),
        },
        room_id,
    )

    # 🔔 푸시: 멤버들에게 투표 시작 알림
    try:
        from services import push_service
        if push_service.push_enabled():
            member_ids = [m.user_id for m in db.query(models.ChatRoomMember).filter(
                models.ChatRoomMember.room_id == room_id).all()]
            room = db.query(models.ChatRoom).filter(models.ChatRoom.id == room_id).first()
            what = "장소" if kind == "place" else "일정"
            push_service.notify_users_async(
                member_ids,
                (room.title if room else "랑데부").replace("[모임] ", ""),
                f"🗳️ {current_user.name}님이 {what} 투표를 올렸어요 — 후보를 담고 투표해보세요!",
                {"room_id": str(room_id), "poll_id": str(poll.id)},
                exclude_user_id=current_user.id,
            )
    except Exception as _e:
        print(f"[Push] poll hook skip: {_e}")

    return _serialize_poll(db, poll, current_user.id)


@router.get("/api/chat/polls/active")
def my_active_polls(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """내가 속한 방들의 진행 중(open) 장소 투표 — 탐색/추천 탭 '투표에 담기' 입구용."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    room_ids = [
        r[0]
        for r in db.query(models.ChatRoomMember.room_id)
        .filter(models.ChatRoomMember.user_id == current_user.id)
        .all()
    ]
    if not room_ids:
        return {"items": []}
    polls = (
        db.query(models.ChatPoll)
        .filter(
            models.ChatPoll.room_id.in_(room_ids),
            models.ChatPoll.status == "open",
            models.ChatPoll.kind == "place",
        )
        .order_by(models.ChatPoll.created_at.desc())
        .limit(10)
        .all()
    )
    rooms = {r.id: r for r in db.query(models.ChatRoom).filter(models.ChatRoom.id.in_([p.room_id for p in polls])).all()}
    out = []
    for p in polls:
        cnt = db.query(models.ChatPollOption).filter(models.ChatPollOption.poll_id == p.id).count()
        room = rooms.get(p.room_id)
        out.append({
            "poll_id": p.id,
            "room_id": p.room_id,
            "room_title": (room.title if room else "").replace("[모임] ", ""),
            "option_count": cnt,
            "created_at": p.created_at.isoformat() if p.created_at else None,
        })
    return {"items": out}


@router.get("/api/chat/rooms/{room_id}/polls")
def room_polls(
    room_id: str,
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """방의 투표 목록 — status=confirmed면 확정 히스토리(방문 히스토리 카드용)."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    _require_member(db, room_id, current_user.id)
    q = db.query(models.ChatPoll).filter(models.ChatPoll.room_id == room_id)
    if status:
        q = q.filter(models.ChatPoll.status == status)
    polls = q.order_by(models.ChatPoll.created_at.desc()).limit(30).all()
    out = []
    for p in polls:
        item = {
            "poll_id": p.id,
            "kind": p.kind,
            "status": p.status,
            "created_at": p.created_at.isoformat() if p.created_at else None,
            "confirmed": None,
        }
        if p.confirmed_option_id:
            opt = db.query(models.ChatPollOption).filter(models.ChatPollOption.id == p.confirmed_option_id).first()
            if opt:
                item["confirmed"] = {"label": opt.label, "place_id": opt.place_id, "meta": opt.meta or {}}
        out.append(item)
    return {"items": out}


@router.get("/api/chat/polls/{poll_id}")
def get_poll(
    poll_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    poll = db.query(models.ChatPoll).filter(models.ChatPoll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="투표를 찾을 수 없어요.")
    return _serialize_poll(db, poll, current_user.id if current_user else None)


@router.post("/api/chat/polls/{poll_id}/options")
async def add_option(
    poll_id: int,
    req: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    poll = db.query(models.ChatPoll).filter(models.ChatPoll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="투표를 찾을 수 없어요.")
    if poll.status != "open":
        raise HTTPException(status_code=400, detail="이미 확정된 투표예요.")
    _require_member(db, poll.room_id, current_user.id)

    label = str(req.get("label") or "").strip()
    if not label:
        raise HTTPException(status_code=400, detail="후보 이름이 필요해요.")
    # 같은 장소 중복 방지
    place_id = req.get("place_id")
    dup = (
        db.query(models.ChatPollOption)
        .filter(models.ChatPollOption.poll_id == poll_id)
        .filter(
            (models.ChatPollOption.place_id == place_id)
            if place_id
            else (models.ChatPollOption.label == label)
        )
        .first()
    )
    if dup:
        raise HTTPException(status_code=409, detail="이미 후보에 있어요.")
    opt = models.ChatPollOption(
        poll_id=poll_id,
        added_by=current_user.id,
        place_id=place_id,
        label=label[:80],
        meta=req.get("meta") or {},
    )
    db.add(opt)
    db.commit()
    await _broadcast_poll(db, poll)
    return _serialize_poll(db, poll, current_user.id)


@router.delete("/api/chat/polls/{poll_id}/options/{option_id}")
async def remove_option(
    poll_id: int,
    option_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    poll = db.query(models.ChatPoll).filter(models.ChatPoll.id == poll_id).first()
    if not poll or poll.status != "open":
        raise HTTPException(status_code=400, detail="삭제할 수 없는 투표예요.")
    opt = (
        db.query(models.ChatPollOption)
        .filter(models.ChatPollOption.id == option_id, models.ChatPollOption.poll_id == poll_id)
        .first()
    )
    if not opt:
        raise HTTPException(status_code=404, detail="후보를 찾을 수 없어요.")
    # 내가 추가한 후보 or 투표 만든 사람만
    if opt.added_by != current_user.id and poll.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="내가 추가한 후보만 뺄 수 있어요.")
    db.query(models.ChatPollVote).filter(
        models.ChatPollVote.poll_id == poll_id, models.ChatPollVote.option_id == option_id
    ).delete()
    db.delete(opt)
    db.commit()
    await _broadcast_poll(db, poll)
    return _serialize_poll(db, poll, current_user.id)


@router.delete("/api/chat/polls/{poll_id}")
async def delete_poll(
    poll_id: int,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """투표 삭제 — 만든 사람만, 진행 중(open)일 때만(확정된 건 기록 유지).
    카드 메시지도 함께 지우고 message_deleted 브로드캐스트로 전원 화면에서 제거."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    poll = db.query(models.ChatPoll).filter(models.ChatPoll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="투표를 찾을 수 없어요.")
    if poll.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="투표를 만든 사람만 삭제할 수 있어요.")
    if poll.status != "open":
        raise HTTPException(status_code=400, detail="확정된 투표는 삭제할 수 없어요.")

    room_id = poll.room_id
    # 카드 메시지 제거
    deleted_msg_ids = []
    for m in db.query(models.Message).filter(models.Message.room_id == room_id).all():
        content = m.content or ""
        if '"type": "poll"' in content and f'"poll_id": {poll_id}' in content:
            deleted_msg_ids.append(m.id)
            db.delete(m)
    db.query(models.ChatPollVote).filter(models.ChatPollVote.poll_id == poll_id).delete()
    db.query(models.ChatPollOption).filter(models.ChatPollOption.poll_id == poll_id).delete()
    db.delete(poll)
    db.commit()

    for mid in deleted_msg_ids:
        await manager.broadcast({"type": "message_deleted", "message_id": mid}, room_id)
    return {"ok": True, "deleted": True}


@router.post("/api/chat/polls/{poll_id}/vote")
async def vote(
    poll_id: int,
    req: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    poll = db.query(models.ChatPoll).filter(models.ChatPoll.id == poll_id).first()
    if not poll or poll.status != "open":
        raise HTTPException(status_code=400, detail="투표할 수 없는 상태예요.")
    _require_member(db, poll.room_id, current_user.id)

    option_id = req.get("option_id")
    opt = (
        db.query(models.ChatPollOption)
        .filter(models.ChatPollOption.id == option_id, models.ChatPollOption.poll_id == poll_id)
        .first()
    )
    if not opt:
        raise HTTPException(status_code=404, detail="후보를 찾을 수 없어요.")

    existing = (
        db.query(models.ChatPollVote)
        .filter(models.ChatPollVote.poll_id == poll_id, models.ChatPollVote.user_id == current_user.id)
        .first()
    )
    if existing and existing.option_id == option_id:
        db.delete(existing)  # 같은 옵션 다시 누르면 투표 취소
    elif existing:
        existing.option_id = option_id  # 표 옮기기
    else:
        db.add(models.ChatPollVote(poll_id=poll_id, option_id=option_id, user_id=current_user.id))
    db.commit()
    await _broadcast_poll(db, poll)
    return _serialize_poll(db, poll, current_user.id)


@router.post("/api/chat/polls/{poll_id}/confirm")
async def confirm_poll(
    poll_id: int,
    req: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")
    poll = db.query(models.ChatPoll).filter(models.ChatPoll.id == poll_id).first()
    if not poll:
        raise HTTPException(status_code=404, detail="투표를 찾을 수 없어요.")
    if poll.creator_id != current_user.id:
        raise HTTPException(status_code=403, detail="투표를 만든 사람만 확정할 수 있어요.")
    if poll.status != "open":
        raise HTTPException(status_code=400, detail="이미 확정된 투표예요.")

    option_id = req.get("option_id")
    if option_id is None:
        # 기본: 최다 득표(동률이면 먼저 담긴 후보)
        s = _serialize_poll(db, poll)
        if not s["options"]:
            raise HTTPException(status_code=400, detail="후보가 없어요.")
        option_id = s["options"][0]["id"]
    opt = (
        db.query(models.ChatPollOption)
        .filter(models.ChatPollOption.id == option_id, models.ChatPollOption.poll_id == poll_id)
        .first()
    )
    if not opt:
        raise HTTPException(status_code=404, detail="후보를 찾을 수 없어요.")

    poll.status = "confirmed"
    poll.confirmed_option_id = opt.id

    # 확정 시스템 메시지
    verb = "장소" if poll.kind == "place" else "일정"
    content = json.dumps(
        {"type": "poll_confirmed", "poll_id": poll.id, "kind": poll.kind,
         "label": opt.label, "place_id": opt.place_id, "meta": opt.meta or {}},
        ensure_ascii=False,
    )
    msg = models.Message(room_id=poll.room_id, user_id=current_user.id, content=content)
    db.add(msg)
    db.commit()

    await _broadcast_poll(db, poll)
    await manager.broadcast(
        {
            "id": msg.id,
            "user_id": current_user.id,
            "name": current_user.name,
            "content": content,
            "timestamp": kst_hhmm(),
        },
        poll.room_id,
    )

    # 🔔 푸시: 확정 알림
    try:
        from services import push_service
        if push_service.push_enabled():
            member_ids = [m.user_id for m in db.query(models.ChatRoomMember).filter(
                models.ChatRoomMember.room_id == poll.room_id).all()]
            room = db.query(models.ChatRoom).filter(models.ChatRoom.id == poll.room_id).first()
            emoji = "📍" if poll.kind == "place" else "📅"
            push_service.notify_users_async(
                member_ids,
                (room.title if room else "랑데부").replace("[모임] ", ""),
                f"{emoji} '{opt.label}'(으)로 확정됐어요!",
                {"room_id": str(poll.room_id), "poll_id": str(poll.id)},
                exclude_user_id=current_user.id,
            )
    except Exception as _e:
        print(f"[Push] confirm hook skip: {_e}")

    return _serialize_poll(db, poll, current_user.id)
