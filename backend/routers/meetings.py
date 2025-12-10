import random
import numpy as np
import json
import re
import requests
import math
from datetime import datetime, timedelta, time
from typing import List, Optional, Dict, Any

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session
from sqlalchemy import or_
from pydantic import BaseModel, ConfigDict
import google.generativeai as genai

import models
import algorithm as agora_algo
from data_provider import RealDataProvider
from dependencies import get_db, get_current_user
from constants import (
    NAVER_SEARCH_ID, NAVER_SEARCH_SECRET, NAVER_MAP_ID, NAVER_MAP_SECRET, 
    GEMINI_API_KEY, ODSAY_API_KEY, PURPOSE_CONFIG, TAG_KEYWORD_EXPANSIONS, PURPOSE_DURATIONS
)

genai.configure(api_key=GEMINI_API_KEY)
data_provider = RealDataProvider(NAVER_SEARCH_ID, NAVER_SEARCH_SECRET, NAVER_MAP_ID, NAVER_MAP_SECRET)

router = APIRouter()

# 🌟 [1] 백업 좌표 리스트 (1~9호선 및 주요 거점 완비)
FALLBACK_COORDINATES = {
    # 1호선
    "서울역": (37.5559, 126.9723), "시청": (37.5657, 126.9769), "종각": (37.5702, 126.9831),
    "종로3가": (37.5704, 126.9920), "종로5가": (37.5709, 127.0019), "동대문": (37.5717, 127.0113),
    "신설동": (37.5760, 127.0243), "제기동": (37.5781, 127.0348), "청량리": (37.5801, 127.0485),
    "회기": (37.5894, 127.0575), "외대앞": (37.5961, 127.0635), "신이문": (37.6017, 127.0671),
    "석계": (37.6148, 127.0656), "광운대": (37.6236, 127.0617), "월계": (37.6331, 127.0588),
    "녹천": (37.6445, 127.0513), "창동": (37.6531, 127.0477), "방학": (37.6677, 127.0443),
    "도봉": (37.6795, 127.0455), "도봉산": (37.6895, 127.0461), "남영": (37.5410, 126.9713),
    "용산": (37.5298, 126.9645), "노량진": (37.5142, 126.9424), "대방": (37.5133, 126.9263),
    "신길": (37.5170, 126.9171), "영등포": (37.5155, 126.9076), "신도림": (37.5089, 126.8913),
    "구로": (37.5030, 126.8819), "가산디지털단지": (37.4815, 126.8825), "금천구청": (37.4559, 126.8943),
    "안양": (37.4016, 126.9228), "수원": (37.2656, 127.0000), "석수": (37.4357, 126.9026), "관악": (37.4193, 126.9090),
    "명학": (37.3846, 126.9351), "금정": (37.3721, 126.9434), "군포": (37.3535, 126.9483),
    "당정": (37.3444, 126.9484), "의왕": (37.3208, 126.9482), "성균관대": (37.2998, 126.9705), "화서": (37.2839, 126.9888),
    
    # 2호선
    "강남": (37.4980, 127.0276), "역삼": (37.5006, 127.0364), "선릉": (37.5045, 127.0490),
    "삼성": (37.5088, 127.0631), "종합운동장": (37.5109, 127.0736), "잠실새내": (37.5116, 127.0863),
    "잠실": (37.5132, 127.1001), "잠실나루": (37.5207, 127.1037), "강변": (37.5351, 127.0946),
    "구의": (37.5370, 127.0859), "건대입구": (37.5407, 127.0702), "성수": (37.5445, 127.0560),
    "뚝섬": (37.5471, 127.0473), "한양대": (37.5552, 127.0436), "왕십리": (37.5612, 127.0371),
    "상왕십리": (37.5643, 127.0296), "신당": (37.5656, 127.0196), "동대문역사문화공원": (37.5651, 127.0078),
    "을지로4가": (37.5666, 126.9980), "을지로3가": (37.5662, 126.9926), "을지로입구": (37.5660, 126.9826),
    "충정로": (37.5599, 126.9636), "아현": (37.5573, 126.9561), "이대": (37.5567, 126.9460),
    "신촌": (37.5551, 126.9369), "홍대입구": (37.5575, 126.9244), "합정": (37.5489, 126.9166),
    "당산": (37.5343, 126.9022), "영등포구청": (37.5249, 126.8959), "문래": (37.5179, 126.8947),
    "대림": (37.4925, 126.8949), "구로디지털단지": (37.4852, 126.9014), "신대방": (37.4874, 126.9131),
    "신림": (37.4842, 126.9297), "봉천": (37.4823, 126.9416), "서울대입구": (37.4812, 126.9527),
    "낙성대": (37.4769, 126.9636), "사당": (37.4765, 126.9815), "방배": (37.4814, 126.9975),
    "서초": (37.4918, 127.0076), "교대": (37.4934, 127.0140),

    # 3호선
    "연신내": (37.6190, 126.9210), "불광": (37.6104, 126.9298), "녹번": (37.6009, 126.9357),
    "홍제": (37.5890, 126.9437), "무악재": (37.5822, 126.9502), "독립문": (37.5745, 126.9583),
    "경복궁": (37.5757, 126.9735), "안국": (37.5765, 126.9854), "충무로": (37.5612, 126.9942),
    "동대입구": (37.5590, 127.0056), "약수": (37.5543, 127.0107), "금호": (37.5480, 127.0158),
    "옥수": (37.5414, 127.0178), "압구정": (37.5270, 127.0284), "신사": (37.5163, 127.0203),
    "잠원": (37.5127, 127.0112), "고속터미널": (37.5049, 127.0049), "남부터미널": (37.4850, 127.0161),
    "양재": (37.4841, 127.0346), "매봉": (37.4869, 127.0467), "도곡": (37.4902, 127.0551),
    "대치": (37.4946, 127.0636), "학여울": (37.4966, 127.0714), "대청": (37.4935, 127.0795),
    "일원": (37.4836, 127.0843), "수서": (37.4873, 127.1018), "가락시장": (37.4925, 127.1182),
    "지축": (37.6480, 126.9139), "구파발": (37.6367, 126.9188), "경찰병원": (37.4959, 127.1264),
    "오금": (37.5021, 127.1281),

    # 4호선
    "노원": (37.6551, 127.0613), "창동": (37.6531, 127.0477), "쌍문": (37.6486, 127.0347),
    "수유": (37.6380, 127.0257), "미아": (37.6296, 127.0264), "미아사거리": (37.6132, 127.0300),
    "길음": (37.6034, 127.0250), "성신여대입구": (37.5926, 127.0170), "한성대입구": (37.5884, 127.0060),
    "혜화": (37.5822, 127.0018), "명동": (37.5609, 126.9863), "회현": (37.5585, 126.9782),
    "숙대입구": (37.5448, 126.9721), "삼각지": (37.5347, 126.9731), "신용산": (37.5291, 126.9679),
    "이촌": (37.5222, 126.9743), "동작": (37.5028, 126.9793), "이수": (37.4862, 126.9819),
    "사당": (37.4765, 126.9815), "남태령": (37.4638, 126.9891), "선바위": (37.4515, 127.0023),
    "경마공원": (37.4439, 127.0078), "대공원": (37.4357, 127.0065), "과천": (37.4330, 126.9965),
    "정부과천청사": (37.4261, 126.9896), "인덕원": (37.4010, 126.9765), "평촌": (37.3942, 126.9638),
    "범계": (37.3897, 126.9507), "당고개": (37.6702, 127.0794), "상계": (37.6608, 127.0735), "산본": (37.3581, 126.9333),

    # 5호선
    "김포공항": (37.5624, 126.8013), "마곡": (37.5601, 126.8254), "발산": (37.5585, 126.8376),
    "화곡": (37.5415, 126.8404), "까치산": (37.5317, 126.8466), "신정": (37.5249, 126.8561),
    "목동": (37.5259, 126.8648), "오목교": (37.5244, 126.8750), "양평": (37.5256, 126.8861),
    "영등포구청": (37.5249, 126.8959), "영등포시장": (37.5226, 126.9051), "여의도": (37.5215, 126.9243),
    "여의나루": (37.5270, 126.9329), "마포": (37.5395, 126.9459), "공덕": (37.5435, 126.9515),
    "애오개": (37.5537, 126.9568), "서대문": (37.5657, 126.9666), "광화문": (37.5710, 126.9768),
    "청구": (37.5602, 127.0138), "왕십리": (37.5612, 127.0371), "마장": (37.5661, 127.0429),
    "답십리": (37.5667, 127.0527), "장한평": (37.5614, 127.0646), "군자": (37.5571, 127.0794),
    "아차산": (37.5516, 127.0897), "광나루": (37.5453, 127.1035), "천호": (37.5386, 127.1236),
    "강동": (37.5358, 127.1324), "올림픽공원": (37.5162, 127.1309), "방화": (37.5774, 126.8127),
    "개화산": (37.5723, 126.8061), "송정": (37.5611, 126.8113), "우장산": (37.5487, 126.8363),
    "신길": (37.5170, 126.9171), "충정로": (37.5599, 126.9636), "신금호": (37.5545, 127.0203),
    "행당": (37.5573, 127.0294), "길동": (37.5378, 127.1400), "굽은다리": (37.5454, 127.1428),
    "명일": (37.5513, 127.1439), "고덕": (37.5550, 127.1541), "상일동": (37.5567, 127.1664),
    "둔촌동": (37.5277, 127.1362), "방이": (37.5088, 127.1261), "개롱": (37.4980, 127.1347),
    "거여": (37.4931, 127.1441), "마천": (37.4949, 127.1527),

    # 6호선
    "합정": (37.5489, 126.9166), "망원": (37.5559, 126.9099), "상수": (37.5477, 126.9229),
    "광흥창": (37.5474, 126.9324), "대흥": (37.5477, 126.9420), "효창공원앞": (37.5392, 126.9613),
    "삼각지": (37.5347, 126.9731), "녹사평": (37.5346, 126.9866), "이태원": (37.5345, 126.9943),
    "한강진": (37.5396, 127.0017), "한남(오거리)": (37.5340, 127.0060), "버티고개": (37.5480, 127.0070),
    "약수": (37.5543, 127.0107), "신당": (37.5656, 127.0196), "동묘앞": (37.5732, 127.0165),
    "보문": (37.5852, 127.0193), "안암": (37.5863, 127.0292), "고려대": (37.5905, 127.0358),
    "석계": (37.6148, 127.0656), "태릉입구": (37.6179, 127.0751), "응암": (37.5986, 126.9155),
    "역촌": (37.6060, 126.9227), "불광": (37.6104, 126.9298), "독바위": (37.6184, 126.9330),
    "구산": (37.6113, 126.9171), "새절": (37.5911, 126.9136), "증산": (37.5838, 126.9096),
    "디지털미디어시티": (37.5774, 126.8995), "월드컵경기장": (37.5695, 126.8990),
    "마포구청": (37.5635, 126.9033), "공덕": (37.5435, 126.9515), "청구": (37.5602, 127.0138),
    "창신": (37.5796, 127.0152), "월곡": (37.6019, 127.0413), "상월곡": (37.6063, 127.0484),
    "돌곶이": (37.6105, 127.0564), "화랑대": (37.6200, 127.0845), "봉화산": (37.6172, 127.0910),
    "신내": (37.6128, 127.1033),

    # 7호선
    "건대입구": (37.5407, 127.0702), "강남구청": (37.5171, 127.0412), "학동": (37.5142, 127.0316),
    "논현": (37.5110, 127.0214), "반포": (37.5081, 127.0116), "고속터미널": (37.5049, 127.0049),
    "내방": (37.4876, 126.9935), "이수": (37.4862, 126.9819), "숭실대입구": (37.4960, 126.9537),
    "상도": (37.5028, 126.9479), "신대방삼거리": (37.4997, 126.9282), "보라매": (37.4998, 126.9204),
    "대림": (37.4925, 126.8949), "가산디지털단지": (37.4815, 126.8825), "철산": (37.4760, 126.8679),
    "광명사거리": (37.4792, 126.8548), "장암": (37.7001, 127.0531), "수락산": (37.6778, 127.0553),
    "마들": (37.6649, 127.0577), "중계": (37.6445, 127.0643), "하계": (37.6363, 127.0679),
    "공릉": (37.6257, 127.0728), "먹골": (37.6106, 127.0777), "중화": (37.6025, 127.0794),
    "상봉": (37.5965, 127.0850), "면목": (37.5885, 127.0875), "사가정": (37.5808, 127.0884),
    "용마산": (37.5736, 127.0867), "중곡": (37.5659, 127.0843), "어린이대공원": (37.5479, 127.0746),
    "뚝섬유원지": (37.5315, 127.0667), "청담": (37.5193, 127.0533), "남성": (37.4845, 126.9712),
    "장승배기": (37.5048, 126.9391), "신풍": (37.5000, 126.9099), "남구로": (37.4860, 126.8872),
    "천왕": (37.4866, 126.8387), "온수": (37.4922, 126.8233),

    # 8호선
    "암사": (37.5499, 127.1271), "천호": (37.5386, 127.1236), "강동구청": (37.5303, 127.1205),
    "몽촌토성": (37.5174, 127.1123), "석촌": (37.5054, 127.1069), "송파": (37.4997, 127.1121),
    "문정": (37.4858, 127.1225), "장지": (37.4787, 127.1261), "복정": (37.4700, 127.1266),
    "모란": (37.4321, 127.1290), "가락시장": (37.4925, 127.1182), "산성": (37.4571, 127.1499),
    "남한산성입구": (37.4515, 127.1598), "단대오거리": (37.4452, 127.1568),
    "신흥": (37.4409, 127.1473), "수진": (37.4374, 127.1408),

    # 9호선
    "김포공항": (37.5624, 126.8013), "마곡나루": (37.5667, 126.8272), "가양": (37.5613, 126.8544),
    "염창": (37.5469, 126.8749), "당산": (37.5343, 126.9022), "국회의사당": (37.5281, 126.9178),
    "여의도": (37.5215, 126.9243), "노량진": (37.5142, 126.9424), "흑석": (37.5087, 126.9637),
    "동작": (37.5028, 126.9793), "고속터미널": (37.5049, 127.0049), "신논현": (37.5045, 127.0250),
    "언주": (37.5072, 127.0338), "선정릉": (37.5102, 127.0438), "봉은사": (37.5142, 127.0602),
    "종합운동장": (37.5109, 127.0736), "석촌": (37.5054, 127.1069), "올림픽공원": (37.5162, 127.1309),
    "개화": (37.5786, 126.7974), "공항시장": (37.5637, 126.8106), "신방화": (37.5675, 126.8166),
    "마곡나루": (37.5667, 126.8272), "양천향교": (37.5683, 126.8413), "증미": (37.5574, 126.8619),
    "등촌": (37.5506, 126.8656), "신목동": (37.5442, 126.8830), "선유도": (37.5380, 126.8932),
    "샛강": (37.5172, 126.9284), "노들": (37.5128, 126.9532), "구반포": (37.5013, 126.9873),
    "신반포": (37.5034, 126.9959), "사평": (37.5042, 127.0152), "삼성중앙": (37.5129, 127.0530),
    "삼전": (37.5048, 127.0877), "석촌고분": (37.5023, 127.0963), "송파나루": (37.5101, 127.1131),
    "한성백제": (37.5168, 127.1182), "둔촌오륜": (37.5196, 127.1387), "중앙보훈병원": (37.5296, 127.1427),

    # 분당선, 신분당선, 경의중앙 등 주요 거점
    "판교": (37.3947, 127.1112), "정자": (37.3670, 127.1081), "서현": (37.3837, 127.1222),
    "이매": (37.3957, 127.1283), "야탑": (37.4111, 127.1286), "서울숲": (37.5436, 127.0446),
    "압구정로데오": (37.5273, 127.0405), "한티": (37.4962, 127.0528), "도곡": (37.4902, 127.0551),
    "구룡": (37.4868, 127.0588), "개포동": (37.4891, 127.0661), "대모산입구": (37.4913, 127.0727),
    "수서": (37.4873, 127.1018), "미금": (37.3500, 127.1089), "오리": (37.3398, 127.1095),
    "죽전": (37.3247, 127.1073), "보정": (37.3129, 127.1082), "기흥": (37.2754, 127.1159),
    "광교중앙": (37.2886, 127.0520), "동탄": (37.1994, 127.0966), "송도": (37.3866, 126.6392),
    "일산(정발산)": (37.6592, 126.7734), "대화": (37.6760, 126.7472), "구리": (37.6033, 127.1438),
    "의정부": (37.7386, 127.0460)
}

