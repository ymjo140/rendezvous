"""
네이버 Local API를 사용하여 "일반음식점"을 정확하게 분류하는 스크립트
네이버 개발자 센터에서 API 키 발급 필요: https://developers.naver.com/
"""
print("📦 모듈 로딩 중...")

import os
import csv
import requests
import time
from dotenv import load_dotenv
from supabase import create_client

print("✅ 모듈 로딩 완료")

# .env 파일 로드
load_dotenv()
print(f"📂 .env 로드 완료")

# === 설정 ===
# .env에 있는 NAVER_SEARCH_ID / NAVER_SEARCH_SECRET 사용
NAVER_CLIENT_ID = os.getenv("NAVER_SEARCH_ID") or os.getenv("NAVER_CLIENT_ID", "YOUR_CLIENT_ID")
NAVER_CLIENT_SECRET = os.getenv("NAVER_SEARCH_SECRET") or os.getenv("NAVER_CLIENT_SECRET", "YOUR_CLIENT_SECRET")

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

INPUT_FILE = "unclassified_places.csv"  # export_unclassified.py로 생성한 파일
OUTPUT_FILE = "classified_places_result.csv"

# 네이버 카테고리 → 우리 cuisine_type 매핑
NAVER_CATEGORY_MAP = {
    # 한식
    "한식": ("한식", "RESTAURANT"),
    "한정식": ("한식", "RESTAURANT"),
    "국밥": ("한식", "RESTAURANT"),
    "찌개": ("한식", "RESTAURANT"),
    "전골": ("한식", "RESTAURANT"),
    "해장국": ("한식", "RESTAURANT"),
    "설렁탕": ("한식", "RESTAURANT"),
    "삼계탕": ("한식", "RESTAURANT"),
    "냉면": ("한식", "RESTAURANT"),
    "칼국수": ("한식", "RESTAURANT"),
    "국수": ("한식", "RESTAURANT"),
    "비빔밥": ("한식", "RESTAURANT"),
    "백반": ("한식", "RESTAURANT"),
    "분식": ("분식", "RESTAURANT"),
    "떡볶이": ("분식", "RESTAURANT"),
    "김밥": ("분식", "RESTAURANT"),
    "죽": ("한식", "RESTAURANT"),
    "보쌈": ("한식", "RESTAURANT"),
    "족발": ("한식", "RESTAURANT"),
    "순대": ("분식", "RESTAURANT"),
    
    # 고기
    "삼겹살": ("고기/구이", "RESTAURANT"),
    "갈비": ("고기/구이", "RESTAURANT"),
    "구이": ("고기/구이", "RESTAURANT"),
    "곱창": ("고기/구이", "RESTAURANT"),
    "막창": ("고기/구이", "RESTAURANT"),
    "불고기": ("고기/구이", "RESTAURANT"),
    "소고기": ("고기/구이", "RESTAURANT"),
    "돼지고기": ("고기/구이", "RESTAURANT"),
    "양고기": ("고기/구이", "RESTAURANT"),
    "육류": ("고기/구이", "RESTAURANT"),
    "정육점": ("고기/구이", "RESTAURANT"),
    "숯불": ("고기/구이", "RESTAURANT"),
    
    # 치킨
    "치킨": ("치킨", "RESTAURANT"),
    "닭강정": ("치킨", "RESTAURANT"),
    "닭갈비": ("치킨", "RESTAURANT"),
    "닭발": ("치킨", "RESTAURANT"),
    "닭요리": ("치킨", "RESTAURANT"),
    
    # 해산물
    "해산물": ("해산물", "RESTAURANT"),
    "생선": ("해산물", "RESTAURANT"),
    "회": ("해산물", "RESTAURANT"),
    "초밥": ("일식", "RESTAURANT"),
    "횟집": ("해산물", "RESTAURANT"),
    "조개": ("해산물", "RESTAURANT"),
    "게": ("해산물", "RESTAURANT"),
    "랍스터": ("해산물", "RESTAURANT"),
    "새우": ("해산물", "RESTAURANT"),
    "낙지": ("해산물", "RESTAURANT"),
    "오징어": ("해산물", "RESTAURANT"),
    "아귀": ("해산물", "RESTAURANT"),
    "대게": ("해산물", "RESTAURANT"),
    
    # 일식
    "일식": ("일식", "RESTAURANT"),
    "일본식": ("일식", "RESTAURANT"),
    "일본음식": ("일식", "RESTAURANT"),
    "스시": ("일식", "RESTAURANT"),
    "라멘": ("일식", "RESTAURANT"),
    "돈까스": ("일식", "RESTAURANT"),
    "돈카츠": ("일식", "RESTAURANT"),
    "우동": ("일식", "RESTAURANT"),
    "소바": ("일식", "RESTAURANT"),
    "텐동": ("일식", "RESTAURANT"),
    "규동": ("일식", "RESTAURANT"),
    "덮밥": ("일식", "RESTAURANT"),
    "이자카야": ("술집/바", "PUB"),
    "야키토리": ("일식", "RESTAURANT"),
    "오마카세": ("일식", "RESTAURANT"),
    
    # 중식
    "중식": ("중식", "RESTAURANT"),
    "중국식": ("중식", "RESTAURANT"),
    "중국음식": ("중식", "RESTAURANT"),
    "중화": ("중식", "RESTAURANT"),
    "짜장면": ("중식", "RESTAURANT"),
    "짬뽕": ("중식", "RESTAURANT"),
    "탕수육": ("중식", "RESTAURANT"),
    "마라": ("중식", "RESTAURANT"),
    "훠궈": ("중식", "RESTAURANT"),
    "딤섬": ("중식", "RESTAURANT"),
    "양꼬치": ("중식", "RESTAURANT"),
    
    # 양식
    "양식": ("양식", "RESTAURANT"),
    "서양식": ("양식", "RESTAURANT"),
    "스테이크": ("양식", "RESTAURANT"),
    "파스타": ("양식", "RESTAURANT"),
    "피자": ("피자", "RESTAURANT"),
    "햄버거": ("양식", "RESTAURANT"),
    "버거": ("양식", "RESTAURANT"),
    "이탈리안": ("양식", "RESTAURANT"),
    "이탈리아": ("양식", "RESTAURANT"),
    "프렌치": ("양식", "RESTAURANT"),
    "프랑스": ("양식", "RESTAURANT"),
    "브런치": ("양식", "RESTAURANT"),
    "샐러드": ("양식", "RESTAURANT"),
    "샌드위치": ("패스트푸드", "RESTAURANT"),
    "멕시칸": ("양식", "RESTAURANT"),
    
    # 아시아
    "베트남": ("아시아음식", "RESTAURANT"),
    "쌀국수": ("아시아음식", "RESTAURANT"),
    "태국": ("아시아음식", "RESTAURANT"),
    "인도": ("아시아음식", "RESTAURANT"),
    "커리": ("아시아음식", "RESTAURANT"),
    "동남아": ("아시아음식", "RESTAURANT"),
    
    # 패스트푸드
    "패스트푸드": ("패스트푸드", "RESTAURANT"),
    "페스트푸드": ("패스트푸드", "RESTAURANT"),
    "퀵서비스": ("패스트푸드", "RESTAURANT"),
    
    # 카페/디저트
    "카페": ("카페", "CAFE"),
    "커피": ("카페", "CAFE"),
    "커피전문점": ("카페", "CAFE"),
    "카페,디저트": ("카페", "CAFE"),
    "디저트": ("디저트", "CAFE"),
    "빙수": ("디저트", "CAFE"),
    "아이스크림": ("디저트", "CAFE"),
    "제과": ("디저트", "CAFE"),
    "베이커리": ("디저트", "CAFE"),
    "빵": ("디저트", "CAFE"),
    "케이크": ("디저트", "CAFE"),
    "도넛": ("디저트", "CAFE"),
    "떡카페": ("디저트", "CAFE"),
    "차": ("카페", "CAFE"),
    "티": ("카페", "CAFE"),
    
    # 술집/바
    "술집": ("술집/바", "PUB"),
    "호프": ("술집/바", "PUB"),
    "맥주": ("술집/바", "PUB"),
    "주점": ("술집/바", "PUB"),
    "포차": ("술집/바", "PUB"),
    "바": ("술집/바", "PUB"),
    "와인바": ("술집/바", "PUB"),
    "칵테일": ("술집/바", "PUB"),
    "라운지": ("술집/바", "PUB"),
    "펍": ("술집/바", "PUB"),
    "요리주점": ("술집/바", "PUB"),
    "실내포장마차": ("술집/바", "PUB"),
}


