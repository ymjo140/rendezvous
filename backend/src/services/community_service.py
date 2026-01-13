from sqlalchemy.orm import Session
from fastapi import HTTPException
from domain import models
from repositories.community_repository import CommunityRepository
from repositories.user_repository import UserRepository
from schemas import community as schemas

class CommunityService:
    def __init__(self):
        self.repo = CommunityRepository()
        self.user_repo = UserRepository()

    def create_community(self, db: Session, user: models.User, req: schemas.CommunityCreate):
        try:
            comm = self.repo.create(db, user.id, req)
            db.commit()
            return {"message": "Community created", "id": comm.id}
        except:
            db.rollback()
            raise HTTPException(500, "Creation failed")

    def get_communities(self, db: Session, user: models.User):
        comms = self.repo.get_all(db)
        result = []
        for c in comms:
            host = self.user_repo.get_by_id(db, c.host_id)
            members = c.member_ids or []
            result.append({
                "id": c.id,
                "title": c.title,
                "category": c.category,
                "location": c.location,
                "date_time": c.date_time,
                "max_members": c.max_members,
                "member_ids": len(members),
                "host_name": host.name if host else "Unknown",
                "tags": c.tags,
                "is_joined": user.id in members,
                "description": c.description
            })
        return result

    def join_community(self, db: Session, user: models.User, comm_id: str):
        comm = self.repo.get_by_id(db, comm_id)
        if not comm: raise HTTPException(404, "Community not found")
        
        members = list(comm.member_ids) if comm.member_ids else []
        if user.id in members: return {"message": "Already joined"}
        if len(members) >= comm.max_members: raise HTTPException(400, "Community is full")
        
        try:
            members.append(user.id)
            self.repo.update_members(db, comm, members)
            db.commit()
            return {"message": "Joined successfully"}
        except:
            db.rollback()
            raise HTTPException(500, "Join failed")