def get_fuzzy_coordinate(place_name: str):
    for key, coords in FALLBACK_COORDINATES.items():
        if key in place_name: return coords
    return 0.0, 0.0

def find_nearest_hotspot_local(lat: float, lng: float):
    min_dist = float('inf')
    best_place = "중간지점"
    for name, coords in FALLBACK_COORDINATES.items():
        dist = (coords[0] - lat)**2 + (coords[1] - lng)**2
        if dist < min_dist:
            min_dist = dist
            best_place = name
    return best_place

# 🌟 [디버깅] ODsay API 호출 함수
def get_transit_time(sx, sy, ex, ey):
    if not ODSAY_API_KEY:
        print("❌ [ODsay] API Key Missing!")
        return None

    try:
        url = "https://api.odsay.com/v1/api/searchPubTransPathT"
        params = { "SX": sx, "SY": sy, "EX": ex, "EY": ey, "apiKey": ODSAY_API_KEY }
        
        # 🌟 헤더 추가 (CORS 우회) - 중요!
        headers = { "Referer": "http://127.0.0.1" }
        
        print(f"📡 [ODsay Request] {sx},{sy} -> {ex},{ey}")
        res = requests.get(url, params=params, headers=headers, timeout=5)
        
        if res.status_code == 200:
            data = res.json()
            if "result" in data and "path" in data["result"]:
                time_cost = data["result"]["path"][0]["info"]["totalTime"]
                print(f"✅ [ODsay Success] Time: {time_cost} min")
                return time_cost
            else:
                print(f"⚠️ [ODsay No Path] Response: {str(data)[:100]}...")
                return None
        else:
            print(f"🔥 [ODsay Error] Status: {res.status_code}, Body: {res.text}")
            return None
    except Exception as e:
        print(f"🔥 [ODsay Exception] {e}")
        return None

