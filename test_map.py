import requests
import urllib.parse

# 👇 여기에 네이버 클라우드에서 복사한 값을 직접 붙여넣으세요 (환경변수 X)
client_id = "9v6ryi96pr"  # 사용자님이 알려주신 ID
client_secret = "SWzbnHxWxlEJLNAC0oRu58qkSrIXonCHAp6tAoO4" # Secret 값 (gvpX...로 시작하는거)

headers = {
    "X-NCP-APIGW-API-KEY-ID": client_id,
    "X-NCP-APIGW-API-KEY": client_secret
}

def test_geocoding():
    query = "롯데리아"
    url = f"https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode?query={urllib.parse.quote(query)}"
    
    print(f"🚀 테스트 시작: ID={client_id}")
    
    try:
        response = requests.get(url, headers=headers)
        print(f"📡 응답 코드: {response.status_code}")
        
        if response.status_code == 200:
            data = response.json()
            if data.get('addresses'):
                print(f"✅ 성공! 좌표: {data['addresses'][0]['y']}, {data['addresses'][0]['x']}")
            else:
                print("⚠️ 성공했으나 검색 결과 없음 (키는 정상)")
        else:
            print(f"❌ 실패: {response.text}")
            print("👉 원인: 키 값이 틀렸거나, Geocoding 체크가 안 됨")
            
    except Exception as e:
        print(f"에러 발생: {e}")

if __name__ == "__main__":
    test_geocoding()