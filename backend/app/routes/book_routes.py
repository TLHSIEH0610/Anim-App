import os
import json
import base64
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from typing import List
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from app.auth import current_user
from app.db import get_db
from app.models import Book, BookPage, User
from app.schemas import BookCreate, BookResponse, BookWithPagesResponse, BookListResponse, BookPageResponse
from app.storage import save_upload
from app.utility import user_free_remaining
from rq import Queue
import redis

router = APIRouter(prefix="/books", tags=["books"])

# RQ connection (same Redis as compose)
redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
_redis = redis.from_url(redis_url)
q = Queue("books", connection=_redis)

@router.post("/create", response_model=BookResponse)
async def create_book(
    files: List[UploadFile] = File(...),
    title: str = Form(...),
    theme: str = Form(...),
    target_age: str = Form(...),
    page_count: int = Form(8),
    character_description: str = Form(""),
    positive_prompt: str = Form(""),
    negative_prompt: str = Form(""),
    db: Session = Depends(get_db),
    user = Depends(current_user)
):
    """Create a new children's book with 1-4 uploaded images and prompts"""

    # Validate number of files
    if not files or len(files) < 1:
        raise HTTPException(400, "At least 1 image is required")
    if len(files) > 4:
        raise HTTPException(400, "Maximum 4 images allowed")

    # Validate all files
    for file in files:
        ext = (file.filename or "").split(".")[-1].lower()
        if ext not in {"jpg", "jpeg", "png"}:
            raise HTTPException(400, f"Unsupported file type for {file.filename}. Use JPG or PNG.")

    # Check user credits/quota
    free_left = user_free_remaining(db, user.id)
    books_this_month = db.query(Book).filter(Book.user_id == user.id).count()

    # For books, let's say 1 free book per month, then costs 3 credits
    if books_this_month >= 1 and user.credits < 3:
        raise HTTPException(402, "Insufficient credits. Book creation requires 3 credits after your first free book.")

    # Validate inputs
    if not title.strip():
        raise HTTPException(400, "Title is required")

    if theme not in ["adventure", "friendship", "learning", "bedtime", "fantasy", "family"]:
        raise HTTPException(400, "Invalid theme. Choose from: adventure, friendship, learning, bedtime, fantasy, family")

    if target_age not in ["3-5", "6-8", "9-12"]:
        raise HTTPException(400, "Invalid age group. Choose from: 3-5, 6-8, 9-12")

    if page_count not in [1, 4, 6, 8, 10, 12, 16]:
        raise HTTPException(400, "Invalid page count. Choose from: 1, 4, 6, 8, 10, 12, 16")

    try:
        # Save all uploaded images
        saved_paths = []
        for i, file in enumerate(files):
            saved_path = save_upload(file.file, subdir="book_inputs", filename=f"{i}_{file.filename}")
            saved_paths.append(saved_path)

        # Create book record
        book = Book(
            user_id=user.id,
            title=title.strip(),
            theme=theme,
            target_age=target_age,
            page_count=page_count,
            character_description=character_description.strip(),
            positive_prompt=positive_prompt.strip(),
            negative_prompt=negative_prompt.strip(),
            original_image_paths=json.dumps(saved_paths),  # Store as JSON array
            status="creating"
        )
        
        db.add(book)
        db.commit()
        db.refresh(book)
        
        # Deduct credits if not free
        if books_this_month >= 1:
            user.credits -= 3
            db.commit()
        
        # Enqueue book creation job
        job = q.enqueue(
            "app.worker.book_processor.create_childbook",
            book.id,
            job_timeout=1800  # 30 minutes timeout
        )
        
        return BookResponse.from_orm(book)
        
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to create book: {str(e)}")

@router.get("/list", response_model=BookListResponse)
def list_user_books(user = Depends(current_user), db: Session = Depends(get_db)):
    """Get list of user's books"""
    books = db.query(Book).filter(Book.user_id == user.id).order_by(Book.created_at.desc()).limit(20).all()
    
    return BookListResponse(books=[BookResponse.from_orm(book) for book in books])

@router.get("/{book_id}", response_model=BookWithPagesResponse)  
def get_book_details(book_id: int, user = Depends(current_user), db: Session = Depends(get_db)):
    """Get detailed book information including pages"""
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == user.id).first()
    if not book:
        raise HTTPException(404, "Book not found")
    
    # Load pages
    pages = db.query(BookPage).filter(BookPage.book_id == book_id).order_by(BookPage.page_number).all()
    
    book_response = BookWithPagesResponse.from_orm(book)
    book_response.pages = [BookPageResponse.from_orm(page) for page in pages]
    
    return book_response

@router.get("/{book_id}/status", response_model=BookResponse)
def get_book_status(book_id: int, user = Depends(current_user), db: Session = Depends(get_db)):
    """Get book creation status and progress"""
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == user.id).first()
    if not book:
        raise HTTPException(404, "Book not found")
    
    return BookResponse.from_orm(book)

@router.get("/{book_id}/pdf")
def download_book_pdf(book_id: int, user = Depends(current_user), db: Session = Depends(get_db)):
    """Download the completed book as PDF"""
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == user.id).first()
    if not book:
        raise HTTPException(404, "Book not found")
    
    if book.status != "completed" or not book.pdf_path:
        raise HTTPException(404, "Book not completed or PDF not available")
    
    if not os.path.exists(book.pdf_path):
        raise HTTPException(404, "PDF file not found")
    
    return FileResponse(
        book.pdf_path,
        media_type="application/pdf",
        filename=f"{book.title.replace(' ', '_')}_book.pdf"
    )

