# backend/app/routes/auth_routes.py
from fastapi import APIRouter, HTTPException, Depends
from sqlalchemy.orm import Session
from app.db import get_db
from app.auth import create_user, get_user_by_email, verify_pw, create_access_token
from pydantic import BaseModel

router = APIRouter(prefix="/auth", tags=["auth"])

class RegisterIn(BaseModel):
    email: str
    password: str

class LoginIn(BaseModel):
    email: str
    password: str

@router.post("/register")
def register(payload: RegisterIn, db: Session = Depends(get_db)):
    if get_user_by_email(db, payload.email):
        raise HTTPException(400, "Email already registered")
    u = create_user(db, payload.email, payload.password)
    return {"token": create_access_token(u.id)}

@router.post("/login")
def login(payload: LoginIn, db: Session = Depends(get_db)):
    u = get_user_by_email(db, payload.email)
    if not u or not verify_pw(payload.password, u.password_hash):
        raise HTTPException(401, "Invalid credentials")
    return {"token": create_access_token(u.id)}
