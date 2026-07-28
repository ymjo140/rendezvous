"""
외부 지도 저장 리스트 임포트 (네이버 지도 + 카카오맵)
- 공유 링크를 붙여넣으면 어느 지도인지 자동 감지 → 공개 API에서 목록을 읽어와
  우리 places와 매칭 → 내 저장 폴더로 일괄 저장.
- 같은 외부 장소(naver_sid/kakao_cid)는 항상 같은 place_id로 수렴 →
  saved_items 집계(급상승/인기)가 여러 사용자의 임포트를 자연스럽게 합산한다.

네이버: naver.me 단축링크 → pages.map.naver.com save-pages 북마크 API
카카오: kko.to 단축링크 → map.kakao.com folder/info + favorite/list
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

UA_HEADERS = {
    "User-Agent": "Mozilla/5.0 (Linux; Android 13; SM-G991N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Mobile Safari/537.36",
    "Accept": "application/json",
}
NAVER_SHARE_RE = re.compile(r"(?:folder|detail-list)/([0-9a-f]{16,40})")
NAVER_HEX_RE = re.compile(r"\b[0-9a-f]{32}\b")
KAKAO_FOLDER_RE = re.compile(r"folderid=(\d+)", re.IGNORECASE)

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
    source: str = "naver"           # "naver" | "kakao"
    sid: Optional[str] = None       # 외부 장소 id (네이버 sid / 카카오 key)
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


def _first_url(text_in: str) -> str:
    text_in = (text_in or "").strip()
    m = re.search(r"https?://\S+", text_in)
    if m:
        return m.group(0)
    if not text_in.startswith("http"):
        raise HTTPException(status_code=400, detail="네이버 지도 또는 카카오맵 공유 링크를 붙여넣어 주세요.")
    return text_in


def _resolve(url: str) -> str:
    """단축 링크 리다이렉트를 따라가 최종 URL 반환"""
    try:
        resp = requests.get(url, headers=UA_HEADERS, allow_redirects=True, timeout=8)
        return resp.url or url
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="링크를 여는 데 실패했어요. 잠시 후 다시 시도해 주세요.")


# ─────────────────────────── 네이버 ───────────────────────────

def _naver_share_id(url: str) -> Optional[str]:
    found = NAVER_SHARE_RE.search(url) or NAVER_HEX_RE.search(url)
    if not found:
        return None
    return found.group(1) if found.lastindex else found.group(0)


def _fetch_naver(share_id: str) -> dict:
    """네이버 북마크 API → {folder_name, owner_nick, items:[...]}"""
    api = f"https://pages.map.naver.com/save-pages/api/maps-bookmark/v3/shares/{share_id}/bookmarks"
    headers = {**UA_HEADERS, "Referer": f"https://pages.map.naver.com/save-pages/web/detail-list/{share_id}"}
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
    folder = data.get("folder")
    if not folder:
        raise HTTPException(status_code=400, detail="리스트 정보를 찾지 못했어요. 링크를 다시 확인해 주세요.")

    items = []
    for b in (data.get("bookmarkList") or []):
        if b.get("type") != "place":
            continue
        name = (b.get("name") or "").strip()
        if not name:
            continue
        items.append({
            "source": "naver",
            "sid": str(b.get("sid")) if b.get("sid") else None,
            "name": name,
            "address": b.get("address"),
            "lat": b.get("py"),
            "lng": b.get("px"),
            "mcid": b.get("mcid"),
            "mcid_name": b.get("mcidName"),
        })
    return {
        "folder_name": folder.get("name") or "가져온 리스트",
        "owner_nick": (folder.get("placeUserProfile") or {}).get("nick"),
        "items": items,
    }


# ─────────────────────────── 카카오 ───────────────────────────

def _fetch_kakao(folder_id: str) -> dict:
    """카카오맵 공개 폴더 API → {folder_name, owner_nick, items:[...]}"""
    headers = {**UA_HEADERS, "Referer": "https://map.kakao.com/"}
    try:
        # 파라미터 대소문자가 엔드포인트마다 다름에 주의 (folderId vs folderid)
        info = requests.get("https://map.kakao.com/folder/info", headers=headers,
                            params={"folderId": folder_id}, timeout=10)
        favs = requests.get("https://map.kakao.com/favorite/list", headers=headers,
                            params={"folderid": folder_id}, timeout=10)
    except requests.RequestException:
        raise HTTPException(status_code=502, detail="카카오맵에서 리스트를 불러오지 못했어요. 잠시 후 다시 시도해 주세요.")
    try:
        info_j = info.json()
        favs_j = favs.json()
    except ValueError:
        raise HTTPException(status_code=502, detail="리스트를 읽을 수 없어요. 공유가 꺼져 있거나 삭제된 리스트일 수 있어요.")

    folders = info_j.get("folders") or []
    if not folders:
        raise HTTPException(status_code=400, detail="리스트 정보를 찾지 못했어요. 링크를 다시 확인해 주세요.")
    folder = folders[0]

    items = []
    for f in (favs_j.get("favorites") or []):
        if (f.get("type") or "").upper() != "PLACE":
            continue
        name = (f.get("display1") or "").strip()
        if not name:
            continue
        items.append({
            "source": "kakao",
            "sid": str(f.get("key")) if f.get("key") else None,
            "name": name,
            "address": f.get("display2"),
            "lat": f.get("lat"),
            "lng": f.get("lon"),
            "mcid": None,
            "mcid_name": None,
        })
    return {
        "folder_name": folder.get("title") or "가져온 리스트",
        "owner_nick": folder.get("nickname"),
        "items": items,
    }


# ─────────────────────────── 링크 감지 ───────────────────────────

def _load_shared_list(raw_url: str) -> dict:
    """공유 링크에서 지도 서비스 자동 감지 후 목록 로드"""
    url = _first_url(raw_url)

    # 리다이렉트 없이 바로 판별 가능한 형태 먼저
    if "kko.to" in url or "kakao.com" in url:
        final = url if KAKAO_FOLDER_RE.search(url) else _resolve(url)
        m = KAKAO_FOLDER_RE.search(final)
        if not m:
            raise HTTPException(status_code=400, detail="카카오맵 저장 리스트 공유 링크가 아닌 것 같아요. 카카오맵 → 저장 → 폴더 공유 링크를 붙여넣어 주세요.")
        return _fetch_kakao(m.group(1))

    sid = _naver_share_id(url)
    if sid is None:
        final = _resolve(url)
        # naver.me가 아닌 링크가 카카오로 풀리는 경우도 처리
        m = KAKAO_FOLDER_RE.search(final)
        if m and "kakao.com" in final:
            return _fetch_kakao(m.group(1))
        sid = _naver_share_id(final)
    if sid is None:
        raise HTTPException(status_code=400, detail="저장 리스트 공유 링크가 아닌 것 같아요. 네이버 지도/카카오맵의 리스트 공유 링크를 붙여넣어 주세요.")
    return _fetch_naver(sid)


# ─────────────────────────── 장소 매칭 ───────────────────────────

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


def _ext_id_column(source: str):
    return models.Place.kakao_cid if source == "kakao" else models.Place.naver_sid


def _match_place(db: Session, source: str, sid: Optional[str], name: str, lat: Optional[float], lng: Optional[float]):
    """외부 북마크 1건을 우리 places에 매칭. 반환: Place | None"""
    if sid:
        hit = db.query(models.Place).filter(_ext_id_column(source) == str(sid)).first()
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


# ─────────────────────────── API ───────────────────────────

@router.post("/api/import/places/preview")
def preview_import(
    req: PreviewRequest,
    user: models.User = Depends(require_user),
    db: Session = Depends(get_db),
):
    """공유 링크(네이버/카카오 자동 감지) → 리스트 미리보기(우리 장소 매칭 결과 포함)"""
    data = _load_shared_list(req.url)

    items = []
    matched_cnt = 0
    for b in data["items"]:
        place = _match_place(db, b["source"], b["sid"], b["name"], b["lat"], b["lng"])
        if place:
            matched_cnt += 1
        items.append({**b, "matched": {"place_id": place.id, "name": place.name} if place else None})

    return {
        "source": data["items"][0]["source"] if data["items"] else None,
        "folder_name": data["folder_name"],
        "owner_nick": data.get("owner_nick"),
        "total": len(items),
        "matched": matched_cnt,
        "items": items,
    }


@router.post("/api/import/places/commit")
def commit_import(
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

    from api.routers.saves import pick_folder_color
    folder = models.SaveFolder(user_id=user.id, name=name, icon="🧡", color=pick_folder_color(db, user.id))
    db.add(folder)
    db.flush()

    created_places = 0
    saved = 0
    seen_pids = set()
    for it in items:
        source = it.source if it.source in ("naver", "kakao") else "naver"
        place = None
        if it.place_id:
            place = db.query(models.Place).filter(models.Place.id == it.place_id).first()
        if not place:
            # 다른 사용자의 임포트로 이미 생성됐을 수 있음 → 외부 id + 좌표·이름 재매칭 (중복 생성 방지)
            place = _match_place(db, source, it.sid, it.name, it.lat, it.lng)
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
                naver_sid=str(it.sid) if (it.sid and source == "naver") else None,
                kakao_cid=str(it.sid) if (it.sid and source == "kakao") else None,
                search_keywords=[it.name.strip()],
            )
            db.add(place)
            db.flush()
            created_places += 1
        elif it.sid:
            # 매칭된 기존 장소에 외부 id 백필 → 다음 임포트부터 즉시 수렴
            if source == "naver" and not getattr(place, "naver_sid", None):
                place.naver_sid = str(it.sid)
            elif source == "kakao" and not getattr(place, "kakao_cid", None):
                place.kakao_cid = str(it.sid)

        if place.id in seen_pids:
            continue
        seen_pids.add(place.id)
        db.add(models.SavedItem(
            folder_id=folder.id,
            user_id=user.id,
            item_type="place",
            place_id=place.id,
            source="import",   # 과거 관심의 흔적 — 지금 고른 게 아니라 신호가 약하다
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
