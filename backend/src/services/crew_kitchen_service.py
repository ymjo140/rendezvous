# -*- coding: utf-8 -*-
"""크루 주방 — 같이 간 기록이 우리 가게로 쌓인다.

왜 만드나
  지금 제품은 '정하고 나면 끝'이다. 투표하고 예약하면 다시 열 이유가 없다.
  캐치테이블이 못 따라오는 지점이 여기다 — 그쪽은 개인 축이라 공동 소유물을
  만들 수 없다. 혼자서는 못 하는 것만이 크루 전용이 된다.

왜 상태 테이블이 없나
  등급도 해금도 단골도 전부 place_checkins에서 계산된다. 테이블을 따로 두면
  동기화 버그가 생기고, 무엇보다 **지난 방문이 소급 적용되지 않는다**.
  계산형이면 오늘 만들어도 어제 간 곳이 이미 해금돼 있다.
  재료·치장처럼 소비되는 것이 생기면 그때 상태를 둔다.

두 축을 나눈 이유
  해금(다양성)만 있으면 새 가게만 가게 된다. 그러면 제휴 가게에 할 말이 없다 —
  "손님은 데려오는데 다시는 안 옵니다"가 되니까. 그래서 단골(재방문) 축을 따로 둔다.
  "이 가게를 단골로 걸어둔 크루가 N팀"이 제휴 영업의 근거가 된다.
"""
from typing import Any, Dict, List, Optional

from sqlalchemy import text
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

REGULAR_MIN_VISITS = 3      # 같은 가게 이만큼 가면 '우리 크루의 단골집'


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


def get_kitchen(db: Session, community_id: str) -> Dict[str, Any]:
    """크루 주방 상태. place_checkins만 읽어서 전부 계산한다."""
    rows = db.execute(text("""
        SELECT c.place_id,
               COUNT(DISTINCT c.date) AS visits,
               MIN(c.date) AS first_date,
               MAX(c.date) AS last_date,
               p.name, COALESCE(p.uptae, ''), p.main_category
        FROM place_checkins c
        JOIN places p ON p.id = c.place_id
        WHERE c.community_id = :cid
        GROUP BY c.place_id, p.name, p.uptae, p.main_category
    """), {"cid": str(community_id)}).all()

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
        "menus": menus,
        "regulars": regulars,
    }


def regular_crew_count(db: Session, place_id: int) -> int:
    """이 가게를 단골로 걸어둔 크루 수. 제휴 영업에 그대로 쓰는 숫자다."""
    return int(db.execute(text("""
        SELECT COUNT(*) FROM (
            SELECT community_id
            FROM place_checkins
            WHERE place_id = :pid AND community_id IS NOT NULL
            GROUP BY community_id
            HAVING COUNT(DISTINCT date) >= :n
        ) t
    """), {"pid": place_id, "n": REGULAR_MIN_VISITS}).scalar() or 0)


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

def _week_start_utc_naive():
    from services.gamification_service import week_start_utc_naive
    return week_start_utc_naive()


