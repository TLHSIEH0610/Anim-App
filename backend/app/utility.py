# backend/app/utility.py
from datetime import datetime, timezone
from sqlalchemy import func
from .models import Job
from .db import SessionLocal

FREE_PER_DAY = 2

def user_free_remaining(db, user_id: int) -> int:
    now = datetime.now(timezone.utc)
    start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    count = db.query(func.count(Job.id)).filter(Job.user_id==user_id, Job.created_at >= start).scalar()
    return max(0, FREE_PER_DAY - (count or 0))