from sqlalchemy.orm import Session
from fastapi import HTTPException
import uuid  # 🌟 필수: 이게 없으면 500 에러가 발생합니다.
import json  # 🌟 필수: 시스템 메시지 생성을 위해 필요합니다.
from domain import models
from repositories.community_repository import CommunityRepository
from repositories.user_repository import UserRepository
from schemas import community as schemas

class CommunityService:
    def __init__(self):
        self.repo = CommunityRepository()
        self.user_repo = UserRepository()

    # 1. 커뮤니티 생성 시 채팅방도 생성
    def create_community(self, db: Session, user: models.User, req: schemas.CommunityCreate):
        try:
            # 커뮤니티 생성
            comm = self.repo.create(db, user.id, req)
            
            # 🌟 채팅방 생성 (커뮤니티 ID와 동일하게 설정하여 연동)
            new_chat_room = models.ChatRoom(
                id=comm.id,
                title=f"[모임] {req.title}",
                is_group=True
            )
            db.add(new_chat_room)
            
            # 호스트를 채팅방 멤버로 추가
            db.add(models.ChatRoomMember(room_id=comm.id, user_id=user.id))
            
            db.commit()
            return {"message": "Community and ChatRoom created", "id": comm.id}
        except Exception as e:
            db.rollback()
            raise HTTPException(500, f"생성 실패: {str(e)}")

    # 2. 커뮤니티 참여 시 일정 등록 + 채팅방 입장
    def join_community(self, db: Session, user: models.User, comm_id: str):
        comm = self.repo.get_by_id(db, comm_id)
        if not comm: raise HTTPException(404, "모임을 찾을 수 없습니다.")
        
        members = list(comm.member_ids) if comm.member_ids else []
        if user.id in members: return {"message": "이미 참여 중"}
        
        try:
            # 1. 커뮤니티 멤버 추가
            members.append(user.id)
            self.repo.update_members(db, comm, members)
            
            # 2. 채팅방 멤버 추가
            db.add(models.ChatRoomMember(room_id=comm_id, user_id=user.id))
            
            # 3. 일정 자동 등록 (500 에러 방지를 위해 날짜/시간 파싱 안전장치 추가)
            dt_parts = comm.date_time.split(" ")
            date_str = dt_parts[0] if len(dt_parts) > 0 else comm.date_time
            time_str = dt_parts[1] if len(dt_parts) > 1 else "12:00"

            new_event = models.Event(
                id=str(uuid.uuid4()), # 🌟 uuid import 필수
                user_id=user.id,
                title=f"🙌 {comm.title}",
                date=date_str,
                time=time_str,
                location_name=comm.location,
                purpose=comm.category,
                is_private=True
            )
            db.add(new_event)
            
            # 4. 시스템 메시지
            sys_msg = models.Message(
                room_id=comm_id,
                user_id=0,
                content=json.dumps({"type": "system", "text": f"{user.name}님이 참여했습니다."}, ensure_ascii=False)
            )
            db.add(sys_msg)
            
            db.commit() # 🌟 모든 변경사항을 한 번에 반영
            return {"status": "success"}
        except Exception as e:
            db.rollback()
            raise HTTPException(500, f"Join Error: {str(e)}")

    def get_communities(self, db: Session, user: models.User):
        # 기존 로직 유지
        comms = self.repo.get_all(db)
        result = []
        for c in comms:
            host = self.user_repo.get_by_id(db, c.host_id)
            m_count = len(c.member_ids) if c.member_ids else 0
            result.append({
                "id": c.id, "title": c.title, "category": c.category,
                "location": c.location, "date_time": c.date_time,
                "max_members": c.max_members, "member_ids": m_count,
                "host_name": host.name if host else "Unknown",
                "is_joined": user.id in (c.member_ids or []),
                "description": c.description
            })
        return result