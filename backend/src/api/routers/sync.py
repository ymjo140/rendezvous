import uuid
import socket
import ipaddress
from urllib.parse import urlparse
from datetime import datetime

import httpx
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.orm import Session
from icalendar import Calendar

from core.database import get_db
from domain import models
from api.dependencies import get_current_user

router = APIRouter()


class IcalSyncRequest(BaseModel):
    url: str
    source_name: str = "External"


def _is_safe_url(url: str) -> bool:
    """SSRF 가드: http(s)만 허용 + 호스트가 사설/루프백/링크로컬 IP로 해석되면 거부."""
    try:
        p = urlparse(url)
    except Exception:
        return False
    if p.scheme not in ("http", "https"):
        return False
    host = p.hostname
    if not host:
        return False
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        return False
    for info in infos:
        try:
            ip = ipaddress.ip_address(info[4][0])
        except ValueError:
            return False
        if (ip.is_private or ip.is_loopback or ip.is_link_local
                or ip.is_reserved or ip.is_multicast or ip.is_unspecified):
            return False
    return True


# 최종 주소: POST /api/sync/ical
@router.post("/ical")
async def sync_ical(
    req: IcalSyncRequest,
    user: models.User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    if user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    # SSRF 방어 — 내부망/메타데이터 엔드포인트로의 서버측 요청 차단
    if not _is_safe_url(req.url):
        return JSONResponse(status_code=400, content={"message": "허용되지 않은 URL입니다."})

    try:
        # 1. iCal 다운로드
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.get(req.url)
            if resp.status_code != 200:
                return JSONResponse(status_code=400, content={"message": "캘린더 URL 접속 실패"})
            ical_content = resp.content

        # 2. 파싱 → 인증된 유저 계정에 저장
        cal = Calendar.from_ical(ical_content)
        count = 0
        for component in cal.walk():
            if component.name != "VEVENT":
                continue
            try:
                summary = str(component.get("summary", "제목 없음"))
                dtstart = component.get("dtstart").dt
                if isinstance(dtstart, datetime):
                    date_str = dtstart.strftime("%Y-%m-%d")
                    time_str = dtstart.strftime("%H:%M")
                else:  # date 타입
                    date_str = dtstart.strftime("%Y-%m-%d")
                    time_str = "09:00"
                location = str(component.get("location", ""))
                db.add(models.Event(
                    id=str(uuid.uuid4()),
                    user_id=user.id,   # 하드코딩(5) 제거 → 인증된 유저
                    title=summary,
                    date=date_str,
                    time=time_str,
                    duration_hours=1.0,
                    location_name=location,
                    purpose=req.source_name,
                    is_private=True,
                ))
                count += 1
            except Exception as parse_e:
                print(f"⚠️ 파싱 건너뜀: {parse_e}")
                continue

        # 3. 저장
        if count > 0:
            db.commit()
            return {"status": "success", "message": f"{count}개의 일정을 불러왔습니다!"}
        return {"status": "success", "message": "가져올 일정이 없습니다."}

    except Exception as e:
        db.rollback()
        print(f"❌ iCal Sync Error: {e}")
        return JSONResponse(status_code=200, content={"status": "error", "message": f"동기화 오류: {str(e)}"})
