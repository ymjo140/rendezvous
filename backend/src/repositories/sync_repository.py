from sqlalchemy.orm import Session
from ..domain import models

class SyncRepository:
    def delete_events_by_source(self, db: Session, user_id: int, source_name: str):
        """기존 연동된 일정 삭제 (중복 방지용)"""
        search_pattern = f"[{source_name}]%"
        db.query(models.Event).filter(
            models.Event.user_id == user_id,
            models.Event.title.like(search_pattern)
        ).delete(synchronize_session=False)
    
    def add_event(self, db: Session, event: models.Event):
        db.add(event)