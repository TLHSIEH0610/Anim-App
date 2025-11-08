from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from typing import Optional

from ..auth import current_user
from ..db import get_db
from ..models import SupportTicket, User
from pydantic import BaseModel

router = APIRouter(prefix="/support", tags=["support"])


class SupportTicketCreate(BaseModel):
    subject: str
    body: str
    category: Optional[str] = None
    book_id: Optional[int] = None
    app_version: Optional[str] = None
    build: Optional[str] = None
    device_os: Optional[str] = None
    api_base: Optional[str] = None


class SupportTicketResponse(BaseModel):
    id: int
    subject: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True


@router.post("/tickets")
def create_ticket(payload: SupportTicketCreate, user: User = Depends(current_user), db: Session = Depends(get_db)):
    subj = (payload.subject or "").strip()
    body = (payload.body or "").strip()
    if not subj or len(subj) > 120:
        raise HTTPException(status_code=400, detail="Subject is required and must be <= 120 characters")
    if not body or len(body) < 5:
        raise HTTPException(status_code=400, detail="Message is too short")

    ticket = SupportTicket(
        user_id=user.id,
        user_email=user.email,
        subject=subj,
        body=body,
        category=(payload.category or None),
        book_id=payload.book_id,
        status="open",
        app_version=payload.app_version,
        build=payload.build,
        device_os=payload.device_os,
        api_base=payload.api_base,
        created_at=datetime.now(timezone.utc),
        updated_at=datetime.now(timezone.utc),
    )
    db.add(ticket)
    db.commit()
    db.refresh(ticket)
    return {"message": "Ticket submitted", "ticket": SupportTicketResponse.model_validate(ticket)}
