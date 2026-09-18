# -*- coding: utf-8 -*-
"""크루 주방·방문 미션은 검증된 공동 방문에서 계산한다.
과거 신고 기록은 보존하되 해금·단골·제휴 자격으로 승격하지 않는다.
"""
from typing import Any, Dict, List, Optional

from sqlalchemy import func
from core import visit_time as clock
from domain import models
from services import visit_service
from sqlalchemy.orm import Session

from core import menu_taxonomy as mt

# 등급 — 방문 '횟수'가 아니라 '가짓수'로 오른다.
# 횟수로 걸면 돈 많은 크루가 이기고 나머지는 몇 주 만에 포기한다.
# 가짓수로 걸면 같은 국밥집 20번보다 여러 종류를 가야 올라간다 —
# 새로운 곳을 찾게 만드는 우리 제품 목적과 맞고, 가게에도 신규 유입이 된다.
TIERS = [
    (0,  "골목식당",   "이제 막 문을 열었어요"),
    (3,  "동네 맛집",  "동네에 소문이 나기 시작했어요"),
    (8,  "지역 대표",  "이 동네에서 알아주는 집이 됐어요"),
    (15, "미식가의 집", "웬만한 건 다 다뤄요"),
    (25, "미슐랭",     "25가지를 모두 정복했어요"),
]

REGULAR_MIN_VISITS = visit_service.REGULAR_MIN_VISITS


def _tier_of(unlocked: int):
    """해금 수 → (등급명, 설명, 다음 등급까지 남은 수)."""
    name, desc = TIERS[0][1], TIERS[0][2]
    nxt = None
    for need, n, d in TIERS:
        if unlocked >= need:
            name, desc = n, d
        else:
            nxt = {"name": n, "need": need, "remain": need - unlocked}
            break
    return name, desc, nxt


def _place_visits(db, cid):
    return (db.query(models.Place, func.count(models.VisitEvent.id),
                     func.min(models.VisitEvent.visit_date_kst), func.max(models.VisitEvent.visit_date_kst))
            .join(models.VisitEvent, models.VisitEvent.place_id == models.Place.id)
            .filter(models.VisitEvent.community_id == str(cid), models.VisitEvent.status == "verified")
            .group_by(models.Place.id).all())


def get_kitchen(db: Session, community_id: str) -> Dict[str, Any]:
    place_rows = _place_visits(db, community_id)
    rows = [(p.id, n, first.isoformat(), last.isoformat(), p.name, p.uptae or "", p.main_category)
            for p, n, first, last in place_rows]

    # 크루원은 가게 안이 아니라 크루가 실제로 다녀온 대표 가게 앞에 선다.
    # 가장 최근 검증 방문 장소를 대표 장면으로 사용하고, 기록이 없으면
    # 프론트의 기본 동네 배경으로 안전하게 fallback한다.
    hero_place = None
    if place_rows:
        place, visits, first, last = sorted(place_rows, key=lambda row: row[3] or "", reverse=True)[0]
        hero_place = {
            "id": place.id,
            "name": place.name,
            "category": place.uptae or place.cuisine_type or place.category or "장소",
            "address": place.address,
            "image": getattr(place, "hero_image", None),
            "visits": int(visits or 0),
            "last_visit": last.isoformat() if last else None,
        }

    # 메뉴별로 '처음 해금한 가게'를 남긴다 — 카드에 "OO에서 해금" 하고 보여주려고
    unlocked: Dict[str, Dict[str, Any]] = {}
    regulars: List[Dict[str, Any]] = []
    total_visits = 0

    for place_id, visits, first_date, last_date, name, uptae, main_cat in rows:
        total_visits += int(visits or 0)
        key = mt.menu_key(name or "", uptae, main_cat)
        prev = unlocked.get(key)
        if prev is None or (first_date or "") < prev["date"]:
            unlocked[key] = {"place_id": place_id, "place_name": name, "date": first_date or ""}
        if (visits or 0) >= REGULAR_MIN_VISITS:
            regulars.append({
                "place_id": place_id, "name": name,
                "visits": int(visits), "last_date": last_date,
                "menu": mt.menu_title(key),
            })

    regulars.sort(key=lambda r: -r["visits"])
    tier_name, tier_desc, next_tier = _tier_of(len(unlocked))

    # 잠긴 것도 같이 내려준다 — 뭐가 남았는지 보여야 다음에 갈 데를 정한다
    menus = []
    for card in mt.MENU_CARDS:
        got = unlocked.get(card["key"])
        menus.append({
            "key": card["key"],
            "title": card["title"],
            "group": card["group"],
            "image": f"/stock/{card['key']}-1.jpg",
            "unlocked": got is not None,
            "place_name": got["place_name"] if got else None,
            "date": got["date"] if got else None,
        })

    return {
        "community_id": str(community_id),
        "tier": tier_name,
        "tier_desc": tier_desc,
        "next_tier": next_tier,
        "unlocked_count": len(unlocked),
        "total_count": len(mt.MENU_CARDS),
        "total_visits": total_visits,
        "hero_place": hero_place,
        "legacy_visits": visit_service.legacy_visit_stats(db, community_id)["visits"],
        "menus": menus,
        "regulars": regulars,
    }


