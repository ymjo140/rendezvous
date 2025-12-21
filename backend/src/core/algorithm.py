from typing import List, Dict, Any
from dataclasses import dataclass
import numpy as np
from ..domain.models import MeetingHistory

@dataclass
class POI:
    id: int
    name: str
    category: str
    tags: List[str]
    location: np.ndarray
    price_level: int
    avg_rating: float
    address: str = ""

class AdvancedRecommender:
    def __init__(self, candidates: List[POI]):
        self.candidates = candidates

    @staticmethod
    def train_user_model(user_prefs: Dict, place_tags: List[str], rating: float, reason: str = None) -> Dict:
        """사용자 취향 벡터 업데이트 (리뷰 기반)"""
        weights = user_prefs.get("tag_weights", {})
        learning_rate = 0.1
        
        # 긍정/부정 판단
        sentiment = 1 if rating >= 4.0 else -1
        if rating == 3.0: sentiment = 0.1
        
        for tag in place_tags:
            old_w = weights.get(tag, 1.0)
            new_w = old_w + (learning_rate * sentiment)
            weights[tag] = max(0.1, min(5.0, new_w)) # 가중치 클리핑
        
        user_prefs["tag_weights"] = weights
        return user_prefs

    def recommend(self, user_prefs_list: List[Dict], purpose: str, top_k=3) -> List[POI]:
        """다수 사용자 취향을 고려한 장소 추천"""
        if not self.candidates: return []
        
        scores = []
        for poi in self.candidates:
            score = poi.avg_rating * 10 # 기본 점수
            
            # 태그 매칭 점수
            matched_tags = 0
            for prefs in user_prefs_list:
                user_weights = prefs.get("tag_weights", {})
                for tag in poi.tags:
                    w = user_weights.get(tag, 1.0)
                    if tag in prefs.get("foods", []) or tag in prefs.get("vibes", []):
                        matched_tags += (1 * w)
            
            score += matched_tags * 5
            scores.append((score, poi))
        
        scores.sort(key=lambda x: x[0], reverse=True)
        return [item[1] for item in scores[:top_k]]