import json

from fastapi import APIRouter, Depends, BackgroundTasks, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import text
from typing import List, Optional

from core.database import get_db
from domain import models
from schemas import meeting as schemas
from services.meeting_service import MeetingService

# 🌟 [수정됨] 파일 위치가 'core' 폴더이므로 경로를 core로 변경합니다.
from core.data_provider import RealDataProvider 
from api.dependencies import get_current_user

router = APIRouter()
meeting_service = MeetingService()

# 객체 생성
data_provider = RealDataProvider() 

# 🌟 [신규 추가] 지하철역 자동완성 API
@router.get("/api/places/autocomplete")
def autocomplete_hotspots(query: str = Query(..., min_length=1)):
    return meeting_service.search_hotspots(query)

# 🌟 [수정] 장소 검색 API
@router.get("/api/places/search")
def search_places(
    query: str = Query(..., min_length=1),
    main_category: str = Query(None, description="RESTAURANT, CAFE, PUB, BUSINESS, CULTURE"),
    db_only: bool = Query(False, description="Return DB results only when true"),
    db: Session = Depends(get_db)
):
    results = []
    seen = set()

    # 이름 검색은 카테고리와 무관하게 이름을 찾는다(네이버 지도식).
    # ⚠️ 크롤 데이터의 main_category가 config와 어긋나 있음(FOOD 10만 vs RESTAURANT 11건)
    #    + 개별 분류 노이즈(예: '신정동국밥집'이 PUB). 카테고리로 하드 필터하면 정상
    #    이름 매치를 다 놓쳐 "검색 실패"가 됐음. main_category는 하위호환용으로만 받고
    #    필터엔 쓰지 않는다(향후 카테고리 정규화 후 소프트 랭킹으로 활용 가능).
    db_query = db.query(models.Place).filter(models.Place.name.ilike(f"%{query}%"))
    db_places = db_query.limit(50).all()
    for p in db_places:
        name = p.name or ""
        if name and name not in seen:
            seen.add(name)
            results.append({
                "id": p.id,
                "name": name,
                "title": name,
                "address": p.address or "",
                "category": p.cuisine_type or p.category or "",
                "main_category": p.main_category,
                "lat": p.lat,
                "lng": p.lng,
                "features": p.features or {},
                "vibe_tags": p.vibe_tags or [],
                "business_hours": p.business_hours or "",
                "phone": p.phone or "",
                "price_range": p.price_range or "",
                "wemeet_rating": p.wemeet_rating or 0.0,
                "review_count": p.review_count or 0,
                "external_link": p.external_link or "",
                "source": "db"
            })

    if db_only:
        return results

    # 외부(네이버) 검색 실패가 DB 결과까지 날리지 않도록 방어(API키 누락/네트워크 등)
    try:
        ext_results = data_provider.search_places_all_queries([query], "", 0.0, 0.0, db=db)
    except Exception as ex:
        print(f"[search] 외부 검색 실패(무시하고 DB 결과 반환): {ex}")
        ext_results = []
    for place in ext_results:
        name = place.name or ""
        if not name or name in seen:
            continue
        lat = place.location[0] if isinstance(place.location, (list, tuple)) else place.location
        lng = place.location[1] if isinstance(place.location, (list, tuple)) else 0.0
        results.append({
            "id": None,
            "name": name,
            "title": name,
            "address": place.address or "",
            "category": place.category or "",
            "main_category": "",
            "lat": lat,
            "lng": lng,
            "features": {},
            "vibe_tags": [],
            "business_hours": "",
            "phone": "",
            "price_range": "",
            "wemeet_rating": 0.0,
            "review_count": 0,
            "external_link": "",
            "source": "external"
        })

    return results


@router.get("/api/geocode")
def geocode_region(query: str = Query(..., min_length=1)):
    """내 동네 설정용 검색 — 도로명/지번 주소 + 동 + 지하철역(식당 아님).
    지오코딩(NCP)로 주소/동을, 네이버 지역검색의 '지하철/전철' 카테고리로 역을 찾는다."""
    import os as _os
    import re as _re
    import requests as _rq

    q = query.strip()
    results = []
    seen = set()

    # 1) NCP 지오코딩 — 동/도로명·지번 주소
    mid = _os.getenv("NAVER_MAP_ID")
    msec = _os.getenv("NAVER_MAP_SECRET")
    if mid and msec:
        try:
            gr = _rq.get(
                "https://maps.apigw.ntruss.com/map-geocode/v2/geocode",
                params={"query": q},
                headers={"X-NCP-APIGW-API-KEY-ID": mid, "X-NCP-APIGW-API-KEY": msec},
                timeout=8,
            )
            if gr.status_code == 200:
                for a in gr.json().get("addresses", [])[:5]:
                    title = a.get("roadAddress") or a.get("jibunAddress") or ""
                    if not title or title in seen:
                        continue
                    try:
                        lat = float(a.get("y"))
                        lng = float(a.get("x"))
                    except (TypeError, ValueError):
                        continue
                    seen.add(title)
                    results.append({
                        "title": title,
                        "address": a.get("jibunAddress") or title,
                        "lat": lat, "lng": lng, "type": "address",
                    })
        except Exception as ex:
            print(f"[geocode] 지오코딩 실패: {ex}")

    # 2) 지하철역 — 네이버 지역검색에서 '지하철/전철' 카테고리만 추려 상단 배치
    sid = _os.getenv("NAVER_SEARCH_ID")
    ssec = _os.getenv("NAVER_SEARCH_SECRET")
    if sid and ssec:
        try:
            lr = _rq.get(
                "https://openapi.naver.com/v1/search/local.json",
                params={"query": q, "display": 5},
                headers={"X-Naver-Client-Id": sid, "X-Naver-Client-Secret": ssec},
                timeout=8,
            )
            if lr.status_code == 200:
                stations = []
                for it in lr.json().get("items", []):
                    cat = it.get("category", "")
                    if "지하철" not in cat and "전철" not in cat:
                        continue
                    title = _re.sub(r"<[^>]+>", "", it.get("title", ""))
                    if not title or title in seen:
                        continue
                    try:
                        lng = int(it.get("mapx")) / 1e7
                        lat = int(it.get("mapy")) / 1e7
                    except (TypeError, ValueError):
                        continue
                    seen.add(title)
                    stations.append({
                        "title": title,
                        "address": it.get("roadAddress") or it.get("address") or "지하철역",
                        "lat": lat, "lng": lng, "type": "station",
                    })
                results = stations + results  # 역을 위로
        except Exception as ex:
            print(f"[geocode] 역 검색 실패: {ex}")

    return results


