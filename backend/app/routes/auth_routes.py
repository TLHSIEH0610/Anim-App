# backend/app/routes/auth_routes.py
import os
import secrets
import time
from typing import Any

import requests
from fastapi import APIRouter, HTTPException, Depends, status, Request
from datetime import datetime, timezone
from sqlalchemy.orm import Session
from app.db import get_db
from app.auth import create_user, get_user_by_email, verify_pw, create_access_token, current_user
from app.security import enforce_android_integrity_or_warn, record_user_attestation, write_audit_log, extract_client_signals
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])

GOOGLE_CLIENT_IDS = [
    client.strip()
    for client in os.getenv("GOOGLE_OAUTH_CLIENT_IDS", "").split(",")
    if client.strip()
]

class RegisterIn(BaseModel):
    email: str
    password: str

class LoginIn(BaseModel):
    email: str
    password: str


class MockLoginIn(BaseModel):
    email: str | None = None


class GoogleLoginIn(BaseModel):
    id_token: str


class AuthUser(BaseModel):
    id: int
    email: str
    name: str | None = None
    picture: str | None = None
    role: str | None = None


class AuthResponse(BaseModel):
    token: str
    user: AuthUser


def _verify_google_id_token(id_token: str) -> dict[str, Any]:
    try:
        resp = requests.get(
            "https://oauth2.googleapis.com/tokeninfo",
            params={"id_token": id_token},
            timeout=5,
        )
    except requests.RequestException as exc:
        raise HTTPException(status.HTTP_503_SERVICE_UNAVAILABLE, "Unable to reach Google") from exc

    if resp.status_code != 200:
        detail = resp.json().get("error_description") if resp.headers.get("content-type", "").startswith("application/json") else "Google rejected the ID token"
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, detail)

    data = resp.json()
    aud = data.get("aud")
    if GOOGLE_CLIENT_IDS and aud not in GOOGLE_CLIENT_IDS:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "ID token audience mismatch")

    exp = int(data.get("exp", "0"))
    if exp and exp < int(time.time()):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "ID token expired")

    if not data.get("email"):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Google profile is missing an email address")

    return data

@router.post("/register", response_model=AuthResponse)
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    if get_user_by_email(db, payload.email):
        raise HTTPException(400, "Email already registered")
    u = create_user(db, payload.email, payload.password)
    try:
        u.last_login_at = datetime.now(timezone.utc)
        db.add(u); db.commit(); db.refresh(u)
    except Exception:
        db.rollback()
    token = create_access_token(u.id)
    name = u.email.split("@")[0] if u.email else None
    return AuthResponse(
        token=token,
        user=AuthUser(
            id=u.id,
            email=u.email,
            name=name,
            picture=None,
            role=getattr(u, "role", None),
        ),
    )

@router.post("/login", response_model=AuthResponse)
def login(payload: LoginIn, request: Request, db: Session = Depends(get_db)):
    u = get_user_by_email(db, payload.email)
    if not u or not verify_pw(payload.password, u.password_hash):
        raise HTTPException(401, "Invalid credentials")
    try:
        u.last_login_at = datetime.now(timezone.utc)
        db.add(u); db.commit(); db.refresh(u)
    except Exception:
        db.rollback()
    token = create_access_token(u.id)
    name = u.email.split("@")[0] if u.email else None
    try:
        # Record basic device signals for heuristics
        record_user_attestation(db, u, extract_client_signals(request))
        write_audit_log(db, user=u, request=request, action="auth_password", status=200)
    except Exception:
        pass
    return AuthResponse(
        token=token,
        user=AuthUser(
            id=u.id,
            email=u.email,
            name=name,
            picture=None,
            role=getattr(u, "role", None),
        ),
    )


# Note: Mock login endpoint has been removed to reduce surface area. Use Google login
# or email/password in local/dev. If needed, reintroduce behind ALLOW_AUTH_MOCK gate.

from app.models import (
    Book,
    BookPage,
    Payment,
    User as UserModel,
    UserAttestation,
    Job,
    AuditLogEntry,
    SupportTicket,
)
import json
import os

