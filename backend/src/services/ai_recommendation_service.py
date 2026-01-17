"""
AI 추천 서비스
- 콘텐츠 기반 필터링 (Content-Based Filtering)
- 협업 필터링 (Collaborative Filtering)
- 하이브리드 추천
- 인기도 기반 추천 (Cold Start 대응)
"""

from sqlalchemy.orm import Session
from sqlalchemy import func, desc
from typing import List, Dict, Optional, Tuple
from datetime import datetime, timedelta
import math

from domain.models import (
    User, Place, Review, UserAction, PlaceVector, 
    UserPreferenceVector, RecommendationLog, SimilarPlace, ActionType
)


class AIRecommendationService:
    """AI 기반 장소 추천 서비스"""
    
    # 행동별 가중치
    ACTION_WEIGHTS = {
        ActionType.VIEW.value: 1.0,
        ActionType.CLICK.value: 2.0,
        ActionType.LIKE.value: 3.0,
        ActionType.SAVE.value: 4.0,
        ActionType.REVIEW.value: 5.0,
        ActionType.VISIT.value: 5.0,
        ActionType.SHARE.value: 3.0,
    }
    
    def __init__(self):
        self.min_actions_for_personalization = 5  # 개인화 추천 최소 행동 수
        self.recommendation_count = 10  # 기본 추천 개수
    
    # === 사용자 행동 기록 ===
    
    def record_action(
        self, 
        db: Session, 
        user_id: int, 
        action_type: str,
        place_id: Optional[int] = None,
        action_value: float = 1.0,
        context: Dict = None
    ) -> UserAction:
        """사용자 행동 기록"""
        action = UserAction(
            user_id=user_id,
            place_id=place_id,
            action_type=action_type,
            action_value=action_value,
            context=context or {}
        )
        db.add(action)
        db.commit()
        db.refresh(action)
        
        # 선호도 벡터 업데이트 (비동기로 처리하면 더 좋음)
        if place_id:
            self._update_user_preference(db, user_id)
        
        return action
    
    # === 추천 알고리즘 ===
    
    def get_recommendations(
        self,
        db: Session,
        user_id: int,
        purpose: str = None,
        limit: int = 10,
        exclude_place_ids: List[int] = None
    ) -> List[Dict]:
        """
        하이브리드 추천 - 상황에 따라 적절한 알고리즘 선택
        """
        exclude_place_ids = exclude_place_ids or []
        
        # 사용자 행동 수 확인
        action_count = db.query(func.count(UserAction.id))\
            .filter(UserAction.user_id == user_id)\
            .scalar()
        
        if action_count < self.min_actions_for_personalization:
            # Cold Start: 인기도 기반 + 규칙 기반
            algorithm = "popular"
            recommendations = self._get_popular_recommendations(
                db, purpose, limit, exclude_place_ids
            )
        else:
            # 하이브리드: 콘텐츠 기반 + 협업 필터링
            algorithm = "hybrid"
            content_recs = self._get_content_based_recommendations(
                db, user_id, purpose, limit * 2, exclude_place_ids
            )
            collab_recs = self._get_collaborative_recommendations(
                db, user_id, limit * 2, exclude_place_ids
            )
            recommendations = self._merge_recommendations(content_recs, collab_recs, limit)
        
        # 추천 로그 기록
        self._log_recommendation(
            db, user_id, algorithm, 
            [r["place_id"] for r in recommendations],
            [r["score"] for r in recommendations],
            {"purpose": purpose}
        )
        
        return recommendations
    
    def _get_popular_recommendations(
        self,
        db: Session,
        purpose: str = None,
        limit: int = 10,
        exclude_place_ids: List[int] = None
    ) -> List[Dict]:
        """인기도 기반 추천 (Cold Start 대응)"""
        exclude_place_ids = exclude_place_ids or []
        
        # 최근 30일 인기 장소
        thirty_days_ago = datetime.now() - timedelta(days=30)
        
        # 리뷰 수 + 평균 평점 기반 인기도
        query = db.query(
            Place,
            func.count(Review.id).label("review_count"),
            func.avg(Review.rating).label("avg_rating")
        ).outerjoin(Review, Place.name == Review.place_name)\
         .filter(Place.id.notin_(exclude_place_ids))
        
        # 목적에 따른 카테고리 필터
        if purpose:
            category_map = {
                "식사": ["한식", "양식", "일식", "중식"],
                "술": ["술집", "바", "포차"],
                "카페": ["카페", "디저트"],
                "데이트": ["레스토랑", "와인바", "카페"]
            }
            if purpose in category_map:
                query = query.filter(Place.category.in_(category_map[purpose]))
        
        results = query.group_by(Place.id)\
            .order_by(desc("review_count"), desc("avg_rating"))\
            .limit(limit)\
            .all()
        
        recommendations = []
        for place, review_count, avg_rating in results:
            # 인기도 점수 계산
            popularity_score = (review_count or 0) * 0.3 + (avg_rating or 3.0) * 0.7
            recommendations.append({
                "place_id": place.id,
                "place_name": place.name,
                "category": place.category,
                "score": round(min(popularity_score / 5.0, 1.0), 3),
                "reason": "인기 장소",
                "review_count": review_count or 0,
                "avg_rating": round(avg_rating or 0, 1)
            })
        
        return recommendations
    
    def _get_content_based_recommendations(
        self,
        db: Session,
        user_id: int,
        purpose: str = None,
        limit: int = 10,
        exclude_place_ids: List[int] = None
    ) -> List[Dict]:
        """콘텐츠 기반 추천"""
        exclude_place_ids = exclude_place_ids or []
        
        # 사용자 선호도 벡터 가져오기
        user_pref = db.query(UserPreferenceVector)\
            .filter(UserPreferenceVector.user_id == user_id)\
            .first()
        
        if not user_pref:
            return self._get_popular_recommendations(db, purpose, limit, exclude_place_ids)
        
        # 모든 장소 벡터 가져오기
        place_vectors = db.query(PlaceVector, Place)\
            .join(Place, PlaceVector.place_id == Place.id)\
            .filter(Place.id.notin_(exclude_place_ids))\
            .all()
        
        if not place_vectors:
            return self._get_popular_recommendations(db, purpose, limit, exclude_place_ids)
        
        # 코사인 유사도 계산
        scored_places = []
        user_vec = self._extract_user_vector(user_pref)
        
        for pv, place in place_vectors:
            place_vec = self._extract_place_vector(pv)
            similarity = self._cosine_similarity(user_vec, place_vec)
            
            # 목적에 따른 보너스
            purpose_bonus = 0
            if purpose:
                if purpose == "데이트" and pv.date_friendly > 0.7:
                    purpose_bonus = 0.1
                elif purpose == "단체" and pv.group_friendly > 0.7:
                    purpose_bonus = 0.1
                elif purpose == "혼밥" and pv.solo_friendly > 0.7:
                    purpose_bonus = 0.1
            
            scored_places.append({
                "place_id": place.id,
                "place_name": place.name,
                "category": place.category,
                "score": round(similarity + purpose_bonus, 3),
                "reason": "취향 맞춤"
            })
        
        # 점수순 정렬
        scored_places.sort(key=lambda x: x["score"], reverse=True)
        return scored_places[:limit]
    
    def _get_collaborative_recommendations(
        self,
        db: Session,
        user_id: int,
        limit: int = 10,
        exclude_place_ids: List[int] = None
    ) -> List[Dict]:
        """협업 필터링 추천 - 유사 사용자 기반"""
        exclude_place_ids = exclude_place_ids or []
        
        # 현재 사용자가 좋아한 장소들
        user_liked_places = db.query(UserAction.place_id)\
            .filter(
                UserAction.user_id == user_id,
                UserAction.action_type.in_([ActionType.LIKE.value, ActionType.SAVE.value, ActionType.REVIEW.value]),
                UserAction.place_id.isnot(None)
            ).distinct().all()
        user_liked_ids = {p[0] for p in user_liked_places}
        
        if not user_liked_ids:
            return []
        
        # 유사한 취향의 사용자 찾기 (같은 장소를 좋아한 사용자)
        similar_users = db.query(UserAction.user_id, func.count(UserAction.id).label("common_count"))\
            .filter(
                UserAction.place_id.in_(user_liked_ids),
                UserAction.user_id != user_id,
                UserAction.action_type.in_([ActionType.LIKE.value, ActionType.SAVE.value, ActionType.REVIEW.value])
            ).group_by(UserAction.user_id)\
            .order_by(desc("common_count"))\
            .limit(50)\
            .all()
        
        if not similar_users:
            return []
        
        similar_user_ids = [u[0] for u in similar_users]
        
        # 유사 사용자들이 좋아하지만 현재 사용자는 아직 안 본 장소
        recommended_places = db.query(
            Place,
            func.count(UserAction.id).label("recommendation_count"),
            func.avg(UserAction.action_value).label("avg_score")
        ).join(UserAction, Place.id == UserAction.place_id)\
         .filter(
            UserAction.user_id.in_(similar_user_ids),
            UserAction.place_id.notin_(user_liked_ids),
            Place.id.notin_(exclude_place_ids),
            UserAction.action_type.in_([ActionType.LIKE.value, ActionType.SAVE.value, ActionType.REVIEW.value])
        ).group_by(Place.id)\
         .order_by(desc("recommendation_count"), desc("avg_score"))\
         .limit(limit)\
         .all()
        
        recommendations = []
        for place, rec_count, avg_score in recommended_places:
            # 협업 필터링 점수
            cf_score = min((rec_count / 10) * 0.5 + (avg_score or 3.0) / 5.0 * 0.5, 1.0)
            recommendations.append({
                "place_id": place.id,
                "place_name": place.name,
                "category": place.category,
                "score": round(cf_score, 3),
                "reason": "비슷한 취향의 사람들이 좋아해요"
            })
        
        return recommendations
    
    def _merge_recommendations(
        self,
        content_recs: List[Dict],
        collab_recs: List[Dict],
        limit: int
    ) -> List[Dict]:
        """하이브리드 추천 - 두 알고리즘 결과 병합"""
        # 장소별 점수 병합 (가중 평균)
        place_scores = {}
        
        for rec in content_recs:
            pid = rec["place_id"]
            place_scores[pid] = {
                **rec,
                "content_score": rec["score"],
                "collab_score": 0
            }
        
        for rec in collab_recs:
            pid = rec["place_id"]
            if pid in place_scores:
                place_scores[pid]["collab_score"] = rec["score"]
                # 하이브리드 점수: 콘텐츠 60% + 협업 40%
                place_scores[pid]["score"] = round(
                    place_scores[pid]["content_score"] * 0.6 + rec["score"] * 0.4, 3
                )
                place_scores[pid]["reason"] = "취향 + 인기"
            else:
                place_scores[pid] = {
                    **rec,
                    "content_score": 0,
                    "collab_score": rec["score"]
                }
        
        # 점수순 정렬 후 상위 N개 반환
        sorted_recs = sorted(place_scores.values(), key=lambda x: x["score"], reverse=True)
        return sorted_recs[:limit]
    
    # === 유틸리티 함수 ===
    
    def _extract_user_vector(self, pref: UserPreferenceVector) -> List[float]:
        """사용자 선호도 벡터 추출"""
        return [
            pref.price_preference,
            pref.noise_preference,
            pref.group_preference,
            pref.date_preference,
            pref.family_preference,
            pref.solo_preference,
            pref.korean_preference,
            pref.western_preference,
            pref.japanese_preference,
            pref.chinese_preference,
            pref.cafe_preference,
            pref.bar_preference,
            pref.trendy_preference,
            pref.traditional_preference,
            pref.cozy_preference
        ]
    
    def _extract_place_vector(self, pv: PlaceVector) -> List[float]:
        """장소 특성 벡터 추출"""
        return [
            pv.price_level,
            pv.noise_level,
            pv.group_friendly,
            pv.date_friendly,
            pv.family_friendly,
            pv.solo_friendly,
            pv.korean_score,
            pv.western_score,
            pv.japanese_score,
            pv.chinese_score,
            pv.cafe_score,
            pv.bar_score,
            pv.trendy_score,
            pv.traditional_score,
            pv.cozy_score
        ]
    
    def _cosine_similarity(self, vec1: List[float], vec2: List[float]) -> float:
        """코사인 유사도 계산"""
        if len(vec1) != len(vec2):
            return 0.0
        
        dot_product = sum(a * b for a, b in zip(vec1, vec2))
        norm1 = math.sqrt(sum(a * a for a in vec1))
        norm2 = math.sqrt(sum(b * b for b in vec2))
        
        if norm1 == 0 or norm2 == 0:
            return 0.0
        
        return dot_product / (norm1 * norm2)
    
    def _update_user_preference(self, db: Session, user_id: int):
        """사용자 선호도 벡터 업데이트 (행동 기반 학습)"""
        # 최근 100개 행동 가져오기
        recent_actions = db.query(UserAction)\
            .filter(
                UserAction.user_id == user_id,
                UserAction.place_id.isnot(None)
            ).order_by(desc(UserAction.created_at))\
            .limit(100)\
            .all()
        
        if not recent_actions:
            return
        
        # 기존 선호도 가져오기 또는 생성
        user_pref = db.query(UserPreferenceVector)\
            .filter(UserPreferenceVector.user_id == user_id)\
            .first()
        
        if not user_pref:
            user_pref = UserPreferenceVector(user_id=user_id)
            db.add(user_pref)
        
        # 행동한 장소들의 벡터 가중 평균 계산
        place_ids = [a.place_id for a in recent_actions]
        place_vectors = db.query(PlaceVector)\
            .filter(PlaceVector.place_id.in_(place_ids))\
            .all()
        
        if not place_vectors:
            db.commit()
            return
        
        pv_dict = {pv.place_id: pv for pv in place_vectors}
        
        # 가중 평균 계산
        total_weight = 0
        accumulated = [0.0] * 15  # 15차원 벡터
        
        for action in recent_actions:
            if action.place_id not in pv_dict:
                continue
            
            pv = pv_dict[action.place_id]
            weight = self.ACTION_WEIGHTS.get(action.action_type, 1.0) * action.action_value
            total_weight += weight
            
            vec = self._extract_place_vector(pv)
            for i, v in enumerate(vec):
                accumulated[i] += v * weight
        
        if total_weight > 0:
            # 정규화
            for i in range(len(accumulated)):
                accumulated[i] /= total_weight
            
            # 선호도 업데이트 (기존 값과 혼합 - 90% 기존 + 10% 새 학습)
            alpha = 0.1  # 학습률
            user_pref.price_preference = (1 - alpha) * user_pref.price_preference + alpha * accumulated[0]
            user_pref.noise_preference = (1 - alpha) * user_pref.noise_preference + alpha * accumulated[1]
            user_pref.group_preference = (1 - alpha) * user_pref.group_preference + alpha * accumulated[2]
            user_pref.date_preference = (1 - alpha) * user_pref.date_preference + alpha * accumulated[3]
            user_pref.family_preference = (1 - alpha) * user_pref.family_preference + alpha * accumulated[4]
            user_pref.solo_preference = (1 - alpha) * user_pref.solo_preference + alpha * accumulated[5]
            user_pref.korean_preference = (1 - alpha) * user_pref.korean_preference + alpha * accumulated[6]
            user_pref.western_preference = (1 - alpha) * user_pref.western_preference + alpha * accumulated[7]
            user_pref.japanese_preference = (1 - alpha) * user_pref.japanese_preference + alpha * accumulated[8]
            user_pref.chinese_preference = (1 - alpha) * user_pref.chinese_preference + alpha * accumulated[9]
            user_pref.cafe_preference = (1 - alpha) * user_pref.cafe_preference + alpha * accumulated[10]
            user_pref.bar_preference = (1 - alpha) * user_pref.bar_preference + alpha * accumulated[11]
            user_pref.trendy_preference = (1 - alpha) * user_pref.trendy_preference + alpha * accumulated[12]
            user_pref.traditional_preference = (1 - alpha) * user_pref.traditional_preference + alpha * accumulated[13]
            user_pref.cozy_preference = (1 - alpha) * user_pref.cozy_preference + alpha * accumulated[14]
            
            user_pref.action_count = len(recent_actions)
        
        db.commit()
    
    def _log_recommendation(
        self,
        db: Session,
        user_id: int,
        algorithm: str,
        place_ids: List[int],
        scores: List[float],
        context: Dict
    ):
        """추천 로그 기록"""
        log = RecommendationLog(
            user_id=user_id,
            algorithm=algorithm,
            recommended_place_ids=place_ids,
            scores=scores,
            context=context
        )
        db.add(log)
        db.commit()
    
    # === 추가 기능 ===
    
    def get_similar_places(
        self,
        db: Session,
        place_id: int,
        limit: int = 5
    ) -> List[Dict]:
        """유사한 장소 추천"""
        # 캐시된 유사 장소 확인
        cached = db.query(SimilarPlace, Place)\
            .join(Place, SimilarPlace.similar_place_id == Place.id)\
            .filter(SimilarPlace.place_id == place_id)\
            .order_by(desc(SimilarPlace.similarity_score))\
            .limit(limit)\
            .all()
        
        if cached:
            return [{
                "place_id": place.id,
                "place_name": place.name,
                "category": place.category,
                "similarity": round(sp.similarity_score, 3)
            } for sp, place in cached]
        
        # 캐시 없으면 실시간 계산
        target_vector = db.query(PlaceVector)\
            .filter(PlaceVector.place_id == place_id)\
            .first()
        
        if not target_vector:
            return []
        
        target_vec = self._extract_place_vector(target_vector)
        
        all_vectors = db.query(PlaceVector, Place)\
            .join(Place, PlaceVector.place_id == Place.id)\
            .filter(PlaceVector.place_id != place_id)\
            .all()
        
        similarities = []
        for pv, place in all_vectors:
            sim = self._cosine_similarity(target_vec, self._extract_place_vector(pv))
            similarities.append({
                "place_id": place.id,
                "place_name": place.name,
                "category": place.category,
                "similarity": round(sim, 3)
            })
        
        similarities.sort(key=lambda x: x["similarity"], reverse=True)
        return similarities[:limit]
    
    def track_recommendation_click(
        self,
        db: Session,
        user_id: int,
        place_id: int
    ):
        """추천 클릭 추적"""
        # 가장 최근 추천 로그 찾기
        recent_log = db.query(RecommendationLog)\
            .filter(
                RecommendationLog.user_id == user_id,
                RecommendationLog.clicked_place_id.is_(None)
            ).order_by(desc(RecommendationLog.created_at))\
            .first()
        
        if recent_log and place_id in recent_log.recommended_place_ids:
            recent_log.clicked_place_id = place_id
            db.commit()
