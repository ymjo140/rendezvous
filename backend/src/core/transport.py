import math
import requests
from sqlalchemy.orm import Session
from sqlalchemy import text
from core.config import settings

class TransportEngine:
    ODSAY_URL = "https://api.odsay.com/v1/api/searchPubTransPathT"
    
    # 🌟 서울/경기/인천 주요 거점 및 환승역
    SEOUL_HOTSPOTS = [
         # --- 1호선 ---
        {"name": "서울역", "lat": 37.5559, "lng": 126.9723, "lines": [1, 4, "공항", "KTX"]},
        {"name": "시청", "lat": 37.5657, "lng": 126.9769, "lines": [1, 2]},
        {"name": "종각", "lat": 37.5702, "lng": 126.9831, "lines": [1]},
        {"name": "종로3가", "lat": 37.5704, "lng": 126.9920, "lines": [1, 3, 5]},
        {"name": "종로5가", "lat": 37.5709, "lng": 127.0019, "lines": [1]},
        {"name": "동대문", "lat": 37.5717, "lng": 127.0113, "lines": [1, 4]},
        {"name": "동묘앞", "lat": 37.5732, "lng": 127.0165, "lines": [1, 6]},
        {"name": "신설동", "lat": 37.5760, "lng": 127.0243, "lines": [1, 2, "우이신설"]},
        {"name": "제기동", "lat": 37.5781, "lng": 127.0348, "lines": [1]},
        {"name": "청량리", "lat": 37.5801, "lng": 127.0485, "lines": [1, "경의중앙", "수인분당"]},
        {"name": "회기", "lat": 37.5894, "lng": 127.0575, "lines": [1, "경의중앙"]},
        {"name": "석계", "lat": 37.6148, "lng": 127.0656, "lines": [1, 6]},
        {"name": "남영", "lat": 37.5410, "lng": 126.9713, "lines": [1]},
        {"name": "용산", "lat": 37.5298, "lng": 126.9645, "lines": [1, "경의중앙"]},
        {"name": "노량진", "lat": 37.5142, "lng": 126.9424, "lines": [1, 9]},
        {"name": "대방", "lat": 37.5133, "lng": 126.9263, "lines": [1, "신림"]},
        {"name": "신길", "lat": 37.5170, "lng": 126.9171, "lines": [1, 5]},
        {"name": "영등포", "lat": 37.5155, "lng": 126.9076, "lines": [1]},
        {"name": "신도림", "lat": 37.5089, "lng": 126.8913, "lines": [1, 2]},
        {"name": "구로", "lat": 37.5030, "lng": 126.8819, "lines": [1]},
        {"name": "온수", "lat": 37.4922, "lng": 126.8233, "lines": [1, 7]},
        {"name": "역곡", "lat": 37.4851, "lng": 126.8115, "lines": [1]},
        {"name": "부천", "lat": 37.4840, "lng": 126.7826, "lines": [1]},
        {"name": "송내", "lat": 37.4876, "lng": 126.7536, "lines": [1]},
        {"name": "부평", "lat": 37.4894, "lng": 126.7249, "lines": [1, "인천1"]},
        {"name": "금정", "lat": 37.3720, "lng": 126.9434, "lines": [1, 4]},
        {"name": "안양", "lat": 37.4016, "lng": 126.9228, "lines": [1]},
        {"name": "수원역", "lat": 37.2656, "lng": 127.0000, "lines": [1, "수인분당"]},

        # --- 2호선 ---
        {"name": "을지로입구", "lat": 37.5660, "lng": 126.9826, "lines": [2]},
        {"name": "을지로3가", "lat": 37.5662, "lng": 126.9926, "lines": [2, 3]},
        {"name": "을지로4가", "lat": 37.5669, "lng": 126.9977, "lines": [2, 5]},
        {"name": "동대문역사문화공원", "lat": 37.5656, "lng": 127.0089, "lines": [2, 4, 5]},
        {"name": "신당", "lat": 37.5656, "lng": 127.0197, "lines": [2, 6]},
        {"name": "상왕십리", "lat": 37.5643, "lng": 127.0291, "lines": [2]},
        {"name": "왕십리", "lat": 37.5612, "lng": 127.0371, "lines": [2, 5, "수인분당", "경의중앙"]},
        {"name": "한양대", "lat": 37.5552, "lng": 127.0436, "lines": [2]},
        {"name": "뚝섬", "lat": 37.5474, "lng": 127.0473, "lines": [2]},
        {"name": "성수", "lat": 37.5445, "lng": 127.0560, "lines": [2]},
        {"name": "건대입구", "lat": 37.5407, "lng": 127.0702, "lines": [2, 7]},
        {"name": "구의", "lat": 37.5403, "lng": 127.0824, "lines": [2]},
        {"name": "강변", "lat": 37.5351, "lng": 127.0947, "lines": [2]},
        {"name": "잠실나루", "lat": 37.5207, "lng": 127.1037, "lines": [2]},
        {"name": "잠실", "lat": 37.5132, "lng": 127.1001, "lines": [2, 8]},
        {"name": "잠실새내", "lat": 37.5116, "lng": 127.0863, "lines": [2]},
        {"name": "종합운동장", "lat": 37.5109, "lng": 127.0736, "lines": [2, 9]},
        {"name": "삼성", "lat": 37.5088, "lng": 127.0631, "lines": [2]},
        {"name": "선릉", "lat": 37.5045, "lng": 127.0490, "lines": [2, "수인분당"]},
        {"name": "역삼", "lat": 37.5006, "lng": 127.0364, "lines": [2]},
        {"name": "강남", "lat": 37.4980, "lng": 127.0276, "lines": [2, "신분당"]},
        {"name": "교대", "lat": 37.4934, "lng": 127.0140, "lines": [2, 3]},
        {"name": "서초", "lat": 37.4918, "lng": 127.0076, "lines": [2]},
        {"name": "방배", "lat": 37.4814, "lng": 126.9975, "lines": [2]},
        {"name": "사당", "lat": 37.4765, "lng": 126.9815, "lines": [2, 4]},
        {"name": "낙성대", "lat": 37.4769, "lng": 126.9636, "lines": [2]},
        {"name": "서울대입구", "lat": 37.4812, "lng": 126.9527, "lines": [2]},
        {"name": "봉천", "lat": 37.4823, "lng": 126.9418, "lines": [2]},
        {"name": "신림", "lat": 37.4842, "lng": 126.9297, "lines": [2, "신림"]},
        {"name": "신대방", "lat": 37.4874, "lng": 126.9131, "lines": [2]},
        {"name": "구로디지털단지", "lat": 37.4852, "lng": 126.9014, "lines": [2]},
        {"name": "대림", "lat": 37.4925, "lng": 126.8949, "lines": [2, 7]},
        {"name": "문래", "lat": 37.5179, "lng": 126.8947, "lines": [2]},
        {"name": "영등포구청", "lat": 37.5249, "lng": 126.8959, "lines": [2, 5]},
        {"name": "당산", "lat": 37.5343, "lng": 126.9022, "lines": [2, 9]},
        {"name": "합정", "lat": 37.5489, "lng": 126.9166, "lines": [2, 6]},
        {"name": "홍대입구", "lat": 37.5575, "lng": 126.9244, "lines": [2, "공항", "경의중앙"]},
        {"name": "신촌", "lat": 37.5551, "lng": 126.9369, "lines": [2]},
        {"name": "이대", "lat": 37.5567, "lng": 126.9460, "lines": [2]},
        {"name": "아현", "lat": 37.5573, "lng": 126.9561, "lines": [2]},
        {"name": "충정로", "lat": 37.5599, "lng": 126.9636, "lines": [2, 5]},

        # --- 3호선 ---
        {"name": "연신내", "lat": 37.6190, "lng": 126.9210, "lines": [3, 6]},
        {"name": "불광", "lat": 37.6104, "lng": 126.9298, "lines": [3, 6]},
        {"name": "녹번", "lat": 37.6009, "lng": 126.9357, "lines": [3]},
        {"name": "홍제", "lat": 37.5890, "lng": 126.9437, "lines": [3]},
        {"name": "경복궁", "lat": 37.5757, "lng": 126.9735, "lines": [3]},
        {"name": "안국", "lat": 37.5765, "lng": 126.9854, "lines": [3]},
        {"name": "충무로", "lat": 37.5612, "lng": 126.9942, "lines": [3, 4]},
        {"name": "동대입구", "lat": 37.5590, "lng": 127.0056, "lines": [3]},
        {"name": "약수", "lat": 37.5543, "lng": 127.0107, "lines": [3, 6]},
        {"name": "금호", "lat": 37.5482, "lng": 127.0158, "lines": [3]},
        {"name": "옥수", "lat": 37.5414, "lng": 127.0178, "lines": [3, "경의중앙"]},
        {"name": "압구정", "lat": 37.5270, "lng": 127.0284, "lines": [3]},
        {"name": "신사", "lat": 37.5163, "lng": 127.0203, "lines": [3, "신분당"]},
        {"name": "잠원", "lat": 37.5127, "lng": 127.0112, "lines": [3]},
        {"name": "고속터미널", "lat": 37.5049, "lng": 127.0049, "lines": [3, 7, 9]},
        {"name": "남부터미널", "lat": 37.4850, "lng": 127.0162, "lines": [3]},
        {"name": "양재", "lat": 37.4841, "lng": 127.0346, "lines": [3, "신분당"]},
        {"name": "매봉", "lat": 37.4869, "lng": 127.0467, "lines": [3]},
        {"name": "도곡", "lat": 37.4909, "lng": 127.0554, "lines": [3, "수인분당"]},
        {"name": "대치", "lat": 37.4946, "lng": 127.0629, "lines": [3]},
        {"name": "수서", "lat": 37.4873, "lng": 127.1018, "lines": [3, "수인분당", "SRT"]},
        {"name": "가락시장", "lat": 37.4925, "lng": 127.1182, "lines": [3, 8]},
        {"name": "오금", "lat": 37.5021, "lng": 127.1281, "lines": [3, 5]},

        # --- 4호선 ---
        {"name": "노원", "lat": 37.6551, "lng": 127.0613, "lines": [4, 7]},
        {"name": "창동", "lat": 37.6531, "lng": 127.0477, "lines": [1, 4]},
        {"name": "수유", "lat": 37.6380, "lng": 127.0257, "lines": [4]},
        {"name": "미아사거리", "lat": 37.6132, "lng": 127.0300, "lines": [4]},
        {"name": "성신여대입구", "lat": 37.5926, "lng": 127.0170, "lines": [4, "우이신설"]},
        {"name": "한성대입구", "lat": 37.5884, "lng": 127.0060, "lines": [4]},
        {"name": "혜화", "lat": 37.5822, "lng": 127.0018, "lines": [4]},
        {"name": "명동", "lat": 37.5609, "lng": 126.9863, "lines": [4]},
        {"name": "회현", "lat": 37.5585, "lng": 126.9782, "lines": [4]},
        {"name": "숙대입구", "lat": 37.5448, "lng": 126.9715, "lines": [4]},
        {"name": "삼각지", "lat": 37.5347, "lng": 126.9731, "lines": [4, 6]},
        {"name": "신용산", "lat": 37.5291, "lng": 126.9684, "lines": [4]},
        {"name": "이촌", "lat": 37.5222, "lng": 126.9743, "lines": [4, "경의중앙"]},
        {"name": "동작", "lat": 37.5028, "lng": 126.9802, "lines": [4, 9]},
        {"name": "이수", "lat": 37.4862, "lng": 126.9819, "lines": [4, 7]},
        {"name": "과천", "lat": 37.4330, "lng": 126.9965, "lines": [4]},
        {"name": "인덕원", "lat": 37.4011, "lng": 126.9765, "lines": [4]},
        {"name": "평촌", "lat": 37.3942, "lng": 126.9638, "lines": [4]},
        {"name": "범계", "lat": 37.3897, "lng": 126.9507, "lines": [4]},
        {"name": "산본", "lat": 37.3581, "lng": 126.9333, "lines": [4]},

        # --- 5호선 ---
        {"name": "김포공항", "lat": 37.5624, "lng": 126.8013, "lines": [5, 9, "공항"]},
        {"name": "마곡", "lat": 37.5601, "lng": 126.8254, "lines": [5]},
        {"name": "발산", "lat": 37.5585, "lng": 126.8376, "lines": [5]},
        {"name": "화곡", "lat": 37.5415, "lng": 126.8404, "lines": [5]},
        {"name": "까치산", "lat": 37.5317, "lng": 126.8466, "lines": [2, 5]},
        {"name": "목동", "lat": 37.5259, "lng": 126.8649, "lines": [5]},
        {"name": "오목교", "lat": 37.5244, "lng": 126.8750, "lines": [5]},
        {"name": "여의도", "lat": 37.5215, "lng": 126.9243, "lines": [5, 9]},
        {"name": "여의나루", "lat": 37.5271, "lng": 126.9329, "lines": [5]},
        {"name": "마포", "lat": 37.5395, "lng": 126.9459, "lines": [5]},
        {"name": "공덕", "lat": 37.5435, "lng": 126.9515, "lines": [5, 6, "공항", "경의중앙"]},
        {"name": "서대문", "lat": 37.5657, "lng": 126.9666, "lines": [5]},
        {"name": "광화문", "lat": 37.5710, "lng": 126.9768, "lines": [5]},
        {"name": "청구", "lat": 37.5602, "lng": 127.0138, "lines": [5, 6]},
        {"name": "왕십리", "lat": 37.5612, "lng": 127.0371, "lines": [2, 5, "수인분당"]},
        {"name": "군자", "lat": 37.5571, "lng": 127.0794, "lines": [5, 7]},
        {"name": "아차산", "lat": 37.5516, "lng": 127.0897, "lines": [5]},
        {"name": "광나루", "lat": 37.5453, "lng": 127.1035, "lines": [5]},
        {"name": "천호", "lat": 37.5386, "lng": 127.1236, "lines": [5, 8]},
        {"name": "올림픽공원", "lat": 37.5162, "lng": 127.1309, "lines": [5, 9]},

        # --- 6호선 ---
        {"name": "응암", "lat": 37.5986, "lng": 126.9155, "lines": [6]},
        {"name": "디지털미디어시티", "lat": 37.5770, "lng": 126.9012, "lines": [6, "공항", "경의중앙"]},
        {"name": "망원", "lat": 37.5559, "lng": 126.9099, "lines": [6]},
        {"name": "합정", "lat": 37.5489, "lng": 126.9166, "lines": [2, 6]},
        {"name": "상수", "lat": 37.5477, "lng": 126.9228, "lines": [6]},
        {"name": "이태원", "lat": 37.5345, "lng": 126.9943, "lines": [6]},
        {"name": "한강진", "lat": 37.5396, "lng": 127.0017, "lines": [6]},
        {"name": "안암", "lat": 37.5863, "lng": 127.0292, "lines": [6]},
        {"name": "고려대", "lat": 37.5905, "lng": 127.0358, "lines": [6]},
        {"name": "태릉입구", "lat": 37.6179, "lng": 127.0751, "lines": [6, 7]},

        # --- 7호선 ---
        {"name": "강남구청", "lat": 37.5171, "lng": 127.0412, "lines": [7, "수인분당"]},
        {"name": "학동", "lat": 37.5142, "lng": 127.0316, "lines": [7]},
        {"name": "논현", "lat": 37.5110, "lng": 127.0214, "lines": [7, "신분당"]},
        {"name": "반포", "lat": 37.5081, "lng": 127.0115, "lines": [7]},
        {"name": "내방", "lat": 37.4876, "lng": 126.9935, "lines": [7]},
        {"name": "남구로", "lat": 37.4852, "lng": 126.8872, "lines": [7]},
        {"name": "가산디지털단지", "lat": 37.4815, "lng": 126.8825, "lines": [1, 7]},
        {"name": "철산", "lat": 37.4760, "lng": 126.8679, "lines": [7]},
        {"name": "광명사거리", "lat": 37.4792, "lng": 126.8548, "lines": [7]},
        {"name": "청담", "lat": 37.5193, "lng": 127.0518, "lines": [7]},
        {"name": "상봉", "lat": 37.5965, "lng": 127.0850, "lines": [7, "경의중앙", "경춘"]},

        # --- 8호선 ---
        {"name": "암사", "lat": 37.5499, "lng": 127.1271, "lines": [8]},
        {"name": "강동구청", "lat": 37.5303, "lng": 127.1205, "lines": [8]},
        {"name": "몽촌토성", "lat": 37.5174, "lng": 127.1123, "lines": [8]},
        {"name": "석촌", "lat": 37.5054, "lng": 127.1069, "lines": [8, 9]},
        {"name": "송파", "lat": 37.4997, "lng": 127.1121, "lines": [8]},
        {"name": "문정", "lat": 37.4858, "lng": 127.1225, "lines": [8]},
        {"name": "장지", "lat": 37.4787, "lng": 127.1261, "lines": [8]},
        {"name": "복정", "lat": 37.4700, "lng": 127.1266, "lines": [8, "수인분당"]},
        {"name": "모란", "lat": 37.4321, "lng": 127.1290, "lines": [8, "수인분당"]},

        # --- 9호선 ---
        {"name": "개화", "lat": 37.5786, "lng": 126.7981, "lines": [9]},
        {"name": "마곡나루", "lat": 37.5667, "lng": 126.8272, "lines": [9, "공항"]},
        {"name": "가양", "lat": 37.5613, "lng": 126.8544, "lines": [9]},
        {"name": "염창", "lat": 37.5469, "lng": 126.8748, "lines": [9]},
        {"name": "국회의사당", "lat": 37.5281, "lng": 126.9178, "lines": [9]},
        {"name": "흑석", "lat": 37.5087, "lng": 126.9637, "lines": [9]},
        {"name": "신반포", "lat": 37.5034, "lng": 126.9959, "lines": [9]},
        {"name": "신논현", "lat": 37.5045, "lng": 127.0250, "lines": [9, "신분당"]},
        {"name": "언주", "lat": 37.5072, "lng": 127.0338, "lines": [9]},
        {"name": "선정릉", "lat": 37.5102, "lng": 127.0438, "lines": [9, "수인분당"]},
        {"name": "삼성중앙", "lat": 37.5130, "lng": 127.0532, "lines": [9]},
        {"name": "봉은사", "lat": 37.5142, "lng": 127.0602, "lines": [9]},

        # --- 기타 (경기/인천/공항철도/신분당 등) ---
        {"name": "판교", "lat": 37.3947, "lng": 127.1112, "lines": ["신분당"]},
        {"name": "이매", "lat": 37.3955, "lng": 127.1282, "lines": ["수인분당"]},
        {"name": "야탑", "lat": 37.4125, "lng": 127.1286, "lines": ["수인분당"]},
        {"name": "서현", "lat": 37.3830, "lng": 127.1217, "lines": ["수인분당"]},
        {"name": "정자", "lat": 37.3670, "lng": 127.1080, "lines": ["신분당"]},
        {"name": "미금", "lat": 37.3500, "lng": 127.1089, "lines": ["신분당"]},
        {"name": "오리", "lat": 37.3399, "lng": 127.1090, "lines": ["수인분당"]},
        {"name": "죽전", "lat": 37.3247, "lng": 127.1073, "lines": ["수인분당"]},
        {"name": "보정", "lat": 37.3133, "lng": 127.1081, "lines": ["수인분당"]},
        {"name": "기흥", "lat": 37.2754, "lng": 127.1159, "lines": ["수인분당"]},
        {"name": "광교중앙", "lat": 37.2886, "lng": 127.0520, "lines": ["신분당"]},
        {"name": "동탄", "lat": 37.1994, "lng": 127.0966, "lines": ["SRT"]},
        {"name": "송도", "lat": 37.3866, "lng": 126.6392, "lines": ["인천1"]},
        {"name": "일산(정발산)", "lat": 37.6592, "lng": 126.7734, "lines": [3]},
        {"name": "대화", "lat": 37.6760, "lng": 126.7472, "lines": [3]},
        {"name": "구리", "lat": 37.6033, "lng": 127.1438, "lines": ["8"]},
        {"name": "의정부", "lat": 37.7386, "lng": 127.0460, "lines": [1]}
    ]

    @staticmethod
    def _haversine(lat1, lon1, lat2, lon2):
        R = 6371
        dLat = math.radians(lat2 - lat1)
        dLon = math.radians(lon2 - lon1)
        a = math.sin(dLat/2) * math.sin(dLat/2) + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) * math.sin(dLon/2)
        c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
        return R * c * 1000

    @staticmethod
    def get_nearest_hotspot(lat, lng):
        """좌표에서 가장 가까운 핫스팟(지하철역)을 찾아서 이름 반환"""
        nearest = None
        min_dist = float('inf')
        for spot in TransportEngine.SEOUL_HOTSPOTS:
            dist = TransportEngine._haversine(lat, lng, spot["lat"], spot["lng"])
            if dist < min_dist:
                min_dist = dist
                nearest = spot
        return nearest, min_dist

    # 🌟 [핵심] DB 캐시 확인 -> 없으면 API 호출 -> DB 저장
    @staticmethod
    def get_transit_time(db: Session, start_name: str, end_name: str, sx, sy, ex, ey):
        if start_name == end_name:
            return 0

        # 1. 캐시 테이블 조회
        # (DB에는 양방향 모두 저장되어 있을 수 있으므로 두 가지 키 확인)
        cache_keys = [f"{start_name}_{end_name}", f"{end_name}_{start_name}"]
        
        try:
            query = text("SELECT total_time FROM travel_time_cache WHERE id = :id1 OR id = :id2")
            result = db.execute(query, {"id1": cache_keys[0], "id2": cache_keys[1]}).fetchone()
            if result:
                return result[0]
        except Exception as e:
            print(f"Cache Read Error: {e}")

        # 2. 캐시 없으면 ODsay API 호출
        if not settings.ODSAY_API_KEY:
            return None 

        params = { "SX": sx, "SY": sy, "EX": ex, "EY": ey, "apiKey": settings.ODSAY_API_KEY }
        try:
            res = requests.get(TransportEngine.ODSAY_URL, params=params, timeout=3)
            if res.status_code == 200:
                data = res.json()
                if "result" in data and "path" in data["result"]:
                    best_path = min(data["result"]["path"], key=lambda x: x["info"]["totalTime"])
                    time_min = best_path["info"]["totalTime"]

                    # 3. 결과 DB 저장 (Caching)
                    try:
                        insert_query = text("""
                            INSERT INTO travel_time_cache (id, start_name, end_name, total_time, created_at)
                            VALUES (:id, :start, :end, :time, NOW())
                            ON CONFLICT (id) DO NOTHING
                        """)
                        db.execute(insert_query, {"id": cache_keys[0], "start": start_name, "end": end_name, "time": time_min})
                        db.commit()
                    except Exception as e:
                        print(f"Cache Save Error: {e}")
                        db.rollback()
                    
                    return time_min
        except:
            pass
        return None

    # 🚀 캐시 일괄 로드 — (핫스팟 191 × 멤버) 개별 SELECT 수백 번 → 쿼리 1번
    @staticmethod
    def _load_time_cache_bulk(db: Session, start_names: set) -> dict:
        if not start_names:
            return {}
        try:
            rows = db.execute(
                text("SELECT id, total_time FROM travel_time_cache WHERE start_name = ANY(:names) OR end_name = ANY(:names)"),
                {"names": list(start_names)},
            ).fetchall()
            return {r[0]: r[1] for r in rows}
        except Exception as e:
            print(f"Cache Bulk Read Error: {e}")
            return {}

    # 🌟 [알고리즘 수정] Sum 대신 Min-Max (최대 소요시간 최소화) 적용
    @staticmethod
    def find_best_midpoints(db: Session, users_locations: list):
        candidates = []

        # 유저별 최근접 허브는 핫스팟 루프와 무관 → 선계산 후 캐시 일괄 로드
        user_nodes = []
        for u_loc in users_locations:
            node, dist = TransportEngine.get_nearest_hotspot(u_loc['lat'], u_loc['lng'])
            user_nodes.append((u_loc, node, dist))
        start_names = {n['name'] for (_u, n, d) in user_nodes if n and d < 2000}
        time_cache = TransportEngine._load_time_cache_bulk(db, start_names)
        # 캐시 미스 시 ODSAY 실호출은 요청당 상한(각 3초 timeout) — 초과분은 거리 추산으로.
        # 호출된 결과는 travel_time_cache에 저장되므로 요청이 반복될수록 커버리지가 차오름.
        odsay_budget = 8

        for spot in TransportEngine.SEOUL_HOTSPOTS:
            times = []

            for (u_loc, start_node, dist) in user_nodes:
                time_cost = None
                if start_node and dist < 2000:
                    if start_node['name'] == spot['name']:
                        time_cost = 0
                    else:
                        k1 = f"{start_node['name']}_{spot['name']}"
                        k2 = f"{spot['name']}_{start_node['name']}"
                        if k1 in time_cache:
                            time_cost = time_cache[k1]
                        elif k2 in time_cache:
                            time_cost = time_cache[k2]
                        elif odsay_budget > 0:
                            odsay_budget -= 1
                            time_cost = TransportEngine.get_transit_time(
                                db, start_node['name'], spot['name'],
                                start_node['lng'], start_node['lat'],
                                spot['lng'], spot['lat']
                            )
                            if time_cost is not None:
                                time_cache[k1] = time_cost

                # 실패 시 거리 기반 추산
                if time_cost is None:
                    direct_dist = TransportEngine._haversine(u_loc['lat'], u_loc['lng'], spot['lat'], spot['lng'])
                    time_cost = (direct_dist / 1000) * 15

                times.append(time_cost)
            
            if not times: continue

            # 🌟 점수 계산 로직 변경 (핵심!)
            # 1순위: 가장 오래 걸리는 사람의 시간 (Max Time) -> 낮을수록 좋음 (공평함)
            # 2순위: 총 이동 시간 평균 (Avg Time) -> 낮을수록 좋음 (효율성)
            max_t = max(times)
            avg_t = sum(times) / len(times)
            
            # Max Time에 가중치를 많이 둠 (80% Max, 20% Avg)
            score = (max_t * 0.8) + (avg_t * 0.2)
            
            candidates.append({
                "spot": spot,
                "score": score,
                "travel_times": times  # 🆕 각 출발지별 이동 시간 저장
            })
        
        # 점수가 낮은 순(시간이 적게 걸리는 순)으로 정렬
        candidates.sort(key=lambda x: x["score"])
        
        # 🆕 이동 시간 정보도 함께 반환
        return [{
            "name": c["spot"]["name"],
            "lat": c["spot"]["lat"],
            "lng": c["spot"]["lng"],
            "travel_times": [int(t) for t in c["travel_times"]]  # 각 출발지별 소요시간 (분)
        } for c in candidates[:3]]