def get_missions(db: Session, community_id: str, user_id: int) -> Dict[str, Any]:
    """계단 3개 + 주간 3개. 전부 기존 기록에서 계산한다(별도 진행도 저장 없음)."""
    cid = str(community_id)
    wk = _week_start_utc_naive()

    saved = int(db.execute(text(
        "SELECT COUNT(*) FROM saved_items WHERE user_id = :uid"
    ), {"uid": user_id}).scalar() or 0)

    visits = int(db.execute(text(
        "SELECT COUNT(DISTINCT date) FROM place_checkins WHERE community_id = :cid"
    ), {"cid": cid}).scalar() or 0)

    borrowed = int(db.execute(text(
        "SELECT COUNT(*) FROM list_saves WHERE user_id = :uid"
    ), {"uid": user_id}).scalar() or 0)

    steps = [
        {"key": "save", "title": "마음에 드는 곳 저장하기",
         "desc": "지도나 탐색에서 가고 싶은 곳을 담아보세요",
         "done": saved > 0, "progress": min(saved, 1), "goal": 1},
        {"key": "visit", "title": "크루와 함께 방문하고 체크인",
         "desc": "다녀오면 그 메뉴가 우리 가게에 해금돼요",
         "done": visits > 0, "progress": min(visits, 1), "goal": 1},
        {"key": "borrow", "title": "다른 크루의 리스트에서 한 곳 담기",
         "desc": "담으면 리스트를 만든 크루도 보상을 받아요",
         "done": borrowed > 0, "progress": min(borrowed, 1), "goal": 1},
    ]

    # ── 주간
    kitchen = get_kitchen(db, cid)
    unlocked_keys = {m["key"] for m in kitchen["menus"] if m["unlocked"]}

    # 이번 주에 새로 해금한 메뉴가 있나 — 이번 주 방문한 가게의 메뉴가
    # '이번 주 이전에는 없던' 것이어야 한다
    new_rows = db.execute(text("""
        SELECT p.name, COALESCE(p.uptae,''), p.main_category
        FROM place_checkins c JOIN places p ON p.id = c.place_id
        WHERE c.community_id = :cid AND c.created_at >= :wk
    """), {"cid": cid, "wk": wk}).all()
    prev_rows = db.execute(text("""
        SELECT p.name, COALESCE(p.uptae,''), p.main_category
        FROM place_checkins c JOIN places p ON p.id = c.place_id
        WHERE c.community_id = :cid AND c.created_at < :wk
    """), {"cid": cid, "wk": wk}).all()
    prev_keys = {mt.menu_key(n or "", u, m) for n, u, m in prev_rows}
    new_keys = {mt.menu_key(n or "", u, m) for n, u, m in new_rows} - prev_keys

    week_borrow = int(db.execute(text(
        "SELECT COUNT(*) FROM list_saves WHERE user_id = :uid AND created_at >= :wk"
    ), {"uid": user_id, "wk": wk}).scalar() or 0)

    regular_ids = [r["place_id"] for r in kitchen["regulars"]]
    week_regular = 0
    if regular_ids:
        week_regular = int(db.execute(text("""
            SELECT COUNT(DISTINCT place_id) FROM place_checkins
            WHERE community_id = :cid AND created_at >= :wk AND place_id = ANY(:ids)
        """), {"cid": cid, "wk": wk, "ids": regular_ids}).scalar() or 0)

    weekly = [
        {"key": "new_menu", "title": "새로운 메뉴 1종 해금",
         "desc": "안 가본 종류의 가게에 다녀오세요",
         "done": len(new_keys) > 0, "progress": min(len(new_keys), 1), "goal": 1},
        {"key": "borrow", "title": "다른 크루 리스트에서 1곳 담기",
         "desc": "남의 리스트를 구경하고 마음에 드는 곳을 담아보세요",
         "done": week_borrow > 0, "progress": min(week_borrow, 1), "goal": 1},
        {"key": "regular", "title": "단골집 다시 방문",
         "desc": f"{REGULAR_MIN_VISITS}번 이상 간 곳이 단골집이 돼요",
         "done": week_regular > 0, "progress": min(week_regular, 1), "goal": 1,
         # 단골이 아직 없으면 할 수 없는 미션이라 그 사실을 밝힌다
         "locked": len(regular_ids) == 0,
         "locked_reason": "아직 단골집이 없어요" if not regular_ids else None},
    ]

    return {
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

def get_showcase(db: Session, community_id: str, member_ids: list, limit: int = 12) -> dict:
    cid = str(community_id)

    lists = [{
        "id": r[0], "name": r[1], "description": r[2],
        "count": int(r[3] or 0), "is_public": bool(r[4]), "cover_image": r[5],
    } for r in db.execute(text("""
        SELECT f.id, f.name, f.description, f.item_count, f.is_public, f.cover_image
        FROM save_folders f
        WHERE f.community_id = :cid
        ORDER BY f.item_count DESC NULLS LAST, f.id
        LIMIT :n
    """), {"cid": cid, "n": limit}).all()]

    # 방문기록 — 같은 날 여러 번 찍어도 1회로 센다(모델 주석 참고)
    visits = [{
        "place_id": r[0], "name": r[1], "address": r[2],
        "visits": int(r[3]), "last_date": r[4],
        "menu": mt.menu_title(mt.menu_key(r[1] or "", r[5] or "", r[6])),
        "is_regular": int(r[3]) >= REGULAR_MIN_VISITS,
    } for r in db.execute(text("""
        SELECT c.place_id, p.name, p.address,
               COUNT(DISTINCT c.date) AS visits, MAX(c.date) AS last_date,
               COALESCE(p.uptae,''), p.main_category
        FROM place_checkins c JOIN places p ON p.id = c.place_id
        WHERE c.community_id = :cid
        GROUP BY c.place_id, p.name, p.address, p.uptae, p.main_category
        ORDER BY MAX(c.date) DESC
        LIMIT :n
    """), {"cid": cid, "n": limit}).all()]

    posts = []
    if member_ids and visits:
        place_ids = [v["place_id"] for v in visits]
        posts = [{
            "id": r[0], "content": r[1], "image": (r[2] or [None])[0] if r[2] else None,
            "place_name": r[3], "author": r[4], "created_at": str(r[5]),
            "likes": int(r[6] or 0),
        } for r in db.execute(text("""
            SELECT po.id, po.content, po.image_urls, pl.name, u.name,
                   po.created_at, po.likes_count
            FROM posts po
            JOIN places pl ON pl.id = po.place_id
            JOIN users u ON u.id = po.user_id
            WHERE po.user_id = ANY(:uids) AND po.place_id = ANY(:pids)
              AND COALESCE(po.is_public, TRUE)
            ORDER BY po.created_at DESC
            LIMIT :n
        """), {"uids": list(member_ids), "pids": place_ids, "n": limit}).all()]

    return {"lists": lists, "visits": visits, "posts": posts}
