from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
# 👇 여기가 핵심 수정 사항입니다
from core.config import settings

engine = create_engine(settings.DATABASE_URL)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()