def regular_crew_count(db: Session, place_id: int) -> int:
    # Public activity only; private/list-only crews are not advertised.
    return (db.query(models.VisitEvent.community_id)
            .join(models.Community, models.Community.id == models.VisitEvent.community_id)
            .filter(models.VisitEvent.place_id == place_id, models.VisitEvent.status == "verified",
                    models.Community.visibility.in_(("public", "open")))
            .group_by(models.VisitEvent.community_id)
            .having(func.count(models.VisitEvent.id) >= REGULAR_MIN_VISITS).count())


# ── 미션 ──────────────────────────────────────────────────────
#
# 3단 계단은 난이도가 올라간다: 즐겨찾기(3초·0원) → 방문(시간·돈) → 남의 리스트(3초·0원).
# 큰 산 하나 넘기고 다시 가벼운 걸 주는 리듬이라 중간 이탈이 적다.
#
# 하지만 계단은 일회성이다. 셋 다 깨면 할 게 없어진다. 그래서 주간 미션을 같이 둔다.
# 주간인 이유: 밥은 매일 먹어도 크루로 모이는 건 주 1~2회다.
#
# 주간 미션에 '단골집 방문'을 넣은 게 핵심이다. 해금(다양성)만 밀면 새 가게만 가게
# 되는데, 그러면 제휴 가게에 할 말이 없다. 재방문이 있어야 영업 근거가 생긴다.

def get_missions(db: Session, community_id: str, user_id: int) -> Dict[str, Any]:
    """계단 3개 + 주간 3개. 전부 기존 기록에서 계산한다(별도 진행도 저장 없음)."""
    cid = str(community_id)
    wk = clock.week_start()

    saved = (db.query(models.SavedItem).join(models.SaveFolder)
             .filter(models.SaveFolder.community_id == cid, models.SavedItem.user_id == user_id,
                     models.SavedItem.item_type == "place", models.SavedItem.place_id.isnot(None),
                     models.SavedItem.source == "manual").count())

    visits = visit_service.crew_visits(db, cid)

    copies = db.query(models.ListCopyEvent).filter(
        models.ListCopyEvent.user_id == user_id, models.ListCopyEvent.destination_community_id == cid,
        models.ListCopyEvent.creditable.is_(True))
    borrowed = copies.count()

    steps = [
        {"key": "save", "title": "이 크루에 가고 싶은 곳 저장하기",
         "desc": "내가 직접 고른 장소를 이 크루의 리스트에 저장해요",
         "done": saved > 0, "progress": min(saved, 1), "goal": 1},
        {"key": "visit", "title": "크루와 함께 방문하고 체크인",
         "desc": "멤버 2명 이상이 같은 날 2시간 이내에 각자 방문 인증하면 해금돼요",
         "done": visits > 0, "progress": min(visits, 1), "goal": 1},
        {"key": "borrow", "title": "다른 크루의 공개 리스트 담기",
         "desc": "내가 속하지 않은 크루의 리스트를 이 크루로 담아요. 포인트 보상은 없어요.",
         "done": borrowed > 0, "progress": min(borrowed, 1), "goal": 1},
    ]

    # ── 주간
    kitchen = get_kitchen(db, cid)
    unlocked_keys = {m["key"] for m in kitchen["menus"] if m["unlocked"]}

    # 이번 주에 새로 해금한 메뉴가 있나 — 이번 주 방문한 가게의 메뉴가
    # '이번 주 이전에는 없던' 것이어야 한다
    menu_rows = (db.query(models.Place.name, models.Place.uptae, models.Place.main_category)
                 .join(models.VisitEvent, models.VisitEvent.place_id == models.Place.id)
                 .filter(models.VisitEvent.community_id == cid, models.VisitEvent.status == "verified"))
    new_rows = menu_rows.filter(models.VisitEvent.occurred_at >= wk).all()
    prev_rows = menu_rows.filter(models.VisitEvent.occurred_at < wk).all()
    prev_keys = {mt.menu_key(n or "", u, m) for n, u, m in prev_rows}
    new_keys = {mt.menu_key(n or "", u, m) for n, u, m in new_rows} - prev_keys

    week_borrow = copies.filter(models.ListCopyEvent.created_at >= wk).count()

    regular_ids = [r["place_id"] for r in kitchen["regulars"]]
    week_regular = 0
    if regular_ids:
        week_regular = (visit_service.verified_events(db, cid)
                        .filter(models.VisitEvent.occurred_at >= wk, models.VisitEvent.place_id.in_(regular_ids))
                        .with_entities(models.VisitEvent.place_id).distinct().count())

    weekly = [
        {"key": "new_menu", "title": "새로운 메뉴 1종 해금",
         "desc": "안 가본 종류의 가게에 다녀오세요",
         "done": len(new_keys) > 0, "progress": min(len(new_keys), 1), "goal": 1},
        {"key": "borrow", "title": "다른 크루의 새 리스트 담기",
         "desc": "다른 크루의 공개 리스트를 이 크루로 처음 담으면 완료돼요",
         "done": week_borrow > 0, "progress": min(week_borrow, 1), "goal": 1},
        {"key": "regular", "title": "단골집 다시 방문",
         "desc": f"{REGULAR_MIN_VISITS}번 이상 간 곳이 단골집이 돼요",
         "done": week_regular > 0, "progress": min(week_regular, 1), "goal": 1,
         # 단골이 아직 없으면 할 수 없는 미션이라 그 사실을 밝힌다
         "locked": len(regular_ids) == 0,
         "locked_reason": "아직 단골집이 없어요" if not regular_ids else None},
    ]

    from urllib.parse import quote
    for mission in steps + weekly:
        mission["scope"] = "personal_in_crew" if mission["key"] in ("save", "borrow") else "crew"
        mission["action"] = {"href": f"/crew/{quote(cid, safe='')}/missions?action={mission['key']}",
                             "label": {"save": "장소 고르기", "borrow": "리스트 둘러보기"}.get(mission["key"], "방문할 곳 고르기")}
        mission["completion"] = "기록에 반영됐어요" if mission["done"] else None
    return {
        "community_id": cid,
        "week_start": wk.isoformat(),
        "steps": steps,
        "steps_done": sum(1 for s in steps if s["done"]),
        "weekly": weekly,
        "weekly_done": sum(1 for w in weekly if w["done"]),
        "unlocked_count": len(unlocked_keys),
    }


