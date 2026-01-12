from sqlalchemy.orm import Session
from datetime import datetime, timedelta
from collections import defaultdict
from domain import models

class DemandIntelligenceEngine:
    def __init__(self, db: Session):
        self.db = db

    def get_future_demand(self, region_name: str, days: int = 7):
        today = datetime.now().date()
        end_date = today + timedelta(days=days)
        
        events = self.db.query(models.Event).filter(
            models.Event.date >= str(today),
            models.Event.date <= str(end_date),
            models.Event.location_name.like(f"%{region_name}%")
        ).all()

        daily_trend = defaultdict(int)
        for e in events:
            daily_trend[e.date] += 1
            
        return {
            "region": region_name,
            "period": f"{today} ~ {end_date}",
            "total_events": len(events),
            "daily_trend": dict(daily_trend)
        }