# -*- coding: utf-8 -*-
"""
Seoul Restaurant CSV Upload Script
- Reads CSV and uploads to Supabase with hierarchical category structure
- Batch processing for 119,485 restaurants
"""

import os
import sys
import csv
from typing import Dict, List, Tuple
from datetime import datetime

# Add parent directory to path
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

# Supabase connection
from supabase import create_client
SUPABASE_URL = os.getenv("SUPABASE_URL")
# Service role key FIRST (bypasses RLS), then anon key as fallback
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

print(f"[DEBUG] SUPABASE_URL: {SUPABASE_URL}")
print(f"[DEBUG] Using key: {'SERVICE_ROLE' if os.getenv('SUPABASE_SERVICE_KEY') else 'ANON'}")

# If using direct DB connection
DATABASE_URL = os.getenv("DATABASE_URL")

# ===========================================
# Category Mapping Rules (3-Layer Structure)
# ===========================================

# L1: Main Category determination
MAIN_CATEGORY_RULES = {
    "FOOD": ["한식", "양식", "중식", "일식", "분식", "패스트푸드", "뷔페", "음식점", "식당", "고기", "해물", "국수", "찌개", "탕", "구이", "회", "초밥", "돈까스", "우동", "라멘", "파스타", "피자", "스테이크", "햄버거", "치킨", "족발", "보쌈", "냉면", "만두", "칼국수", "삼겹살", "갈비", "곱창", "막창", "샤브샤브", "떡볶이", "김밥", "순대", "오므라이스", "덮밥", "백반", "정식", "한정식", "아시아", "베트남", "태국", "인도", "멕시코", "브런치"],
    "CAFE": ["카페", "커피", "디저트", "베이커리", "빵", "케이크", "아이스크림", "빙수", "음료", "차", "주스", "스무디", "브런치카페"],
    "PUB": ["술집", "호프", "맥주", "와인", "바", "이자카야", "포차", "소주", "막걸리", "칵테일", "위스키", "주점", "요리주점", "일본식주점"],
    "ACTIVITY": ["놀이", "오락", "게임", "노래", "볼링", "당구", "PC방", "스크린골프", "방탈출", "VR"]
}

# L2: Cuisine type mapping
CUISINE_MAPPING = {
    # 한식
    "한식": ["한식", "한정식", "백반", "정식", "국밥", "찌개", "탕", "전골", "비빔밥", "불고기", "갈비", "삼겹살", "보쌈", "족발", "냉면", "칼국수", "수제비", "콩국수", "국수", "순대", "곱창", "막창", "양", "대창", "닭갈비", "찜닭", "삼계탕", "추어탕", "설렁탕", "곰탕", "감자탕", "뼈해장국", "해장국", "육개장", "된장찌개", "김치찌개", "순두부", "두부", "전", "파전", "해물파전", "빈대떡", "떡갈비", "제육", "돼지", "소", "오리", "닭"],
    # 양식
    "양식": ["양식", "이탈리안", "파스타", "피자", "스테이크", "햄버거", "브런치", "오믈렛", "샐러드", "수프", "리조또", "그라탕", "프렌치", "유러피안", "미국식", "멕시칸", "타코", "부리또"],
    # 일식
    "일식": ["일식", "초밥", "스시", "사시미", "회", "일본", "라멘", "우동", "소바", "돈까스", "돈카츠", "텐동", "규동", "가츠동", "오마카세", "이자카야", "야키토리", "꼬치", "덮밥", "카레", "일본식카레", "타코야키", "오코노미야키"],
    # 중식
    "중식": ["중식", "중국", "중화", "짜장", "짬뽕", "탕수육", "마라", "훠궈", "양꼬치", "딤섬", "만두", "볶음밥", "잡채밥", "유린기", "깐풍기", "고추잡채", "칠리새우"],
    # 아시안
    "아시안": ["베트남", "쌀국수", "반미", "분짜", "태국", "똠양꿍", "팟타이", "인도", "커리", "난", "탄두리", "필리핀", "말레이시아", "싱가포르"],
    # 분식
    "분식": ["분식", "떡볶이", "김밥", "라면", "라볶이", "튀김", "순대", "어묵", "핫도그", "토스트"],
    # 패스트푸드
    "패스트푸드": ["패스트푸드", "버거", "햄버거", "치킨", "피자", "샌드위치", "도넛"],
    # 해산물
    "해산물": ["해물", "해산물", "회", "조개", "게", "랍스터", "새우", "오징어", "낙지", "문어", "전복", "굴", "홍합", "아귀", "대구"],
    # 고기
    "고기/구이": ["고기", "구이", "삼겹살", "갈비", "곱창", "막창", "소고기", "돼지고기", "양고기", "오리", "닭", "BBQ", "바베큐"],
    # 카페
    "카페": ["카페", "커피", "에스프레소", "아메리카노", "라떼", "차", "티"],
    # 디저트
    "디저트": ["디저트", "케이크", "빵", "베이커리", "아이스크림", "빙수", "와플", "마카롱", "쿠키", "도넛", "타르트"],
    # 술집
    "술집/바": ["술집", "바", "펍", "호프", "맥주", "와인바", "칵테일바", "위스키바", "이자카야", "포차", "요리주점", "일본식주점", "막걸리", "전통주"],
    # 뷔페
    "뷔페": ["뷔페", "무한리필", "셀프", "올유캔잇"],
    # 기타
    "기타": []
}

