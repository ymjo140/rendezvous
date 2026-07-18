"""
네이버 지도 저장 리스트 임포트
- 공유 링크(naver.me/... 또는 map.naver.com/p/favorite/...)를 붙여넣으면
  공개 북마크 API에서 목록을 읽어와 우리 places와 매칭 → 내 저장 폴더로 일괄 저장.
- 같은 네이버 장소(sid)는 항상 같은 place_id로 수렴 → saved_items 집계(급상승/인기)가
  여러 사용자의 임포트를 자연스럽게 합산한다.
"""

import math
import re
from typing import List, Optional

import requests
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy.orm import Session

from core.database import get_db
from domain import models
from api.dependencies import require_user

router = APIRouter()

NAVER_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-G991N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
    "Accept": "application/json",
}
SHARE_ID_RE = re.compile(r"(?:folder|detail-list)/([0-9a-f]{16,40})")
HEX_RE = re.compile(r"\b[0-9a-f]{32}\b")

# 네이버 mcid → 우리 main_category
MCID_MAP = {
    "DINING": "RESTAURANT",
    "RESTAURANT": "RESTAURANT",
    "CAFE": "CAFE",
    "BAKERY": "CAFE",
    "BAR": "PUB",
    "PUB": "PUB",
    "CULTURE": "CULTURE",
    "LEISURE": "ACTIVITY",
}


class PreviewRequest(BaseModel):
    url: str


class CommitItem(BaseModel):
    sid: Optional[str] = None       # 네이버 장소 id
    name: str
    address: Optional[str] = None
    lat: Optional[float] = None
    lng: Optional[float] = None
    mcid: Optional[str] = None
    mcid_name: Optional[str] = None
    place_id: Optional[int] = None  # 매칭된 우리 장소 (없으면 신규 생성)


class CommitRequest(BaseModel):
    folder_name: str
    items: List[CommitItem]


def _extract_share_id(url: str) -> str:
    url = url.strip()
    # 붙여넣은 텍스트 안에서 URL만 추출 ("[네이버지도] 맛집 https://naver.me/xxx" 형태 지원)
    m = re.search(r"https?://\S+", url)
    if m:
        url = m.group(0)
    if not url.startswith("http"):
        raise HTTPException(status_code=400, detail="네이버 지도 공유 링크를 붙여넣어 주세요.")

    found = SHARE_ID_RE.search(url) or HEX_RE.search(url)
    if found:
        return found.group(1) if found.lastindex else found.group(0)

    # 단축 링크(naver.me)는 리다이렉트를 따라가 최종 URL에서 추출
    try:
        resp = requests.get(url, headers=NAVER_HEADERS, allow_redirects=True, timeout=8)
        final = resp.url or ""
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="링크를 여는 데 실패했어요. 잠시 후 다시 시도해 주세요.")
    found = SHARE_ID_RE.search(final) or HEX_RE.search(final)
    if not found:
        raise HTTPException(status_code=400, detail="저장 리스트 공유 링크가 아닌 것 같아요. 네이버 지도 → 저장 → 리스트 공유로 만든 링크를 붙여넣어 주세요.")
    return found.group(1) if found.lastindex else found.group(0)


def _fetch_bookmarks(share_id: str) -> dict:
    api = f"https://pages.map.naver.com/save-pages/api/maps-bookmark/v3/shares/{share_id}/bookmarks"
    headers = {**NAVER_HEADERS, "Referer": f"https://pages.map.naver.com/save-pages/web/detail-list/{share_id}"}
    try:
        resp = requests.get(api, headers=headers, params={"start": 0, "limit": 1000, "placeInfo": "false"}, timeout=10)
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="네이버에서 리스트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="리스트를 읽을 수 없어요. 공유가 꺼져 있거나 삭제된 리스트일 수 있어요.")
    try:
        data = resp.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="리스트를 읽을 수 없어요. 링크를 다시 확인해 주세요.")
    if not data.get("folder"):
        raise HTTPException(status_code=400, detail="리스트 정보를 찾지 못했어요. 링크를 다시 확인해 주세요.")
    return data


def _norm_name(s: str) -> str:
    return re.sub(r"[^0-9a-zA-Z가-힣]", "", (s or "").lower())


_BRANCH_RE = re.compile(r"(.+?)\s+\S*(?:점|본점|캠퍼스)$")


def _base_name(s: str) -> str:
    """지점명 제거: '산띠 서교점' → '산띠'"""
    m = _BRANCH_RE.match((s or "").strip())
    return m.group(1) if m else (s or "")


def _dist_m(lat1, lng1, lat2, lng2) -> float:
    dx = (lng2 - lng1) * 88800.0  # 서울 위도 기준 경도 1도 ≈ 88.8km
    dy = (lat2 - lat1) * 111000.0
    return math.sqrt(dx * dx + dy * dy)


