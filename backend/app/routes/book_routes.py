import os
import json
import base64
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form
from typing import List, Optional
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from app.auth import current_user
from app.db import get_db
from app.models import Book, BookPage, StoryTemplate, Payment
from app.schemas import BookCreate, BookResponse, BookWithPagesResponse, BookListResponse, BookPageResponse
from app.storage import save_upload
from app.pricing import resolve_story_price
from rq import Queue
import redis

router = APIRouter(prefix="/books", tags=["books"])

# RQ connection (same Redis as compose)
redis_url = os.getenv("REDIS_URL", "redis://redis:6379/0")
_redis = redis.from_url(redis_url)
q = Queue("books", connection=_redis)


def _decimal_to_float(value: Optional[Decimal]) -> Optional[float]:
    if value is None:
        return None
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return float(value.quantize(Decimal("0.01")))


def _parse_bool(value: Optional[str]) -> bool:
    if value is None:
        return False
    if isinstance(value, bool):
        return value
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


@router.post("/create", response_model=BookResponse)
async def create_book(
    files: List[UploadFile] = File(...),
    title: str = Form(...),
    story_source: str = Form("custom"),
    template_key: Optional[str] = Form(None),
    template_params: Optional[str] = Form(None),
    target_age: Optional[str] = Form(None),
    page_count: int = Form(8),
    character_description: str = Form(""),
    positive_prompt: str = Form(""),
    negative_prompt: str = Form(""),
    payment_id: Optional[int] = Form(None),
    apply_free_trial: Optional[str] = Form(None),
    db: Session = Depends(get_db),
    user = Depends(current_user)
):
    """Create a new children's book after validating payment/promotions."""

    if not files or len(files) < 1:
        raise HTTPException(400, "At least 1 image is required")
    if len(files) > 4:
        raise HTTPException(400, "Maximum 4 images allowed")
    for file in files:
        ext = (file.filename or "").split(".")[-1].lower()
        if ext not in {"jpg", "jpeg", "png"}:
            raise HTTPException(400, f"Unsupported file type for {file.filename}. Use JPG or PNG.")

    if not title.strip():
        raise HTTPException(400, "Title is required")

    story_source = story_source.strip().lower()
    if story_source not in {"custom", "template"}:
        raise HTTPException(400, "story_source must be 'custom' or 'template'")

    template_params_dict = {}
    if template_params:
        try:
            template_params_dict = json.loads(template_params)
        except json.JSONDecodeError:
            raise HTTPException(400, "template_params must be valid JSON")

    allowed_pages = [1, 4, 6, 8, 10, 12, 16]
    if page_count not in allowed_pages:
        raise HTTPException(400, "Invalid page count. Choose from: 1, 4, 6, 8, 10, 12, 16")

    pricing_quote = None
    payment_record = None
    story_template = None
    theme_value = "custom"
    apply_free_trial_flag = _parse_bool(apply_free_trial)

    if story_source == "template":
        if not template_key:
            raise HTTPException(400, "Template selection required")
        story_template = (
            db.query(StoryTemplate)
            .options(joinedload(StoryTemplate.pages))
            .filter(StoryTemplate.slug == template_key, StoryTemplate.is_active.is_(True))
            .first()
        )
        if not story_template:
            raise HTTPException(400, "Unknown template key")
        if not target_age:
            target_age = story_template.default_age
        theme_value = story_template.slug

        pricing_quote = resolve_story_price(user, story_template)

        if pricing_quote.final_price <= Decimal("0"):
            if pricing_quote.free_trial_slug:
                if pricing_quote.free_trial_consumed:
                    raise HTTPException(400, "Free trial already consumed")
                if not apply_free_trial_flag:
                    raise HTTPException(400, "apply_free_trial flag must be true to consume free trial")
        else:
            if not payment_id:
                raise HTTPException(402, "Payment required before book creation")
            payment_record = (
                db.query(Payment)
                .filter(Payment.id == payment_id, Payment.user_id == user.id)
                .with_for_update()
                .first()
            )
            if not payment_record:
                raise HTTPException(404, "Payment not found")
            if payment_record.status != "completed":
                raise HTTPException(400, "Payment not completed")
            if payment_record.book_id is not None:
                raise HTTPException(400, "Payment already consumed")
            if payment_record.story_template_slug and payment_record.story_template_slug != story_template.slug:
                raise HTTPException(400, "Payment template mismatch")

            expected_amount = pricing_quote.final_price.quantize(Decimal("0.01"))
            paid_amount = Decimal(payment_record.amount_dollars or 0).quantize(Decimal("0.01"))
            if paid_amount != expected_amount:
                raise HTTPException(400, "Payment amount mismatch")
    else:
        if target_age not in ["3-5", "6-8", "9-12"]:
            raise HTTPException(400, "Invalid age group. Choose from: 3-5, 6-8, 9-12")

    try:
        character_desc_value = character_description.strip()
        if story_source == "template" and not character_desc_value:
            if template_params_dict and template_params_dict.get("name"):
                character_desc_value = template_params_dict["name"].strip()

        book = Book(
            user_id=user.id,
            title=title.strip(),
            theme=theme_value,
            target_age=target_age,
            page_count=page_count,
            character_description=character_desc_value,
            positive_prompt=positive_prompt.strip() if story_source == "custom" else "",
            negative_prompt=negative_prompt.strip() if story_source == "custom" else "",
            original_image_paths=json.dumps([]),
            story_source=story_source,
            template_key=template_key if story_source == "template" else None,
            template_params=template_params_dict,
            status="creating"
        )

        db.add(book)
        db.flush()

        saved_paths = []
        for i, file in enumerate(files):
            original_ext = (file.filename or "").split(".")[-1]
            ext = f".{original_ext.lower()}" if original_ext else ""
            target_name = f"{book.id}_character_main_{i}"
            saved_path = save_upload(file.file, subdir="book_inputs", filename=f"{target_name}{ext}")
            saved_paths.append(saved_path)

        book.original_image_paths = json.dumps(saved_paths)

        if (
            pricing_quote
            and pricing_quote.final_price <= Decimal("0")
            and pricing_quote.free_trial_slug
            and apply_free_trial_flag
        ):
            trials = list(user.free_trials_used or [])
            if pricing_quote.free_trial_slug not in trials:
                trials.append(pricing_quote.free_trial_slug)
                user.free_trials_used = trials

        if payment_record:
            payment_record.book_id = book.id
            metadata = payment_record.metadata_json or {}
            metadata.update({
                "book_id": book.id,
                "applied_at": datetime.now(timezone.utc).isoformat(),
            })
            payment_record.metadata_json = metadata

        db.commit()
        db.refresh(book)

        job = q.enqueue(
            "app.worker.book_processor.create_childbook",
            book.id,
            job_timeout=1800
        )

        return BookResponse.from_orm(book)

    except HTTPException:
        db.rollback()
        raise
    except Exception as exc:
        db.rollback()
        raise HTTPException(500, f"Failed to create book: {exc}")
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
                    print(f"âœ… Successfully loaded image for page {page.page_number}, size: {len(image_data)} chars")
            except Exception as e:
                print(f"âŒ Error loading image for page {page.page_number}: {e}")
        else:
            print(f"âš ï¸ Page {page.page_number}: status={page.image_status}, path={page.image_path}, exists={os.path.exists(page.image_path) if page.image_path else 'N/A'}")
        
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


@router.get("/stories/templates")
def list_story_templates(user = Depends(current_user), db: Session = Depends(get_db)):
    templates = (
        db.query(StoryTemplate)
        .options(joinedload(StoryTemplate.pages))
        .filter(StoryTemplate.is_active.is_(True))
        .order_by(StoryTemplate.name.asc())
        .all()
    )
    stories = []
    for template in templates:
        quote = resolve_story_price(user, template)
        stories.append(
            {
                "slug": template.slug,
                "name": template.name,
                "description": template.description,
                "default_age": template.default_age,
                "page_count": len(template.pages) or 0,
                "currency": quote.currency,
                "price_dollars": _decimal_to_float(template.price_dollars),
                "discount_price": _decimal_to_float(template.discount_price),
                "final_price": _decimal_to_float(quote.final_price),
                "promotion_type": quote.promotion_type,
                "promotion_label": quote.promotion_label,
                "free_trial_slug": quote.free_trial_slug,
                "free_trial_consumed": quote.free_trial_consumed,
                "credits_required": quote.credits_required,
                "credits_balance": user.credits,
            }
        )
    return {"stories": stories}



















