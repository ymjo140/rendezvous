# -*- coding: utf-8 -*-
"""크루 주방·방문 미션은 검증된 공동 방문에서 계산한다.
과거 신고 기록은 보존하되 해금·단골·제휴 자격으로 승격하지 않는다.
"""
from datetime import timedelta
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

# 도감은 전체와 메뉴별로 같은 기준을 쓴다. 인증 방문 1회와 새로운 가게 1곳이
# 각각 누적되며, 서버가 계산한 값을 그대로 내려줘 화면마다 레벨이 달라지지 않게 한다.
DEX_LEVEL_GOALS = (0, 3, 8, 15, 25, 40)


def _recent(value, cutoff):
    if value is None:
        return False
    try:
        return clock.as_utc(value) >= cutoff
    except (AttributeError, TypeError, ValueError):
        return False


def _activity_stamp(value):
    if value is None:
        return None
    try:
        return clock.as_utc(value)
    except (AttributeError, TypeError, ValueError):
        return None


def member_contributions(db: Session, community_id: str, member_ids: List[int], *, days: int = 30) -> Dict[int, Dict[str, Any]]:
    """Calculate a transparent, recent-weighted contribution score per crew member.

    The score is deliberately derived from existing verified activity rather than
    introducing a new balance or gamification table.  A member contributes through
    verified visits, useful records (reviews/posts), places saved to the crew list,
    and list comments.  Recent activity receives a bonus so the stage does not stay
    occupied by inactive founding members forever.
    """
    ids = list(dict.fromkeys(int(uid) for uid in (member_ids or []) if uid is not None))
    result: Dict[int, Dict[str, Any]] = {
        uid: {
            "score": 0,
            "recent_score": 0,
            "verified_visits": 0,
            "unique_places": 0,
            "menu_types": 0,
            "records": 0,
            "last_activity": None,
            "_places": set(),
            "_menus": set(),
            "_recent_visits": 0,
            "_recent_places": set(),
            "_record_score": 0,
            "_recent_record_score": 0,
            "_last_activity_at": None,
        }
        for uid in ids
    }
    if not result:
        return {}

    cutoff = clock.utc_now() - timedelta(days=max(1, int(days)))
    cutoff_date = clock.kst_date(cutoff)
    place_ids = set()

    visit_rows = (db.query(models.VisitParticipant.user_id, models.VisitEvent.place_id,
                           models.VisitEvent.occurred_at, models.VisitEvent.visit_date_kst)
                  .join(models.VisitEvent, models.VisitEvent.id == models.VisitParticipant.visit_id)
                  .filter(models.VisitEvent.community_id == str(community_id),
                          models.VisitEvent.status == "verified",
                          models.VisitParticipant.user_id.in_(ids)).all())
    for uid, place_id, occurred_at, visit_date in visit_rows:
        score = result.get(uid)
        if score is None:
            continue
        score["verified_visits"] += 1
        score["_places"].add(place_id)
        place_ids.add(place_id)
        is_recent = (visit_date is not None and visit_date >= cutoff_date) or _recent(occurred_at, cutoff)
        if is_recent:
            score["_recent_visits"] += 1
            score["_recent_places"].add(place_id)
        stamp = _activity_stamp(occurred_at)
        if stamp is not None and (score["_last_activity_at"] is None or stamp > score["_last_activity_at"]):
            score["_last_activity_at"] = stamp

    place_menu_keys = {}
    if place_ids:
        places = (db.query(models.Place.id, models.Place.name, models.Place.uptae,
                           models.Place.cuisine_type, models.Place.main_category)
                  .filter(models.Place.id.in_(place_ids)).all())
        place_menu_keys = {
            row[0]: mt.menu_key(row[1] or "", row[2] or "", row[3] or row[4])
            for row in places
        }
    for score in result.values():
        score["_menus"].update(place_menu_keys.get(pid) for pid in score["_places"] if pid in place_menu_keys)

    def add_record(uid, created_at, weight: int):
        score = result.get(uid)
        if score is None:
            return
        score["records"] += 1
        score["_record_score"] += weight
        if _recent(created_at, cutoff):
            score["_recent_record_score"] += weight
        stamp = _activity_stamp(created_at)
        if stamp is not None and (score["_last_activity_at"] is None or stamp > score["_last_activity_at"]):
            score["_last_activity_at"] = stamp

    if place_ids:
        for uid, place_id, created_at in (db.query(models.Review.user_id, models.Review.place_id,
                                                    models.Review.created_at)
                                          .filter(models.Review.user_id.in_(ids),
                                                  models.Review.place_id.in_(place_ids)).all()):
            add_record(uid, created_at, 3)
        for uid, place_id, created_at in (db.query(models.Post.user_id, models.Post.place_id,
                                                   models.Post.created_at)
                                         .filter(models.Post.user_id.in_(ids),
                                                 models.Post.place_id.in_(place_ids),
                                                 models.Post.is_public.is_(True)).all()):
            add_record(uid, created_at, 2)

    for uid, created_at in (db.query(models.SavedItem.user_id, models.SavedItem.created_at)
                            .join(models.SaveFolder, models.SaveFolder.id == models.SavedItem.folder_id)
                            .filter(models.SaveFolder.community_id == str(community_id),
                                    models.SavedItem.user_id.in_(ids),
                                    models.SavedItem.item_type == "place").all()):
        add_record(uid, created_at, 1)

    for uid, created_at in (db.query(models.ListComment.user_id, models.ListComment.created_at)
                            .join(models.SaveFolder, models.SaveFolder.id == models.ListComment.folder_id)
                            .filter(models.SaveFolder.community_id == str(community_id),
                                    models.ListComment.user_id.in_(ids)).all()):
        add_record(uid, created_at, 1)

    for score in result.values():
        score["unique_places"] = len(score["_places"])
        score["menu_types"] = len(score["_menus"])
        # 방문·장소 다양성·메뉴 다양성을 가장 강하게 보고, 기록 행동은
        # 실제 콘텐츠를 남긴 정도에 따라 보조한다. 최근 활동은 별도 보너스다.
        base = (
            score["verified_visits"] * 5
            + score["unique_places"] * 3
            + score["menu_types"] * 2
            + score["_record_score"]
        )
        recent_bonus = (
            score["_recent_visits"] * 3
            + len(score["_recent_places"]) * 2
            + score["_recent_record_score"]
        )
        score["score"] = int(base + recent_bonus)
        score["recent_score"] = int(recent_bonus)
        if score["_last_activity_at"] is not None:
            score["last_activity"] = score["_last_activity_at"].isoformat()
        for key in ("_places", "_menus", "_recent_places", "_recent_visits", "_record_score",
                    "_recent_record_score", "_last_activity_at"):
            score.pop(key, None)
    return result


