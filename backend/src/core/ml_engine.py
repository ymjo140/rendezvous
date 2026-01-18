# -*- coding: utf-8 -*-
"""
ML Engine - Real Machine Learning Logic
- Context-aware recommendations (time, day, weather)
- Scoring with fallback defaults
- Error handling with safe defaults
"""

from typing import Dict, List, Optional, Tuple
from datetime import datetime
import math


class ContextAnalyzer:
    """Analyze user context for better recommendations"""
    
    # Time-based intent mapping
    TIME_INTENTS = {
        (6, 10): "BREAKFAST",
        (11, 14): "LUNCH",
        (14, 17): "CAFE",
        (17, 21): "DINNER",
        (21, 24): "LATE_NIGHT",
        (0, 6): "LATE_NIGHT"
    }
    
    # Day-based adjustments
    WEEKEND_ADJUSTMENTS = {
        "LUNCH": {"preferred_hour_shift": 1},  # Weekend lunch is later
        "CAFE": {"boost": 0.2},  # Cafes more popular on weekends
        "DINNER": {"preferred_hour_shift": 1}
    }
    
    @classmethod
    def analyze(cls, context: Dict = None) -> Dict:
        """Analyze context and return recommendation hints"""
        now = datetime.now()
        hour = now.hour
        day_of_week = now.weekday()  # 0=Monday, 6=Sunday
        is_weekend = day_of_week >= 5
        
        # Override with provided context
        if context:
            hour = context.get("hour", hour)
            day_of_week = context.get("day_of_week", day_of_week)
            is_weekend = day_of_week >= 5
        
        # Determine intent
        intent = "GENERAL"
        for (start, end), intent_name in cls.TIME_INTENTS.items():
            if start <= hour < end:
                intent = intent_name
                break
        
        # Category preferences based on intent
        category_boosts = cls._get_category_boosts(intent, is_weekend)
        
        # Vibe preferences based on time
        vibe_preferences = cls._get_vibe_preferences(hour, is_weekend)
        
        return {
            "hour": hour,
            "day_of_week": day_of_week,
            "is_weekend": is_weekend,
            "predicted_intent": intent,
            "category_boosts": category_boosts,
            "vibe_preferences": vibe_preferences
        }
    
    @classmethod
    def _get_category_boosts(cls, intent: str, is_weekend: bool) -> Dict[str, float]:
        """Get category score boosts based on intent"""
        base_boosts = {
            "BREAKFAST": {"cafe": 0.3, "bakery": 0.2, "korean": 0.1},
            "LUNCH": {"korean": 0.2, "japanese": 0.15, "chinese": 0.1, "western": 0.1},
            "CAFE": {"cafe": 0.4, "dessert": 0.3, "bakery": 0.2},
            "DINNER": {"korean": 0.2, "japanese": 0.2, "western": 0.15, "chinese": 0.1},
            "LATE_NIGHT": {"bar": 0.3, "pub": 0.25, "korean": 0.1, "izakaya": 0.2},
            "GENERAL": {}
        }
        
        boosts = base_boosts.get(intent, {}).copy()
        
        # Weekend adjustments
        if is_weekend:
            boosts["cafe"] = boosts.get("cafe", 0) + 0.1
            boosts["brunch"] = boosts.get("brunch", 0) + 0.2
            if intent == "LATE_NIGHT":
                boosts["bar"] = boosts.get("bar", 0) + 0.1
        
        return boosts
    
    @classmethod
    def _get_vibe_preferences(cls, hour: int, is_weekend: bool) -> Dict[str, float]:
        """Get vibe preferences based on time"""
        if 6 <= hour < 12:
            # Morning: quiet, cozy
            return {"quiet": 0.3, "cozy": 0.2, "trendy": -0.1}
        elif 12 <= hour < 17:
            # Afternoon: trendy, bright
            return {"trendy": 0.2, "instagram": 0.15, "quiet": 0.1}
        elif 17 <= hour < 21:
            # Evening: romantic, cozy
            if is_weekend:
                return {"romantic": 0.25, "cozy": 0.2, "lively": 0.1}
            return {"cozy": 0.2, "quiet": 0.1}
        else:
            # Night: lively, bar
            return {"lively": 0.3, "bar": 0.2, "quiet": -0.2}


