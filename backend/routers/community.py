import json
from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy.orm import Session
from sqlalchemy.orm.attributes import flag_modified
from pydantic import BaseModel, ConfigDict
from typing import List, Any, Optional
from uuid import uuid4
from datetime import datetime, timedelta

import models
from dependencies import get_db, get_current_user
from connection_manager import manager

router = APIRouter()

# --- [Models] ---
class CommunityCreate(BaseModel):
    title: str
    category: str
    location: str
    date_time: str
    max_members: int
    description: str
    tags: List[str] = []

class CommunitySchema(BaseModel):
    id: Optional[str] = None
    host_id: int
    title: str
    category: str
    location: str
    date_time: str
    max_members: int
    description: str
    tags: List[str] = []
    rating: float = 0.0
    current_members: List[Any] = []
    model_config = ConfigDict(from_attributes=True)

class ChatRoomSchema(BaseModel): 
    id: str
    name: str
    lastMessage: str
    time: str
    unread: int
    isGroup: bool = True

class ShareRequest(BaseModel): 
    room_id: str
    place_name: str
    place_category: str
    place_tags: List[str]

class VoteRequest(BaseModel): 
    message_id: int
    vote_type: str 

class ConfirmMeetingRequest(BaseModel): 
    room_id: str
    place_name: str
    date_time: str 

# --- [Community APIs] ---

@router.get("/api/communities", response_model=List[CommunitySchema])
def get_communities(db: Session = Depends(get_db)):
    comms = db.query(models.Community).all()
    results = []
    for c in comms:
        m_ids = c.member_ids or []
        users = db.query(models.User).filter(models.User.id.in_(m_ids)).all()
        m_data = [{"id": u.id, "name": u.name, "avatar": u.avatar, "manner": u.manner} for u in users]
        results.append(CommunitySchema(
            id=c.id, host_id=c.host_id, title=c.title, category=c.category, 
            location=c.location, date_time=c.date_time, max_members=c.max_members, 
            description=c.description, tags=c.tags, rating=c.rating, current_members=m_data
        ))
    return sorted(results, key=lambda x: x.date_time, reverse=True)

