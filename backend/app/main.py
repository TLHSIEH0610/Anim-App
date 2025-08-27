import os
from fastapi import FastAPI, Depends
from .db import engine, Base, get_db
from . import models  # noqa: F401 (register models)
from .routes import auth_routes, job_routes
from fastapi.middleware.cors import CORSMiddleware

# create tables at startup (simple approach for dev)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Animation API (dev)")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(job_routes.router)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend is running!"}

@app.get("/health")
def health(db=Depends(get_db)):
    try:
        db.execute("SELECT 1")
        return {"status":"healthy","db":"connected"}
    except Exception as e:
        return {"status":"unhealthy","error": str(e)}

@app.get("/db-check")
def db_check():
    # quick DB check using raw SQL
    from sqlalchemy import text
    try:
        with engine.connect() as conn:
            res = conn.execute(text("SELECT 1")).scalar()
            return {"db_connected": bool(res)}
    except Exception as e:
        return {"db_connected": False, "error": str(e)}