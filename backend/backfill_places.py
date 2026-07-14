# -*- coding: utf-8 -*-
"""장소 DB 보강 — 네이버 지역검색(공식 API, sort=comment 인기순)으로 누락 가게 채우기.
사용: python backfill_places.py [--apply] [지역이름... | seoul | seoul-full]
  기본 DRY RUN(삽입 없이 후보만 출력). --apply 붙이면 실제 INSERT.
  seoul       = 주요 상권 50곳 x 키워드 8종 (~400쿼리, 몇 분)
  seoul-full  = 서울 전체 동/상권 ~230곳 x 키워드 36종 (~8,300쿼리, 40~60분)
API 제약: 쿼리당 최대 5건 반환(페이지네이션 없음) → 커버리지는 쿼리 수로 확보. 일 한도 25,000콜.
중복 판정: 이름 정규화 일치/포함 + 좌표 ~150m 이내(메모리 그리드 인덱스)."""
import os, sys, io, re, time, argparse
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
from dotenv import load_dotenv
load_dotenv(os.path.join(os.path.dirname(os.path.abspath(__file__)), ".env"))
import requests
from sqlalchemy import create_engine, text

SID = os.getenv("NAVER_SEARCH_ID"); SSEC = os.getenv("NAVER_SEARCH_SECRET")
if not SID or not SSEC:
    print("NAVER_SEARCH_ID/SECRET 없음"); sys.exit(1)
u = os.getenv("DATABASE_URL", "")
if u.startswith("postgres://"): u = u.replace("postgres://", "postgresql://", 1)
engine = create_engine(u)

KEYWORDS = ["맛집", "카페", "술집", "빵집", "분식", "파스타", "일식", "고기집"]
KEYWORDS_FULL = [
    "맛집", "카페", "디저트", "빵집", "브런치",
    "파스타", "피자", "버거", "스테이크",
    "초밥", "오마카세", "돈까스", "라멘", "우동",
    "중식당", "마라탕", "짜장면",
    "쌀국수", "태국음식", "국수",
    "치킨", "삼겹살", "갈비", "곱창", "족발", "보쌈",
    "국밥", "냉면", "해장국", "찌개",
    "횟집", "해물", "샤브샤브",
    "와인바", "이자카야", "포차",
]
PILOT_AREAS = ["신당동", "신당역", "약수역", "청구역"]
DIRECT_PROBES = ["오차드1974 신당", "새벽시루 신당", "보그스톨 신당"]

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