# ── 크루 쇼케이스 ─────────────────────────────────────────────
#
# '우리 크루' 탭에 뜨는 것 = 남이 놀러와서 보는 것. 리스트·방문기록·게시물.
# 채팅·예약·제휴 같은 운영은 '내 크루'가 맡는다. 보여주는 곳과 운영하는 곳을 가른다.
#
# 게시물은 posts에 크루 컬럼이 없다. 그래서 **크루가 다녀온 가게에 멤버가 올린 것**으로
# 좁힌다. 멤버 게시물을 전부 끌어오면 크루와 무관한 개인 글이 섞이고, 스키마를 바꾸면
# 마이그레이션이 따라온다. 이 조건이면 둘 다 피하면서 '우리 기록'이 맞다.

def get_showcase(db: Session, community_id: str, member_ids: list, limit: int = 12,
                 *, include_private_lists: bool = False, include_activity: bool = False) -> dict:
    from domain import models
    from services.crew_access import public_folder_clause

    cid = str(community_id)

    lists = [{
        "id": r[0], "name": r[1], "description": r[2],
        "count": int(r[3] or 0), "is_public": bool(r[4]), "cover_image": r[5],
    } for r in (db.query(models.SaveFolder.id, models.SaveFolder.name,
                        models.SaveFolder.description, models.SaveFolder.item_count,
                        models.SaveFolder.is_public, models.SaveFolder.cover_image)
                .filter(models.SaveFolder.community_id == cid)
                .filter(True if include_private_lists else public_folder_clause())
                .order_by(models.SaveFolder.item_count.desc().nullslast(), models.SaveFolder.id)
                .limit(limit).all())]

    if not include_activity:
        return {"lists": lists, "visits": [], "posts": [], "visit_archive": [], "visit_summary": None}

    visits = [{
        "place_id": p.id, "name": p.name, "address": p.address,
        "visits": int(n), "last_date": last.isoformat(),
        "menu": mt.menu_title(mt.menu_key(p.name or "", p.uptae or "", p.main_category)),
        "is_regular": n >= REGULAR_MIN_VISITS,
    } for p, n, first, last in sorted(_place_visits(db, cid), key=lambda r: r[3], reverse=True)[:limit]]

    posts = []
    if member_ids and visits:
        place_ids = [v["place_id"] for v in visits]
        posts = [{
            "id": r[0], "content": r[1], "image": (r[2] or [None])[0] if r[2] else None,
            "place_name": r[3], "author": r[4], "created_at": str(r[5]),
            "likes": int(r[6] or 0),
        } for r in (db.query(models.Post.id, models.Post.content, models.Post.image_urls,
                            models.Place.name, models.User.name, models.Post.created_at,
                            models.Post.likes_count)
                    .join(models.Place, models.Place.id == models.Post.place_id)
                    .join(models.User, models.User.id == models.Post.user_id)
                    .filter(models.Post.user_id.in_(member_ids), models.Post.place_id.in_(place_ids),
                            models.Post.is_public.is_(True))
                    .order_by(models.Post.created_at.desc()).limit(limit).all())]

    visit_archive, visit_summary = visit_service.crew_visit_archive(db, cid, limit=limit)
    return {
        "lists": lists,
        "visits": visits,
        "posts": posts,
        "visit_archive": visit_archive,
        "visit_summary": visit_summary,
    }