# 🌟 [핵심] Top 3 중간 지점 찾기
def find_top_3_midpoints_odsay(participants, default_lat, default_lng):
    print(f"🔍 [Midpoint] Participants: {len(participants)}")
    
    if not participants:
        print("⚠️ No participants, using default location.")
        return [("내 주변", default_lat, default_lng)]

    avg_lat = sum(p['lat'] for p in participants) / len(participants)
    avg_lng = sum(p['lng'] for p in participants) / len(participants)
    print(f"📍 Center Point: {avg_lat}, {avg_lng}")

    # 1. 1차 후보군 (직선거리 가까운 10개)
    candidates = []
    for name, coords in FALLBACK_COORDINATES.items():
        dist = (coords[0] - avg_lat)**2 + (coords[1] - avg_lng)**2
        candidates.append((dist, name, coords))
    
    candidates.sort(key=lambda x: x[0])
    top_candidates = candidates[:10] # 후보군 10개
    print(f"📍 Candidates: {[c[1] for c in top_candidates]}")

    # 2. 시간 계산
    scored_candidates = []
    for _, name, coords in top_candidates:
        max_time = 0
        valid_cnt = 0
        
        for p in participants:
            time_mins = get_transit_time(p['lng'], p['lat'], coords[1], coords[0])
            
            if time_mins is not None:
                if time_mins > max_time: max_time = time_mins
                valid_cnt += 1
            else:
                # API 실패 시 직선 거리 페널티
                dist = ((p['lat']-coords[0])**2 + (p['lng']-coords[1])**2)**0.5
                estimated_time = 30 + (dist * 1500) 
                if estimated_time > max_time: max_time = estimated_time

        # 성공 횟수 가산점
        final_score = max_time - (valid_cnt * 10)
        scored_candidates.append((final_score, name, coords))

    # 3. 정렬
    scored_candidates.sort(key=lambda x: x[0])
    
    final_regions = []
    # 1, 2순위
    for i in range(min(2, len(scored_candidates))):
        c = scored_candidates[i]
        final_regions.append((c[1], c[2][0], c[2][1]))

    # 3순위 (지리적 중심 보정)
    geo_name = top_candidates[0][1] 
    existing_names = [r[0] for r in final_regions]
    
    if geo_name not in existing_names:
        coords = FALLBACK_COORDINATES.get(geo_name)
        if coords: final_regions.append((geo_name, coords[0], coords[1]))
    elif len(scored_candidates) > 2:
        c = scored_candidates[2]
        final_regions.append((c[1], c[2][0], c[2][1]))

    print(f"🏆 Final Regions: {final_regions}")
    return final_regions