# 서울 전체 스윕: 자치구별 주요 법정/행정동 + 상권·역 (~230)
SEOUL_FULL_AREAS = [
    # 종로구
    "청운동", "사직동", "삼청동", "가회동", "인사동", "익선동", "혜화동", "명륜동", "창신동", "숭인동", "부암동", "평창동", "구기동", "교남동", "종로3가", "종각",
    # 중구
    "소공동", "회현동", "명동", "필동", "장충동", "광희동", "을지로", "충무로", "신당동", "황학동", "중림동", "만리동", "정동", "약수동", "다산동", "시청역",
    # 용산구
    "후암동", "남영동", "청파동", "원효로", "효창동", "용문동", "한강로", "이촌동", "이태원동", "한남동", "서빙고동", "보광동", "용리단길", "경리단길", "해방촌", "삼각지",
    # 성동구
    "왕십리", "마장동", "사근동", "행당동", "응봉동", "금호동", "옥수동", "성수동1가", "성수동2가", "송정동", "용답동", "서울숲", "뚝섬",
    # 광진구
    "중곡동", "능동", "구의동", "광장동", "자양동", "화양동", "군자동", "건대입구",
    # 동대문구
    "신설동", "용두동", "제기동", "전농동", "답십리동", "장안동", "청량리", "회기동", "휘경동", "이문동", "외대앞",
    # 중랑구
    "면목동", "상봉동", "중화동", "묵동", "망우동", "신내동",
    # 성북구
    "성북동", "삼선동", "돈암동", "안암동", "보문동", "정릉동", "길음동", "종암동", "월곡동", "장위동", "석관동", "성신여대",
    # 강북구
    "미아동", "번동", "수유동", "우이동", "미아사거리",
    # 도봉구
    "쌍문동", "방학동", "창동", "도봉동",
    # 노원구
    "월계동", "공릉동", "하계동", "중계동", "상계동", "노원역",
    # 은평구
    "수색동", "녹번동", "불광동", "갈현동", "구산동", "대조동", "응암동", "역촌동", "증산동", "연신내",
    # 서대문구
    "충정로", "천연동", "북아현동", "신촌동", "연희동", "홍제동", "홍은동", "남가좌동", "북가좌동",
    # 마포구
    "아현동", "공덕동", "도화동", "용강동", "대흥동", "염리동", "신수동", "서강동", "서교동", "합정동", "망원동", "연남동", "성산동", "상암동", "홍대입구",
    # 양천구
    "목동", "신월동", "신정동", "오목교",
    # 강서구
    "염창동", "등촌동", "화곡동", "가양동", "마곡동", "발산", "방화동",
    # 구로구
    "신도림동", "구로동", "고척동", "개봉동", "오류동",
    # 금천구
    "가산동", "독산동", "시흥동", "가산디지털단지",
    # 영등포구
    "영등포동", "여의도동", "당산동", "도림동", "문래동", "양평동", "신길동", "대림동",
    # 동작구
    "노량진동", "상도동", "흑석동", "사당동", "대방동", "신대방동",
    # 관악구
    "봉천동", "신림동", "남현동", "서울대입구", "샤로수길", "낙성대",
    # 서초구
    "방배동", "양재동", "잠원동", "반포동", "서초동", "교대역", "고속터미널",
    # 강남구
    "신사동", "논현동", "압구정동", "청담동", "삼성동", "대치동", "역삼동", "도곡동", "개포동", "일원동", "수서동", "강남역", "선정릉", "가로수길",
    # 송파구
    "잠실동", "신천동", "풍납동", "송파동", "석촌동", "삼전동", "가락동", "문정동", "장지동", "방이동", "오금동", "거여동", "마천동", "송리단길",
    # 강동구
    "상일동", "명일동", "고덕동", "암사동", "천호동", "성내동", "길동", "둔촌동",
]


def norm(s: str) -> str:
    return re.sub(r"[\s\(\)\[\]\-·&']", "", (s or "").lower())

def cat_to_main(cat: str) -> str:
    if re.search(r"카페|커피|디저트|베이커리|제과", cat or ""): return "CAFE"
    if re.search(r"술집|호프|바|포차|이자카야|맥주|와인", cat or ""): return "PUB"
    return "FOOD"

def cuisine_from(cat: str) -> str:
    parts = [p for p in (cat or "").split(">") if p]
    return parts[1] if len(parts) > 1 else (parts[0] if parts else "")

def fetch(query: str):
    try:
        r = requests.get(
            "https://openapi.naver.com/v1/search/local.json",
            params={"query": query, "display": 5, "sort": "comment"},
            headers={"X-Naver-Client-Id": SID, "X-Naver-Client-Secret": SSEC},
            timeout=10,
        )
    except Exception:
        return [], "netfail"
    if r.status_code == 429:
        return [], "ratelimit"
    if r.status_code != 200:
        return [], f"http{r.status_code}"
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
        if not re.search(r"음식|카페|주점|술집|호프|베이커리|디저트|분식", cat):
            continue
        out.append({
            "name": name, "lat": lat, "lng": lng, "category": cat,
            "address": it.get("roadAddress") or it.get("address") or "",
        })
    return out, None


