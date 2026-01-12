from sqlalchemy.orm import Session
from uuid import uuid4
from domain import models
from schemas import community as schemas

class CommunityRepository:
    def create(self, db: Session, user_id: int, dto: schemas.CommunityCreate):
        comm = models.Community(
            id=str(uuid4()),
            host_id=user_id,
            title=dto.title,
            category=dto.category,
            location=dto.location,
            date_time=dto.date_time,
            max_members=dto.max_members,
            description=dto.description,
            tags=dto.tags,
            member_ids=[user_id] # 호스트는 자동 참여
        )
        db.add(comm)
        return comm

    def get_all(self, db: Session):
        return db.query(models.Community).all()

    def get_by_id(self, db: Session, comm_id: str):
        return db.query(models.Community).filter(models.Community.id == comm_id).first()

    def update_members(self, db: Session, comm: models.Community, member_ids: list):
        # SQLAlchemy에서 JSON 필드 변경 감지를 위해 새로운 리스트 할당 필요
        comm.member_ids = list(member_ids)
        db.add(comm)