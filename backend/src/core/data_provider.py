import requests
import urllib.parse
import time
import json
from typing import List, Any
from sqlalchemy.orm import Session
from .config import settings

class PlaceInfo:
    def __init__(self, name, category, location, avg_rating=0.0, tags=None, address=None):
        self.name = name
        self.category = category
        self.location = location
        self.avg_rating = avg_rating
        self.tags = tags or []
        self.address = address or ""

class RealDataProvider:
    def __init__(self):
        # 현재 로딩된 키의 앞자리만 출력하여 키가 제대로 들어갔는지 검증
        print(f"🔑 [System] 현재 로드된 Map ID: {settings.NAVER_MAP_ID[:5]}*** (맞는지 확인하세요)")
        
        self.search_headers = {
            "X-Naver-Client-Id": settings.NAVER_SEARCH_ID,
            "X-Naver-Client-Secret": settings.NAVER_SEARCH_SECRET
        }
        self.map_headers = {
            "X-NCP-APIGW-API-KEY-ID": settings.NAVER_MAP_ID,
            "X-NCP-APIGW-API-KEY": settings.NAVER_MAP_SECRET
        }

    def get_coordinates(self, query: str):
        """
        좌표 변환 함수: 실패 시 예외를 발생시켜 프로그램을 중단시킵니다.
        """
        if not query: return 0.0, 0.0
        
        url = f"https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query={urllib.parse.quote(query)}"
        res = requests.get(url, headers=self.map_headers)
        
        # 1. 상태 코드가 200이 아닐 경우 (에러 발생)
        if res.status_code != 200:
            error_data = res.json().get('error', {})
            error_code = error_data.get('errorCode')
            message = error_data.get('message')
            details = error_data.get('details')

            # 에러 분석 및 한글 상세 출력
            print(f"\n🛑 [Critical Error] 좌표 변환 API 요청 실패!")
            print(f"   - Status Code: {res.status_code}")
            print(f"   - Error Code: {error_code}")
            print(f"   - Message: {message}")
            print(f"   - Details: {details}")

            if error_code == "210":
                print("   👉 [원인 분석] Permission Denied: Geocoding 서비스가 신청되지 않았거나, 결제 수단이 등록되지 않음.")
            elif res.status_code == 401:
                print("   👉 [원인 분석] Unauthorized: Client ID/Secret 값이 틀림. (공백 포함 여부 확인)")
            elif res.status_code == 429:
                print("   👉 [원인 분석] Quota Exceeded: 하루/월간 이용 한도 초과.")
            
            # 여기서 에러를 발생시켜 프로세스 중단
            raise Exception(f"Naver Map API Error: {error_code} - {message}")

        # 2. 200 OK이지만 결과가 없는 경우
        data = res.json()
        if not data.get('addresses'):
            print(f"⚠️ [Warning] '{query}'에 대한 검색 결과가 없습니다. (좌표 없음)")
            return 0.0, 0.0

        item = data['addresses'][0]
        return float(item['y']), float(item['x'])

    def search_places_all_queries(self, queries: List[str], region_name: str, center_lat: float, center_lng: float, db: Session = None) -> List[PlaceInfo]:
        from ..repositories.meeting_repository import MeetingRepository
        repo = MeetingRepository()
        
        results = []
        seen_names = set()

        print(f"\n🚀 [Start] 정밀 검색 시작: {queries}")

        try:
            for q in queries:
                if len(results) >= 50: break
                
                search_query = f"{region_name} {q}" if region_name else q
                
                for start_idx in range(1, 50, 5):
                    if len(results) >= 50: break

                    time.sleep(0.1) 
                    url = f"https://openapi.naver.com/v1/search/local.json?query={urllib.parse.quote(search_query)}&display=5&start={start_idx}&sort=random"
                    
                    res = requests.get(url, headers=self.search_headers)
                    if res.status_code != 200:
                        print(f"🛑 [Search API Error] 검색 API 오류: {res.status_code}")
                        break

                    items = res.json().get('items', [])
                    if not items: break

                    for item in items:
                        clean_name = item['title'].replace('<b>', '').replace('</b>', '')
                        if clean_name in seen_names: continue
                        
                        address = item['roadAddress'] or item['address']
                        
                        # 🚨 여기서 좌표 변환 시도 (에러나면 바로 멈춤)
                        try:
                            lat, lng = self.get_coordinates(address)
                        except Exception as e:
                            print(f"\n💥 [System Halt] 치명적 오류 발생으로 검색 중단.")
                            print(f"   - 오류 내용: {e}")
                            return results # 에러 발생 시 현재까지 찾은 것만 반환하고 종료 (또는 raise e 로 아예 뻗게 할 수도 있음)

                        # 좌표가 0.0이면 저장 안 함 (정확성 위함)
                        if lat == 0.0: continue

                        seen_names.add(clean_name)
                        category = item['category'].split('>')[0] if item['category'] else "기타"
                        
                        # DB 저장
                        if db:
                            try:
                                if not repo.get_place_by_name(db, clean_name):
                                    repo.create_place(db, clean_name, category, lat, lng, [q], 0.0, address)
                                    db.commit()
                            except: db.rollback()

                        results.append(PlaceInfo(clean_name, category, [lat, lng], 0.0, [q], address))
                        
        except Exception as e:
            print(f"❌ [Fatal Error] 프로세스 강제 종료: {e}")
        
        print(f"🏁 [End] 총 {len(results)}개 장소 확보 완료")
        return results