class DedupIndex:
    """기존+신규 장소의 (정규화이름, 좌표) 그리드 인덱스 — 150m 근접 중복 판정."""
    CELL_LA, CELL_LO = 0.0015, 0.0019  # ≈150m

    def __init__(self):
        self.grid = {}

    def _key(self, lat, lng):
        return (int(lat / self.CELL_LA), int(lng / self.CELL_LO))

    def add(self, name, lat, lng):
        self.grid.setdefault(self._key(lat, lng), []).append(norm(name))

    def is_dup(self, name, lat, lng):
        k = norm(name)
        if not k:
            return True
        ky, kx = self._key(lat, lng)
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                for e in self.grid.get((ky + dy, kx + dx), []):
                    if e == k or ((k in e or e in k) and min(len(k), len(e)) >= 4):
                        return True
        return False


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("areas", nargs="*")
    args = ap.parse_args()
    if args.areas == ["seoul"]:
        areas, keywords, probes = SEOUL_AREAS, KEYWORDS, []
    elif args.areas == ["seoul-full"]:
        areas, keywords, probes = SEOUL_FULL_AREAS, KEYWORDS_FULL, []
    elif args.areas:
        areas, keywords, probes = args.areas, KEYWORDS, []
    else:
        areas, keywords, probes = PILOT_AREAS, KEYWORDS, DIRECT_PROBES

    queries = [f"{a} {k}" for a in areas for k in keywords] + probes
    print(f"쿼리 {len(queries)}개 (지역 {len(areas)} x 키워드 {len(keywords)})", flush=True)

    # 기존 장소 전체를 메모리 인덱스로 (매 후보 DB조회 대신 — 대량 스윕 대비)
    idx = DedupIndex()
    with engine.connect() as c:
        for nm, la, lo in c.execute(text("select name, lat, lng from places where lat is not null and lng is not null")):
            idx.add(nm, la, lo)
    print("기존 장소 인덱스 로드 완료", flush=True)

    new_items, raw_cnt, err_cnt = [], 0, 0
    t0 = time.time()
    for i, q in enumerate(queries):
        items, err = fetch(q)
        if err == "ratelimit":
            print(f"  !! 레이트리밋(429) — {i}번째 쿼리에서 중단, 수집분만 반영", flush=True)
            break
        if err:
            err_cnt += 1
            if err_cnt > 50:
                print("  !! 오류 누적 50회 — 중단", flush=True)
                break
        raw_cnt += len(items)
        for it in items:
            if idx.is_dup(it["name"], it["lat"], it["lng"]):
                continue
            idx.add(it["name"], it["lat"], it["lng"])  # 신규도 인덱스에 → 배치 내 근접중복 방지
            new_items.append(it)
        if (i + 1) % 200 == 0:
            el = time.time() - t0
            print(f"  진행 {i+1}/{len(queries)} | 수집 {raw_cnt} | 신규 {len(new_items)} | {el/60:.1f}분", flush=True)
        time.sleep(0.12)

    print(f"\n=== 수집 {raw_cnt}건 → 신규 {len(new_items)}건 (중복 제외) ===", flush=True)
    for it in new_items[:25]:
        print(f"  + {it['name']} | {it['category']} | {it['address'][:34]}")
    if len(new_items) > 25:
        print(f"  ... 외 {len(new_items)-25}건")

    if not args.apply:
        print("\nDRY RUN — 삽입 안 함. --apply로 실제 반영.")
        return

    # INSERT (id 명시: places에 시퀀스 없음)
    inserted = 0
    with engine.begin() as w:
        next_id = (w.execute(text("select max(id) from places")).scalar() or 0) + 1
        for it in new_items:
            w.execute(text("""
                insert into places (id, name, lat, lng, address, category, cuisine_type, main_category,
                                    wemeet_rating, review_count, tags)
                values (:id, :name, :lat, :lng, :addr, :cat, :cui, :main, 0.0, 0, '[]')
            """), {"id": next_id, "name": it["name"], "lat": it["lat"], "lng": it["lng"],
                   "addr": it["address"], "cat": it["category"],
                   "cui": cuisine_from(it["category"]), "main": cat_to_main(it["category"])})
            next_id += 1; inserted += 1
    print(f"\n[OK] {inserted}건 INSERT 완료 (id {next_id-inserted}~{next_id-1})", flush=True)


main()
