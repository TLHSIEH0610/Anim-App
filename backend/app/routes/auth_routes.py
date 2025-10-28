# backend/app/routes/auth_routes.py
import os
import secrets
import time
from typing import Any

import requests
from fastapi import APIRouter, HTTPException, Depends, status
from sqlalchemy.orm import Session
from app.db import get_db
from app.auth import create_user, get_user_by_email, verify_pw, create_access_token
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
