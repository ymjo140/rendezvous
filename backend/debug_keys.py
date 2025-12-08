import requests

# 🚨 여기에 네이버 클라우드(NCP)에서 발급받은 '지도(Map)' 키를 직접 붙여넣으세요!
# (.env 파일에서 가져오지 않고 직접 넣어서 테스트합니다)
NAVER_MAP_ID = "djsgmvkn5q" 
NAVER_MAP_SECRET = "gvpXgJJzWmEoaxDJ2WdMXanIWIAukwp1a1rOV6Dr"

def test_geocoding():
    print("🚑 [Geocoding API 긴급 진단 시작]")
    print(f"👉 테스트 ID: {NAVER_MAP_ID}")
    
    url = "https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode"
    headers = {
        "X-NCP-APIGW-API-KEY-ID": NAVER_MAP_ID,
        "X-NCP-APIGW-API-KEY": NAVER_MAP_SECRET
    }
    # 테스트용 주소: 네이버 본사
    params = {"query": "경기도 성남시 분당구 정자일로 95"}

    try:
        response = requests.get(url, headers=headers, params=params)
        
        if response.status_code == 200:
            data = response.json()
            if data.get("addresses"):
                x = data["addresses"][0]["x"]
                y = data["addresses"][0]["y"]
                print(f"✅ 성공! 좌표를 가져왔습니다.")
                print(f"   - 경도(x): {x}")
                print(f"   - 위도(y): {y}")
                print("\n🎉 결론: 키는 정상입니다. .env 파일 위치나 내용이 잘못된 것이니 .env를 수정하세요.")
            else:
                print("❓ 성공은 했으나 주소를 못 찾았습니다. (키는 정상임)")
        else:
            print(f"❌ 실패! 상태 코드: {response.status_code}")
            print(f"👉 에러 메시지: {response.text}")
            
            if response.status_code == 401:
                print("\n[진단 결과: 401 Unauthorized]")
                print("1. NCP 콘솔에 로그인하세요.")
                print("2. 'AI·NAVER API' > 'Application' 메뉴로 가세요.")
                print("3. 등록된 앱의 [변경] 버튼을 누르세요.")
                print("4. **'Geocoding'** 체크박스가 켜져 있는지 눈으로 확인하세요.")
                print("5. **[저장]** 버튼을 꼭 누르셨나요?")
                print("6. Client ID와 Secret이 '검색 API' 키가 아닌지 확인하세요. (지도랑 검색은 다릅니다!)")

    except Exception as e:
        print(f"❌ 요청 중 에러 발생: {e}")

if __name__ == "__main__":
    test_geocoding()