@router.get("/{book_id}/preview")
def get_book_preview(book_id: int, user = Depends(current_user), db: Session = Depends(get_db)):
    """Get book preview with all pages as base64 images for mobile viewing"""
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == user.id).first()
    if not book:
        raise HTTPException(404, "Book not found")
    
    # Get all pages
    pages = db.query(BookPage).filter(BookPage.book_id == book_id).order_by(BookPage.page_number).all()
    
    preview_pages = []
    for page in pages:
        page_data = {
            "page_number": page.page_number,
            "text": page.text_content,
            "image_status": page.image_status,
            "image_data": None
        }
        
        # Add image data if available
        if page.image_status == "completed" and page.image_path and os.path.exists(page.image_path):
            try:
                print(f"Loading image for page {page.page_number} from {page.image_path}")
                with open(page.image_path, "rb") as img_file:
                    image_data = base64.b64encode(img_file.read()).decode()
                    file_ext = page.image_path.lower().split('.')[-1]
                    mime_type = "image/png" if file_ext == "png" else "image/jpeg"
                    page_data["image_data"] = f"data:{mime_type};base64,{image_data}"
                    print(f"✅ Successfully loaded image for page {page.page_number}, size: {len(image_data)} chars")
            except Exception as e:
                print(f"❌ Error loading image for page {page.page_number}: {e}")
        else:
            print(f"⚠️ Page {page.page_number}: status={page.image_status}, path={page.image_path}, exists={os.path.exists(page.image_path) if page.image_path else 'N/A'}")
        
        preview_pages.append(page_data)
    
    return {
        "book_id": book_id,
        "title": book.title,
        "status": book.status,
        "progress": book.progress_percentage,
        "pages": preview_pages,
        "total_pages": len(preview_pages)
    }

@router.delete("/{book_id}")
def delete_book(book_id: int, user = Depends(current_user), db: Session = Depends(get_db)):
    """Delete a book and its associated files"""
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == user.id).first()
    if not book:
        raise HTTPException(404, "Book not found")
    
    try:
        # Delete associated files
        # Handle both old (single path) and new (JSON array) formats
        if book.original_image_paths:
            try:
                paths = json.loads(book.original_image_paths)
                for path in paths:
                    if os.path.exists(path):
                        os.remove(path)
            except:
                # Fallback for old format (single string path)
                if os.path.exists(book.original_image_paths):
                    os.remove(book.original_image_paths)

        if book.pdf_path and os.path.exists(book.pdf_path):
            os.remove(book.pdf_path)
        
        # Delete page images
        pages = db.query(BookPage).filter(BookPage.book_id == book_id).all()
        for page in pages:
            if page.image_path and os.path.exists(page.image_path):
                os.remove(page.image_path)
        
        # Delete from database (cascade will handle pages)
        db.delete(book)
        db.commit()
        
        return {"message": "Book deleted successfully"}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to delete book: {str(e)}")

@router.post("/{book_id}/retry")
def retry_book_creation(book_id: int, user = Depends(current_user), db: Session = Depends(get_db)):
    """Retry failed book creation"""
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == user.id).first()
    if not book:
        raise HTTPException(404, "Book not found")
    
    if book.status not in ["failed", "completed"]:
        raise HTTPException(400, "Book is not in a retryable state")
    
    # Reset book status
    book.status = "creating"
    book.progress_percentage = 0.0
    book.error_message = None
    book.story_generated_at = None
    book.images_completed_at = None
    book.pdf_generated_at = None
    book.completed_at = None
    
    # Clear pages if they exist
    db.query(BookPage).filter(BookPage.book_id == book_id).delete()
    
    db.commit()
    
    # Re-enqueue job
    job = q.enqueue(
        "app.worker.book_processor.create_childbook",
        book.id,
        job_timeout=1800  # 30 minutes timeout
    )
    
    return {"message": "Book creation restarted", "job_id": job.id}

@router.post("/{book_id}/admin-regenerate")
def admin_regenerate_book(book_id: int, user = Depends(current_user), db: Session = Depends(get_db)):
    """Admin regenerate: Delete all book content and start fresh"""
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == user.id).first()
    if not book:
        raise HTTPException(404, "Book not found")
    
    try:
        # Delete page images
        pages = db.query(BookPage).filter(BookPage.book_id == book_id).all()
        for page in pages:
            if page.image_path and os.path.exists(page.image_path):
                os.remove(page.image_path)
        
        # Delete PDF if it exists
        if book.pdf_path and os.path.exists(book.pdf_path):
            os.remove(book.pdf_path)
        
        # Clear all pages
        db.query(BookPage).filter(BookPage.book_id == book_id).delete()
        
        # Reset book status and timestamps
        book.status = "creating"
        book.progress_percentage = 0.0
        book.error_message = None
        book.story_generated_at = None
        book.images_completed_at = None
        book.pdf_generated_at = None
        book.completed_at = None
        book.pdf_path = None
        
        db.commit()
        
        # Re-enqueue job
        job = q.enqueue(
            "app.worker.book_processor.create_childbook",
            book.id,
            job_timeout=1800  # 30 minutes timeout
        )
        
        return {"message": "Book completely regenerated", "job_id": job.id}
        
    except Exception as e:
        db.rollback()
        raise HTTPException(500, f"Failed to regenerate book: {str(e)}")