def search_naver_local(query):
    """네이버 지역 검색 API 호출"""
    url = "https://openapi.naver.com/v1/search/local.json"
    headers = {
        "X-Naver-Client-Id": NAVER_CLIENT_ID,
        "X-Naver-Client-Secret": NAVER_CLIENT_SECRET
    }
    params = {"query": query, "display": 1, "sort": "random"}
    
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=5)
        if resp.status_code == 200:
            items = resp.json().get('items')
            if items:
                return items[0].get('category', '')
    except Exception as e:
        pass
    return None


def map_naver_category(naver_category):
    """네이버 카테고리를 우리 시스템의 cuisine_type으로 매핑"""
    if not naver_category:
        return None, None
    
    # 네이버 카테고리는 "음식점>한식>국밥" 형태
    parts = naver_category.replace(" ", "").split(">")
    
    # 역순으로 검색 (가장 구체적인 것부터)
    for part in reversed(parts):
        for keyword, (cuisine_type, main_category) in NAVER_CATEGORY_MAP.items():
            if keyword in part:
                return cuisine_type, main_category
    
    # 매핑 실패 시 첫 번째 레벨 확인
    if len(parts) > 0:
        first = parts[0]
        if "음식점" in first or "맛집" in first:
            return "한식", "RESTAURANT"  # 기본값
        elif "카페" in first:
            return "카페", "CAFE"
    
    return None, None


