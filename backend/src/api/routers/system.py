from fastapi import APIRouter

from core.config import settings

router = APIRouter()


@router.get("/api/system/config")
def get_system_config():
    return settings.PURPOSE_CONFIG
