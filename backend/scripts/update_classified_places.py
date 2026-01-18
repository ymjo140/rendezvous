"""
네이버 API로 분류한 결과를 Supabase DB에 업데이트하는 스크립트
classify_with_naver_api.py 실행 후 사용
"""

import os
import csv
from dotenv import load_dotenv
from supabase import create_client

load_dotenv()

SUPABASE_URL = os.getenv("SUPABASE_URL")
SUPABASE_KEY = os.getenv("SUPABASE_SERVICE_KEY") or os.getenv("SUPABASE_KEY")

INPUT_FILE = "classified_places_result.csv"  # 네이버 API 분류 결과 파일

def update_places():
    """분류 결과를 DB에 업데이트"""
    
    if not os.path.exists(INPUT_FILE):
        print(f"❌ {INPUT_FILE} 파일이 없습니다.")
        print("   먼저 classify_with_naver_api.py를 실행하세요.")
        return
    
    supabase = create_client(SUPABASE_URL, SUPABASE_KEY)
    
    # CSV 로드
    with open(INPUT_FILE, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        places = list(reader)
    
    total = len(places)
    print(f"📊 총 {total}개의 장소를 업데이트합니다...")
    
    # '기타' 제외하고 업데이트
    update_count = 0
    skip_count = 0
    error_count = 0
    
    for i, place in enumerate(places):
        place_id = place.get('id')
        new_cuisine_type = place.get('new_cuisine_type', '').strip()
        new_main_category = place.get('new_main_category', '').strip()
        
        # 기타는 스킵
        if new_cuisine_type == '기타' or not new_cuisine_type:
            skip_count += 1
            continue
        
        try:
            # DB 업데이트
            supabase.table("places").update({
                "cuisine_type": new_cuisine_type,
                "main_category": new_main_category
            }).eq("id", place_id).execute()
            
            update_count += 1
            
            if (i + 1) % 100 == 0:
                print(f"   진행: {i+1}/{total} (업데이트: {update_count})")
                
        except Exception as e:
            error_count += 1
            print(f"❌ 에러 [{place_id}]: {e}")
    
    print(f"\n{'='*50}")
    print(f"✅ 완료!")
    print(f"   업데이트: {update_count}개")
    print(f"   스킵(기타): {skip_count}개")
    print(f"   에러: {error_count}개")
    print(f"{'='*50}")
    
    # 최종 분포 확인
    print("\n📊 업데이트 후 전체 분포:")
    response = supabase.rpc("get_cuisine_distribution").execute()
    # 또는 직접 쿼리
    

if __name__ == "__main__":
    update_places()
