# backend/app/routes/job_routes.py
import os
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from sqlalchemy.orm import Session
from app.auth import current_user
from app.db import get_db
from app.models import Job
from app.storage import save_upload
from app.utility import user_free_remaining
from rq import Queue
import redis
import os

router = APIRouter(prefix="/jobs", tags=["jobs"])

# RQ connection (same Redis as compose)
redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
_redis = redis.from_url(redis_url)
q = Queue("jobs", connection=_redis)

@router.post("/upload")
def upload_image(file: UploadFile = File(...), db: Session = Depends(get_db), user = Depends(current_user)):
    # validate extension
    ext = (file.filename or "").split(".")[-1].lower()
    if ext not in {"jpg","jpeg","png"}:
        raise HTTPException(400, "Unsupported file type")

    free_left = user_free_remaining(db, user.id)
    if free_left <= 0 and user.credits <= 0:
        raise HTTPException(402, "Quota exceeded. Please purchase credits.")

    # save file
    saved_path = save_upload(file.file, subdir="inputs", filename=file.filename)
    job = Job(user_id=user.id, input_path=saved_path)
    db.add(job); db.commit(); db.refresh(job)

    # consume credit if no free left
    if free_left <= 0:
        user.credits -= 1
        db.commit()

    # enqueue: worker will run function 'worker.job_process.process_image'
    q.enqueue("worker.job_process.process_image", job.id, job.input_path)

    return {"job_id": job.id, "status": job.status}
