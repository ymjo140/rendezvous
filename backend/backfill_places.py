# -*- coding: utf-8 -*-
"""장소 DB 보강 — 네이버 지역검색(공식 API, sort=comment 인기순)으로 누락 가게 채우기.
사용: python backfill_places.py [--apply] [지역이름...]
  기본은 DRY RUN(삽입 없이 후보만 출력). --apply 붙이면 실제 INSERT.
  지역이름 없으면 신당동 파일럿 세트 사용.
중복 판정: 이름 정규화 일치 + 좌표 ~150m 이내 → 스킵."""
import os, sys, io, re, time, math, argparse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
from dotenv import load_dotenv
load_dotenv(r"E:\창업\wemeet_project\backend\.env")
import requests
from sqlalchemy import create_engine, text

SID = os.getenv("NAVER_SEARCH_ID"); SSEC = os.getenv("NAVER_SEARCH_SECRET")
if not SID or not SSEC:
    print("NAVER_SEARCH_ID/SECRET 없음"); sys.exit(1)
u = os.getenv("DATABASE_URL", "")
if u.startswith("postgres://"): u = u.replace("postgres://", "postgresql://", 1)
engine = create_engine(u)

KEYWORDS = ["맛집", "카페", "술집", "빵집", "분식", "파스타", "일식", "고기집"]
PILOT_AREAS = ["신당동", "신당역", "약수역", "청구역"]
# 파이프라인 검증용 직접 조회(아까 지도에서 누락 확인된 가게들)
DIRECT_PROBES = ["오차드1974 신당", "새벽시루 신당", "보그스톨 신당"]

# 서울 주요 상권 (areas 인자에 'seoul' 넣으면 사용)
SEOUL_AREAS = [
    "홍대", "합정", "연남동", "망원동", "상수동", "신촌", "이대", "연희동",
    "이태원", "한남동", "경리단길", "해방촌", "용리단길",
    "성수동", "서울숲", "건대입구", "왕십리", "성신여대", "혜화 대학로",
    "강남역", "역삼", "선릉", "삼성동", "신사동 가로수길", "압구정", "청담동", "논현동",
    "잠실", "송리단길", "방이동", "석촌", "천호",
    "을지로", "종로", "익선동", "삼청동", "서촌", "광화문", "명동", "동대문",
    "여의도", "영등포", "문래동", "공덕", "마포",
    "샤로수길", "노량진", "사당", "수유", "노원",
]

def norm(s: str) -> str:
    return re.sub(r"[\s\(\)\[\]\-·&']", "", (s or "").lower())

def cat_to_main(cat: str) -> str:
    if re.search(r"카페|커피|디저트|베이커리|제과", cat or ""): return "CAFE"
    if re.search(r"술집|호프|바|포차|이자카야|맥주|와인", cat or ""): return "PUB"
    return "FOOD"

def cuisine_from(cat: str) -> str:
    # 네이버 category 예: "음식점>한식>국밥" → 두번째 토큰
    parts = [p for p in (cat or "").split(">") if p]
    return parts[1] if len(parts) > 1 else (parts[0] if parts else "")

def fetch(query: str):
    r = requests.get(
        "https://openapi.naver.com/v1/search/local.json",
        params={"query": query, "display": 5, "sort": "comment"},
        headers={"X-Naver-Client-Id": SID, "X-Naver-Client-Secret": SSEC},
        timeout=10,
    )
    if r.status_code != 200:
        print(f"  ! API {r.status_code}: {query}")
        return []
    out = []
    for it in r.json().get("items", []):
        name = re.sub(r"<[^>]+>", "", it.get("title", "")).strip()
        try:
            lng = int(it.get("mapx")) / 1e7
            lat = int(it.get("mapy")) / 1e7
        except (TypeError, ValueError):
            continue
        if not name or not (33 < lat < 39 and 124 < lng < 132):
            continue
        cat = it.get("category", "")
        # 음식/카페/주점 계열만 (병원·학원 등 제외)
        if not re.search(r"음식|카페|주점|술집|호프|베이커리|디저트|분식", cat):
            continue
        out.append({
            "name": name, "lat": lat, "lng": lng,
            "category": cat,
            "address": it.get("roadAddress") or it.get("address") or "",
        })
    return out

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("areas", nargs="*")
    args = ap.parse_args()
    if args.areas == ["seoul"]:
        areas, probes = SEOUL_AREAS, []
    elif args.areas:
        areas, probes = args.areas, []
    else:
        areas, probes = PILOT_AREAS, DIRECT_PROBES

    queries = [f"{a} {k}" for a in areas for k in KEYWORDS] + probes
    print(f"쿼리 {len(queries)}개 (지역 {len(areas)} x 키워드 {len(KEYWORDS)} + 직접 {len(DIRECT_PROBES)})")

    # 수집
    raw = []
    for q in queries:
        raw.extend(fetch(q))
        time.sleep(0.15)  # 예의상 레이트리밋
    print(f"API 수집: {len(raw)}건 (중복 포함)")

    # 배치 내 중복 제거(이름 정규화)
    seen, cand = set(), []
    for it in raw:
        k = norm(it["name"])
        if k in seen: continue
        seen.add(k); cand.append(it)

    # DB 중복 제거: 이름 정규화 일치 + 150m 이내
    conn = engine.connect()
    new_items = []
    for it in cand:
        rows = conn.execute(text("""
            select name from places
            where lat between :la - 0.0015 and :la + 0.0015
              and lng between :lo - 0.0019 and :lo + 0.0019
        """), {"la": it["lat"], "lo": it["lng"]}).fetchall()
        k = norm(it["name"])
        dup = any(norm(r[0]) == k or (k and (k in norm(r[0]) or norm(r[0]) in k) and min(len(k), len(norm(r[0]))) >= 4) for r in rows)
        if not dup:
            new_items.append(it)

    print(f"\n=== 신규 후보 {len(new_items)}건 (배치중복 {len(raw)-len(cand)}, DB중복 {len(cand)-len(new_items)} 제외) ===")
    for it in new_items[:40]:
        print(f"  + {it['name']} | {it['category']} | {it['address'][:36]}")
    if len(new_items) > 40: print(f"  ... 외 {len(new_items)-40}건")

    probes = ["오차드1974", "새벽시루", "보그스톨"]
    got = [p for p in probes if any(p.replace(" ", "") in norm(i["name"]) or norm(i["name"]) in norm(p) for i in raw)]
    print(f"\n직접 조회 검증: {got if got else '(네이버 검색에도 안 잡힘 — 폐업/미등록 가능)'}")

    if not args.apply:
        print("\nDRY RUN — 삽입 안 함. --apply로 실제 반영.")
        conn.close(); return

    # 실제 삽입 (id 명시: 테이블에 시퀀스 없음)
    with engine.begin() as w:
        next_id = (w.execute(text("select max(id) from places")).scalar() or 0) + 1
        n = 0
        for it in new_items:
            w.execute(text("""
                insert into places (id, name, lat, lng, address, category, cuisine_type, main_category,
                                    wemeet_rating, review_count, tags)
                values (:id, :name, :lat, :lng, :addr, :cat, :cui, :main, 0.0, 0, '[]')
            """), {"id": next_id, "name": it["name"], "lat": it["lat"], "lng": it["lng"],
                   "addr": it["address"], "cat": it["category"],
                   "cui": cuisine_from(it["category"]), "main": cat_to_main(it["category"])})
            next_id += 1; n += 1
    print(f"\n✅ {n}건 INSERT 완료 (id {next_id-n}~{next_id-1})")
    conn.close()

main()
