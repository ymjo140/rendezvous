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
        if not comm: 
            raise HTTPException(404, "모임을 찾을 수 없습니다.")
        
        members = list(comm.member_ids) if comm.member_ids else []
        if user.id in members: 
            return {"message": "이미 참여 중인 모임입니다."}
        
        try:
            # (1) 커뮤니티 멤버 업데이트
            members.append(user.id)
            self.repo.update_members(db, comm, members)
            
            # (2) 🌟 채팅방 멤버 자동 추가
            db.add(models.ChatRoomMember(room_id=comm_id, user_id=user.id))
            
            # (3) 🌟 [핵심] 캘린더 일정(Event) 자동 등록
            # 사용자가 참여를 누르는 순간 일정 탭에도 뜨도록 데이터 삽입
            date_part = comm.date_time.split(" ")[0] if " " in comm.date_time else comm.date_time
            time_part = comm.date_time.split(" ")[1] if " " in comm.date_time else "12:00"
            
            new_event = models.Event(
                id=str(uuid.uuid4()), # 🌟 여기서 uuid가 정의되어 있어야 함
                user_id=user.id,
                title=f"🙌 {comm.title}",
                date=date_part,
                time=time_part,
                location_name=comm.location,
                purpose=comm.category
            )
            db.add(new_event)
            
            # (4) 시스템 메시지 알림
            sys_msg = models.Message(
                room_id=comm_id,
                user_id=0,
                content=json.dumps({"type": "system", "text": f"{user.name}님이 참여했습니다."}, ensure_ascii=False)
            )
            db.add(sys_msg)
            
            db.commit()
            return {"status": "success", "message": "참여 완료 및 일정 등록 성공"}
            
        except Exception as e:
            db.rollback()
            # 서버 로그에 에러 출력 (디버깅용)
            print(f"JOIN ERROR: {str(e)}")
            raise HTTPException(500, f"참여 처리 중 오류 발생: {str(e)}")

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