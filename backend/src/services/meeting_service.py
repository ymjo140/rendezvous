import json
import asyncio
from datetime import datetime, timedelta
from typing import List
from sqlalchemy.orm import Session
from fastapi import BackgroundTasks

from ..core.config import settings
from ..domain import models
from ..schemas import meeting as schemas
from ..repositories.meeting_repository import MeetingRepository

# 외부 의존성
try:
    from ..core.data_provider import RealDataProvider
    from ..core.connection_manager import manager
    try:
        from ..core.transport import TransportEngine
    except ImportError:
        # Fallback (TransportEngine이 없을 경우 대비)
        class TransportEngine:
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
                import math
                R = 6371
                dLat = math.radians(lat2 - lat1)
                dLon = math.radians(lon2 - lon1)
                a = math.sin(dLat/2) * math.sin(dLat/2) + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dLon/2) * math.sin(dLon/2)
                c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
                return R * c * 1000
            @staticmethod
            def find_best_midpoint(locs): return None
except ImportError:
    class RealDataProvider:
        def __init__(self): pass
        def search_places_all_queries(self, *args): return []
    manager = None

data_provider = RealDataProvider()

class MeetingService:
    def __init__(self):
        self.repo = MeetingRepository()

    def _find_best_time_slot(self, db: Session, member_ids: List[int]) -> str:
        today = datetime.now().date()
        for i in range(14):
            target = today + timedelta(days=i)
            d_str = str(target)
            if not member_ids: return f"{d_str} 19:00"
            
            events = self.repo.get_events_by_date_and_users(db, member_ids, d_str)
            conflict = False
            for e in events:
                try:
                    h = int(e.time.split(":")[0])
                    if 18 <= h <= 21: conflict = True
                except: pass
            if not conflict: return f"{d_str} 19:00"
        return f"{today + timedelta(days=1)} 19:00"

    async def _send_system_msg(self, room_id: str, text: str):
        try:
            content = json.dumps({"type": "system", "text": text}, ensure_ascii=False)
            await manager.broadcast({
                "room_id": room_id, "user_id": 0, "name": "System", "avatar": "🤖",
                "content": content, "timestamp": datetime.now().strftime("%H:%M")
            }, room_id)
        except: pass

    # 🌟 [복구 완료] 3개 지역(핫스팟) 추천 및 거리 필터링 적용
    def get_recommendations_direct(self, db: Session, req: schemas.RecommendRequest):
        # 1. 기준 중심점 설정
        c_lat, c_lng = req.current_lat, req.current_lng
        
        if req.manual_locations:
            try:
                parts = req.manual_locations[0].split(',')
                c_lat, c_lng = float(parts[0]), float(parts[1])
            except: pass

        # 2. 중심점 근처의 핫스팟 3곳 선정
        # (단순히 현재 위치 1곳이 아니라, 주변 번화가 3개를 찾습니다)
        candidate_spots = []
        if hasattr(TransportEngine, 'SEOUL_HOTSPOTS'):
            for spot in TransportEngine.SEOUL_HOTSPOTS:
                dist = TransportEngine._haversine(c_lat, c_lng, spot['lat'], spot['lng'])
                candidate_spots.append((dist, spot))
            
            # 거리순 정렬하여 상위 3개 선택
            candidate_spots.sort(key=lambda x: x[0])
            top_3_spots = [item[1] for item in candidate_spots[:3]]
        else:
            # 핫스팟 데이터가 없으면 현재 위치를 단일 지역으로 설정
            top_3_spots = [{"name": req.location_name or "현재 위치", "lat": c_lat, "lng": c_lng}]

        final_results = []

        # 3. 각 지역별로 장소 추천 (거리 필터링 포함)
        for region in top_3_spots:
            r_name = region['name']
            r_lat = region['lat']
            r_lng = region['lng']

            # DB 검색 (해당 지역 중심 반경 2km 이내)
            places = self.repo.search_places_in_range(db, r_lat, r_lng, req.purpose)

            # 데이터 부족 시 외부 API 호출 (해당 지역 중심으로 검색)
            if len(places) < 5:
                # 검색어: "강남역 맛집", "종로3가 카페" 등 명확한 지역명 포함
                search_query = f"{r_name} {req.purpose}"
                if req.user_selected_tags:
                    search_query += f" {req.user_selected_tags[0]}"
                
                # 🌟 search_places_all_queries 사용 (거리 필터링 적용됨)
                # 여기서 r_lat, r_lng를 넘겨주어 해당 지역에서 너무 먼 곳은 거름
                api_pois = data_provider.search_places_all_queries([search_query], r_name, r_lat, r_lng)
                
                for p in api_pois:
                    if not self.repo.get_place_by_name(db, p.name):
                        try:
                            p_lat = p.location[0] if isinstance(p.location, (list, tuple)) else p.location
                            p_lng = p.location[1] if isinstance(p.location, (list, tuple)) else 0.0
                            self.repo.create_place(
                                db, p.name, p.category or req.purpose, 
                                p_lat, p_lng, 
                                p.tags, 0.0
                            )
                        except: continue
                
                try: db.commit()
                except: db.rollback()
                
                # 저장 후 재조회
                places = self.repo.search_places_in_range(db, r_lat, r_lng, req.purpose)

            # 점수 산정
            scored = []
            for p in places:
                score = (p.wemeet_rating or 0) * 10
                
                # 거리 점수 (해당 지역 중심 기준)
                dist = TransportEngine._haversine(r_lat, r_lng, p.lat, p.lng)
                if dist < 500: score += 20
                elif dist < 1000: score += 10
                elif dist > 2000: score -= 30 # 지역 중심에서 멀어지면 감점
                
                # 태그 매칭
                if p.tags and req.user_selected_tags:
                    p_tags = p.tags if isinstance(p.tags, list) else []
                    matched = len(set(p_tags) & set(req.user_selected_tags))
                    score += matched * 15
                
                scored.append((score, p))
            
            scored.sort(key=lambda x: x[0], reverse=True)
            top_places = [item[1] for item in scored[:5]] # 상위 5개

            # 결과 포매팅
            formatted_places = []
            for place in top_places:
                formatted_places.append({
                    "id": place.id,
                    "name": place.name,
                    "category": place.category,
                    "address": place.address or "",
                    "location": [place.lat, place.lng],
                    "lat": place.lat,
                    "lng": place.lng,
                    "tags": place.tags or [],
                    "image": None,
                    "score": round(score, 1)
                })
            
            # 🌟 지역(Region) 객체 생성
            final_results.append({
                "region_name": r_name,
                "lat": r_lat,
                "lng": r_lng,
                "places": formatted_places,
                "transit_info": None
            })

        return final_results

    # (이하 기존 메서드들 유지)
    async def process_background_recommendation(self, req: schemas.MeetingFlowRequest, db: Session):
        pass 

    async def run_meeting_flow(self, db: Session, req: schemas.MeetingFlowRequest, background_tasks: BackgroundTasks):
        if req.room_id:
            background_tasks.add_task(self.process_background_recommendation, req, db)
            return {"status": "accepted"}
        return {"cards": [], "recommendations": []}

    async def vote_meeting(self, db: Session, req: schemas.VoteRequest):
        msg = self.repo.get_message_by_id(db, req.message_id)
        if msg:
            data = json.loads(msg.content)
            data["vote_count"] = data.get("vote_count", 0) + 1
            msg.content = json.dumps(data, ensure_ascii=False)
            db.commit()
            await manager.broadcast({ 
                "id": msg.id, "room_id": msg.room_id, "user_id": msg.user_id, 
                "content": msg.content, "timestamp": str(msg.timestamp), 
                "name": "AI 매니저", "avatar": "🤖" 
            }, req.room_id)
        return {"status": "success"}

    async def confirm_meeting(self, db: Session, req: schemas.ConfirmRequest):
        room_members = self.repo.get_room_members(db, req.room_id)
        count = 0
        for m in room_members:
            event = schemas.EventSchema(
                user_id=m.user_id,
                title=f"📅 {req.place_name}",
                date=req.date,
                time=req.time,
                location_name=req.place_name,
                purpose=req.category
            )
            self.repo.create_event(db, event)
            count += 1
        db.commit()
        text = f"✅ {req.place_name} 약속 확정! ({count}명 캘린더 등록)"
        msg = self.repo.create_system_message(db, req.room_id, json.dumps({"text": text}, ensure_ascii=False))
        await manager.broadcast({ 
            "id": msg.id, "room_id": msg.room_id, "user_id": 1, 
            "name": "AI 매니저", "avatar": "🤖", "content": msg.content, 
            "timestamp": str(msg.timestamp) 
        }, req.room_id)
        return {"status": "success"}

    def create_event(self, db: Session, event: schemas.EventSchema):
        db_ev = self.repo.create_event(db, event)
        db.commit()
        db.refresh(db_ev)
        return db_ev

    def get_events(self, db: Session, user_id: int):
        return self.repo.get_user_events(db, user_id)

    def delete_event(self, db: Session, event_id: str):
        self.repo.delete_event(db, event_id)
        db.commit()