# --- Request Models ---
class RecommendRequest(BaseModel):
    users: List[Any] = []
    purpose: str = "식사"
    location_name: str = ""
    friend_location_manual: Optional[str] = None
    manual_locations: List[str] = [] 
    user_selected_tags: List[str] = []
    current_lat: float = 37.566
    current_lng: float = 126.978
    
class NlpRequest(BaseModel): text: str
class AvailabilityRequest(BaseModel): user_ids: List[int]; days_to_check: int = 7
class EventSchema(BaseModel): id: Optional[str] = None; user_id: int; title: str; date: str; time: str; duration_hours: float = 1.5; location_name: Optional[str] = None; purpose: str; model_config = ConfigDict(from_attributes=True)
class ParticipantSchema(BaseModel): id: int; name: str; lat: float; lng: float; transport: str = "subway"; history_poi_ids: List[int] = []
class MeetingFlowRequest(BaseModel): room_id: Optional[str] = None; participants: List[ParticipantSchema] = []; purpose: str = "식사"; user_tags: List[str] = []; existing_midpoints: Optional[List[Dict[str, Any]]] = None; days_to_check: int = 7; manual_locations: List[str] = []

# --- Helper Functions ---
def save_place_to_db(db: Session, poi_list: List[Any], center_lat: float, center_lng: float):
    for p in poi_list:
        try:
            p_lat = float(p.location[0])
            p_lng = float(p.location[1])
        except: continue

        # 🌟 거리 검증: 중심점으로부터 3km 이상 떨어진 곳은 저장 안 함
        dist = ((p_lat - center_lat)**2 + (p_lng - center_lng)**2)**0.5
        if dist > 0.03: continue

        existing = db.query(models.Place).filter(models.Place.name == p.name).first()
        is_duplicate = False
        
        if existing:
            if abs(existing.lat - p_lat) < 0.0005 and abs(existing.lng - p_lng) < 0.0005: 
                is_duplicate = True
        
        if not is_duplicate:
            addr = getattr(p, 'address', '주소 정보 없음')
            new_place = models.Place(name=p.name, category=p.category, tags=p.tags, lat=p_lat, lng=p_lng, wemeet_rating=p.avg_rating, address=addr)
            db.add(new_place)
    try: db.commit()
    except: db.rollback()