# Vibe/Theme keywords
VIBE_KEYWORDS = {
    "데이트": ["분위기좋은", "데이트", "커플", "기념일", "로맨틱", "야경", "뷰"],
    "회식": ["단체", "회식", "모임", "대관", "파티", "뒷풀이", "룸"],
    "혼밥": ["혼밥", "혼술", "1인", "싱글", "혼자"],
    "가족": ["가족", "아이", "키즈", "어린이", "패밀리"],
    "조용한": ["조용한", "프라이빗", "아늑한", "편안한", "차분한"],
    "핫플": ["핫플", "인스타", "SNS", "포토", "유명한", "맛집"]
}

# Facility keywords
FACILITY_KEYWORDS = {
    "parking": ["주차", "발렛", "파킹"],
    "private_room": ["룸", "개별룸", "단체석", "개인실"],
    "wifi": ["와이파이", "wifi", "무선인터넷"],
    "pet_friendly": ["애견", "반려동물", "펫"],
    "reservation": ["예약", "웨이팅"],
    "delivery": ["배달", "포장", "테이크아웃"]
}


def determine_main_category(category_raw: str) -> str:
    """Determine L1 main category"""
    text = category_raw.lower() if category_raw else ""
    
    for main_cat, keywords in MAIN_CATEGORY_RULES.items():
        if any(kw.lower() in text for kw in keywords):
            return main_cat
    
    return "FOOD"  # Default


def determine_cuisine_type(category_raw: str, name: str) -> str:
    """Determine L2 cuisine type"""
    text = f"{category_raw} {name}".lower() if category_raw else name.lower()
    
    for cuisine, keywords in CUISINE_MAPPING.items():
        if any(kw.lower() in text for kw in keywords):
            return cuisine
    
    # Fallback: use category_raw directly if it's simple enough
    if category_raw and len(category_raw) < 20:
        return category_raw
    
    return "기타"


def extract_vibe_tags(category_raw: str, name: str) -> List[str]:
    """Extract L3 vibe/theme tags"""
    text = f"{category_raw} {name}".lower() if category_raw else name.lower()
    tags = []
    
    for vibe, keywords in VIBE_KEYWORDS.items():
        if any(kw.lower() in text for kw in keywords):
            tags.append(vibe)
    
    return tags


