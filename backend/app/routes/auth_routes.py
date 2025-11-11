# backend/app/routes/auth_routes.py
import os
import secrets
import time
from typing import Any

import requests
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from app.db import get_db
from app.auth import create_user, get_user_by_email, verify_pw, create_access_token, current_user
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
def login(payload: LoginIn, db: Session = Depends(get_db)):
    u = get_user_by_email(db, payload.email)
    if not u or not verify_pw(payload.password, u.password_hash):
        raise HTTPException(401, "Invalid credentials")
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


@router.post("/mock")
def mock_login(payload: MockLoginIn | None = None, db: Session = Depends(get_db)):
    # Disable mock auth in production-like environments by default.
    # Enable only when ALLOW_AUTH_MOCK=true is explicitly set.
    sentry_env = os.getenv("SENTRY_ENV", "local").strip().lower()
    default_allowed = sentry_env in {"local", "development", "dev"}
    allow_env = os.getenv("ALLOW_AUTH_MOCK", "true" if default_allowed else "false").strip().lower()
    allow = allow_env in {"1", "true", "yes", "on"}
    if not allow:
        # Hide existence of the endpoint in production
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not found")

    email = (payload.email if payload else None) or "test@example.com"
    user = get_user_by_email(db, email)
    if not user:
        user = create_user(db, email, "password")
    token = create_access_token(user.id)
    return {
        "token": token,
        "user": {
            "id": user.id,
            "email": user.email,
            "role": getattr(user, "role", None),
        },
    }

from app.models import Book, BookPage, Payment, User as UserModel
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

        # Finally delete the user
        db.delete(user)
        db.commit()
        return {"message": "Account and all data deleted", "deleted": deleted, "deletedAt": int(time.time())}
    except Exception as exc:
        db.rollback()
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, f"Failed to delete account: {exc}")


@router.post("/google", response_model=AuthResponse)
def google_login(payload: GoogleLoginIn, db: Session = Depends(get_db)):
    profile = _verify_google_id_token(payload.id_token)
    email = profile["email"]

    user = get_user_by_email(db, email)
    if not user:
        random_password = secrets.token_urlsafe(32)
        user = create_user(db, email, random_password)

    token = create_access_token(user.id)
    name = profile.get("name") or email.split("@")[0]
    picture = profile.get("picture")

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