def search_places_in_db(db: Session, region_name: str, keywords: List[str], allowed_types: List[str]) -> List[Any]:
    lat, lng = data_provider.get_coordinates(region_name)
    if lat == 0.0: lat, lng = get_fuzzy_coordinate(region_name)
    if lat == 0.0: return []

    lat_min, lat_max = lat - 0.02, lat + 0.02
    lng_min, lng_max = lng - 0.02, lng + 0.02

    places_in_range = db.query(models.Place).filter(models.Place.lat.between(lat_min, lat_max), models.Place.lng.between(lng_min, lng_max)).all()
    candidates = []
    
    for p in places_in_range:
        dist = ((p.lat - lat)**2 + (p.lng - lng)**2)**0.5
        if dist > 0.02: continue 
        is_keyword_match = False
        tags_list = p.tags if isinstance(p.tags, list) else []
        for kw in keywords:
            if kw in p.name or any(kw in t for t in tags_list): is_keyword_match = True; break
        
        if is_keyword_match: pass
        elif allowed_types:
            if p.category not in allowed_types: continue
        
        candidates.append(agora_algo.POI(id=p.id, name=p.name, category=p.category, tags=p.tags, location=np.array([p.lat, p.lng]), price_level=2, avg_rating=p.wemeet_rating or 4.0))
    return candidates

