# backend/worker/worker_runner.py
import os
import redis
from rq import Worker, Queue

from app.backup import maybe_schedule_automatic_backups

redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
conn = redis.from_url(redis_url)

if __name__ == "__main__":
    maybe_schedule_automatic_backups()
    q = Queue("jobs", connection=conn)
    w = Worker([q], connection=conn)
    w.work()