def extract_features(category_raw: str, name: str) -> Dict[str, bool]:
    """Extract L4 facility features"""
    text = f"{category_raw} {name}".lower() if category_raw else name.lower()
    features = {}
    
    for feature, keywords in FACILITY_KEYWORDS.items():
        if any(kw.lower() in text for kw in keywords):
            features[feature] = True
    
    return features


def process_row(row: Dict) -> Dict:
    """Process a single CSV row into structured place data"""
    name = row.get("name", "").strip()
    category_raw = row.get("category", "").strip()
    address = row.get("address", "").strip()
    phone = row.get("phone", "").strip()
    
    # Skip rows with empty names
    if not name:
        return None
    
    try:
        lat = float(row.get("lat", 0))
        lng = float(row.get("lng", 0))
    except (ValueError, TypeError):
        lat, lng = 0.0, 0.0
    
    # Skip invalid coordinates
    if lat == 0 or lng == 0:
        return None
    
    # Determine hierarchical categories
    main_category = determine_main_category(category_raw)
    cuisine_type = determine_cuisine_type(category_raw, name)
    vibe_tags = extract_vibe_tags(category_raw, name)
    features = extract_features(category_raw, name)
    
    # Build search keywords
    search_keywords = [name, cuisine_type] + vibe_tags
    if category_raw:
        search_keywords.append(category_raw)
    
    return {
        "name": name,
        "main_category": main_category,
        "cuisine_type": cuisine_type,
        "category": category_raw,  # Keep original
        "address": address,
        "lat": lat,
        "lng": lng,
        "phone": phone or None,
        "vibe_tags": vibe_tags,
        "features": features,
        "tags": [],  # Legacy, keep empty
        "search_keywords": list(set(search_keywords)),
        "wemeet_rating": 0.0,
        "review_count": 0
    }


def upload_to_supabase(data: List[Dict], batch_size: int = 500):
    """Upload data to Supabase in batches using simple INSERT"""
    if not SUPABASE_URL or not SUPABASE_KEY:
        print("[ERROR] Supabase credentials not found!")
        print("Set SUPABASE_URL and SUPABASE_KEY (or SUPABASE_SERVICE_KEY) in .env")
        return False
    
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    total = len(data)
    uploaded = 0
    errors = 0
    
    print(f"\n[START] Uploading {total} restaurants to Supabase...")
    print(f"[INFO] Batch size: {batch_size}")
    
    for i in range(0, total, batch_size):
        batch = data[i:i + batch_size]
        
        try:
            # Simple INSERT (no upsert)
            result = supabase.table("places").insert(batch).execute()
            
            uploaded += len(batch)
            progress = (uploaded / total) * 100
            print(f"[PROGRESS] {uploaded}/{total} ({progress:.1f}%) - Batch {i // batch_size + 1}")
            
        except Exception as e:
            errors += len(batch)
            print(f"[ERROR] Batch {i // batch_size + 1} failed: {e}")
    
    print(f"\n[DONE] Uploaded: {uploaded}, Errors: {errors}")
    return errors == 0


