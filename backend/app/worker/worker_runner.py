# backend/worker/worker_runner.py
from rq import Worker, Queue
import redis
import os

redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
conn = redis.from_url(redis_url)

if __name__ == "__main__":
    q = Queue("jobs", connection=conn)
    w = Worker([q], connection=conn)
    w.work()
