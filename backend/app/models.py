from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text
from sqlalchemy.orm import relationship
from datetime import datetime, timezone
from .db import Base


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    credits = Column(Integer, default=0)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))

    jobs = relationship("Job", back_populates="user")


class Job(Base):
    __tablename__ = "jobs"
    id = Column(Integer, primary_key=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    status = Column(String(32), index=True, default="queued") # queued|processing|done|failed|expired
    input_path = Column(Text, nullable=False)
    output_path = Column(Text)
    error = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    started_at = Column(DateTime(timezone=True))
    finished_at = Column(DateTime(timezone=True))

    user = relationship("User", back_populates="jobs")