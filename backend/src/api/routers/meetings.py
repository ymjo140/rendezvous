from fastapi import APIRouter, Depends, BackgroundTasks, Query, HTTPException
from sqlalchemy.orm import Session
from typing import List

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
    limit: int = 100, db: Session = Depends(get_db),
):
    """지도 영역(bounds) 안의 가게들 — 지도 핀→상세용. {place_id} 라우트보다 위에 있어야 함.
    밀집 지역(뷰포트에 수천 곳)에서 임의 N개를 뽑으면 유명한 곳이 밀리므로,
    뷰포트를 12x12 격자로 나눠 셀당 1곳씩 우선 선발(md5 해시 = 팬/줌해도 같은 가게 유지)."""
    from sqlalchemy import text as _t
    lim = min(max(limit, 1), 150)
    sql = _t("""
        with cand as (
            select id, name, lat, lng,
                   coalesce(cuisine_type, category, main_category, '') as cat,
                   floor((lat - :min_lat) / nullif(:max_lat - :min_lat, 0) * 12) as gy,
                   floor((lng - :min_lng) / nullif(:max_lng - :min_lng, 0) * 12) as gx
            from places
            where lat between :min_lat and :max_lat
              and lng between :min_lng and :max_lng
        ),
        ranked as (
            select id, name, lat, lng, cat,
                   row_number() over (partition by gx, gy order by md5(id::text)) as rn
            from cand
        )
        select id, name, lat, lng, cat from ranked
        order by rn, md5(id::text)
        limit :lim
    """)
    rows = db.execute(sql, {
        "min_lat": min_lat, "max_lat": max_lat,
        "min_lng": min_lng, "max_lng": max_lng, "lim": lim,
    }).fetchall()
    return {
        "count": len(rows),
        "items": [
            {"id": r[0], "name": r[1], "lat": r[2], "lng": r[3], "category": r[4]}
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

@router.post("/api/recommend")
def get_recommendation(
    req: schemas.RecommendRequest,
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    # 로그인 시 개인 취향 벡터로 재랭킹(미로그인이면 None → 지리/태그 추천 유지)
    user_id = current_user.id if current_user else None
    return meeting_service.get_recommendations_direct(db, req, user_id=user_id)


@router.get("/api/recommend/my-meetings")
def recommend_my_meetings(
    db: Session = Depends(get_db),
    current_user: models.User = Depends(get_current_user),
):
    """내 채팅방(모임)들을 토대로 장소 추천 + 어느 모임이 근거인지 표시.
    각 방의 멤버 취향(중간지점+그룹 least-misery)으로 추천, 방 이름을 근거로 부착."""
    if current_user is None:
        raise HTTPException(status_code=401, detail="로그인이 필요합니다.")

    # 내가 속한 모임(커뮤니티=채팅방) — 호스트이거나 member_ids에 포함
    comms = db.query(models.Community).all()
    my_comms = [c for c in comms if c.host_id == current_user.id or current_user.id in (c.member_ids or [])]
    my_comms = my_comms[:4]  # 과부하 방지

    out = []
    for comm in my_comms:
        member_ids = list(dict.fromkeys((comm.member_ids or []) + ([comm.host_id] if comm.host_id else [])))
        if len(member_ids) < 1:
            continue
        # 멤버 위치 평균(중간지점)
        users = db.query(models.User).filter(models.User.id.in_(member_ids)).all()
        located = [(u.lat, u.lng) for u in users if u.lat and abs(float(u.lat)) > 1]
        req = schemas.RecommendRequest(
            purpose=comm.category or "식사",
            member_user_ids=member_ids,
            current_lat=located[0][0] if located else 37.5665,
            current_lng=located[0][1] if located else 126.978,
            users=[{"location": {"lat": la, "lng": ln}} for la, ln in located[1:]],
        )
        try:
            regions = meeting_service.get_recommendations_direct(db, req, user_id=current_user.id)
        except Exception as exc:
            print(f"[my-meetings] {comm.title} 추천 실패: {exc}")
            continue
        places = (regions[0].get("places") if regions else []) or []
        room_name = (comm.title or "모임").replace("[모임] ", "").strip()
        for p in places[:3]:
            out.append({
                **p,
                "room_id": comm.id,
                "room_name": room_name,
                # 예: "데모모임 장소 추천: 중간지점 근처 · 한식 취향과 잘 맞아요"
                "meeting_reason": f"{room_name} 모임 장소 추천: {p.get('reason', '')}",
            })

    return {"count": len(out), "places": out}

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
