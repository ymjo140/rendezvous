from sqlalchemy.orm import Session
from fastapi import HTTPException
import uuid  # ID 생성을 위해 필요
import json  # 시스템 메시지 처리를 위해 필요
from domain import models
from repositories.community_repository import CommunityRepository
from repositories.user_repository import UserRepository
from schemas import community as schemas

class CommunityService:
    def __init__(self):
        self.repo = CommunityRepository()
        self.user_repo = UserRepository()

    # 1. 커뮤니티 생성 (채팅방 자동 생성 포함)
    def create_community(self, db: Session, user: models.User, req: schemas.CommunityCreate):
        try:
            # A. 커뮤니티 기본 정보 생성
            comm = self.repo.create(db, user.id, req)
            db.flush()
            # B. 채팅방 자동 생성 (커뮤니티 ID와 동일하게 설정하여 1:1 매칭)
            new_chat_room = models.ChatRoom(
                id=comm.id,
                title=f"[모임] {req.title}",
                is_group=True
            )
            db.add(new_chat_room)
            
            # C. 호스트를 채팅방 멤버로 즉시 추가
            db.add(models.ChatRoomMember(room_id=comm.id, user_id=user.id))
            
            db.commit()
            return {"message": "Community and ChatRoom created", "id": comm.id}
        except Exception as e:
            db.rollback()
            print(f"CREATE COMMUNITY ERROR: {str(e)}")
            raise HTTPException(500, f"생성 실패: {str(e)}")

    # 2. 커뮤니티 참여 (일정 자동 등록 + 채팅방 입장)
    def join_community(self, db: Session, user: models.User, comm_id: str):
        comm = self.repo.get_by_id(db, comm_id)
        if not comm: 
            raise HTTPException(404, "모임을 찾을 수 없습니다.")
        
        # 이미 참여 중인지 확인
        members = list(comm.member_ids) if comm.member_ids else []
        if user.id in members: 
            return {"message": "이미 참여 중인 모임입니다."}
        
        # 정원 확인
        if len(members) >= comm.max_members:
            raise HTTPException(400, "모임 정원이 초과되었습니다.")
        
        try:
            # A. 커뮤니티 멤버 리스트 업데이트
            members.append(user.id)
            self.repo.update_members(db, comm, members)
            
            # B. 채팅방 멤버로 자동 추가
            db.add(models.ChatRoomMember(room_id=comm_id, user_id=user.id))
            
            # C. 캘린더 일정(Event) 자동 등록
            dt_parts = comm.date_time.split(" ")
            date_str = dt_parts[0] if len(dt_parts) > 0 else comm.date_time
            time_str = dt_parts[1] if len(dt_parts) > 1 else "12:00"

            new_event = models.Event(
                id=str(uuid.uuid4()), 
                user_id=user.id,
                title=f"🙌 {comm.title}",
                date=date_str,
                time=time_str,
                duration_hours=getattr(comm, 'duration_hours', 1.0), 
                location_name=comm.location,
                purpose=comm.category,
                is_private=True
            )
            db.add(new_event)
            
            # D. 채팅방에 참여 시스템 메시지 전송
            sys_msg_content = json.dumps({"type": "system", "text": f"{user.name}님이 참여했습니다."}, ensure_ascii=False)
            sys_msg = models.Message(
                room_id=comm_id,
                user_id=0, 
                content=sys_msg_content
            )
            db.add(sys_msg)
            
            db.commit()
            return {"status": "success", "message": "참여 완료 및 일정 등록 성공"}
            
        except Exception as e:
            db.rollback()
            print(f"JOIN COMMUNITY ERROR: {str(e)}")
            raise HTTPException(500, f"참여 처리 중 오류 발생: {str(e)}")

    # 3. 커뮤니티 목록 조회
    def get_communities(self, db: Session, user: models.User):
        comms = self.repo.get_all(db)
        result = []
        for c in comms:
            host = self.user_repo.get_by_id(db, c.host_id)
            m_count = len(c.member_ids) if c.member_ids else 0
            
            result.append({
                "id": c.id,
                "title": c.title,
                "category": c.category,
                "location": c.location,
                "date_time": c.date_time,
                "max_members": c.max_members,
                "member_ids": m_count,
                "host_name": host.name if host else "Unknown",
                "is_joined": user.id in (c.member_ids or []),
                "description": c.description,
                "tags": getattr(c, 'tags', [])
            })
        return result