def _table_cells(x: int, y: int, shape: str, rotated: bool):
    """테이블이 차지하는 격자 셀(긴 테이블은 2칸)."""
    cells = [(x, y)]
    if shape == "long":
        cells.append((x, y + 1) if rotated else ((x + 1), y))
    return cells


def _max_group_seats(tables: list) -> tuple:
    """빈 테이블 중 (최대 단일 테이블 인원, 합석 가능 인접 테이블 최대 합계).
    tables: [{capacity, cells, mergeable, area}] — 같은 구역에서 변을 맞댄
    합석 가능 테이블들을 붙였을 때 앉을 수 있는 최대 인원."""
    from collections import deque
    best_single = max((t["capacity"] for t in tables), default=0)
    merge = [t for t in tables if t.get("mergeable")]
    cellmap = {}
    for i, t in enumerate(merge):
        for c in t["cells"]:
            cellmap[(t["area"], c)] = i
    seen, best_comp = set(), 0
    for i in range(len(merge)):
        if i in seen:
            continue
        seen.add(i)
        comp, dq = 0, deque([i])
        while dq:
            j = dq.popleft()
            tj = merge[j]
            comp += tj["capacity"]
            for (cx, cy) in tj["cells"]:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    k = cellmap.get((tj["area"], (cx + dx, cy + dy)))
                    if k is not None and k not in seen:
                        seen.add(k)
                        dq.append(k)
        best_comp = max(best_comp, comp)
    return best_single, max(best_single, best_comp)


@router.get("/api/places/vacancy-now")
def get_vacancy_now(
    lat: float = Query(37.5665),
    lng: float = Query(126.978),
    db: Session = Depends(get_db),
):
    """🔴 지금 빈자리 있는 장소(사장님 원탭/테이블맵 신호, TTL 자동만료) — 내 주변 순.
    테이블맵 사용 매장은 빈 테이블 수·좌석수·테이블 한정 최대할인까지 포함."""
    from sqlalchemy import text as _t
    rows = db.execute(_t("""
        SELECT p.id, p.name, p.category, p.address, p.lat, p.lng, p.wemeet_rating,
               (6371 * acos(cos(radians(:lat)) * cos(radians(p.lat)) * cos(radians(p.lng) - radians(:lng)) + sin(radians(:lat)) * sin(radians(p.lat)))) AS dist_km,
               EXTRACT(EPOCH FROM (p.vacancy_until - NOW()))/60 AS remain_min,
               (SELECT COUNT(*) FROM store_tables t WHERE t.place_id = p.id AND t.status = 'empty') AS empty_tables,
               (SELECT COALESCE(SUM(t.capacity),0) FROM store_tables t WHERE t.place_id = p.id AND t.status = 'empty') AS empty_seats,
               (SELECT MAX(t.deal_percent) FROM store_tables t WHERE t.place_id = p.id AND t.status = 'empty') AS best_deal
        FROM places p
        WHERE p.vacancy_until IS NOT NULL AND p.vacancy_until > NOW()
        ORDER BY dist_km ASC
        LIMIT 15
    """), {"lat": lat, "lng": lng}).fetchall()
    out = []
    for r in rows:
        item = {
            "id": r[0], "name": r[1], "category": r[2], "address": r[3],
            "lat": r[4], "lng": r[5], "wemeet_rating": r[6],
            "dist_km": round(float(r[7] or 0), 1),
            "remain_min": max(0, int(r[8] or 0)),
            "empty_tables": int(r[9] or 0),
            "empty_seats": int(r[10] or 0),
            "best_deal": int(r[11]) if r[11] else None,
            "max_single_seats": 0,
            "max_group_seats": 0,
        }
        # 합석(⛓) 시 최대 인원 — 빈 테이블 좌표 기반 인접 집계
        if item["empty_tables"] > 0:
            try:
                trows = db.execute(_t("""
                    SELECT capacity, pos_x, pos_y, COALESCE(shape,'square'),
                           COALESCE(rotated,false), COALESCE(mergeable,false), COALESCE(area,'1층')
                    FROM store_tables WHERE place_id = :pid AND status = 'empty'
                """), {"pid": item["id"]}).fetchall()
                tbls = [{
                    "capacity": int(t[0] or 0),
                    "cells": _table_cells(int(t[1] or 0), int(t[2] or 0), t[3], bool(t[4])),
                    "mergeable": bool(t[5]),
                    "area": t[6],
                } for t in trows]
                single, group = _max_group_seats(tbls)
                item["max_single_seats"] = single
                item["max_group_seats"] = group
            except Exception as exc:
                print(f"[vacancy] group seats skip: {exc}")
                db.rollback()  # 트랜잭션 오염 방지(다음 장소 집계 보호)
        out.append(item)
    return {"count": len(out), "places": out}


@router.get("/api/places/{place_id}/tables")
def get_place_tables(place_id: int, db: Session = Depends(get_db)):
    """손님용 테이블 목록 — 예약 시 '창가 4인석' 지정용. 테이블맵 미등록이면 빈 배열."""
    from sqlalchemy import text as _t
    zone_ko = {"hall": "홀", "window": "창가", "room": "룸", "outdoor": "야외", "bar": "바"}
    try:
        rows = db.execute(_t("""
            SELECT id, label, capacity, COALESCE(shape,'square'), COALESCE(zone_type,'hall'),
                   COALESCE(area,'1층'), status, deal_percent, COALESCE(mergeable,false)
            FROM store_tables WHERE place_id = :pid ORDER BY area, id
        """), {"pid": place_id}).fetchall()
    except Exception as exc:
        print(f"[place-tables] 조회 실패: {exc}")
        db.rollback()
        return {"count": 0, "tables": []}
    return {
        "count": len(rows),
        "tables": [{
            "id": r[0],
            "label": r[1],
            "capacity": int(r[2] or 0),
            "shape": r[3],
            "zone": zone_ko.get(r[4], r[4]),
            "area": r[5],
            "status": r[6],
            "deal_percent": int(r[7]) if r[7] else None,
            "mergeable": bool(r[8]),
        } for r in rows],
    }