def _match_place(db: Session, sid: Optional[str], name: str, lat: Optional[float], lng: Optional[float]):
    """네이버 북마크 1건을 우리 places에 매칭. 반환: Place | None"""
    if sid:
        hit = db.query(models.Place).filter(models.Place.naver_sid == str(sid)).first()
        if hit:
            return hit
    if lat is None or lng is None:
        return None
    # 반경 ~150m 후보 중 이름이 통하는 가장 가까운 곳
    cand = (
        db.query(models.Place)
        .filter(
            models.Place.lat.between(lat - 0.0014, lat + 0.0014),
            models.Place.lng.between(lng - 0.0017, lng + 0.0017),
        )
        .all()
    )
    n1 = _norm_name(name)
    b1 = _norm_name(_base_name(name))
    best, best_d = None, 1e18
    for p in cand:
        n2 = _norm_name(p.name)
        b2 = _norm_name(_base_name(p.name))
        ok = False
        if n1 and n2 and (n1 == n2 or n1.startswith(n2) or n2.startswith(n1)):
            ok = True
        elif b1 and b2 and len(b1) >= 2 and len(b2) >= 2 and (b1 == b2 or b1.startswith(b2) or b2.startswith(b1)):
            ok = True
        if not ok:
            continue
        d = _dist_m(lat, lng, p.lat, p.lng)
        if d < best_d:
            best, best_d = p, d
    return best


@router.post("/api/import/naver/preview")
def preview_naver_import(
    req: PreviewRequest,
    user: models.User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """공유 링크 → 리스트 미리보기(우리 장소 매칭 결과 포함)"""
    share_id = _extract_share_id(req.url)
    data = _fetch_bookmarks(share_id)
    folder = data.get("folder") or {}

    items = []
    matched_cnt = 0
    for b in (data.get("bookmarkList") or []):
        if b.get("type") != "place":
            continue
        name = (b.get("name") or "").strip()
        if not name:
            continue
        lat, lng = b.get("py"), b.get("px")
        sid = str(b.get("sid")) if b.get("sid") else None
        place = _match_place(db, sid, name, lat, lng)
        if place:
            matched_cnt += 1
        items.append({
            "sid": sid,
            "name": name,
            "address": b.get("address"),
            "lat": lat,
            "lng": lng,
            "mcid": b.get("mcid"),
            "mcid_name": b.get("mcidName"),
            "matched": {"place_id": place.id, "name": place.name} if place else None,
        })

    return {
        "share_id": share_id,
        "folder_name": folder.get("name") or "가져온 리스트",
        "owner_nick": (folder.get("placeUserProfile") or {}).get("nick"),
        "total": len(items),
        "matched": matched_cnt,
        "items": items,
    }


@router.post("/api/import/naver/commit")
def commit_naver_import(
    req: CommitRequest,
    user: models.User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """선택한 항목을 새 저장 폴더로 일괄 저장. 미매칭 장소는 신규 생성."""
    items = req.items[:1000]
    if not items:
        raise HTTPException(status_code=400, detail="가져올 장소가 없어요.")

    # 폴더 이름 중복 시 (2), (3)...
    base = (req.folder_name or "가져온 리스트").strip()[:40] or "가져온 리스트"
    name, n = base, 2
    while db.query(models.SaveFolder).filter(
        models.SaveFolder.user_id == user.id, models.SaveFolder.name == name
    ).first():
        name = f"{base} ({n})"
        n += 1

    folder = models.SaveFolder(user_id=user.id, name=name, icon="🧡", color="#03C75A")
    db.add(folder)
    db.flush()

    created_places = 0
    saved = 0
    seen_pids = set()
    for it in items:
        place = None
        if it.place_id:
            place = db.query(models.Place).filter(models.Place.id == it.place_id).first()
        if not place and it.sid:
            # 다른 사용자의 임포트로 이미 생성됐을 수 있음 → sid 재확인 (place_id 수렴이 핵심)
            place = db.query(models.Place).filter(models.Place.naver_sid == str(it.sid)).first()
        if not place:
            if it.lat is None or it.lng is None:
                continue
            place = models.Place(
                name=it.name.strip()[:80],
                main_category=MCID_MAP.get((it.mcid or "").upper(), "RESTAURANT"),
                cuisine_type=it.mcid_name or None,
                category=it.mcid_name or None,
                address=it.address,
                lat=it.lat,
                lng=it.lng,
                naver_sid=str(it.sid) if it.sid else None,
                search_keywords=[it.name.strip()],
            )
            db.add(place)
            db.flush()
            created_places += 1
        elif it.sid and not getattr(place, "naver_sid", None):
            place.naver_sid = str(it.sid)

        if place.id in seen_pids:
            continue
        seen_pids.add(place.id)
        db.add(models.SavedItem(
            folder_id=folder.id,
            user_id=user.id,
            item_type="place",
            place_id=place.id,
        ))
        saved += 1

    folder.item_count = saved
    db.commit()

    return {
        "folder_id": folder.id,
        "folder_name": folder.name,
        "saved": saved,
        "created_places": created_places,
    }
