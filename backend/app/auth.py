import os, datetime
from fastapi import Depends, HTTPException
from fastapi.security import OAuth2PasswordBearer
from jose import jwt
from passlib.context import CryptContext
from sqlalchemy.orm import Session
from .db import get_db
from .models import User


pwd_context = CryptContext(schemes=["pbkdf2_sha256"], deprecated="auto")

SECRET_KEY = os.getenv("SECRET_KEY", "dev")
ALGO = "HS256"
ACCESS_MIN = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "43200"))


oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


def hash_pw(pw: str) -> str:
    return pwd_context.hash(pw)

def verify_pw(pw: str, h: str) -> bool:
    try:
        return pwd_context.verify(pw, h)
    except ValueError:
        return False

def create_user(db: Session, email: str, password: str) -> User:
    u = User(email=email, password_hash=hash_pw(password))
    db.add(u); db.commit(); db.refresh(u)
    return u

def get_user_by_email(db: Session, email: str):
    return db.query(User).filter(User.email == email).first()

def create_access_token(user_id: int):
    now = datetime.datetime.utcnow()
    payload = {"sub": str(user_id), "iat": now, "exp": now + datetime.timedelta(minutes=ACCESS_MIN)}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGO)

def current_user(db: Session = Depends(get_db), token: str = Depends(oauth2_scheme)) -> User:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGO])
        uid = int(payload.get("sub"))
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    u = db.get(User, uid)
    if not u:
        raise HTTPException(status_code=401, detail="User not found")
    return u
