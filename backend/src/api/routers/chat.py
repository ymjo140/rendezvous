from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict
import json
from datetime import datetime, timedelta

from sqlalchemy.orm.attributes import flag_modified

from core.database import get_db
from domain import models
from schemas import user as user_schemas
from api.dependencies import get_current_user

router = APIRouter()

# --- WebSocket 관리자 ---
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, room_id: str):
        await websocket.accept()
        if room_id not in self.active_connections:
            self.active_connections[room_id] = []
        self.active_connections[room_id].append(websocket)

    def disconnect(self, websocket: WebSocket, room_id: str):
        if room_id in self.active_connections:
            if websocket in self.active_connections[room_id]:
                self.active_connections[room_id].remove(websocket)

    async def broadcast(self, message: dict, room_id: str):
        if room_id in self.active_connections:
            for connection in self.active_connections[room_id]:
                try:
                    await connection.send_text(json.dumps(message, ensure_ascii=False))
                except:
                    pass

manager = ConnectionManager()

# --- 1. 채팅방 목록 (수정됨) ---
def _sync_room_members_from_community(db: Session, room_id: str) -> None:
    """Community.member_ids/host_id ↔ ChatRoomMember 동기화(레거시/누락 자가복구).
    모임 채팅방 id == community id. 두 소스가 어긋난 방을 보정한다."""
    comm = db.query(models.Community).filter(models.Community.id == room_id).first()
    if not comm:
        return
    expected = set(comm.member_ids or [])
    if comm.host_id:
        expected.add(comm.host_id)
    if not expected:
        return
    existing = {m.user_id for m in db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == room_id).all()}
    missing = [uid for uid in expected if uid not in existing]
    if missing:
        for uid in missing:
            db.add(models.ChatRoomMember(room_id=room_id, user_id=uid))
        db.commit()


@router.get("/api/chat/rooms")
def get_chat_rooms(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 1) ChatRoomMember 기준 내 방
    room_ids = {r[0] for r in db.query(models.ChatRoomMember.room_id).filter(
        models.ChatRoomMember.user_id == current_user.id).all()}

    # 2) 커뮤니티 멤버십 기준 보정 — 내가 호스트이거나 member_ids에 있는 모임방도 포함(+동기화)
    try:
        comms = db.query(models.Community).all()
        for c in comms:
            if c.host_id == current_user.id or current_user.id in (c.member_ids or []):
                room_ids.add(c.id)
                _sync_room_members_from_community(db, c.id)
    except Exception as exc:
        print(f"[chat] community 동기화 스킵: {exc}")

    rooms = db.query(models.ChatRoom).filter(models.ChatRoom.id.in_(list(room_ids))).all()
    result = []
    for r in rooms:
        result.append({
            "id": r.id,
            "title": r.title,
            "last_message": "새로운 대화를 시작해보세요.",
            "is_group": r.is_group
        })
    return result

