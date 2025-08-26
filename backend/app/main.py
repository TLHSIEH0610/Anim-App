import os
from fastapi import FastAPI
from .db import engine, Base
from . import models  # noqa: F401 (register models)

# create tables at startup (simple approach for dev)
Base.metadata.create_all(bind=engine)

app = FastAPI(title="Anim API (dev)")

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend is running!"}

@app.get("/health")
def health():
    return {"ok": True}

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