def classify_places():
    """일반음식점 데이터를 네이버 API로 분류"""
    
    # API 키 확인
    if not NAVER_CLIENT_ID or NAVER_CLIENT_ID == "YOUR_CLIENT_ID":
        print("❌ 네이버 API 키를 설정해주세요!")
        print("   .env 파일에 NAVER_SEARCH_ID와 NAVER_SEARCH_SECRET 추가")
        return
    
    print(f"✅ 네이버 API 키 확인됨: {NAVER_CLIENT_ID[:4]}****")
    
    # Supabase 연결
    supabase = None
    if SUPABASE_URL and SUPABASE_KEY:
        supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # 데이터 로드 (CSV 또는 Supabase)
    places = []
    
    if os.path.exists(INPUT_FILE):
        print(f"📂 {INPUT_FILE}에서 데이터 로드 중...")
        with open(INPUT_FILE, 'r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            places = list(reader)
    elif supabase:
        print("📂 Supabase에서 일반음식점 데이터 조회 중...")
        offset = 0
        page_size = 1000
        while True:
            response = supabase.table("places") \
                .select("id, name, address, category, cuisine_type, main_category") \
                .eq("cuisine_type", "일반음식점") \
                .range(offset, offset + page_size - 1) \
                .execute()
            
            if not response.data:
                break
            places.extend(response.data)
            if len(response.data) < page_size:
                break
            offset += page_size
    else:
        print("❌ 데이터를 찾을 수 없습니다.")
        print(f"   {INPUT_FILE} 파일을 생성하거나 Supabase 연결을 확인하세요.")
        return
    
    total = len(places)
    print(f"\n🔍 총 {total}개의 '일반음식점'을 검색합니다...")
    print(f"   예상 소요시간: 약 {total * 0.15 / 60:.1f}분\n")
    
    # 결과 저장용
    results = []
    success_count = 0
    fail_count = 0
    
    for i, place in enumerate(places):
        place_id = place.get('id', '')
        name = place.get('name', '')
        address = place.get('address', '')
        
        # 검색 쿼리 생성 (구 단위까지만 사용)
        addr_parts = address.split(' ') if address else []
        short_addr = ' '.join(addr_parts[:2]) if len(addr_parts) >= 2 else ""
        query = f"{short_addr} {name}".strip()
        
        # 네이버 API 검색
        naver_category = search_naver_local(query)
        cuisine_type, main_category = map_naver_category(naver_category)
        
        # 결과 저장
        result = {
            'id': place_id,
            'name': name,
            'address': address,
            'category': place.get('category', ''),
            'naver_category': naver_category or '',
            'new_cuisine_type': cuisine_type or '기타',
            'new_main_category': main_category or 'RESTAURANT'
        }
        results.append(result)
        
        # 진행상황 출력
        if cuisine_type:
            print(f"✅ [{i+1}/{total}] {name} → {naver_category} → {cuisine_type}")
            success_count += 1
        else:
            print(f"❌ [{i+1}/{total}] {name} → 분류 실패")
            fail_count += 1
        
        # API 제한 방지 (초당 10회 제한)
        time.sleep(0.12)
        
        # 100개마다 중간 저장
        if (i + 1) % 100 == 0:
            save_results(results, OUTPUT_FILE)
            print(f"\n💾 중간 저장 완료 ({i+1}/{total})\n")
    
    # 최종 저장
    save_results(results, OUTPUT_FILE)
    
    print(f"\n{'='*50}")
    print(f"✅ 완료!")
    print(f"   성공: {success_count}개")
    print(f"   실패: {fail_count}개")
    print(f"   결과 파일: {os.path.abspath(OUTPUT_FILE)}")
    print(f"{'='*50}")
    
    # 분류 결과 통계
    print("\n📊 분류 결과 통계:")
    stats = {}
    for r in results:
        ct = r['new_cuisine_type']
        stats[ct] = stats.get(ct, 0) + 1
    
    for ct, count in sorted(stats.items(), key=lambda x: -x[1]):
        print(f"   {ct}: {count}개")


def save_results(results, filename):
    """결과를 CSV로 저장"""
    with open(filename, 'w', newline='', encoding='utf-8-sig') as f:
        if results:
            writer = csv.DictWriter(f, fieldnames=results[0].keys())
            writer.writeheader()
            writer.writerows(results)


if __name__ == "__main__":
    print("🚀 스크립트 시작...")
    try:
        classify_places()
    except Exception as e:
        print(f"❌ 에러 발생: {e}")
        import traceback
        traceback.print_exc()