def expand_tags_to_keywords(purpose: str, user_tags: List[str], region_name: str = "") -> List[str]:
    keywords = []
    base_keywords = []
    if user_tags:
        for tag in user_tags:
            if tag in TAG_KEYWORD_EXPANSIONS: base_keywords.extend(TAG_KEYWORD_EXPANSIONS[tag][:5])
            base_keywords.append(tag)
    else: base_keywords = PURPOSE_CONFIG.get(purpose, {}).get("keywords", ["맛집"])
    
    if region_name and region_name not in ["내 주변", "중간지점", "지리적 중간"]:
        clean_region = region_name.split('(')[0].strip()
        keywords = [f"{clean_region} {kw}" for kw in base_keywords]
    else: keywords = base_keywords
    return list(dict.fromkeys(keywords))

def _format_pois(pois):
    return [{"id": p.id, "name": p.name, "category": p.category, "score": max(0.1, p.avg_rating), "tags": p.tags, "location": [p.location[0], p.location[1]]} for p in pois]

def compute_availability_slots(user_ids: List[int], days_to_check: int, db: Session, required_duration: float = 1.5) -> List[str]:
    events = db.query(models.Event).filter(models.Event.user_id.in_(user_ids)).all()
    booked_slots = set()
    for ev in events:
        try:
            start_dt = datetime.strptime(f"{ev.date} {ev.time}", "%Y-%m-%d %H:%M")
            blocks = int(ev.duration_hours * 2)
            curr = start_dt
            for _ in range(blocks): booked_slots.add(curr.strftime("%Y-%m-%d %H:%M")); curr += timedelta(minutes=30)
        except: continue
    avail = []
    curr_date = datetime.now().date(); end_date = curr_date + timedelta(days=days_to_check)
    while curr_date <= end_date:
        for h in range(11, 22): 
            for m in [0, 30]:
                start_check = datetime.combine(curr_date, time(h, m))
                if start_check < datetime.now(): continue
                if start_check.strftime("%Y-%m-%d %H:%M") not in booked_slots: avail.append(start_check.strftime("%Y-%m-%d %H:%M"))
        curr_date += timedelta(days=1)
    return avail

