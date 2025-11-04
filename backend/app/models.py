from sqlalchemy import Column, Integer, BigInteger, String, DateTime, Boolean, ForeignKey, Text, Float, JSON, Numeric
from sqlalchemy.orm import relationship, foreign
from datetime import datetime, timezone
from decimal import Decimal
from .db import Base
import json


class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String(255), unique=True, index=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    role = Column(String(20), default="user")
    credits = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    free_trials_used = Column(JSON, default=list)

    jobs = relationship("Job", back_populates="user")
    books = relationship("Book", back_populates="user")
    payments = relationship("Payment", back_populates="user")


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
    theme = Column(String(100))  # reused to store template key or 'custom'
    target_age = Column(String(10))  # 3-5, 6-8, 9-12
    page_count = Column(Integer, default=8)

    # Generation parameters
    character_description = Column(Text)
    positive_prompt = Column(Text)
    negative_prompt = Column(Text)
    original_image_paths = Column(Text)  # JSON array of image paths (1-3 images)
    story_source = Column(String(20), default="custom")  # custom | template
    template_key = Column(String(64))
    template_params = Column(JSON)
    
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
    workflow_snapshots = relationship(
        "BookWorkflowSnapshot",
        back_populates="book",
        cascade="all, delete-orphan",
    )
    story_template = relationship(
        "StoryTemplate",
        primaryjoin="Book.template_key==foreign(StoryTemplate.slug)",
        viewonly=True,
    )


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


class BookWorkflowSnapshot(Base):
    __tablename__ = "book_workflow_snapshots"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), index=True, nullable=False)
    page_number = Column(Integer, nullable=False)
    prompt_id = Column(String(100))
    workflow_json = Column(JSON, nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    vae_image_path = Column(Text)
    workflow_version = Column(Integer)
    workflow_slug = Column(String(100))

    book = relationship("Book", back_populates="workflow_snapshots")


class WorkflowDefinition(Base):
    __tablename__ = "workflow_definitions"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), index=True, nullable=False)
    name = Column(String(255), nullable=False)
    type = Column(String(50), nullable=False)
    version = Column(Integer, nullable=False, default=1)
    content = Column(JSON, nullable=False)
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))


class StoryTemplate(Base):
    __tablename__ = "story_templates"
    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(100), unique=True, index=True, nullable=False)
    name = Column(String(255), nullable=False)

    description = Column(Text)
    age = Column(String(10))
    version = Column(Integer, nullable=False, default=1)
    workflow_slug = Column(String(100), nullable=False, default="base")
    is_active = Column(Boolean, default=True)
    cover_image_url = Column(Text)
    demo_image_1 = Column(Text)
    demo_image_2 = Column(Text)
    demo_image_3 = Column(Text)
    demo_image_4 = Column(Text)
    free_trial_slug = Column(String(120))
    price_dollars = Column(Numeric(10, 2), nullable=False, default=Decimal("1.50"))
    discount_price = Column(Numeric(10, 2))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    pages = relationship(
        "StoryTemplatePage",
        back_populates="template",
        cascade="all, delete-orphan",
        order_by="StoryTemplatePage.page_number",
    )


class StoryTemplatePage(Base):
    __tablename__ = "story_template_pages"

    id = Column(Integer, primary_key=True, index=True)
    story_template_id = Column(Integer, ForeignKey("story_templates.id"), nullable=False, index=True)
    page_number = Column(Integer, nullable=False)
    story_text = Column(Text, nullable=False)
    image_prompt = Column(Text, nullable=False)
    positive_prompt = Column(Text, nullable=False)
    negative_prompt = Column(Text)
    pose_prompt = Column(Text, nullable=False)
    controlnet_image = Column(String(150))
    keypoint_image = Column(String(150))
    workflow_slug = Column(String(100))
    seed = Column(BigInteger)
    cover_text = Column(Text)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    template = relationship("StoryTemplate", back_populates="pages")


class Payment(Base):
    __tablename__ = "payments"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=True, index=True)
    story_template_slug = Column(String(100))
    amount_dollars = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    currency = Column(String(10), nullable=False, default="aud")
    method = Column(String(20), nullable=False)
    stripe_payment_intent_id = Column(String(255))
    status = Column(String(50), nullable=False)
    metadata_json = Column('metadata', JSON)
    credits_used = Column(Numeric(10, 2), nullable=False, default=Decimal("0.00"))
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))

    user = relationship("User", back_populates="payments")
    book = relationship("Book")


class ControlNetImage(Base):
    __tablename__ = "controlnet_images"

    id = Column(Integer, primary_key=True, index=True)
    slug = Column(String(120), unique=True, nullable=False, index=True)
    name = Column(String(255), nullable=False)
    workflow_slug = Column(String(100), nullable=False, default="base")
    image_path = Column(Text, nullable=False)
    preview_path = Column(Text)
    metadata_json = Column("metadata", JSON)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    updated_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), onupdate=lambda: datetime.now(timezone.utc))