def rank_member_ids(db: Session, community_id: str, member_ids: List[int], viewer_id: Optional[int] = None):
    """Return stable representative order plus the score payload for the roster."""
    ids = list(dict.fromkeys(int(uid) for uid in (member_ids or []) if uid is not None))
    contributions = member_contributions(db, community_id, ids)
    positions = {uid: index for index, uid in enumerate(ids)}

    # Stable multi-pass sort: score first, then recent activity, then latest
    # activity. The final input order is the deterministic tie-breaker.
    ranked = list(ids)
    ranked.sort(key=lambda uid: positions[uid])
    ranked.sort(key=lambda uid: contributions.get(uid, {}).get("last_activity") or "", reverse=True)
    ranked.sort(key=lambda uid: int(contributions.get(uid, {}).get("recent_score", 0)), reverse=True)
    ranked.sort(key=lambda uid: int(contributions.get(uid, {}).get("score", 0)), reverse=True)
    # '우리 크루'에서는 내가 내 공간에서 사라지지 않게 첫 자리를 보장한다.
    if viewer_id in positions:
        ranked = [viewer_id] + [uid for uid in ranked if uid != viewer_id]
    return ranked, contributions


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


def _dex_progress(visits: int, unique_places: int) -> Dict[str, Any]:
    """Return one menu's transparent cumulative level from verified visits only."""
    visits = max(0, int(visits or 0))
    unique_places = max(0, int(unique_places or 0))
    score = visits + unique_places
    level_index = 0
    for index, goal in enumerate(DEX_LEVEL_GOALS[1:], start=1):
        if score < goal:
            break
        level_index = index

    current_goal = DEX_LEVEL_GOALS[level_index]
    next_goal = DEX_LEVEL_GOALS[level_index + 1] if level_index + 1 < len(DEX_LEVEL_GOALS) else None
    progress = 1.0 if next_goal is None else min(1.0, max(0.0, (score - current_goal) / (next_goal - current_goal)))
    return {
        "visits": visits,
        "unique_places": unique_places,
        "score": score,
        "level": level_index + 1,
        "next_goal": next_goal,
        "remaining": 0 if next_goal is None else max(0, next_goal - score),
        "progress": progress,
    }


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
    menu_stats: Dict[str, Dict[str, Any]] = {}
    regulars: List[Dict[str, Any]] = []
    total_visits = 0

    for place_id, visits, first_date, last_date, name, uptae, main_cat in rows:
        total_visits += int(visits or 0)
        key = mt.menu_key(name or "", uptae, main_cat)
        stats = menu_stats.setdefault(key, {"visits": 0, "places": set()})
        stats["visits"] += int(visits or 0)
        stats["places"].add(place_id)
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
        stats = menu_stats.get(card["key"], {"visits": 0, "places": set()})
        progress = _dex_progress(stats["visits"], len(stats["places"]))
        menus.append({
            "key": card["key"],
            "title": card["title"],
            "group": card["group"],
            "image": f"/stock/{card['key']}-1.jpg",
            "unlocked": got is not None,
            "place_name": got["place_name"] if got else None,
            "date": got["date"] if got else None,
            **progress,
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