# --- Main Logic ---
def run_group_recommendation(req: RecommendRequest, db: Session):
    print("🚀 [Recommendation] Starting...")
    participants = []
    
    # 1. 사용자 목록 파싱
    for u in req.users:
        try:
            uid = u.get("id")
            db_user = db.query(models.User).filter(models.User.id == uid).first() if uid else None
            if db_user:
                participants.append({ "id": db_user.id, "name": db_user.name, "lat": db_user.lat, "lng": db_user.lng, "preferences": db_user.preferences or {} })
            else:
                loc = u.get('location', {})
                participants.append({ "id": u.get("id", 0), "name": u.get("name", "User"), "lat": float(loc.get('lat', 0)), "lng": float(loc.get('lng', 0)), "preferences": {} })
        except: continue
        
    # 2. 수동 위치 추가
    if req.manual_locations:
        for idx, loc_name in enumerate(req.manual_locations):
            if loc_name.strip():
                lat, lng = data_provider.get_coordinates(loc_name)
                if lat == 0.0: lat, lng = get_fuzzy_coordinate(loc_name)
                if lat != 0.0: participants.append({"id": 9000+idx, "name": loc_name, "lat": lat, "lng": lng, "preferences": {}})
    
    # 3. 친구 위치 추가
    if req.friend_location_manual:
        lat, lng = data_provider.get_coordinates(req.friend_location_manual)
        if lat == 0.0: lat, lng = get_fuzzy_coordinate(req.friend_location_manual)
        if lat != 0.0: participants.append({"id": 9999, "name": req.friend_location_manual, "lat": lat, "lng": lng, "preferences": {}})

    print(f"👥 Total Participants: {len(participants)}")

    # 4. 중간 지점 계산 (무조건 실행)
    regions = []
    if len(participants) > 0:
        try:
            top_regions = find_top_3_midpoints_odsay(participants, req.current_lat, req.current_lng)
            for name, lat, lng in top_regions:
                regions.append({"region_name": name, "lat": lat, "lng": lng})
        except Exception as e:
            print(f"🔥 Error in midpoint calculation: {e}")
            avg_lat = sum(p['lat'] for p in participants) / len(participants)
            avg_lng = sum(p['lng'] for p in participants) / len(participants)
            regions = [{"region_name": "중간지점", "lat": avg_lat, "lng": avg_lng}]
    else:
        regions = [{"region_name": "내 주변", "lat": req.current_lat, "lng": req.current_lng}]

    # 5. 장소 추천
    final_response = []
    for region in regions:
        try:
            r_name = region.get('region_name', '중간지점').split('(')[0].strip()
            final_keywords = expand_tags_to_keywords(req.purpose, req.user_selected_tags, r_name)
            
            pois = search_places_in_db(db, r_name, final_keywords, None) # allowed_types 제거
            if len(pois) < 5:
                api_pois = data_provider.search_places_all_queries(final_keywords, r_name, region.get("lat"), region.get("lng"), allowed_types=None)
                # 🌟 DB 저장 시 거리 필터 적용
                save_place_to_db(db, api_pois, region.get("lat"), region.get("lng"))
                
                existing_names = {p.name for p in pois}
                for p in api_pois:
                    # 🌟 메모리 상에서도 거리 필터 적용
                    p_lat, p_lng = float(p.location[0]), float(p.location[1])
                    dist = ((p_lat - region.get("lat"))**2 + (p_lng - region.get("lng"))**2)**0.5
                    
                    if p.name not in existing_names and dist < 0.03: 
                        pois.append(p)

            # 🌟 최종 추천 시 한번 더 거리 필터링 (2km)
            valid_pois = []
            for p in pois:
                dist = ((p.location[0] - region['lat'])**2 + (p.location[1] - region['lng'])**2)**0.5
                if dist < 0.02: valid_pois.append(p)

            algo_users = [agora_algo.UserProfile(id=p.get('id',0), preferences=p.get('preferences', {}), history=[]) for p in participants]
            engine = agora_algo.AdvancedRecommender(algo_users, valid_pois)
            results = engine.recommend(req.purpose, np.array([region.get("lat"), region.get("lng")]), req.user_selected_tags)
            
            formatted_places = [{"id": p.id, "name": p.name, "category": p.category, "score": max(0.1, round(float(s), 1)), "tags": p.tags, "location": [p.location[0], p.location[1]]} for p, s in results[:10]]
            final_response.append({ "region_name": region['region_name'], "lat": region["lat"], "lng": region["lng"], "transit_info": region.get("transit_info"), "places": formatted_places })
        except Exception as e:
            print(f"🔥 Error in region processing: {e}")
            continue

    return final_response