@router.delete("/account")
def delete_account(user = Depends(current_user), db: Session = Depends(get_db)):
    """Delete the authenticated user's account and all associated data/files.

    Returns a deletion manifest with basic counts so the client can show a receipt.
    Payment rows are anonymized and retained for accounting (reassigned to a
    tombstone user with metadata cleared).
    """
    try:
        deleted = {
            "books": 0,
            "pages": 0,
            "files": 0,
            "payments_anonymized": 0,
            "user": 1,
        }
        # Disassociate user payments from books and anonymize PII while keeping summaries
        # Find or create a tombstone account to retain payment rows without PII linkage
        tombstone_email = os.getenv("DELETED_USER_EMAIL", "deleted@system.invalid")
        tombstone = db.query(UserModel).filter(UserModel.email == tombstone_email).first()
        if not tombstone:
            tombstone = create_user(db, tombstone_email, secrets.token_urlsafe(32))
            try:
                setattr(tombstone, "role", "system")
                setattr(tombstone, "credits", 0)
                db.add(tombstone)
                db.commit(); db.refresh(tombstone)
            except Exception:
                db.rollback()
        # Anonymize payments for this user
        payments_q = db.query(Payment).filter(Payment.user_id == user.id)
        deleted["payments_anonymized"] = payments_q.count()
        payments_q.update(
            {
                Payment.book_id: None,
                Payment.user_id: tombstone.id,
                Payment.stripe_payment_intent_id: None,
                Payment.metadata_json: {},
            },
            synchronize_session=False,
        )

        # Best-effort: clear audit_logs linkage (we retain rows but detach the user)
        db.query(AuditLogEntry).filter(AuditLogEntry.user_id == user.id).update(
            {AuditLogEntry.user_id: None}, synchronize_session=False
        )

        # Remove attestation rows and ephemeral jobs referencing the user
        db.query(UserAttestation).filter(UserAttestation.user_id == user.id).delete(
            synchronize_session=False
        )
        db.query(Job).filter(Job.user_id == user.id).delete(synchronize_session=False)

        # Delete all books and their files
        books = db.query(Book).filter(Book.user_id == user.id).all()
        for book in books:
            deleted["books"] += 1
            # Remove uploaded originals
            if getattr(book, 'original_image_paths', None):
                try:
                    paths = json.loads(book.original_image_paths)
                    for p in paths or []:
                        if p and os.path.exists(p):
                            try:
                                os.remove(p)
                                deleted["files"] += 1
                            except Exception:
                                pass
                except Exception:
                    if os.path.exists(book.original_image_paths):
                        try:
                            os.remove(book.original_image_paths)
                            deleted["files"] += 1
                        except Exception:
                            pass

            # Remove PDF
            if book.pdf_path and os.path.exists(book.pdf_path):
                try:
                    os.remove(book.pdf_path)
                    deleted["files"] += 1
                except Exception:
                    pass

            # Remove page images
            pages = db.query(BookPage).filter(BookPage.book_id == book.id).all()
            for page in pages:
                if page.image_path and os.path.exists(page.image_path):
                    try:
                        os.remove(page.image_path)
                        deleted["files"] += 1
                    except Exception:
                        pass
                deleted["pages"] += 1
            # Delete pages and book
            db.query(BookPage).filter(BookPage.book_id == book.id).delete()
            db.delete(book)

        # Reassign support tickets to tombstone to preserve history
        db.query(SupportTicket).filter(SupportTicket.user_id == user.id).update(
            {SupportTicket.user_id: tombstone.id}, synchronize_session=False
        )

        # Finally delete the user
        db.delete(user)
        db.commit()
        return {"message": "Account and all data deleted", "deleted": deleted, "deletedAt": int(time.time())}
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to delete account: {exc}")


@router.post("/google", response_model=AuthResponse)
def google_login(payload: GoogleLoginIn, request: Request, db: Session = Depends(get_db)):
    # Soft/conditional enforcement of Android integrity
    enforce_android_integrity_or_warn(request, action="auth_google")
    profile = _verify_google_id_token(payload.id_token)
    email = profile["email"]

    user = get_user_by_email(db, email)
    if not user:
        random_password = secrets.token_urlsafe(32)
        user = create_user(db, email, random_password)
    try:
        user.last_login_at = datetime.now(timezone.utc)
        db.add(user); db.commit(); db.refresh(user)
    except Exception:
        db.rollback()

    token = create_access_token(user.id)
    name = profile.get("name") or email.split("@")[0]
    picture = profile.get("picture")

    try:
        record_user_attestation(db, user, extract_client_signals(request))
        write_audit_log(db, user=user, request=request, action="auth_google", status=200)
    except Exception:
        pass
    return AuthResponse(
        token=token,
        user=AuthUser(
            id=user.id,
            email=user.email,
            name=name,
            picture=picture,
            role=getattr(user, "role", None),
        ),
    )
