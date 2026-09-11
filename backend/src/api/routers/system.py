from fastapi import APIRouter

from core.config import settings
from fastapi import Depends
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError
from sqlalchemy.orm import Session
from core.database import get_db
from services.health_service import probe_database, release

router = APIRouter()


@router.get("/api/health/live")
def liveness():
    return JSONResponse({"status": "ok", "version": settings.VERSION, "revision": release()},
                        headers={"Cache-Control": "no-store"})


@router.get("/api/health/ready")
def readiness(db: Session = Depends(get_db)):
    try:
        probe_database(db)
    except SQLAlchemyError:
        db.rollback()
        return JSONResponse({"status": "not_ready", "revision": release()}, status_code=503,
                            headers={"Cache-Control": "no-store"})
    return JSONResponse({"status": "ready", "revision": release()},
                        headers={"Cache-Control": "no-store"})


@router.get("/api/system/config")
def get_system_config():
    return settings.PURPOSE_CONFIG