# ... (나머지 엔드포인트) ...
@router.get("/api/places/search")
def search_places_endpoint(query: str = Query(..., min_length=1)):
    try:
        results = []
        for name, coords in FALLBACK_COORDINATES.items():
            if query in name: results.append({ "title": name, "address": "주요 지하철역/거점", "lat": coords[0], "lng": coords[1] })
        return results[:10]
    except: return []

@router.post("/api/recommend")
def get_recommendation(req: RecommendRequest, db: Session = Depends(get_db)):
    return run_group_recommendation(req, db)

@router.post("/api/meeting-flow")
def run_meeting_flow(req: MeetingFlowRequest, db: Session = Depends(get_db)):
    engine_instance = MeetingFlowEngine(data_provider)
    return engine_instance.plan_meeting(req, db)

@router.post("/api/ai/parse-schedule")
def parse_schedule_endpoint(req: NlpRequest):
    try:
        model = genai.GenerativeModel('gemini-flash-latest')
        now = datetime.now().strftime("%Y-%m-%d %H:%M")
        prompt = f"Extract JSON (title, date YYYY-MM-DD, time HH:MM, location_name, purpose) from: '{req.text}'. Current: {now}. Return JSON string only."
        response = model.generate_content(prompt)
        return json.loads(response.text.replace("```json", "").replace("```", "").strip())
    except: return { "title": "새 일정", "date": datetime.now().strftime("%Y-%m-%d"), "time": "19:00", "location_name": "미정", "purpose": "식사" }

@router.post("/api/events", response_model=EventSchema)
def create_event(event: EventSchema, db: Session = Depends(get_db)):
    from uuid import uuid4
    db_event = models.Event(id=str(uuid4()), user_id=event.user_id, title=event.title, date=event.date, time=event.time, duration_hours=event.duration_hours, location_name=event.location_name, purpose=event.purpose)
    db.add(db_event); db.commit(); db.refresh(db_event)
    return db_event

@router.get("/api/events", response_model=List[EventSchema])
def get_events(current_user: models.User = Depends(get_current_user), db: Session = Depends(get_db)):
    return db.query(models.Event).filter(models.Event.user_id == current_user.id).all()

@router.put("/api/events/{event_id}")
def update_event(event_id: str, updated: EventSchema, db: Session = Depends(get_db)):
    ev = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not ev: raise HTTPException(status_code=404, detail="Not found")
    ev.title = updated.title; ev.date = updated.date; ev.time = updated.time; ev.location_name = updated.location_name; ev.purpose = updated.purpose; db.commit(); return ev
@router.delete("/api/events/{event_id}")
def delete_event(event_id: str, db: Session = Depends(get_db)):
    ev = db.query(models.Event).filter(models.Event.id == event_id).first()
    if not ev: raise HTTPException(status_code=404, detail="Not found")
    db.delete(ev); db.commit(); return {"detail": "Deleted"}
@router.post("/api/group-availability")
def group_availability(req: AvailabilityRequest, db: Session = Depends(get_db)):
    avail = compute_availability_slots(req.user_ids, req.days_to_check, db)
    return {"available_slots": avail, "user_ids": req.user_ids}