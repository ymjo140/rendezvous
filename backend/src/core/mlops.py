# -*- coding: utf-8 -*-
"""
MLOps - Machine Learning Operations
- Rule-based scoring (no random)
- Model management
- Error handling with safe defaults
"""

from typing import Dict, List, Optional, Tuple
from datetime import datetime
import math


class RuleBasedModel:
    """
    Rule-based scoring model (replaces MockModel)
    
    Scoring formula:
    - Base score = (rating * 0.7) + (review_count_normalized * 0.2) + (recency_boost * 0.1)
    - All scores normalized to 0.0~1.0
    """
    
    DEFAULT_SCORE = 0.5
    MAX_REVIEW_COUNT = 500  # For normalization
    
    def __init__(self):
        self.model_name = "rule_based_v1"
        self.version = "1.0.0"
    
    def predict(self, features: List[float]) -> float:
        """
        Predict score based on features
        
        Expected features order:
        [0] rating (0-5 scale)
        [1] review_count
        [2] price_level (0-1 scale, optional)
        [3] freshness (0-1 scale, optional - how recent the place is trending)
        
        Returns: score between 0.0 and 1.0
        """
        try:
            if not features or len(features) == 0:
                return self.DEFAULT_SCORE
            
            # Extract features with defaults
            rating = features[0] if len(features) > 0 else 0.0
            review_count = features[1] if len(features) > 1 else 0
            price_level = features[2] if len(features) > 2 else 0.5
            freshness = features[3] if len(features) > 3 else 0.5
            
            # Normalize rating to 0-1 (originally 0-5)
            rating_normalized = min(rating / 5.0, 1.0) if rating > 0 else 0.0
            
            # Normalize review count (log scale for diminishing returns)
            if review_count > 0:
                review_normalized = min(
                    math.log10(review_count + 1) / math.log10(self.MAX_REVIEW_COUNT + 1),
                    1.0
                )
            else:
                review_normalized = 0.0
            
            # Calculate weighted score
            # Formula: (rating * 0.7) + (review_count * 0.2) + (freshness * 0.1)
            score = (
                rating_normalized * 0.7 +
                review_normalized * 0.2 +
                freshness * 0.1
            )
            
            # Apply price level adjustment (prefer mid-range slightly)
            price_adjustment = 1.0 - abs(price_level - 0.5) * 0.1
            score *= price_adjustment
            
            # Ensure score is in valid range
            final_score = max(0.0, min(1.0, score))
            
            return round(final_score, 4)
            
        except Exception as e:
            print(f"[RuleBasedModel] Prediction error: {e}")
            return self.DEFAULT_SCORE
    
    def predict_batch(self, features_list: List[List[float]]) -> List[float]:
        """Predict scores for multiple items"""
        try:
            return [self.predict(features) for features in features_list]
        except Exception as e:
            print(f"[RuleBasedModel] Batch prediction error: {e}")
            return [self.DEFAULT_SCORE] * len(features_list)


class MLEngine:
    """
    ML Engine for managing models and predictions
    Handles model loading, versioning, and fallbacks
    """
    
    DEFAULT_SCORE = 0.5
    
    def __init__(self):
        self.model = RuleBasedModel()
        self.model_version = self.model.version
        self.is_loaded = True
    
    def predict(self, features: List[float]) -> float:
        """
        Make prediction with error handling
        Returns default score on any error
        """
        try:
            if not self.is_loaded or self.model is None:
                print("[MLEngine] Model not loaded, returning default score")
                return self.DEFAULT_SCORE
            
            score = self.model.predict(features)
            return score
            
        except Exception as e:
            print(f"[MLEngine] Prediction error: {e}")
            return self.DEFAULT_SCORE
    
    def predict_with_context(
        self, 
        features: List[float],
        context: Dict = None
    ) -> Tuple[float, str]:
        """
        Predict with context awareness
        Returns (score, reason)
        """
        try:
            base_score = self.predict(features)
            reason = "Recommended for you"
            
            if context:
                # Time-based adjustments
                hour = context.get("hour", datetime.now().hour)
                is_weekend = context.get("is_weekend", datetime.now().weekday() >= 5)
                
                # Boost score based on context
                if 11 <= hour <= 14:
                    reason = "Great for lunch"
                elif 17 <= hour <= 21:
                    reason = "Perfect for dinner"
                elif hour >= 21 or hour < 6:
                    reason = "Open late night"
                    base_score *= 1.05  # Small boost for late-night places
                
                if is_weekend:
                    base_score *= 1.02  # Small weekend boost
            
            final_score = max(0.0, min(1.0, base_score))
            return round(final_score, 4), reason
            
        except Exception as e:
            print(f"[MLEngine] Context prediction error: {e}")
            return self.DEFAULT_SCORE, "Recommended for you"
    
    def get_model_info(self) -> Dict:
        """Get model information"""
        return {
            "model_name": self.model.model_name if self.model else "unknown",
            "version": self.model_version,
            "is_loaded": self.is_loaded,
            "type": "rule_based"
        }
    
    def reload_model(self) -> bool:
        """Reload model (for future ML model updates)"""
        try:
            self.model = RuleBasedModel()
            self.model_version = self.model.version
            self.is_loaded = True
            print("[MLEngine] Model reloaded successfully")
            return True
        except Exception as e:
            print(f"[MLEngine] Model reload error: {e}")
            return False


class PlaceScorer:
    """
    Convenience class for scoring places directly from place objects
    """
    
    def __init__(self):
        self.engine = MLEngine()
    
    def score_place(self, place_dict: Dict, context: Dict = None) -> Tuple[float, str]:
        """
        Score a place from its attributes
        
        Args:
            place_dict: {rating, review_count, price_level, ...}
            context: {hour, is_weekend, ...}
        """
        try:
            # Extract features
            features = [
                place_dict.get("rating", 0) or 0,
                place_dict.get("review_count", 0) or 0,
                place_dict.get("price_level", 0.5) or 0.5,
                place_dict.get("freshness", 0.5) or 0.5
            ]
            
            return self.engine.predict_with_context(features, context)
            
        except Exception as e:
            print(f"[PlaceScorer] Error: {e}")
            return 0.5, "Recommended"
    
    def score_places_batch(
        self, 
        places: List[Dict],
        context: Dict = None
    ) -> List[Tuple[float, str]]:
        """Score multiple places"""
        return [self.score_place(p, context) for p in places]


# Singleton instances
_ml_engine = None
_place_scorer = None


def get_ml_engine() -> MLEngine:
    """Get ML Engine singleton"""
    global _ml_engine
    if _ml_engine is None:
        _ml_engine = MLEngine()
    return _ml_engine


def get_place_scorer() -> PlaceScorer:
    """Get Place Scorer singleton"""
    global _place_scorer
    if _place_scorer is None:
        _place_scorer = PlaceScorer()
    return _place_scorer
