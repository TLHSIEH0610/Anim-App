import os
import sentry_sdk
from sentry_sdk.integrations.starlette import StarletteIntegration
try:
    # Prefer FastAPI-specific integration if available
    from sentry_sdk.integrations.fastapi import FastApiIntegration as _FastApiIntegration
except Exception:  # pragma: no cover
    _FastApiIntegration = None
from fastapi import FastAPI, Depends
from .db import engine, Base, get_db, SessionLocal
from . import models  # noqa: F401 (register models)
from .routes import auth_routes, job_routes, book_routes, admin_routes, billing_routes
from fastapi.middleware.cors import CORSMiddleware
from .default_workflows import ensure_default_workflows
from .default_stories import ensure_default_stories
from .db_utils import apply_schema_patches
from sqlalchemy import text

# create tables at startup (simple approach for dev)
Base.metadata.create_all(bind=engine)
apply_schema_patches(engine)
ensure_default_workflows(SessionLocal)
ensure_default_stories(SessionLocal)

# Initialize Sentry if DSN provided
_SENTRY_DSN = os.getenv("SENTRY_DSN")
if _SENTRY_DSN:
    integrations = [StarletteIntegration()]
    if _FastApiIntegration is not None:
        try:
            integrations.append(_FastApiIntegration())
        except Exception:
            pass
    sentry_sdk.init(
        dsn=_SENTRY_DSN,
        environment=os.getenv("SENTRY_ENV", "local"),
        traces_sample_rate=float(os.getenv("SENTRY_TRACES_SAMPLE_RATE", "0.05")),
        profiles_sample_rate=float(os.getenv("SENTRY_PROFILES_SAMPLE_RATE", "0.0")),
        integrations=integrations,
    )

app = FastAPI(title="Children's Book Creator API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_routes.router)
app.include_router(job_routes.router)
app.include_router(book_routes.router)
app.include_router(admin_routes.router)
app.include_router(billing_routes.router)

@app.get("/")
def read_root():
    return {"status": "ok", "message": "Backend is running!"}

@app.get("/health")
def health(db=Depends(get_db)):
    try:
        db.execute(text("SELECT 1"))
        return {"status":"healthy","db":"connected"}
    except Exception as e:
        return {"status":"unhealthy","error": str(e)}

@app.get("/db-check")
def db_check():
    # quick DB check using raw SQL
    try:
        with engine.connect() as conn:
            res = conn.execute(text("SELECT 1")).scalar()
            return {"db_connected": bool(res)}
    except Exception as e:
        return {"db_connected": False, "error": str(e)}
