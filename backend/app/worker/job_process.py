# backend/worker/job_process.py
import os, time, asyncio
from datetime import datetime, timezone
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.models import Job
from app.db import DATABASE_URL if False else None  # placeholder
# We will get DATABASE_URL from env to create our own engine here:
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://arnie:password@db:5432/appdb")
_engine = create_engine(DATABASE_URL)
_Session = sessionmaker(bind=_engine)

def mock_process_image(input_path: str, output_dir: str) -> str:
    # Simulate processing time on Mac (3-6s)
    time.sleep(4)
    # Copy input -> outputs with suffix to simulate result
    os.makedirs(output_dir, exist_ok=True)
    base = os.path.basename(input_path)
    out = os.path.join(output_dir, base + ".out.png")
    # simple file copy (binary)
    with open(input_path, "rb") as rf:
        data = rf.read()
    with open(out, "wb") as wf:
        wf.write(data)
    return out

def process_image(job_id: int, input_path: str):
    session = _Session()
    job = session.query(Job).get(job_id)
    if job:
        job.status = "processing"
        job.started_at = datetime.now(timezone.utc)
        session.commit()
    try:
        out_dir = os.getenv("MEDIA_ROOT", "/data/media") + "/outputs"
        out_path = mock_process_image(input_path, out_dir)
        if job:
            job.status = "done"
            job.output_path = out_path
            job.finished_at = datetime.now(timezone.utc)
            session.commit()
    except Exception as e:
        if job:
            job.status = "failed"
            job.error = str(e)
            job.finished_at = datetime.now(timezone.utc)
            session.commit()
        raise
    finally:
        session.close()