@router.get("/api/places/nearby")
def places_nearby(
    min_lat: float, max_lat: float, min_lng: float, max_lng: float,
    limit: int = 3000, db: Session = Depends(get_db),
):
    """지도 영역(bounds) 안의 가게 전부 — 지도 핀→상세용. {place_id} 라우트보다 위에 있어야 함.
    샘플링 없이 모두 반환(이름표 노출은 프론트 충돌감지가 조절). limit은 브라우저 보호용 상한."""
    lim = min(max(limit, 1), 5000)
    rows = (
        db.query(models.Place.id, models.Place.name, models.Place.lat, models.Place.lng,
                 models.Place.cuisine_type, models.Place.category, models.Place.main_category)
        .filter(
            models.Place.lat >= min_lat, models.Place.lat <= max_lat,
            models.Place.lng >= min_lng, models.Place.lng <= max_lng,
        )
        .order_by(models.Place.id)
        .limit(lim)
        .all()
    )
    return {
        "count": len(rows),
        "items": [
            {"id": r[0], "name": r[1], "lat": r[2], "lng": r[3],
             "category": r[4] or r[5] or r[6] or ""}
            for r in rows
            if r[2] and r[3]
        ],
    }


@router.get("/api/places/{place_id}")
def get_place_detail(
    place_id: int,
    reviews_limit: int = Query(20, le=50),
    db: Session = Depends(get_db)
):
    place = db.query(models.Place).filter(models.Place.id == place_id).first()
    if not place:
        raise HTTPException(status_code=404, detail="Place not found")

    reviews_query = db.query(models.Review).filter(models.Review.place_name == place.name)
    total_reviews = reviews_query.count()
    reviews = reviews_query.order_by(models.Review.created_at.desc()).limit(reviews_limit).all()

    users_map = {}
    user_ids = {r.user_id for r in reviews}
    if user_ids:
        users = db.query(models.User).filter(models.User.id.in_(user_ids)).all()
        users_map = {u.id: u for u in users}

    review_items = []
    for r in reviews:
        user = users_map.get(r.user_id)
        review_items.append({
            "id": r.id,
            "user_id": r.user_id,
            "user_name": user.name if user else "Unknown",
            "rating": r.rating,
            "scores": {
                "taste": r.score_taste,
                "service": r.score_service,
                "price": r.score_price,
                "vibe": r.score_vibe
            },
            "comment": r.comment,
            "tags": r.tags or [],
            "image_urls": r.image_urls or [],
            "created_at": r.created_at.strftime("%Y-%m-%d")
        })

    avg_rating = place.wemeet_rating or 0.0
    if total_reviews > 0:
        avg_rating = sum(r.rating for r in reviews) / max(len(reviews), 1)

    # 1순위: 사장님이 콘솔에서 등록한 메뉴(store_menus, 공유 Supabase) — B2B↔B2C 연결.
    # 없으면 크롤링 데이터(features.menus) 폴백. 테이블 부재/권한 오류에도 상세가 죽지 않게.
    menus = []
    try:
        from sqlalchemy import text as _sql_text
        rows = db.execute(
            _sql_text(
                """
                SELECT name, price, is_recommended FROM store_menus
                WHERE store_id = :sid
                ORDER BY is_recommended DESC, created_at ASC
                LIMIT 30
                """
            ),
            {"sid": str(place_id)},
        ).fetchall()
        menus = [{"name": r[0], "price": r[1], "recommended": bool(r[2])} for r in rows if r[0]]
    except Exception as exc:
        print(f"[place_detail] store_menus 조회 실패(폴백): {exc}")

    features = place.features or {}
    if not menus:
        raw_menus = features.get("menus") or features.get("menu") or []
        if isinstance(raw_menus, list):
            for item in raw_menus:
                if isinstance(item, dict):
                    name = item.get("name") or item.get("title") or ""
                    price = item.get("price")
                    menus.append({"name": name, "price": price})
                elif isinstance(item, str):
                    menus.append({"name": item, "price": None})
        elif isinstance(raw_menus, dict):
            name = raw_menus.get("name") or raw_menus.get("title") or ""
            menus.append({"name": name, "price": raw_menus.get("price")})

    tags = []
    for tag in (place.tags or []) + (place.vibe_tags or []):
        if tag and tag not in tags:
            tags.append(tag)

    # 🔴 실시간 빈자리(사장님 원탭/테이블맵) — vacancy_until 유효할 때만
    vacancy = None
    try:
        vrow = db.execute(text("""
            SELECT EXTRACT(EPOCH FROM (vacancy_until - NOW()))/60 AS remain_min,
                   (SELECT COUNT(*) FROM store_tables t WHERE t.place_id=:pid AND t.status='empty') AS et,
                   (SELECT COALESCE(SUM(capacity),0) FROM store_tables t WHERE t.place_id=:pid AND t.status='empty') AS es,
                   (SELECT MAX(deal_percent) FROM store_tables t WHERE t.place_id=:pid AND t.status='empty') AS bd
            FROM places WHERE id=:pid AND vacancy_until IS NOT NULL AND vacancy_until > NOW()
        """), {"pid": place_id}).fetchone()
        if vrow:
            vacancy = {
                "active": True,
                "remain_min": max(0, int(vrow[0] or 0)),
                "empty_tables": int(vrow[1] or 0),
                "empty_seats": int(vrow[2] or 0),
                "best_deal": int(vrow[3]) if vrow[3] else None,
            }
    except Exception as exc:
        print(f"[place_detail] vacancy skip: {str(exc)[:60]}")
        db.rollback()

    # 💸 진행 중인 할인(사장님 등록 오퍼) — 유효기간·재고 남은 것만
    offers_out = []
    try:
        orows = db.execute(text("""
            SELECT id, title, description, benefit_type, benefit_value, valid_to,
                   inventory_cap, inventory_used
            FROM offers
            WHERE place_id=:pid AND COALESCE(status,'active')='active'
              AND (valid_from IS NULL OR valid_from <= NOW())
              AND (valid_to IS NULL OR valid_to > NOW())
            ORDER BY created_at DESC LIMIT 10
        """), {"pid": place_id}).fetchall()
        for o in orows:
            cap, used = o[6], o[7]
            if cap is not None and used is not None and used >= cap:
                continue  # 소진
            offers_out.append({
                "id": o[0], "title": o[1] or "", "description": o[2] or "",
                "benefit_type": o[3], "benefit_value": o[4],
                "remaining": (int(cap) - int(used)) if (cap is not None and used is not None) else None,
                "valid_to": o[5].isoformat() if o[5] else None,
            })
    except Exception as exc:
        print(f"[place_detail] offers skip: {str(exc)[:60]}")
        db.rollback()

    return {
        "id": place.id,
        "name": place.name,
        "category": place.cuisine_type or place.category or "",
        "main_category": place.main_category,
        "address": place.address or "",
        "lat": place.lat,
        "lng": place.lng,
        "rating": avg_rating,
        "review_count": total_reviews if total_reviews > 0 else (place.review_count or 0),
        "phone": place.phone or "",
        "business_hours": place.business_hours or "",
        "price_range": place.price_range or "",
        "external_link": place.external_link or "",
        "tags": tags,
        "menus": menus,
        "vacancy": vacancy,   # 🔴 실시간 빈자리(없으면 null)
        "offers": offers_out, # 💸 진행 중 할인
        "reviews": review_items
    }