@router.get("/api/chat/rooms/{room_id}/members")
def get_room_members(room_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    """채팅방 참여 멤버 목록 — 이름/위치. 그룹 장소추천의 입력(멤버 user_id)도 됨."""
    _sync_room_members_from_community(db, room_id)  # 레거시/누락 자가복구
    rows = db.query(models.ChatRoomMember).filter(models.ChatRoomMember.room_id == room_id).all()
    uids = [r.user_id for r in rows]
    if not uids:
        return {"room_id": room_id, "count": 0, "members": []}
    users = db.query(models.User).filter(models.User.id.in_(uids)).all()
    members = [{
        "id": u.id,
        "name": u.name,
        "is_me": u.id == current_user.id,
        "lat": u.lat,
        "lng": u.lng,
        "location_name": u.location_name,
    } for u in users]
    # 나를 맨 앞으로
    members.sort(key=lambda m: (not m["is_me"], m["name"]))
    return {"room_id": room_id, "count": len(members), "members": members}


# --- 2. 메시지 내역 ---
@router.get("/api/chat/{room_id}/messages")
def get_messages(room_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    msgs = db.query(models.Message).filter(models.Message.room_id == room_id).order_by(models.Message.timestamp).all()
    result = []
    for m in msgs:
        sender = db.query(models.User).filter(models.User.id == m.user_id).first()
        result.append({
            "id": m.id,
            "user_id": m.user_id,
            "name": sender.name if sender else "알 수 없음", # 유저 이름은 name 유지
            "content": m.content,
            "timestamp": m.timestamp.strftime("%H:%M")
        })
    return result

# --- 3. 메시지 전송 ---
@router.post("/api/chat/message")
async def send_message_api(req: dict, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    room_id = req.get("room_id")
    content = req.get("content")

    # 구조화 메시지(payload: {type: image|video|settlement|...}) 지원 — 사진/영상/정산 카드
    payload = req.get("payload")
    if isinstance(payload, dict) and payload.get("type"):
        content_str = json.dumps(payload, ensure_ascii=False)
    else:
        content_str = json.dumps({"text": content})

    new_msg = models.Message(room_id=room_id, user_id=current_user.id, content=content_str)
    db.add(new_msg)
    db.commit()
    
    msg_data = {
        "id": new_msg.id,
        "user_id": current_user.id,
        "name": current_user.name,
        "content": new_msg.content,
        "timestamp": datetime.now().strftime("%H:%M")
    }
    await manager.broadcast(msg_data, room_id)
    return {"status": "ok"}

# --- 4. 기타 API ---
@router.post("/api/chat/rooms/{room_id}/leave")
def leave_room(
    room_id: str,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """현재 사용자를 채팅방에서 완전히 제거.
    ⚠️ ChatRoomMember만 지우면 get_chat_rooms가 Community.member_ids 기준으로 방을
    되살리므로(_sync_room_members_from_community), 커뮤니티 멤버십에서도 함께 제거한다."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    removed = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == room_id,
        models.ChatRoomMember.user_id == current_user.id,
    ).delete()

    # 모임(커뮤니티) 방이면 member_ids/host_id에서도 제거 → 나가기 후 재출현 방지
    comm = db.query(models.Community).filter(models.Community.id == room_id).first()
    if comm:
        mids = [x for x in (comm.member_ids or []) if x != current_user.id]
        if mids != (comm.member_ids or []):
            comm.member_ids = mids
            flag_modified(comm, "member_ids")
        if comm.host_id == current_user.id:
            # 호스트가 나가면 남은 첫 멤버에게 위임(없으면 비움)
            comm.host_id = mids[0] if mids else None

    db.commit()
    return {"status": "left", "removed": bool(removed)}

@router.post("/api/chat/rooms/{room_id}/invite")
def invite_to_room(
    room_id: str,
    req: dict,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """채팅방에 친구 초대(멤버 추가). 초대자는 해당 방의 멤버여야 함."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")

    is_member = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == room_id,
        models.ChatRoomMember.user_id == current_user.id,
    ).first()
    if not is_member:
        raise HTTPException(status_code=403, detail="해당 채팅방의 멤버만 초대할 수 있습니다.")

    user_id = req.get("user_id")
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id가 필요합니다.")

    target = db.query(models.User).filter(models.User.id == user_id).first()
    if target is None:
        raise HTTPException(status_code=404, detail="유저를 찾을 수 없습니다.")

    existing = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == room_id,
        models.ChatRoomMember.user_id == user_id,
    ).first()
    if existing:
        return {"status": "already_member", "user_id": user_id, "name": target.name}

    db.add(models.ChatRoomMember(room_id=room_id, user_id=user_id))
    room = db.query(models.ChatRoom).filter(models.ChatRoom.id == room_id).first()
    if room is not None and not room.is_group:
        room.is_group = True  # 1:1 → 그룹방으로 전환
    db.commit()
    return {"status": "invited", "user_id": user_id, "name": target.name}


def _find_or_create_dm(db: Session, user_a_id: int, user_b_id: int) -> models.ChatRoom:
    """두 유저의 1:1 채팅방을 찾고, 없으면 생성."""
    a_rooms = {m.room_id for m in db.query(models.ChatRoomMember).filter(models.ChatRoomMember.user_id == user_a_id).all()}
    b_rooms = {m.room_id for m in db.query(models.ChatRoomMember).filter(models.ChatRoomMember.user_id == user_b_id).all()}
    common = a_rooms & b_rooms
    if common:
        room = db.query(models.ChatRoom).filter(
            models.ChatRoom.id.in_(common), models.ChatRoom.is_group == False
        ).first()
        if room:
            return room
    friend = db.query(models.User).filter(models.User.id == user_b_id).first()
    room = models.ChatRoom(title=(friend.name if friend else "대화"), is_group=False)
    db.add(room)
    db.flush()
    db.add(models.ChatRoomMember(room_id=room.id, user_id=user_a_id))
    db.add(models.ChatRoomMember(room_id=room.id, user_id=user_b_id))
    db.flush()
    return room


@router.post("/api/chat/share")
async def share_to_friends(
    req: user_schemas.ShareToFriends,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """추천 결과/장소를 인앱 친구(1:1 방) 또는 특정 방으로 공유.
    chat-tab의 'shared_items' 렌더러가 카드로 표시함."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    if not req.items:
        raise HTTPException(status_code=400, detail="공유할 항목이 없습니다.")

    target_room_ids: List[str] = []
    if req.room_id:
        target_room_ids.append(req.room_id)
    for fid in (req.friend_ids or []):
        if not fid or fid == current_user.id:
            continue
        room = _find_or_create_dm(db, current_user.id, int(fid))
        target_room_ids.append(room.id)

    if not target_room_ids:
        raise HTTPException(status_code=400, detail="공유 대상이 없습니다.")

    content = json.dumps(
        {"type": "shared_items", "message": req.message or "", "items": req.items},
        ensure_ascii=False,
    )
    shared_rooms: List[str] = []
    for rid in dict.fromkeys(target_room_ids):  # 중복 제거 + 순서 유지
        msg = models.Message(room_id=rid, user_id=current_user.id, content=content)
        db.add(msg)
        db.flush()
        shared_rooms.append(rid)
        await manager.broadcast(
            {
                "id": msg.id,
                "user_id": current_user.id,
                "name": current_user.name,
                "content": content,
                "timestamp": datetime.now().strftime("%H:%M"),
            },
            rid,
        )
    db.commit()
    return {"status": "shared", "rooms": shared_rooms}


_WD_KO = ["월", "화", "수", "목", "금", "토", "일"]


@router.get("/api/chat/rooms/{room_id}/available-dates")
def get_available_dates(room_id: str, db: Session = Depends(get_db),
                        current_user: models.User = Depends(get_current_user)):
    """오늘 기준 다가오는 후보 날짜 — 멤버들의 기존 일정(events) 날짜는 '바쁜 날'로 제외.
    (기존엔 2026-01-20 등으로 하드코딩돼 있었음)"""
    now = datetime.now()
    # 오늘이 늦었으면(20시 이후) 내일부터 제안
    start = now + timedelta(days=1) if now.hour >= 20 else now

    # 멤버 기존 일정 = 바쁜 날 → 비는 날 우선
    busy = set()
    try:
        member_ids = [m.user_id for m in db.query(models.ChatRoomMember).filter(
            models.ChatRoomMember.room_id == room_id).all()]
        if member_ids:
            for (d,) in db.query(models.Event.date).filter(models.Event.user_id.in_(member_ids)).all():
                if d:
                    busy.add(str(d))
    except Exception as exc:
        print(f"[available-dates] busy 조회 스킵: {exc}")

    slots = []
    cur = start
    guard = 0
    while len(slots) < 6 and guard < 30:
        ds = cur.strftime("%Y-%m-%d")
        if ds not in busy:
            slots.append({
                "fullDate": ds,
                "displayDate": f"{cur.month}/{cur.day} ({_WD_KO[cur.weekday()]})",
                "time": "19:00",
            })
        cur += timedelta(days=1)
        guard += 1
    return slots


@router.post("/api/ai/parse-schedule")
def parse_schedule(req: dict):
    """자연어 일정 파싱(간이). 날짜 미지정 시 오늘 기준 가장 가까운 평일 저녁으로.
    (기존엔 2026-01-24 하드코딩)"""
    now = datetime.now()
    base = now + timedelta(days=1) if now.hour >= 19 else now
    return {
        "title": "새로운 약속",
        "date": base.strftime("%Y-%m-%d"),
        "time": "19:00",
        "location_name": (req or {}).get("location_name") or "중간지점",
        "purpose": (req or {}).get("purpose") or "식사",
    }

@router.websocket("/api/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str):
    # 수신 전용: 메시지 전송/저장/브로드캐스트는 REST(/api/chat/message)에서 처리.
    # 기존엔 받은 텍스트를 'System'(user_id 0)으로 에코해 발신자 귀속/저장이 안 됐음.
    await manager.connect(websocket, room_id)
    try:
        while True:
            await websocket.receive_text()  # ping 등 수신만 유지(연결 keep-alive)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)
