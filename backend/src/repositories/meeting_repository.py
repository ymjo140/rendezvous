from sqlalchemy.orm import Session
from sqlalchemy import or_
from uuid import uuid4
from datetime import datetime, timedelta

from ..domain import models
from ..schemas import meeting as schemas

class MeetingRepository:
    # --- 장소 (Place) ---
    def get_place_by_name(self, db: Session, name: str):
        return db.query(models.Place).filter(models.Place.name == name).first()

    def create_place(self, db: Session, name: str, category: str, lat: float, lng: float, tags: list, rating: float = 0.0):
        place = models.Place(name=name, category=category, lat=lat, lng=lng, tags=tags, wemeet_rating=rating)
        db.add(place)
        return place

    def search_places_in_range(self, db: Session, lat: float, lng: float, category: str, range_deg: float = 0.03):
        return db.query(models.Place).filter(
            models.Place.lat.between(lat - range_deg, lat + range_deg),
            models.Place.lng.between(lng - range_deg, lng + range_deg),
            models.Place.category.contains(category)
        ).all()

    # --- 일정 (Event) ---
    def create_event(self, db: Session, event: schemas.EventSchema):
        db_event = models.Event(
            id=str(uuid4()),
            user_id=event.user_id,
            title=event.title,
            date=event.date,
            time=event.time,
            duration_hours=event.duration_hours,
            location_name=event.location_name,
            purpose=event.purpose
        )
        db.add(db_event)
        return db_event

    def get_user_events(self, db: Session, user_id: int):
        return db.query(models.Event).filter(models.Event.user_id == user_id).all()

    def delete_event(self, db: Session, event_id: str):
        db.query(models.Event).filter(models.Event.id == event_id).delete()

    def get_events_by_date_and_users(self, db: Session, user_ids: list, date: str):
        return db.query(models.Event).filter(
            models.Event.user_id.in_(user_ids),
            models.Event.date == date
        ).all()

    # --- 채팅방 멤버 & 메시지 ---
    def get_room_members(self, db: Session, room_id: str):
        return db.query(models.ChatRoomMember).filter(models.ChatRoomMember.room_id == room_id).all()

    def get_users_by_ids(self, db: Session, user_ids: list):
        return db.query(models.User).filter(models.User.id.in_(user_ids)).all()

    def create_system_message(self, db: Session, room_id: str, content: str):
        msg = models.Message(room_id=room_id, user_id=1, content=content, timestamp=datetime.now()) # user_id 1 = AI/System
        db.add(msg)
        db.commit()
        return msg

    def get_message_by_id(self, db: Session, message_id: int):
        return db.query(models.Message).filter(models.Message.id == message_id).first()