@router.get("/api/places/by-category")
def get_places_by_category(
    main_category: str = Query(..., description="RESTAURANT, CAFE, PUB, BUSINESS, CULTURE"),
    cuisine_type: str = Query(None, description="세부 유형 (공유오피스, 영화관 등)"),
    lat: float = Query(None, description="중심 위도"),
    lng: float = Query(None, description="중심 경도"),
    radius_km: float = Query(5.0, description="반경 (km)"),
    limit: int = Query(50, le=100),
    db: Session = Depends(get_db)
):
    """카테고리별 장소 검색 (비즈니스: 회의실/공유오피스, 문화생활: 영화관/공연장)"""
    
    query = db.query(models.Place).filter(
        models.Place.main_category == main_category.upper()
    )
    
    # cuisine_type 필터
    if cuisine_type:
        query = query.filter(models.Place.cuisine_type.ilike(f"%{cuisine_type}%"))
    
    # 위치 기반 필터 (간단한 bounding box)
    if lat and lng:
        # 대략적인 반경 계산 (1도 ≈ 111km)
        delta = radius_km / 111.0
        query = query.filter(
            models.Place.lat.between(lat - delta, lat + delta),
            models.Place.lng.between(lng - delta, lng + delta)
        )
    
    places = query.limit(limit).all()
    
    return [{
        "id": p.id,
        "name": p.name,
        "address": p.address or "",
        "category": p.cuisine_type or p.category or "",
        "main_category": p.main_category,
        "lat": p.lat,
        "lng": p.lng,
        "features": p.features or {},
        "vibe_tags": p.vibe_tags or [],
        "business_hours": p.business_hours or "",
        "wemeet_rating": p.wemeet_rating or 0.0,
        "review_count": p.review_count or 0
    } for p in places]

# ─────────────────────── 모임 추천 이유 엔진 ───────────────────────
# 음식 취향/카테고리를 표준 라벨로 정규화(멤버 prefs ↔ 장소 cuisine 매칭용)
_CUISINE_KEYWORDS = {
    "일식": ["일식", "스시", "초밥", "오마카세", "사시미", "라멘", "우동", "돈카츠", "이자카야", "일본", "규카츠", "소바"],
    "한식": ["한식", "국밥", "찌개", "백반", "불고기", "비빔밥", "족발", "보쌈", "분식", "떡볶이", "김밥", "해장국", "감자탕", "설렁탕", "국수", "냉면"],
    "중식": ["중식", "중국", "짜장", "짬뽕", "마라", "딤섬", "훠궈", "양꼬치"],
    "양식": ["양식", "이탈리", "파스타", "피자", "스테이크", "브런치", "경양식", "버거"],
    "고기": ["고기", "구이", "삼겹", "갈비", "곱창", "막창", "정육", "숯불", "회식"],
    "카페": ["카페", "커피", "디저트", "베이커리", "빵", "케이크"],
    "술": ["술", "맥주", "포차", "호프", "펍", "와인", "바", "하이볼", "칵테일"],
    "해산물": ["해산물", "회", "횟집", "물회", "조개", "대게", "랍스터", "새우", "수산"],
    "아시아": ["아시아", "베트남", "태국", "쌀국수", "팟타이", "인도"],
}


def _josa_eul(word: str) -> str:
    """받침 유무로 을/를 선택."""
    if not word:
        return "을"
    ch = word[-1]
    if "가" <= ch <= "힣":
        return "을" if (ord(ch) - 0xAC00) % 28 else "를"
    return "을"


def _canon_cuisines(*texts) -> set:
    """자유 텍스트(멤버 취향/장소 카테고리)에서 표준 음식 라벨 집합 추출."""
    blob = " ".join(str(t) for t in texts if t)
    labels = set()
    for label, kws in _CUISINE_KEYWORDS.items():
        if any(kw in blob for kw in kws):
            labels.add(label)
    return labels


def _split_prefs(pref_list) -> list:
    """['고기/구이','한식'] → ['고기','구이','한식'] 슬래시 분해."""
    out = []
    for raw in (pref_list or []):
        for part in str(raw).split("/"):
            t = part.strip()
            if t:
                out.append(t)
    return out


def _reason_km(anchor_lat, anchor_lng, plat, plng) -> Optional[float]:
    try:
        import math as _m
        dx = (float(plng) - float(anchor_lng)) * 88.8
        dy = (float(plat) - float(anchor_lat)) * 111.0
        return _m.sqrt(dx * dx + dy * dy)
    except Exception:
        return None


