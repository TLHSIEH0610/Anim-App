from sqlalchemy import Column, Integer, String, DateTime, Boolean, ForeignKey, Text, Float
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
    books = relationship("Book", back_populates="user")


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


class Book(Base):
    __tablename__ = "books"
    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), index=True)
    title = Column(String(255), nullable=False)
    theme = Column(String(100))  # adventure, friendship, learning, etc.
    target_age = Column(String(10))  # 3-5, 6-8, 9-12
    page_count = Column(Integer, default=8)
    
    # Generation parameters
    character_description = Column(Text)
    positive_prompt = Column(Text)
    negative_prompt = Column(Text)
    original_image_path = Column(Text)
    
    # Story data (JSON string)
    story_data = Column(Text)  # JSON of the generated story
    
    # Status tracking
    status = Column(String(32), default="creating")  # creating|generating_story|generating_images|composing|completed|failed
    progress_percentage = Column(Float, default=0.0)
    error_message = Column(Text)
    
    # File paths
    pdf_path = Column(Text)
    preview_image_path = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    story_generated_at = Column(DateTime(timezone=True))
    images_completed_at = Column(DateTime(timezone=True))
    pdf_generated_at = Column(DateTime(timezone=True))
    completed_at = Column(DateTime(timezone=True))
    
    # Relationships
    user = relationship("User", back_populates="books")
    pages = relationship("BookPage", back_populates="book", cascade="all, delete-orphan")


class BookPage(Base):
    __tablename__ = "book_pages"
    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), index=True)
    page_number = Column(Integer, nullable=False)
    
    # Content
    text_content = Column(Text, nullable=False)
    image_description = Column(Text, nullable=False)
    
    # Image generation details
    enhanced_prompt = Column(Text)  # The final prompt sent to ComfyUI
    image_path = Column(Text)
    comfy_job_id = Column(String(100))  # Track ComfyUI job
    
    # Processing status
    image_status = Column(String(32), default="pending")  # pending|processing|completed|failed
    image_error = Column(Text)
    
    # Timestamps
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    image_started_at = Column(DateTime(timezone=True))
    image_completed_at = Column(DateTime(timezone=True))
    
    # Relationships
    book = relationship("Book", back_populates="pages")