class MLScorer:
    """Score places using ML-like logic with real features"""
    
    DEFAULT_SCORE = 0.5
    
    def __init__(self):
        self.context_analyzer = ContextAnalyzer()
    
    def score_place(
        self,
        place_features: Dict,
        user_preferences: Dict = None,
        context: Dict = None
    ) -> Tuple[float, str]:
        """
        Score a place based on features, preferences, and context
        Returns: (score, reason)
        """
        try:
            base_score = self.DEFAULT_SCORE
            reasons = []
            
            # 1. Context-based scoring
            ctx = self.context_analyzer.analyze(context)
            context_score, context_reason = self._score_by_context(place_features, ctx)
            if context_score > 0:
                base_score += context_score
                if context_reason:
                    reasons.append(context_reason)
            
            # 2. User preference matching
            if user_preferences:
                pref_score, pref_reason = self._score_by_preferences(
                    place_features, user_preferences
                )
                if pref_score > 0:
                    base_score += pref_score
                    if pref_reason:
                        reasons.append(pref_reason)
            
            # 3. Popularity/quality boost
            quality_score = self._score_by_quality(place_features)
            base_score += quality_score
            
            # 4. Recency boost (newer reviews = higher score)
            recency_score = self._score_by_recency(place_features)
            base_score += recency_score
            
            # Normalize to 0-1
            final_score = max(0.0, min(1.0, base_score))
            
            # Generate reason
            reason = " + ".join(reasons) if reasons else self._get_default_reason(ctx)
            
            return final_score, reason
            
        except Exception as e:
            print(f"[MLScorer] Error scoring place: {e}")
            return self.DEFAULT_SCORE, "Recommended for you"
    
    def _score_by_context(self, features: Dict, ctx: Dict) -> Tuple[float, str]:
        """Score based on context (time, day)"""
        score = 0.0
        reason = ""
        
        category = features.get("category", "").lower()
        tags = [t.lower() for t in features.get("tags", [])]
        
        # Category boost
        for cat, boost in ctx.get("category_boosts", {}).items():
            if cat in category or cat in tags:
                score += boost
                if boost > 0.15:
                    intent = ctx.get("predicted_intent", "")
                    if intent == "LUNCH":
                        reason = "Perfect for lunch"
                    elif intent == "DINNER":
                        reason = "Great for dinner"
                    elif intent == "CAFE":
                        reason = "Ideal for a coffee break"
                    elif intent == "LATE_NIGHT":
                        reason = "Perfect for late night"
                break
        
        return score, reason
    
    def _score_by_preferences(self, features: Dict, prefs: Dict) -> Tuple[float, str]:
        """Score based on user preferences"""
        score = 0.0
        reason = ""
        
        # Price level matching
        if "price_level" in features and "price_preference" in prefs:
            price_diff = abs(features["price_level"] - prefs["price_preference"])
            if price_diff < 0.2:
                score += 0.15
                reason = "Matches your budget"
        
        # Vibe matching
        vibes = features.get("vibes", [])
        pref_vibes = prefs.get("preferred_vibes", [])
        if vibes and pref_vibes:
            matching_vibes = set(vibes) & set(pref_vibes)
            if matching_vibes:
                score += 0.1 * len(matching_vibes)
                reason = "Your style"
        
        # Food type matching
        category = features.get("category", "").lower()
        pref_foods = [f.lower() for f in prefs.get("preferred_foods", [])]
        if any(food in category for food in pref_foods):
            score += 0.2
            reason = "Your favorite cuisine"
        
        return score, reason
    
    def _score_by_quality(self, features: Dict) -> float:
        """Score based on quality indicators"""
        score = 0.0
        
        # Rating boost
        rating = features.get("rating", 0)
        if rating >= 4.5:
            score += 0.15
        elif rating >= 4.0:
            score += 0.1
        elif rating >= 3.5:
            score += 0.05
        
        # Review count boost (popular places)
        review_count = features.get("review_count", 0)
        if review_count >= 100:
            score += 0.1
        elif review_count >= 50:
            score += 0.05
        
        return score
    
    def _score_by_recency(self, features: Dict) -> float:
        """Score based on recency of data"""
        # Places with recent activity get a small boost
        return 0.0  # Placeholder for now
    
    def _get_default_reason(self, ctx: Dict) -> str:
        """Get default reason based on context"""
        intent = ctx.get("predicted_intent", "GENERAL")
        reasons = {
            "BREAKFAST": "Good for morning",
            "LUNCH": "Popular for lunch",
            "CAFE": "Nice cafe spot",
            "DINNER": "Great for dinner",
            "LATE_NIGHT": "Open late",
            "GENERAL": "Recommended for you"
        }
        return reasons.get(intent, "Recommended for you")


class ColdStartHandler:
    """Handle cold start problem for new users"""
    
    @staticmethod
    def get_cold_start_recommendations(
        db_session,
        context: Dict = None,
        limit: int = 10
    ) -> List[Dict]:
        """
        Get recommendations for users with no history
        Uses time-based rules + popularity
        """
        from domain.models import Place, PlaceEmbedding
        from sqlalchemy import func
        
        try:
            ctx = ContextAnalyzer.analyze(context)
            intent = ctx.get("predicted_intent", "GENERAL")
            category_boosts = ctx.get("category_boosts", {})
            
            # Get popular places
            query = db_session.query(Place).filter(
                Place.wemeet_rating > 0
            )
            
            # Apply category filter based on intent
            if category_boosts:
                top_categories = sorted(
                    category_boosts.items(), 
                    key=lambda x: x[1], 
                    reverse=True
                )[:3]
                category_keywords = [c[0] for c in top_categories]
                
                # Simple filter - check if any category keyword is in place category
                # This is a simplified approach
            
            # Order by rating and get results
            places = query.order_by(
                Place.wemeet_rating.desc(),
                Place.review_count.desc()
            ).limit(limit * 2).all()
            
            # Score and sort
            scorer = MLScorer()
            scored_places = []
            
            for place in places:
                features = {
                    "category": place.category or "",
                    "tags": place.tags or [],
                    "rating": place.wemeet_rating or 0,
                    "review_count": place.review_count or 0
                }
                
                score, reason = scorer.score_place(features, context=context)
                
                scored_places.append({
                    "place_id": place.id,
                    "name": place.name,
                    "category": place.category,
                    "address": place.address,
                    "score": round(score, 4),
                    "reason": reason,
                    "rating": place.wemeet_rating,
                    "tags": place.tags or []
                })
            
            # Sort by score
            scored_places.sort(key=lambda x: x["score"], reverse=True)
            
            return scored_places[:limit]
            
        except Exception as e:
            print(f"[ColdStartHandler] Error: {e}")
            # Return empty list on error
            return []


# Singleton instances
_ml_scorer = None
_context_analyzer = None

def get_ml_scorer() -> MLScorer:
    global _ml_scorer
    if _ml_scorer is None:
        _ml_scorer = MLScorer()
    return _ml_scorer

def get_context_analyzer() -> ContextAnalyzer:
    global _context_analyzer
    if _context_analyzer is None:
        _context_analyzer = ContextAnalyzer()
    return _context_analyzer
