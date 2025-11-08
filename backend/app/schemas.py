from pydantic import BaseModel
from datetime import datetime
from typing import Optional, List, Dict, Any

class UserCreate(BaseModel):
    email: str
    password: str

class User(BaseModel):
    id: int
    email: str
    credits: int
    created_at: datetime
    
    class Config:
        from_attributes = True

class JobResponse(BaseModel):
    job_id: int
    status: str
    input_path: str
    output_path: Optional[str] = None
    created_at: datetime
    finished_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True


# New schemas for books
class BookCreate(BaseModel):
    title: str
    target_age: Optional[str] = None
    page_count: int = 8
    character_description: Optional[str] = None
    positive_prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    story_source: str = "custom"
    template_key: Optional[str] = None
    template_params: Optional[Dict[str, Any]] = None

class BookPageResponse(BaseModel):
    id: int
    page_number: int
    text_content: str
    image_description: str
    image_path: Optional[str] = None
    image_status: str = "pending"
    created_at: datetime
    image_completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class BookResponse(BaseModel):
    id: int
    title: str
    story_source: Optional[str] = "custom"
    template_key: Optional[str] = None
    template_params: Optional[Dict[str, Any]] = None
    theme: Optional[str] = None
    target_age: Optional[str] = None
    page_count: int
    status: str
    progress_percentage: float = 0.0
    error_message: Optional[str] = None
    pdf_path: Optional[str] = None
    preview_image_path: Optional[str] = None
    template_description: Optional[str] = None
    cover_url: Optional[str] = None
    created_at: datetime
    completed_at: Optional[datetime] = None
    
    class Config:
        from_attributes = True

class BookWithPagesResponse(BookResponse):
    pages: List[BookPageResponse] = []

class BookListResponse(BaseModel):
    books: List[BookResponse]
