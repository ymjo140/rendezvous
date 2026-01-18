"""
일반음식점(미분류)으로 분류된 장소들을 CSV로 추출하는 스크립트
다른 AI에게 분류 작업을 맡기기 위한 용도
"""

import os
import csv
from dotenv import load_dotenv
from supabase import create_client

# .env 파일 로드
load_dotenv()

# Supabase 연결
SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("SUPABASE_URL과 SUPABASE_KEY를 .env 파일에 설정해주세요")

supabase = create_client(SUPABASE_URL, SUPABASE_KEY)

def export_unclassified_places():
    """일반음식점으로 분류된 장소들을 CSV로 내보내기"""
    
    print("일반음식점 데이터 조회 중...")
    
    # 일반음식점 데이터 조회 (페이지네이션 처리)
    all_places = []
    page_size = 1000
    offset = 0
    
    while True:
        response = supabase.table("places") \
            .select("id, name, address, category, cuisine_type, main_category") \
            .eq("cuisine_type", "일반음식점") \
            .range(offset, offset + page_size - 1) \
            .execute()
        
        if not response.data:
            break
            
        all_places.extend(response.data)
        print(f"  {len(all_places)}개 조회 완료...")
        
        if len(response.data) < page_size:
            break
            
        offset += page_size
    
    print(f"\n총 {len(all_places)}개의 일반음식점 데이터 조회 완료")
    
    # CSV 파일로 저장
    output_file = "unclassified_places.csv"
    
    with open(output_file, 'w', newline='', encoding='utf-8-sig') as f:
        writer = csv.writer(f)
        
        # 헤더 작성
        writer.writerow([
            'id',
            'name', 
            'address',
            'category',
            'current_cuisine_type',
            'current_main_category',
            'new_cuisine_type',  # AI가 채울 컬럼
            'new_main_category'  # AI가 채울 컬럼
        ])
        
        # 데이터 작성
        for place in all_places:
            writer.writerow([
                place.get('id', ''),
                place.get('name', ''),
                place.get('address', ''),
                place.get('category', ''),
                place.get('cuisine_type', ''),
                place.get('main_category', ''),
                '',  # new_cuisine_type - AI가 채움
                ''   # new_main_category - AI가 채움
            ])
    
    print(f"\n✅ {output_file} 파일 생성 완료!")
    print(f"   위치: {os.path.abspath(output_file)}")
    
    # 통계 출력
    print("\n--- 참고: 사용 가능한 cuisine_type 목록 ---")
    cuisine_types = [
        "한식", "일식", "중식", "양식", "아시아음식",
        "치킨", "피자", "분식", "패스트푸드",
        "카페", "디저트", "술집/바", "해산물",
        "고기/구이", "일반음식점"
    ]
    for ct in cuisine_types:
        print(f"  - {ct}")
    
    print("\n--- 참고: 사용 가능한 main_category 목록 ---")
    main_categories = ["RESTAURANT", "CAFE", "PUB"]
    for mc in main_categories:
        print(f"  - {mc}")

if __name__ == "__main__":
    export_unclassified_places()
