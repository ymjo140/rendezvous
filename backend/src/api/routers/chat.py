from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, HTTPException
from sqlalchemy.orm import Session
from typing import List, Dict
import json
from datetime import datetime, timedelta

from core.database import get_db
from domain import models
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
@router.get("/api/chat/rooms")
def get_chat_rooms(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 🌟 내가 멤버로 등록된 채팅방 ID들만 조회
    my_room_ids = db.query(models.ChatRoomMember.room_id).filter(models.ChatRoomMember.user_id == current_user.id).all()
    room_ids = [r[0] for r in my_room_ids]
    
    rooms = db.query(models.ChatRoom).filter(models.ChatRoom.id.in_(room_ids)).all()
    
    result = []
    for r in rooms:
        result.append({
            "id": r.id,
            "title": r.title,
            "last_message": "새로운 대화를 시작해보세요.",
            "is_group": r.is_group
        })
    return result

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
    
    new_msg = models.Message(room_id=room_id, user_id=current_user.id, content=json.dumps({"text": content}))
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
    """현재 사용자를 채팅방 멤버에서 제거(실제 나가기). 기존엔 no-op이라 새로고침 시 방이 다시 보였음."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="Unauthorized")
    removed = db.query(models.ChatRoomMember).filter(
        models.ChatRoomMember.room_id == room_id,
        models.ChatRoomMember.user_id == current_user.id,
    ).delete()
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


@router.get("/api/chat/rooms/{room_id}/available-dates")
def get_available_dates(room_id: str):
    fallback_time = (datetime.now() + timedelta(hours=1)).strftime("%H:%M")
    return [
        {"fullDate": "2026-01-20", "displayDate": "1/20 (화)", "time": fallback_time},
        {"fullDate": "2026-01-21", "displayDate": "1/21 (수)", "time": fallback_time}
    ]

@router.post("/api/ai/parse-schedule")
def parse_schedule(req: dict):
    fallback_time = (datetime.now() + timedelta(hours=1)).strftime("%H:%M")
    return {
        "title": "새로운 약속", "date": "2026-01-24", "time": fallback_time,
        "location_name": "강남역", "purpose": "식사"
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
