from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from typing import List, Dict
import json
from datetime import datetime

from core.database import get_db
from domain import models
from api.dependencies import get_current_user

router = APIRouter()

# --- WebSocket 관리자 (간단 버전) ---
class ConnectionManager:
    def __init__(self):
        # room_id: [websocket1, websocket2, ...]
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

# --- 1. 채팅방 목록 ---
@router.get("/api/chat/rooms")
def get_chat_rooms(db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # 내가 참여 중인 채팅방 조회 (임시: 모든 방 리턴하거나 DB조회)
    # 실제로는 ChatRoomMember 테이블을 조인해야 함.
    # 여기서는 간단히 모든 방을 보여줍니다.
    rooms = db.query(models.ChatRoom).all()
    
    result = []
    for r in rooms:
        result.append({
            "id": r.id,
            "name": r.name,
            "last_message": "대화가 없습니다.", # 실제로는 메시지 테이블 조회 필요
            "is_group": r.is_group
        })
    return result

# --- 2. 채팅방 메시지 내역 ---
@router.get("/api/chat/{room_id}/messages")
def get_messages(room_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    msgs = db.query(models.Message).filter(models.Message.room_id == room_id).order_by(models.Message.timestamp).all()
    
    result = []
    for m in msgs:
        # 보낸 사람 이름 찾기
        sender = db.query(models.User).filter(models.User.id == m.user_id).first()
        result.append({
            "id": m.id,
            "user_id": m.user_id,
            "name": sender.name if sender else "알 수 없음",
            "content": m.content,
            "timestamp": m.timestamp.strftime("%H:%M")
        })
    return result

# --- 3. 메시지 전송 (REST API) ---
@router.post("/api/chat/message")
async def send_message_api(
    req: dict, 
    db: Session = Depends(get_db), 
    current_user: models.User = Depends(get_current_user)
):
    room_id = req.get("room_id")
    content = req.get("content")
    
    # DB 저장
    new_msg = models.Message(
        room_id=room_id,
        user_id=current_user.id,
        content=json.dumps({"text": content}) # 프론트엔드 포맷에 맞춤
    )
    db.add(new_msg)
    db.commit()
    
    # 소켓으로 실시간 전송
    msg_data = {
        "id": new_msg.id,
        "user_id": current_user.id,
        "name": current_user.name,
        "content": new_msg.content,
        "timestamp": datetime.now().strftime("%H:%M")
    }
    await manager.broadcast(msg_data, room_id)
    
    return {"status": "ok"}

# --- 4. 채팅방 나가기 ---
@router.post("/api/chat/rooms/{room_id}/leave")
def leave_room(room_id: str, db: Session = Depends(get_db), current_user: models.User = Depends(get_current_user)):
    # ChatRoomMember에서 삭제 로직 (여기서는 생략하고 성공 리턴)
    return {"status": "left"}

# --- 5. 가능한 날짜 추천 (AI Planner용) ---
@router.get("/api/chat/rooms/{room_id}/available-dates")
def get_available_dates(room_id: str):
    # 더미 데이터 리턴
    return [
        {"fullDate": "2026-01-20", "displayDate": "1/20 (화)", "time": "19:00"},
        {"fullDate": "2026-01-21", "displayDate": "1/21 (수)", "time": "12:00"},
        {"fullDate": "2026-01-22", "displayDate": "1/22 (목)", "time": "18:30"},
    ]

# --- 6. AI 자연어 일정 분석 ---
@router.post("/api/ai/parse-schedule")
def parse_schedule(req: dict):
    text = req.get("text", "")
    # 간단한 룰베이스 분석 (실제로는 LLM 사용 권장)
    return {
        "title": "새로운 약속",
        "date": "2026-01-24", # 임시 날짜
        "time": "19:00",
        "location_name": "강남역",
        "purpose": "식사"
    }

# --- 7. WebSocket 연결 ---
@router.websocket("/api/ws/{room_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, token: str = None):
    # 토큰 검증 로직은 생략 (실무에서는 필수)
    await manager.connect(websocket, room_id)
    try:
        while True:
            data = await websocket.receive_text()
            # 받은 메시지 그대로 브로드캐스트 (DB 저장은 별도 필요)
            # 여기서는 간단히 echo
            await manager.broadcast({"content": data, "user_id": 0, "name": "System"}, room_id)
    except WebSocketDisconnect:
        manager.disconnect(websocket, room_id)