@router.post("/api/communities", response_model=CommunitySchema)
def create_community(comm: CommunityCreate, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    new_id = str(uuid4())
    db_comm = models.Community(
        id=new_id, 
        host_id=current_user.id,
        title=comm.title, 
        category=comm.category, 
        location=comm.location, 
        date_time=comm.date_time, 
        max_members=comm.max_members, 
        description=comm.description, 
        tags=comm.tags, 
        rating=5.0, 
        member_ids=[current_user.id]
    )
    db.add(db_comm)
    db.commit()
    
    return CommunitySchema(
        id=new_id, host_id=current_user.id, title=comm.title, category=comm.category,
        location=comm.location, date_time=comm.date_time, max_members=comm.max_members,
        description=comm.description, tags=comm.tags, rating=5.0,
        current_members=[{"id": current_user.id, "name": current_user.name, "avatar": current_user.avatar, "manner": current_user.manner}]
    )

@router.delete("/api/communities/{community_id}")
def delete_community(community_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    comm = db.query(models.Community).filter(models.Community.id == community_id).first()
    if not comm: raise HTTPException(status_code=404, detail="Community not found")
    if comm.host_id != current_user.id: raise HTTPException(status_code=403, detail="삭제 권한이 없습니다.")
    db.delete(comm)
    db.commit()
    return {"message": "Successfully deleted"}

# --- [Chat APIs] ---

@router.get("/api/chat/rooms", response_model=List[ChatRoomSchema])
def get_chat_rooms(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    my_id = current_user.id
    comms = db.query(models.Community).all()
    my_rooms = []
    for c in comms:
        if my_id in (c.member_ids or []):
            last_msg = db.query(models.Message).filter(models.Message.room_id == c.id).order_by(models.Message.timestamp.desc()).first()
            last_text = "대화 시작"; msg_time = "Now"
            if last_msg:
                try:
                    content_json = json.loads(last_msg.content)
                    if content_json.get("type") == "vote_card": last_text = "📍 장소 추천 공유"
                    elif content_json.get("type") == "proposal": last_text = "📅 스마트 모임 제안"
                    elif content_json.get("type") == "system": last_text = "🔔 알림"
                    else: last_text = content_json.get("text", "메시지")
                except: last_text = last_msg.content
                msg_time = last_msg.timestamp.strftime("%H:%M")
            
            my_rooms.append(ChatRoomSchema(id=str(c.id), name=c.title, lastMessage=last_text, time=msg_time, unread=0, isGroup=True))
    return my_rooms

@router.post("/api/chat/share")
async def share_place(req: ShareRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    content_data = {
        "type": "vote_card",
        "text": f"{current_user.name}님이 장소를 추천했습니다!",
        "place": { "name": req.place_name, "category": req.place_category, "tags": req.place_tags },
        "vote_count": 0
    }
    msg = models.Message(room_id=req.room_id, user_id=current_user.id, content=json.dumps(content_data), timestamp=datetime.now())
    db.add(msg); db.commit(); db.refresh(msg)
    await manager.broadcast({
        "user_id": current_user.id, "name": current_user.name, "avatar": "👤",
        "content": json.dumps(content_data), "type": "vote_card", "message_id": msg.id, "timestamp": msg.timestamp.strftime("%H:%M")
    }, req.room_id)
    return {"message": "Shared"}

@router.get("/api/chat/{room_id}/messages")
def get_chat_history(room_id: str, db: Session = Depends(get_db)):
    history = db.query(models.Message).filter(models.Message.room_id == room_id).order_by(models.Message.timestamp).all()
    results = []
    for msg in history:
        sender = db.query(models.User).filter(models.User.id == msg.user_id).first()
        vote_count = db.query(models.Vote).filter(models.Vote.message_id == msg.id).count()
        try: 
            cdata = json.loads(msg.content)
            if isinstance(cdata, dict):
                m_type = cdata.get("type", "text")
                if m_type == "vote_card": cdata["vote_count"] = vote_count; final_content = json.dumps(cdata)
                else: final_content = msg.content
            else: m_type = "text"; final_content = json.dumps({"type": "text", "text": msg.content})
        except: m_type = "text"; final_content = json.dumps({"type": "text", "text": msg.content})
        
        results.append({ 
            "user_id": msg.user_id, 
            "name": sender.name if sender else "System", 
            "avatar": "👤", 
            "content": final_content, 
            "type": m_type, 
            "message_id": msg.id, 
            "timestamp": msg.timestamp.strftime("%H:%M") 
        })
    return results

class MessageRequest(BaseModel):
    room_id: str
    content: str
    type: str = "text"

@router.post("/api/chat/message")
async def send_message(req: MessageRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    if req.type == "text":
        save_content = json.dumps({"type": "text", "text": req.content})
    else:
        save_content = req.content
    
    db_msg = models.Message(room_id=req.room_id, user_id=current_user.id, content=save_content, timestamp=datetime.now())
    db.add(db_msg); db.commit(); db.refresh(db_msg)
    
    await manager.broadcast({ 
        "user_id": current_user.id, "name": current_user.name, "avatar": "👤", 
        "content": save_content, "type": req.type, "message_id": db_msg.id, 
        "timestamp": datetime.now().strftime("%H:%M") 
    }, req.room_id)
    
    return {"status": "sent", "message_id": db_msg.id}

@router.post("/api/chat/vote")
async def cast_vote(req: VoteRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    existing_vote = db.query(models.Vote).filter(models.Vote.message_id == req.message_id, models.Vote.user_id == current_user.id).first()
    if existing_vote: db.delete(existing_vote)
    else: db.add(models.Vote(message_id=req.message_id, user_id=current_user.id, vote_type=req.vote_type))
    db.commit()
    
    count = db.query(models.Vote).filter(models.Vote.message_id == req.message_id).count()
    msg = db.query(models.Message).filter(models.Message.id == req.message_id).first()
    
    if msg: 
        try:
            content_data = json.loads(msg.content)
            content_data["vote_count"] = count
            msg.content = json.dumps(content_data)
            db.commit()
        except: pass
        await manager.broadcast({ "type": "vote_update", "message_id": req.message_id, "count": count }, msg.room_id)
        
    return {"count": count}

@router.post("/api/chat/confirm")
async def confirm_meeting(req: ConfirmMeetingRequest, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    room = db.query(models.Community).filter(models.Community.id == req.room_id).first()
    if not room: raise HTTPException(404, "Room not found")
    member_ids = room.member_ids or []
    for uid in member_ids:
        try: 
            dt_obj = datetime.strptime(req.date_time, "%Y-%m-%d %H:%M")
            date_str = dt_obj.strftime("%Y-%m-%d"); time_str = dt_obj.strftime("%H:%M")
        except: 
            now = datetime.now() + timedelta(days=1); date_str = now.strftime("%Y-%m-%d"); time_str = "19:00"
        db.add(models.Event(id=str(uuid4()), user_id=uid, title=f"[{room.title}] 모임", date=date_str, time=time_str, duration_hours=2.0, location_name=req.place_name, purpose="약속"))
    db.commit()
    
    system_msg_content = json.dumps({ "type": "system", "text": f"✅ 약속 확정!\n장소: {req.place_name}\n일시: {req.date_time}\n(캘린더 등록 완료)" }, ensure_ascii=False)
    db_msg = models.Message(room_id=req.room_id, user_id=current_user.id, content=system_msg_content, timestamp=datetime.now())
    db.add(db_msg); db.commit()
    await manager.broadcast({ "user_id": 0, "name": "System", "avatar": "🤖", "content": system_msg_content, "type": "system", "timestamp": datetime.now().strftime("%H:%M") }, req.room_id)
    return {"message": "Confirmed"}

@router.post("/api/chat/rooms/{room_id}/leave")
def leave_chat_room(room_id: str, current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    comm = db.query(models.Community).filter(models.Community.id == room_id).first()
    if not comm: raise HTTPException(404, "Room not found")
    members = list(comm.member_ids) if comm.member_ids else []
    if current_user.id in members:
        members.remove(current_user.id)
        comm.member_ids = members
        flag_modified(comm, "member_ids")
        db.commit()
        return {"message": "Left", "status": "left"}
    raise HTTPException(400, "User not in room")

@router.websocket("/ws/{room_id}/{user_id}")
async def websocket_endpoint(websocket: WebSocket, room_id: str, user_id: int, db: Session = Depends(get_db)):
    await manager.connect(websocket, room_id)
    history = db.query(models.Message).filter(models.Message.room_id == room_id).order_by(models.Message.timestamp).limit(50).all()
    for msg in history:
        sender = db.query(models.User).filter(models.User.id == msg.user_id).first()
        try: content_json = json.loads(msg.content)
        except: content_json = {"type": "text", "text": msg.content}
        await websocket.send_json({ 
            "user_id": msg.user_id, "name": sender.name if sender else "System", "avatar": "👤", 
            "content": json.dumps(content_json), "type": content_json.get("type", "text"), 
            "message_id": msg.id, "timestamp": msg.timestamp.strftime("%H:%M") 
        })
    try:
        while True:
            payload = await websocket.receive_json()
            msg_type = payload.get('type', 'text')
            if msg_type == 'text': save_content = json.dumps({"type": "text", "text": payload.get('content', '')})
            else: save_content = json.dumps(payload)
            db_msg = models.Message(room_id=room_id, user_id=user_id, content=save_content, timestamp=datetime.now())
            db.add(db_msg); db.commit(); db.refresh(db_msg)
            sender = db.query(models.User).filter(models.User.id == user_id).first()
            await manager.broadcast({ "user_id": user_id, "name": sender.name, "avatar": "👤", "content": save_content, "type": msg_type, "message_id": db_msg.id, "timestamp": datetime.now().strftime("%H:%M") }, room_id)
    except WebSocketDisconnect: manager.disconnect(websocket, room_id)