def _first_image(imgs) -> Optional[str]:
    """image_urls(리스트/JSON/문자열)에서 첫 유효 이미지 하나."""
    if not imgs:
        return None
    try:
        arr = imgs if isinstance(imgs, list) else json.loads(imgs)
    except Exception:
        arr = [imgs] if isinstance(imgs, str) else []
    for u in arr:
        if isinstance(u, str) and (u.startswith("http") or u.startswith("data:")):
            return u
    return None


def place_image_map(db: Session, places: list) -> dict:
    """장소 대표 이미지 배치 조회. 우선순위: 유저 게시물 사진(place_id) → 후기 사진(가게명).
    (사장님 등록 사진 테이블이 생기면 최우선으로 이 앞에 추가) — 없으면 프론트가 이모지 타일."""
    ids = [p.get("id") for p in places if p.get("id")]
    names = [p.get("name") for p in places if p.get("name")]
    out: dict = {}
    if not ids:
        return out
    try:
        rows = db.execute(text(
            "select place_id, image_urls from posts "
            "where place_id = any(:ids) and image_urls is not null "
            "order by created_at desc"
        ), {"ids": ids}).fetchall()
        for pid, imgs in rows:
            if pid in out:
                continue
            img = _first_image(imgs)
            if img:
                out[pid] = img
    except Exception as exc:
        print(f"[place-image] posts skip: {str(exc)[:60]}")
        db.rollback()
    # 후기 사진(place_name 매칭) — place_id 아직 안 붙은 장소 보완
    missing_names = [p["name"] for p in places if p.get("id") and p["id"] not in out and p.get("name")]
    if missing_names:
        try:
            rows = db.execute(text(
                "select place_name, image_urls from reviews "
                "where place_name = any(:names) and image_urls is not null "
                "order by created_at desc"
            ), {"names": missing_names}).fetchall()
            name_img = {}
            for pname, imgs in rows:
                if pname in name_img:
                    continue
                img = _first_image(imgs)
                if img:
                    name_img[pname] = img
            for p in places:
                if p.get("id") and p["id"] not in out and name_img.get(p.get("name")):
                    out[p["id"]] = name_img[p["name"]]
        except Exception as exc:
            print(f"[place-image] reviews skip: {str(exc)[:60]}")
            db.rollback()
    return out


def _attach_images(db: Session, places: list) -> None:
    """places 각 항목에 image 필드 부착(있는 것만)."""
    imap = place_image_map(db, places)
    for p in places:
        if p.get("id") in imap:
            p["image"] = imap[p["id"]]


def _cuisine_to_main(labels: set) -> str:
    # _canon_cuisines의 라벨 키는 '카페'/'술'(빵·디저트·맥주 등은 이 라벨로 흡수됨)
    if "카페" in labels:
        return "CAFE"
    if "술" in labels:
        return "PUB"
    return "FOOD"


def meeting_taste_signal(db: Session, comm, member_ids: list) -> dict:
    """모임의 '취향 장소' 수집 → 후보 확장 카테고리 + 센트로이드용 place_ids.
    주력: 모임 방문 재방문의사(강) + 모임 소유 폴더 저장. 보조: 멤버 개인 저장(캡).
    (개인 저장은 유저별로 수백 개라 그대로 쓰면 특정 유저 취향으로 쏠려서 캡+저비중)"""
    primary_ids = []   # 모임 전용(재방문의사/모임폴더) — 카테고리 판단 근거
    all_ids = []       # 센트로이드용(주력+보조)

    # 1) 재방문 의사(가장 강함): 이 모임 방문 or 멤버 개인 재방문의사
    try:
        for (pid,) in db.query(models.PlaceVisitFeedback.place_id).filter(
            models.PlaceVisitFeedback.place_id.isnot(None),
            ((models.PlaceVisitFeedback.room_id == comm.id) |
             (models.PlaceVisitFeedback.user_id.in_(member_ids))),
            ((models.PlaceVisitFeedback.personal_revisit == True) |  # noqa: E712
             (models.PlaceVisitFeedback.group_revisit == True)),     # noqa: E712
        ).all():
            primary_ids.append(pid)
    except Exception as exc:
        print(f"[taste] revisit skip: {str(exc)[:60]}")

    # 2) 모임 소유 폴더 저장(빵지순례 등)
    try:
        fids = [f[0] for f in db.query(models.SaveFolder.id).filter(
            models.SaveFolder.community_id == comm.id).all()]
        if fids:
            for (pid,) in db.query(models.SavedItem.place_id).filter(
                    models.SavedItem.folder_id.in_(fids),
                    models.SavedItem.place_id.isnot(None)).all():
                primary_ids.append(pid)
    except Exception as exc:
        print(f"[taste] comm folder skip: {str(exc)[:60]}")

    # 센트로이드는 '모임 전용(재방문의사+모임폴더)'만 사용 — 개인 저장(유저별 수백)은
    # 그대로 섞으면 그 유저 취향으로 쏠려 모임 특색이 사라지고(빵모임→한식) 태그도 아무데나 붙음.
    all_ids.extend(primary_ids)

    from collections import Counter
    boost = set()
    # ① 저장 폴더 장소 이름으로 카테고리 판정(cuisine_type 오염돼서 이름 우선)
    if primary_ids:
        names = [n for (n,) in db.query(models.Place.name).filter(models.Place.id.in_(primary_ids[:100])).all()]
        mains = Counter(_cuisine_to_main(_canon_cuisines(n)) for n in names)
        total = sum(mains.values()) or 1
        for mc, cnt in mains.items():
            if mc in ("CAFE", "PUB") and cnt / total >= 0.34:
                boost.add(mc)
    # ② 모임 이름 키워드(빵탐방→CAFE, 맥주모임→PUB) — 저장 없어도 성격 반영
    title_mc = _cuisine_to_main(_canon_cuisines(comm.title or ""))
    if title_mc in ("CAFE", "PUB"):
        boost.add(title_mc)

    # 중복 제거
    seen = set()
    taste_ids = [x for x in all_ids if x and not (x in seen or seen.add(x))]
    return {"boost_main_categories": list(boost), "taste_place_ids": taste_ids[:300]}


