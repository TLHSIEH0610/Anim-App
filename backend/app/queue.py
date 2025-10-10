from datetime import datetime, timezone, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
from .models import Job


FREE_PER_DAY = 2


def user_free_remaining(db: Session, user_id: int) -> int:
    """Return remaining free jobs for the user today."""
    # Count jobs created today (UTC) regardless of status
    now = datetime.now(timezone.utc)
    start = datetime(now.year, now.month, now.day, tzinfo=timezone.utc)
    count = (
        db.query(func.count(Job.id))
        .filter(Job.user_id == user_id, Job.created_at >= start)
        .scalar()
    )
    return max(0, FREE_PER_DAY - (count or 0))
