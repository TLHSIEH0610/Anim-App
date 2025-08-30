# backend/app/routes/job_routes.py
import os
import base64
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
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

    # enqueue: worker will run function 'app.worker.job_process.process_image'
    q.enqueue("app.worker.job_process.process_image", job.id, job.input_path)

    return {"job_id": job.id, "status": job.status}

@router.get("/status/{job_id}")
def get_job_status(job_id: int, user = Depends(current_user), db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == user.id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    
    return {
        "job_id": job.id,
        "status": job.status,
        "input_path": job.input_path,
        "output_path": job.output_path,
        "created_at": job.created_at,
        "completed_at": job.finished_at
    }

@router.get("/list")
def list_user_jobs(user = Depends(current_user), db: Session = Depends(get_db)):
    jobs = db.query(Job).filter(Job.user_id == user.id).order_by(Job.id.desc()).limit(20).all()
    
    return {
        "jobs": [
            {
                "job_id": job.id,
                "status": job.status,
                "input_path": job.input_path,
                "output_path": job.output_path,
                "created_at": job.created_at,
                "completed_at": job.finished_at
            }
            for job in jobs
        ]
    }

@router.get("/image/{job_id}")
def get_job_image(job_id: int, user = Depends(current_user), db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == user.id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    
    if job.status != "done" or not job.output_path:
        raise HTTPException(404, "Job not completed or no output available")
    
    if not os.path.exists(job.output_path):
        raise HTTPException(404, "Output file not found")
    
    return FileResponse(
        job.output_path,
        media_type="image/png",
        filename=f"job_{job_id}_output.png"
    )

@router.get("/image-data/{job_id}")
def get_job_image_data(job_id: int, user = Depends(current_user), db: Session = Depends(get_db)):
    job = db.query(Job).filter(Job.id == job_id, Job.user_id == user.id).first()
    if not job:
        raise HTTPException(404, "Job not found")
    
    if job.status != "done" or not job.output_path:
        raise HTTPException(404, "Job not completed or no output available")
    
    if not os.path.exists(job.output_path):
        raise HTTPException(404, "Output file not found")
    
    try:
        with open(job.output_path, "rb") as image_file:
            image_data = base64.b64encode(image_file.read()).decode()
            
        # Determine the mime type based on file extension
        file_ext = job.output_path.lower().split('.')[-1]
        mime_type = "image/png" if file_ext == "png" else "image/jpeg"
        
        return {
            "job_id": job_id,
            "image_data": f"data:{mime_type};base64,{image_data}",
            "filename": f"job_{job_id}_output.{file_ext}"
        }
    except Exception as e:
        raise HTTPException(500, f"Error reading image file: {str(e)}")