def _member_taste(db: Session, member_ids: list) -> dict:
    """모임 멤버들의 취향 집계 → {n, food_counter(라벨→명수), vibe_counter}."""
    from collections import Counter
    food_c, vibe_c = Counter(), Counter()
    n = 0
    if not member_ids:
        return {"n": 0, "food": food_c, "vibe": vibe_c}
    users = db.query(models.User).filter(models.User.id.in_(member_ids)).all()
    for u in users:
        prefs = u.preferences if isinstance(u.preferences, dict) else {}
        foods = _split_prefs(prefs.get("foods"))
        vibes = _split_prefs(prefs.get("vibes"))
        if not foods and not vibes:
            continue
        n += 1
        seen_labels = set()
        for f in foods:
            for lab in _canon_cuisines(f):
                if lab not in seen_labels:
                    food_c[lab] += 1
                    seen_labels.add(lab)
        for v in set(vibes):
            vibe_c[v] += 1
    return {"n": n, "food": food_c, "vibe": vibe_c}


def _room_signature(taste: dict) -> set:
    """유사 모임 판정용 취향 시그니처(음식 라벨 + 대표 분위기)."""
    sig = set(taste["food"].keys())
    sig |= {f"vibe:{v}" for v, c in taste["vibe"].items() if c >= 1}
    return sig


def _jaccard(a: set, b: set) -> float:
    if not a or not b:
        return 0.0
    return len(a & b) / len(a | b)