def upload_with_sqlalchemy(data: List[Dict], batch_size: int = 1000):
    """Upload data using SQLAlchemy (direct DB connection)"""
    if not DATABASE_URL:
        print("[ERROR] DATABASE_URL not found in .env")
        return False
    
    from sqlalchemy import create_engine
    from sqlalchemy.orm import sessionmaker
    
    engine = create_engine(DATABASE_URL)
    SessionLocal = sessionmaker(bind=engine)
    db = SessionLocal()
    
    total = len(data)
    uploaded = 0
    
    print(f"\n[START] Uploading {total} restaurants via SQLAlchemy...")
    
    try:
        for i in range(0, total, batch_size):
            batch = data[i:i + batch_size]
            
            # Use raw SQL for faster insert
            from sqlalchemy import text
            
            for row in batch:
                # Check if exists
                existing = db.execute(
                    text("SELECT id FROM places WHERE name = :name AND lat = :lat AND lng = :lng"),
                    {"name": row["name"], "lat": row["lat"], "lng": row["lng"]}
                ).fetchone()
                
                if not existing:
                    db.execute(
                        text("""
                            INSERT INTO places 
                            (name, main_category, cuisine_type, category, address, lat, lng, phone, 
                             vibe_tags, features, tags, search_keywords, wemeet_rating, review_count)
                            VALUES 
                            (:name, :main_category, :cuisine_type, :category, :address, :lat, :lng, :phone,
                             :vibe_tags::jsonb, :features::jsonb, :tags::jsonb, :search_keywords::jsonb, 
                             :wemeet_rating, :review_count)
                        """),
                        {
                            **row,
                            "vibe_tags": str(row["vibe_tags"]).replace("'", '"'),
                            "features": str(row["features"]).replace("'", '"').replace("True", "true").replace("False", "false"),
                            "tags": "[]",
                            "search_keywords": str(row["search_keywords"]).replace("'", '"')
                        }
                    )
                    uploaded += 1
            
            db.commit()
            progress = ((i + batch_size) / total) * 100
            print(f"[PROGRESS] {min(i + batch_size, total)}/{total} ({min(progress, 100):.1f}%)")
        
        print(f"\n[DONE] Uploaded: {uploaded} new restaurants")
        return True
        
    except Exception as e:
        print(f"[ERROR] Upload failed: {e}")
        db.rollback()
        return False
    finally:
        db.close()


def main():
    """Main function"""
    csv_path = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data",
        "seoul_current_restaurants.csv"
    )
    
    if not os.path.exists(csv_path):
        print(f"[ERROR] CSV file not found: {csv_path}")
        return
    
    print(f"[INFO] Reading CSV: {csv_path}")
    
    # Read and process CSV
    data = []
    skipped = 0
    
    # Try different encodings
    encodings_to_try = ["utf-8-sig", "utf-8", "cp949", "euc-kr"]
    file_content = None
    
    for enc in encodings_to_try:
        try:
            with open(csv_path, "r", encoding=enc) as f:
                file_content = f.read()
                print(f"[INFO] CSV encoding detected: {enc}")
                break
        except UnicodeDecodeError:
            continue
    
    if not file_content:
        print("[ERROR] Could not read CSV with any encoding")
        return
    
    import io
    reader = csv.DictReader(io.StringIO(file_content))
    
    for row in reader:
        processed = process_row(row)
        if processed:
            data.append(processed)
        else:
            skipped += 1
    
    print(f"[INFO] Processed: {len(data)} restaurants")
    print(f"[INFO] Skipped (invalid coords): {skipped}")
    
    # Show sample
    if data:
        print("\n[SAMPLE] First processed record:")
        import json
        print(json.dumps(data[0], ensure_ascii=False, indent=2))
    
    # Category distribution
    categories = {}
    cuisines = {}
    for d in data:
        cat = d["main_category"]
        cui = d["cuisine_type"]
        categories[cat] = categories.get(cat, 0) + 1
        cuisines[cui] = cuisines.get(cui, 0) + 1
    
    print("\n[STATS] Main Category Distribution:")
    for cat, count in sorted(categories.items(), key=lambda x: -x[1]):
        print(f"  {cat}: {count}")
    
    print("\n[STATS] Top 15 Cuisine Types:")
    for cui, count in sorted(cuisines.items(), key=lambda x: -x[1])[:15]:
        print(f"  {cui}: {count}")
    
    # Ask for upload confirmation
    print("\n" + "=" * 50)
    response = input("Upload to database? (y/n): ").strip().lower()
    
    if response == "y":
        # Try Supabase first, then SQLAlchemy
        if SUPABASE_URL and SUPABASE_KEY:
            upload_to_supabase(data)
        elif DATABASE_URL:
            upload_with_sqlalchemy(data)
        else:
            print("[ERROR] No database connection configured!")
            print("Set SUPABASE_URL + SUPABASE_KEY or DATABASE_URL in .env")
    else:
        print("[INFO] Upload cancelled.")


if __name__ == "__main__":
    main()
