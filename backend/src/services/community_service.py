from sqlalchemy.orm import Session
from fastapi import HTTPException
import uuid
import json
from domain import models
from schemas import community as schemas

class CommunityService:
    def __init__(self):
        # 기존 저장소(Repository) 사용
        from repositories.community_repository import CommunityRepository
        from repositories.user_repository import UserRepository
        self.repo = CommunityRepository()
        self.user_repo = UserRepository()

    # 🌟 [수정] 커뮤니티 생성 + 채팅방 생성 연동
    def create_community(self, db: Session, user: models.User, req: schemas.CommunityCreate):
        try:
            # 1. 커뮤니티 생성
            comm = self.repo.create(db, user.id, req)
            
            # 2. 채팅방 생성 (커뮤니티 ID와 동일하게 설정하여 연동)
            new_chat_room = models.ChatRoom(
                id=comm.id,
                title=f"[모임] {req.title}",
                is_group=True
            )
            db.add(new_chat_room)
            
            # 3. 채팅방 멤버 추가 (호스트)
            new_member = models.ChatRoomMember(
                room_id=comm.id,
                user_id=user.id
            )
            db.add(new_member)
            
            db.commit()
            return {"message": "Community and ChatRoom created", "id": comm.id}
        except Exception as e:
            db.rollback()
            raise HTTPException(500, f"Creation failed: {str(e)}")

    # 🌟 [수정] 커뮤니티 참여 + 채팅방 입장 연동
    def join_community(self, db: Session, user: models.User, comm_id: str):
        comm = self.repo.get_by_id(db, comm_id)
        if not comm: raise HTTPException(404, "Community not found")
        
        members = list(comm.member_ids) if comm.member_ids else []
        if user.id in members: return {"message": "Already joined"}
        if len(members) >= comm.max_members: raise HTTPException(400, "Community is full")
        
        try:
            # 1. 커뮤니티 멤버 추가
            members.append(user.id)
            self.repo.update_members(db, comm, members)
            
            # 2. 채팅방 멤버 추가
            new_chat_member = models.ChatRoomMember(
                room_id=comm_id,
                user_id=user.id
            )
            db.add(new_chat_member)
            
            # 3. 시스템 메시지 전송
            sys_msg = models.Message(
                room_id=comm_id,
                user_id=0,
                content=json.dumps({"type": "system", "text": f"{user.name}님이 모임에 참여했습니다."}, ensure_ascii=False)
            )
            db.add(sys_msg)
            
            db.commit()
            return {"message": "Joined successfully and entered chatroom"}
        except Exception as e:
            db.rollback()
            raise HTTPException(500, f"Join failed: {str(e)}")

    # 기존 get_communities는 유지
    def get_communities(self, db: Session, user: models.User):
        comms = self.repo.get_all(db)
        result = []
        for c in comms:
            host = self.user_repo.get_by_id(db, c.host_id)
            # member_ids가 정수 리스트인 경우 길이를 반환
            member_count = len(c.member_ids) if c.member_ids else 0
            result.append({
                "id": c.id, "title": c.title, "category": c.category,
                "location": c.location, "date_time": c.date_time,
                "max_members": c.max_members, "member_ids": member_count,
                "host_name": host.name if host else "Unknown",
                "is_joined": user.id in (c.member_ids or []),
                "description": c.description
            })
        return result