def build_meeting_reasons(db: Session, comm, member_ids: list, places: list,
                          anchor_lat, anchor_lng, room_sig_map: dict, fb_by_room: dict) -> None:
    """장소별 근거 사다리(우리>남, 행동>말) 적용 → 각 place에 meeting_reason 재작성.
    room_sig_map: {room_id: signature}, fb_by_room: {room_id: {place_id: {'visit':n,'love':n}}}"""
    taste = _member_taste(db, member_ids)
    n_mem = max(taste["n"], len(member_ids))
    my_sig = room_sig_map.get(comm.id) or _room_signature(taste)

    # 유사 모임(자기 제외) — 시그니처 자카드 ≥ 0.34
    similar_rooms = [rid for rid, sig in room_sig_map.items()
                     if rid != comm.id and _jaccard(my_sig, sig) >= 0.34]

    # 장소별 cuisine_type + tags 배치 조회(취향/분위기 매칭용)
    pids = [p.get("id") for p in places if p.get("id")]
    meta = {}
    save_cnt = {}
    if pids:
        try:
            rows = db.query(models.Place.id, models.Place.cuisine_type, models.Place.tags,
                            models.Place.wemeet_rating).filter(models.Place.id.in_(pids)).all()
            for pid, cuisine, tags, rating in rows:
                meta[pid] = {"cuisine": cuisine, "tags": tags or [], "rating": rating or 0}
        except Exception as exc:
            print(f"[reason] meta skip: {str(exc)[:60]}")
        # 저장 인기(여러 사람이 저장한 곳) — 임포트/저장이 쌓이면 자연 점등
        try:
            from sqlalchemy import func as _f
            for pid, cnt in (db.query(models.SavedItem.place_id, _f.count(models.SavedItem.id))
                             .filter(models.SavedItem.place_id.in_(pids))
                             .group_by(models.SavedItem.place_id).all()):
                save_cnt[pid] = int(cnt)
        except Exception as exc:
            print(f"[reason] save cnt skip: {str(exc)[:60]}")

    own_fb = fb_by_room.get(comm.id, {})

    def _agg_similar(pid):
        visit = love = 0
        for rid in similar_rooms:
            cell = fb_by_room.get(rid, {}).get(pid)
            if cell:
                visit += 1 if cell.get("visit") else 0
                love += 1 if cell.get("love") else 0
        return visit, love

    top_vibe = taste["vibe"].most_common(1)[0][0] if taste["vibe"] else None

    for p in places:
        pid = p.get("id")
        m = meta.get(pid, {})
        km = _reason_km(anchor_lat, anchor_lng, p.get("lat"), p.get("lng"))
        rating = float(m.get("rating") or p.get("wemeet_rating") or 0)
        revisit = int(p.get("revisit_count") or 0)
        # 장소 대표 취향: cuisine_type 우선(가장 정확) → 없으면 category/name.
        # (category까지 섞으면 78%가 '한식'이라 획일화됨 → 일식집도 한식으로 뜨던 문제)
        place_cuisines = _canon_cuisines(m.get("cuisine")) or _canon_cuisines(p.get("category"), p.get("name"))
        top_food = None
        if place_cuisines:
            top_food = max(place_cuisines, key=lambda l: taste["food"].get(l, 0))
        food_hits = taste["food"].get(top_food, 0) if top_food else 0
        # 강함 기준: 과반(최소 2명). 소수(1명 이상)는 약한 톤 태그로 다양성 확보.
        food_strong = food_hits >= max(2, (n_mem + 1) // 2)
        vibe_hit = bool(top_vibe and top_vibe in set(m.get("tags") or []))
        sim_visit, sim_love = _agg_similar(pid)
        own_cell = own_fb.get(pid, {})

        # ── 사다리: 위에서부터 첫 충족 ──
        reason = None
        if own_cell.get("love"):                       # 1) 자기 모임 재방문
            reason = "우리 모임이 다녀와서 또 가고 싶어 한 곳이에요"
        elif sim_love >= 1:                            # 2) 유사 모임 재방문
            reason = f"우리와 취향이 비슷한 모임 {sim_love}팀이 ‘또 가고 싶다’고 했어요"
        elif sim_visit >= 2:                           # 3) 유사 모임 방문/평점
            reason = f"우리와 취향이 비슷한 모임 {sim_visit}팀이 자주 찾은 곳이에요"
        elif top_food and food_hits >= 1:              # 4) 자기 모임 음식취향(가중치: 과반/소수)
            je = _josa_eul(top_food)
            if food_hits >= n_mem and n_mem >= 2:
                reason = f"모임 모두 {top_food}{je} 좋아해서 딱 맞는 곳이에요"
            elif food_strong:
                reason = f"모임 {n_mem}명 중 {food_hits}명이 {top_food}{je} 좋아해서 추천해요"
            else:
                reason = f"{top_food}{je} 좋아하는 멤버가 있어 골라봤어요"
        elif vibe_hit:                                 # 5) 자기 모임 분위기
            reason = f"다들 선호하는 ‘{top_vibe}’ 분위기예요"
        elif rating >= 4.3 or revisit >= 2:            # 6) 검증된 맛집
            if revisit >= 2:
                reason = f"다녀온 분들 재방문율이 높은 검증된 곳이에요"
            else:
                reason = f"평점 {rating:.1f} · 만족도 높은 곳이에요"
        else:                                          # 7) 위치
            if km is not None:
                reason = f"다들 모이기 좋은 중간지점 근처예요 ({km:.1f}km)"
            else:
                reason = "다들 모이기 좋은 중간지점 근처예요"

        # 카드 한 줄은 '대표 이유 하나'만 — 순위 산정 원리(전원 만족)는 '추천 기준' 설명으로 분리.
        # (예전 '누구 하나 안 빠지고' 접두가 '3명 중 2명'과 모순돼 제거)
        p["meeting_reason"] = reason
        p["reason"] = reason  # 프론트 통일

        # A안: 강한 요소 태그(우선순위 순, 최대 3) — 카드에 칩으로 표시
        gmin = p.get("group_min_sim")
        factors = []
        if gmin is not None and gmin >= 0.6:
            factors.append({"key": "all", "label": "모두 만족"})
        if own_cell.get("love"):
            factors.append({"key": "own", "label": "우리가 또 감"})
        if sim_love >= 1 or sim_visit >= 2:
            factors.append({"key": "similar", "label": "비슷한 모임 픽"})
        if p.get("taste_match"):
            factors.append({"key": "taste", "label": "모임 취향 저격"})
        if top_food and food_hits >= 1:
            if food_strong or (food_hits >= n_mem and n_mem >= 2):
                factors.append({"key": "food", "label": f"{top_food} 취향 적중"})
            else:
                factors.append({"key": "food_soft", "label": f"{top_food} 좋아하는 멤버"})
        if vibe_hit:
            factors.append({"key": "vibe", "label": f"{top_vibe} 분위기"})
        if revisit >= 2:
            factors.append({"key": "revisit", "label": "재방문율 ↑"})
        if rating >= 4.3:
            factors.append({"key": "rating", "label": f"평점 {rating:.1f} ↑"})
        if save_cnt.get(pid, 0) >= 3:
            factors.append({"key": "saved", "label": "많이 저장된 곳"})
        if km is not None and km <= 1.0:
            factors.append({"key": "near", "label": "가까움"})
        if not factors:  # 아무 신호도 없으면 위치라도
            factors.append({"key": "near", "label": "중간지점 근처"})
        p["factors"] = factors[:3]


@router.post("/api/recommend")
def get_recommendation(
    req: schemas.RecommendRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # 로그인 시 개인 취향 벡터로 재랭킹(미로그인이면 None → 지리/태그 추천 유지)
    user_id = current_user.id if current_user else None
    regions = meeting_service.get_recommendations_direct(db, req, user_id=user_id)
    for reg in (regions or []):
        _attach_images(db, reg.get("places") or [])
    return regions


# 🚀 my-meetings 응답 인메모리 캐시(프로세스당) — 탭 재진입마다 전체 파이프라인 재계산 방지
_MY_MEETINGS_CACHE: dict = {}
_MY_MEETINGS_TTL = 300  # 5분


@router.get("/api/recommend/my-meetings")
def recommend_my_meetings(
    lat: Optional[float] = Query(None),
    lng: Optional[float] = Query(None),
    area: Optional[str] = Query(None),
    per_room: int = Query(3, ge=1, le=200),
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """내 채팅방(모임)들을 토대로 장소 추천 + 어느 모임이 근거인지 표시.
    각 방의 멤버 취향(중간지점+그룹 least-misery)으로 추천, 방 이름을 근거로 부착.
    lat/lng 주면 그 지역 기준으로 앵커(지역 검색 추천) — 멤버 중간지점 대신 해당 좌표 사용."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    import time as _time
    cache_key = (
        current_user.id,
        None if lat is None else round(lat, 3),
        None if lng is None else round(lng, 3),
        per_room,
    )
    hit = _MY_MEETINGS_CACHE.get(cache_key)
    if hit and hit[0] > _time.time():
        return hit[1]

    # 모임 카테고리 → 추천 엔진이 아는 유효 purpose로 정규화
    # (채팅방 생성 시 category가 '맛집모임'/'모임' 등으로 들어와 추천이 0건이 되던 문제)
    def _norm_purpose(cat: Optional[str]) -> str:
        c = (cat or "").strip()
        if not c:
            return "식사"
        if any(k in c for k in ["카페", "커피", "디저트", "베이커리", "빵"]):
            return "카페"
        if any(k in c for k in ["술", "맥주", "포차", "바", "호프", "주점", "이자카야", "와인"]):
            return "술집"
        # 식사/맛집/모임/기타 전부 식사로
        return "식사"

    # 내가 속한 모임(커뮤니티=채팅방) — 호스트이거나 member_ids에 포함. 최근 생성 우선.
    comms = db.query(models.Community).order_by(models.Community.id.desc()).all()
    my_comms = [c for c in comms if c.host_id == current_user.id or current_user.id in (c.member_ids or [])]
    my_comms = my_comms[:8]  # 과부하 방지

    # ── 이유 엔진 사전계산: 방문 피드백 있는 방들의 취향 시그니처 + 방×장소 피드백 맵 ──
    # (유사 모임 재방문/방문 근거용. 데이터 적으면 자연히 비어 하위 근거로 폴백)
    room_sig_map: dict = {}
    fb_by_room: dict = {}
    try:
        fb_room_ids = [r[0] for r in db.query(models.PlaceVisitFeedback.room_id)
                       .filter(models.PlaceVisitFeedback.room_id.isnot(None)).distinct().all()]
        sig_room_ids = set(fb_room_ids) | {c.id for c in my_comms}
        sig_comms = db.query(models.Community).filter(models.Community.id.in_(list(sig_room_ids))).all() if sig_room_ids else []
        for c in sig_comms:
            mids = list(dict.fromkeys((c.member_ids or []) + ([c.host_id] if c.host_id else [])))
            room_sig_map[c.id] = _room_signature(_member_taste(db, mids))
        if fb_room_ids:
            for rid, pid, pr, gr in db.query(
                models.PlaceVisitFeedback.room_id, models.PlaceVisitFeedback.place_id,
                models.PlaceVisitFeedback.personal_revisit, models.PlaceVisitFeedback.group_revisit
            ).filter(models.PlaceVisitFeedback.room_id.in_(fb_room_ids)).all():
                if pid is None:
                    continue
                cell = fb_by_room.setdefault(rid, {}).setdefault(pid, {"visit": 0, "love": 0})
                cell["visit"] = 1
                if pr or gr:
                    cell["love"] = 1
    except Exception as exc:
        print(f"[reason] precompute skip: {str(exc)[:80]}")

    # 모임별로 따로 모아서 라운드로빈으로 섞음(한 모임이 상단을 독식하지 않도록)
    per_room_lists: list = []
    for comm in my_comms:
        member_ids = list(dict.fromkeys((comm.member_ids or []) + ([comm.host_id] if comm.host_id else [])))
        if len(member_ids) < 1:
            continue
        # 앵커: 지역 검색(lat/lng) > 멤버 위치 평균 > 요청자(나) 위치 > 시청
        users = db.query(models.User).filter(models.User.id.in_(member_ids)).all()
        located = [(u.lat, u.lng) for u in users if u.lat and abs(float(u.lat)) > 1]
        if lat is not None and lng is not None:
            anchor_lat, anchor_lng, extra_users = lat, lng, []
        elif located:
            anchor_lat, anchor_lng = located[0]
            extra_users = [{"location": {"lat": la, "lng": ln}} for la, ln in located[1:]]
        elif current_user.lat and abs(float(current_user.lat)) > 1:
            anchor_lat, anchor_lng, extra_users = current_user.lat, current_user.lng, []
        else:
            anchor_lat, anchor_lng, extra_users = 37.5665, 126.978, []
        taste = meeting_taste_signal(db, comm, member_ids)
        req = schemas.RecommendRequest(
            purpose=_norm_purpose(comm.category),
            member_user_ids=member_ids,
            current_lat=anchor_lat,
            current_lng=anchor_lng,
            users=extra_users,
            top_k=max(15, per_room),
            taste_place_ids=taste["taste_place_ids"],
            boost_main_categories=taste["boost_main_categories"],
        )
        try:
            regions = meeting_service.get_recommendations_direct(db, req, user_id=current_user.id)
        except Exception as exc:
            print(f"[my-meetings] {comm.title} 추천 실패: {exc}")
            continue
        places = (regions[0].get("places") if regions else []) or []
        room_name = (comm.title or "모임").replace("[모임] ", "").strip()
        room_list = [{**p, "room_id": comm.id, "room_name": room_name} for p in places[:per_room]]
        # 근거 사다리 적용(우리>남, 행동>말) — meeting_reason/reason 재작성
        try:
            build_meeting_reasons(db, comm, member_ids, room_list, anchor_lat, anchor_lng, room_sig_map, fb_by_room)
        except Exception as exc:
            print(f"[reason] build skip {comm.title}: {str(exc)[:80]}")
        if lat is not None and lng is not None:
            for p in room_list:
                if p.get("meeting_reason"):
                    p["meeting_reason"] = p["meeting_reason"].replace("중간지점 근처", f"{area or '선택 지역'} 근처")
                    p["reason"] = p["meeting_reason"]
        if room_list:
            per_room_lists.append(room_list)

    # 라운드로빈 인터리브: [방A1, 방B1, 방C1, 방A2, 방B2, ...]
    out = []
    if per_room_lists:
        for i in range(max(len(l) for l in per_room_lists)):
            for l in per_room_lists:
                if i < len(l):
                    out.append(l[i])

    _attach_images(db, out)  # 대표 이미지(게시물/후기) 부착
    result = {"count": len(out), "places": out, "rooms": [
        {"id": c.id, "name": (c.title or "모임").replace("[모임] ", "").strip()} for c in my_comms
    ]}
    # 만료 엔트리 청소 후 저장(무한 성장 방지)
    now = _time.time()
    if len(_MY_MEETINGS_CACHE) > 500:
        for k in [k for k, v in _MY_MEETINGS_CACHE.items() if v[0] <= now]:
            _MY_MEETINGS_CACHE.pop(k, None)
    _MY_MEETINGS_CACHE[cache_key] = (now + _MY_MEETINGS_TTL, result)
    return result

# --- 회의/모임 흐름 ---
@router.post("/api/meeting-flow")
async def run_meeting_flow(req: schemas.MeetingFlowRequest, background_tasks: BackgroundTasks, db: Session = Depends(get_db)):
    return await meeting_service.run_meeting_flow(db, req, background_tasks)

@router.post("/api/meeting-flow/vote")
async def vote_meeting(req: schemas.VoteRequest, db: Session = Depends(get_db)):
    return await meeting_service.vote_meeting(db, req)

@router.post("/api/meeting-flow/confirm")
async def confirm_meeting(req: schemas.ConfirmRequest, db: Session = Depends(get_db)):
    return await meeting_service.confirm_meeting(db, req)

# --- 일정 (Events) ---
@router.post("/api/events", response_model=schemas.EventSchema)
def create_event(
    event: schemas.EventSchema, 
    db: Session = Depends(get_db),
    # 👇 일정 생성 시 유저 정보 필수
    current_user: models.User = Depends(get_current_user)
):
    event.user_id = current_user.id
    return meeting_service.create_event(db, event)

@router.get("/api/events", response_model=List[schemas.EventSchema])
def get_events(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return meeting_service.get_events(db, current_user.id)

@router.delete("/api/events/{event_id}")
def delete_event(
    event_id: str, 
    db: Session = Depends(get_db), 
    user = Depends(get_current_user) # 🌟 유저 정보 주입 확인
):
    # 🌟 인자 3개를 정확히 전달: (db, user_id, event_id)
    return meeting_service.delete_event(db, user.id, event_id)
