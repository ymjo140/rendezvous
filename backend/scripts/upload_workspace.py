"""
워크스페이스(공유오피스) 데이터 업로드 스크립트
"""

import os
import sys
import json
import csv
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

# === 설정 ===
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

CSV_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "workspace.csv")

# 태그 → features 매핑
TAG_TO_FEATURE = {
    "와이파이": "wifi",
    "주차가능": "parking",
    "프로젝터": "projector",
    "화이트보드": "whiteboard",
    "에어컨": "aircon",
    "난방": "heating",
    "인쇄/복사": "printer",
    "보안": "security",
    "락커": "locker",
    "라운지": "lounge",
    "카페": "cafe",
    "샤워실": "shower",
    "24시간": "24hours",
    "택배": "delivery",
    "창고": "storage",
    "루프탑": "rooftop",
    "다과제공": "refreshments",
}

# 태그 → vibe_tags 매핑
TAG_TO_VIBE = {
    "조용한": "조용한",
    "주말운영": "주말운영",
    "연중무휴": "연중무휴",
    "독립오피스": "프라이빗",
    "공유오피스": "오픈형",
}


def parse_tags(tags_str):
    """JSON 배열 형태의 태그 문자열 파싱"""
    try:
        if not tags_str or tags_str == '[]':
            return []
        # JSON 파싱
        tags = json.loads(tags_str)
        return tags if isinstance(tags, list) else []
    except:
        return []


def tags_to_features(tags):
    """태그 목록을 features 딕셔너리로 변환"""
    features = {}
    for tag in tags:
        if tag in TAG_TO_FEATURE:
            features[TAG_TO_FEATURE[tag]] = True
    return features


def tags_to_vibe(tags):
    """태그 목록을 vibe_tags 리스트로 변환"""
    vibe_tags = []
    for tag in tags:
        if tag in TAG_TO_VIBE:
            vibe_tags.append(TAG_TO_VIBE[tag])
    # 추가 분위기 태그
    if "24시간" in tags:
        vibe_tags.append("24시간")
    return list(set(vibe_tags))


def determine_cuisine_type(name, tags):
    """이름과 태그로 cuisine_type 결정"""
    name_lower = name.lower()
    
    if "스터디" in name or "독서실" in name:
        return "스터디카페"
    elif "회의" in name or "세미나" in name or "미팅" in name:
        return "회의실"
    elif "코워킹" in name or "coworking" in name_lower:
        return "코워킹스페이스"
    elif "독립오피스" in tags or "소호" in name:
        return "프라이빗오피스"
    else:
        return "공유오피스"


def process_csv():
    """CSV 파일 처리"""
    places = []
    
    # 인코딩 시도
    encodings = ['utf-8-sig', 'utf-8', 'cp949', 'euc-kr']
    
    for encoding in encodings:
        try:
            with open(CSV_PATH, 'r', encoding=encoding) as f:
                reader = csv.DictReader(f)
                rows = list(reader)
            print(f"✅ 인코딩 성공: {encoding}")
            break
        except:
            continue
    else:
        print("❌ CSV 파일 읽기 실패")
        return []
    
    print(f"📂 총 {len(rows)}개 행 로드")
    
    for row in rows:
        name = row.get('name', '').strip()
        if not name:
            continue
        
        address = row.get('address', '').strip()
        
        # 좌표
        try:
            lat = float(row.get('lat', 0))
            lng = float(row.get('lng', 0))
        except:
            lat, lng = 37.5665, 126.9780  # 서울 기본값
        
        # 태그 파싱
        tags = parse_tags(row.get('tags', '[]'))
        
        # features와 vibe_tags 생성
        features = tags_to_features(tags)
        vibe_tags = tags_to_vibe(tags)
        
        # cuisine_type 결정
        cuisine_type = determine_cuisine_type(name, tags)
        
        # 영업시간
        business_hours = row.get('formatted_hours', '').strip()
        
        place = {
            'name': name,
            'address': address,
            'lat': lat,
            'lng': lng,
            'main_category': 'BUSINESS',
            'cuisine_type': cuisine_type,
            'category': 'workspace',  # 원본 카테고리 보존
            'vibe_tags': vibe_tags,
            'features': features,
            'tags': tags,  # 원본 태그 보존
            'business_hours': business_hours,
            'wemeet_rating': 0.0,
            'review_count': 0,
            'search_keywords': [name, cuisine_type, '공유오피스', '워크스페이스'] + vibe_tags
        }
        
        places.append(place)
    
    return places


def upload_to_supabase(places):
    """Supabase에 업로드"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("❌ Supabase 연결 정보 없음")
        print("   SUPABASE_URL과 SUPABASE_SERVICE_KEY를 .env에 설정하세요")
        return
    
    print(f"\n🔌 Supabase 연결 중...")
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    print(f"📤 {len(places)}개 워크스페이스 업로드 중...")
    
    batch_size = 100
    uploaded = 0
    errors = 0
    
    for i in range(0, len(places), batch_size):
        batch = places[i:i+batch_size]
        
        try:
            result = supabase.table("places").insert(batch).execute()
            uploaded += len(batch)
            print(f"   ✅ {uploaded}/{len(places)} 완료")
        except Exception as e:
            errors += len(batch)
            print(f"   ❌ 배치 {i//batch_size + 1} 에러: {e}")
    
    print(f"\n{'='*50}")
    print(f"✅ 업로드 완료: {uploaded}개")
    print(f"❌ 에러: {errors}개")
    print(f"{'='*50}")


def main():
    print("="*60)
    print("📁 워크스페이스 데이터 업로드")
    print("="*60)
    
    if not os.path.exists(CSV_PATH):
        print(f"❌ 파일 없음: {CSV_PATH}")
        return
    
    # CSV 처리
    places = process_csv()
    
    if not places:
        print("❌ 처리할 데이터 없음")
        return
    
    # 미리보기
    print(f"\n📋 미리보기 (처음 5개):")
    for p in places[:5]:
        print(f"   - {p['name']} ({p['cuisine_type']})")
        print(f"     시설: {list(p['features'].keys())[:5]}")
    
    # 확인
    confirm = input(f"\n총 {len(places)}개를 업로드할까요? (y/n): ")
    if confirm.lower() == 'y':
        upload_to_supabase(places)
    else:
        print("취소됨")


if __name__ == "__main__":
    main()
