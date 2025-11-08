import os
import json
from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, Form, Query
import logging
from typing import List, Optional
from fastapi import Request
from fastapi.responses import FileResponse, Response
from pathlib import Path
from sqlalchemy.orm import Session, joinedload
from app.auth import current_user
from jose import jwt
from app.auth import SECRET_KEY, ALGO
from app.db import get_db
from app.models import Book, BookPage, StoryTemplate, Payment
from app.schemas import BookCreate, BookResponse, BookWithPagesResponse, BookListResponse, BookPageResponse
from app.storage import save_upload
from app.pricing import resolve_story_price
from rq import Queue
from PIL import Image as PILImage
import uuid
import time
import redis

# Optional Sentry capture for warnings (non-fatal)
try:
    import sentry_sdk  # type: ignore
except Exception:  # pragma: no cover
    sentry_sdk = None  # type: ignore

def _sentry_warn(message: str) -> None:
    try:
        if sentry_sdk is not None:  # type: ignore[name-defined]
            sentry_sdk.capture_message(message, level="warning")  # type: ignore[attr-defined]
    except Exception:
        pass

router = APIRouter(prefix="/books", tags=["books"])
logger = logging.getLogger(__name__)

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
    if len(files) > 3:
        raise HTTPException(400, "Maximum 3 images allowed")
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
            target_age = story_template.age
        theme_value = story_template.slug

        pricing_quote = resolve_story_price(user, story_template)

        # For templates, auto-derive page_count from the template's defined pages (excluding cover page 0 / 'cover' workflow)
        try:
            body_count = len([
                p for p in (story_template.pages or [])
                if not (
                    getattr(p, 'page_number', None) == 0
                    or str(getattr(p, 'workflow_slug', '') or '').strip().lower() == 'cover'
                )
            ])
        except Exception:
            body_count = 0
        if body_count <= 0:
            body_count = len(story_template.pages or [])
        page_count = body_count or 1

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
        # Enforce allowed page counts only for custom stories
        if page_count not in allowed_pages:
            raise HTTPException(400, "Invalid page count. Choose from: 1, 4, 6, 8, 10, 12, 16")

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
    
    items = []
    for book in books:
        resp = BookResponse.from_orm(book)
        data = resp.model_dump()
        data["cover_url"] = f"/books/{book.id}/cover"
        items.append(BookResponse(**data))
    return BookListResponse(books=items)

@router.get("/{book_id}", response_model=BookWithPagesResponse)  
def get_book_details(book_id: int, user = Depends(current_user), db: Session = Depends(get_db)):
    """Get detailed book information including pages"""
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == user.id).first()
    if not book:
        raise HTTPException(404, "Book not found")
    
    # Load pages
    pages = db.query(BookPage).filter(BookPage.book_id == book_id).order_by(BookPage.page_number).all()
    
    book_response = BookWithPagesResponse.from_orm(book)
    try:
        # Attach a relative cover_url for convenience
        setattr(book_response, 'cover_url', f"/books/{book.id}/cover")
    except Exception:
        pass
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

@router.get("/stories/cover-public")
def get_story_cover_public(path: str = Query(...), token: str = Query(...), request: Request = None):
    """Serve a story template cover image via token query param (for Image components).

    Placed before /{book_id}/cover-public to avoid route matching 'stories' as book_id.
    The token is validated, file must live under MEDIA_ROOT.
    """
    if not path:
        raise HTTPException(status_code=400, detail="Missing path")
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGO])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    file_path = _resolve_media_path(path)
    try:
        size = os.path.getsize(file_path)
    except Exception:
        size = -1
    logger.info(f"cover-public: user={payload.get('sub')} path={file_path} size={size}")
    return _file_response_with_etag(file_path, "public, max-age=600", request)


@router.get("/media/resize-public")
def get_media_resize_public(path: str = Query(...), token: str = Query(...), w: int = Query(320), h: Optional[int] = Query(None), request: Request = None):
    """Serve a resized/cached derivative of a media file via token."""
    try:
        jwt.decode(token, SECRET_KEY, algorithms=[ALGO])
    except Exception:
        raise HTTPException(status_code=401, detail="Invalid token")
    file_path = _resolve_media_path(path)
    try:
        thumb = _build_thumb(file_path, w, h)
        return _file_response_with_etag(thumb, "public, max-age=86400", request)
    except Exception as exc:
        # Fallback to original image to avoid breaking UI if resize fails
        msg = f"resize-public failed for path={file_path} w={w} h={h}: {exc}"
        try:
            logger.warning(msg)
        except Exception:
            pass
        _sentry_warn(msg)
        return _file_response_with_etag(file_path, "public, max-age=600", request)

@router.get("/{book_id}/cover")
def get_book_cover(book_id: int, request: Request, user = Depends(current_user), db: Session = Depends(get_db)):
    """Serve the personalized cover image (page 0) if available."""
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == user.id).first()
    if not book:
        raise HTTPException(404, "Book not found")
    path = book.preview_image_path
    if not path:
        page0 = db.query(BookPage).filter(BookPage.book_id == book_id, BookPage.page_number == 0).first()
        if page0 and page0.image_path:
            path = page0.image_path
    # Fallback: use the first available page image if no explicit cover
    if (not path) or (path and not os.path.exists(path)):
        first_img = (
            db.query(BookPage)
            .filter(BookPage.book_id == book_id, BookPage.image_path.isnot(None))
            .order_by(BookPage.page_number.asc())
            .first()
        )
        if first_img and first_img.image_path and os.path.exists(first_img.image_path):
            path = first_img.image_path
    if not path or not os.path.exists(path):
        raise HTTPException(404, "Cover not available")
    return _file_response_with_etag(Path(path), "private, max-age=3600", request)

@router.get("/{book_id}/cover-public")
def get_book_cover_public(book_id: int, request: Request, token: str = Query(...), db: Session = Depends(get_db)):
    """Serve the personalized cover via token query param (for Image components)."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGO])
        uid = int(payload.get("sub"))
    except Exception:
        raise HTTPException(401, "Invalid token")
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == uid).first()
    if not book:
        raise HTTPException(404, "Book not found")
    path = book.preview_image_path
    if not path:
        page0 = db.query(BookPage).filter(BookPage.book_id == book_id, BookPage.page_number == 0).first()
        if page0 and page0.image_path:
            path = page0.image_path
    # Fallback: first available page image if no explicit cover
    if (not path) or (path and not os.path.exists(path)):
        first_img = (
            db.query(BookPage)
            .filter(BookPage.book_id == book_id, BookPage.image_path.isnot(None))
            .order_by(BookPage.page_number.asc())
            .first()
        )
        if first_img and first_img.image_path and os.path.exists(first_img.image_path):
            path = first_img.image_path
    if not path or not os.path.exists(path):
        raise HTTPException(404, "Cover not available")
    return _file_response_with_etag(Path(path), "private, max-age=3600", request)


@router.get("/{book_id}/cover-thumb-public")
def get_book_cover_thumb_public(book_id: int, request: Request, token: str = Query(...), w: int = Query(320), h: Optional[int] = Query(None), db: Session = Depends(get_db)):
    """Serve a resized cover for a book via token query param (for Image components)."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGO])
        uid = int(payload.get("sub"))
    except Exception:
        raise HTTPException(401, "Invalid token")
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == uid).first()
    if not book:
        raise HTTPException(404, "Book not found")
    path = book.preview_image_path
    if not path:
        page0 = db.query(BookPage).filter(BookPage.book_id == book_id, BookPage.page_number == 0).first()
        if page0 and page0.image_path:
            path = page0.image_path
    # Fallback: first available page image if no explicit cover
    if (not path) or (path and not os.path.exists(path)):
        first_img = (
            db.query(BookPage)
            .filter(BookPage.book_id == book_id, BookPage.image_path.isnot(None))
            .order_by(BookPage.page_number.asc())
            .first()
        )
        if first_img and first_img.image_path and os.path.exists(first_img.image_path):
            path = first_img.image_path
    if not path or not os.path.exists(path):
        raise HTTPException(404, "Cover not available")
    try:
        thumb = _build_thumb(Path(path), w, h)
        return _file_response_with_etag(thumb, "private, max-age=3600", request)
    except Exception as exc:
        # Log and fall back to original image to avoid 500s in the UI
        msg = f"cover-thumb-public resize failed for book={book_id} path={path} w={w} h={h}: {exc}"
        try:
            logger.warning(msg)
        except Exception:
            pass
        _sentry_warn(msg)
        return _file_response_with_etag(Path(path), "private, max-age=600", request)


@router.get("/{book_id}/pages/{page_number}/image-public")
def get_book_page_image_public(book_id: int, page_number: int, token: str = Query(...), w: int = Query(0), h: Optional[int] = Query(None), request: Request = None, db: Session = Depends(get_db)):
    """Serve a page image (optionally resized) for a user's book via token.

    Uses no-store to ensure rapid update visibility in the viewer.
    """
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGO])
        uid = int(payload.get("sub"))
    except Exception:
        raise HTTPException(401, "Invalid token")
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == uid).first()
    if not book:
        raise HTTPException(404, "Book not found")
    page = db.query(BookPage).filter(BookPage.book_id == book_id, BookPage.page_number == page_number).first()
    if not page or not page.image_path:
        raise HTTPException(404, "Image not available")
    path = page.image_path
    if not os.path.exists(path):
        raise HTTPException(404, "Image file not found")
    # Optional resize
    file_to_send = Path(path)
    if int(w) > 0:
        try:
            file_to_send = _build_thumb(file_to_send, int(w), int(h) if h else None)
        except Exception as exc:
            # Log and fall back to the original image to avoid breaking the mobile viewer
            msg = (
                f"page image resize failed for book={book_id} page={page_number} "
                f"path={path} w={w} h={h}: {exc}"
            )
            try:
                logger.warning(msg)
            except Exception:
                pass
            _sentry_warn(msg)
            file_to_send = Path(path)
    # Add ETag for validation
    try:
        etag = f'W/"{int(os.path.getmtime(file_to_send))}-{os.path.getsize(file_to_send)}"'
    except Exception:
        etag = None
    # Use caching for completed books; no-store for in-progress
    try:
        book_status = db.query(Book.status).filter(Book.id == book_id, Book.user_id == uid).scalar()
    except Exception:
        book_status = None
    cache_control = "private, max-age=3600" if (book_status == "completed") else "private, no-store"
    headers = {"Cache-Control": cache_control}
    if etag:
        headers["ETag"] = etag
        if request is not None:
            inm = request.headers.get("if-none-match")
            if inm and inm.strip() == etag:
                return Response(status_code=304, headers=headers)
    return FileResponse(str(file_to_send), headers=headers)

@router.get("/{book_id}/preview")
def get_book_preview(book_id: int, user = Depends(current_user), db: Session = Depends(get_db)):
    """Lightweight book preview for mobile viewing.

    Images are not inlined. The mobile client should fetch page images via
    `GET /books/{book_id}/pages/{page_number}/image-public?token=...` with
    optional `w`/`h` for resizing. This avoids large JSON payloads and
    server-side base64 encoding overhead.
    """
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == user.id).first()
    if not book:
        raise HTTPException(404, "Book not found")
    
    # Get all pages
    pages = db.query(BookPage).filter(BookPage.book_id == book_id).order_by(BookPage.page_number).all()
    
    preview_pages = []
    for page in pages:
        # Return only metadata; clients load images via image-public route
        preview_pages.append({
            "page_number": page.page_number,
            "text": page.text_content,
            "image_status": page.image_status,
        })
    
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
        # Disassociate any payments that reference this book first to satisfy FK constraints
        db.query(Payment).filter(Payment.book_id == book_id).update(
            {Payment.book_id: None}, synchronize_session=False
        )

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
    # Enforce admin-only access
    if not getattr(user, "role", None) in ("admin", "superadmin"):
        raise HTTPException(status_code=403, detail="Admin privileges required")
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
        storyline_pages = []
        for page in template.pages:
            if not page.image_prompt:
                continue
            storyline_pages.append(
                {
                    "page_number": page.page_number,
                    "image_prompt": page.image_prompt,
                }
            )

        stories.append(
            {
                "slug": template.slug,
                "name": template.name,
                "description": template.description,
                "age": template.age,
                "version": template.version,
                "page_count": len(template.pages) or 0,
                "cover_path": template.cover_image_url,
                "demo_images": [
                    template.demo_image_1,
                    template.demo_image_2,
                    template.demo_image_3,
                    template.demo_image_4,
                ],
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
                "storyline_pages": storyline_pages,
            }
        )
    return {"stories": stories}


def _resolve_media_path(raw_path: str) -> Path:
    media_root = Path(os.getenv("MEDIA_ROOT", "/data/media")).resolve()
    candidate = Path(raw_path).expanduser().resolve()
    if not str(candidate).startswith(str(media_root)):
        raise HTTPException(status_code=400, detail="Path outside media root")
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return candidate


def _thumbs_dir() -> Path:
    media_root = Path(os.getenv("MEDIA_ROOT", "/data/media")).resolve()
    d = media_root / "thumbs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _build_thumb(file_path: Path, width: int, height: Optional[int] = None) -> Path:
    """Create or return a cached thumbnail for the given file and size.

    Preserves aspect ratio; if height is None, computes based on width.
    Saves under MEDIA_ROOT/thumbs with a deterministic name.
    """
    file_path = Path(file_path)
    w = max(1, int(width))
    h = int(height) if (height and int(height) > 0) else 0
    # Cache filename: <stem>_w{w}_h{h}<ext>
    stem = file_path.stem
    ext = file_path.suffix.lower() or ".jpg"
    target = _thumbs_dir() / f"{stem}_w{w}_h{h}{ext}"
    try:
        # If cached newer than source, reuse
        if target.exists() and target.stat().st_mtime >= file_path.stat().st_mtime:
            return target
    except Exception:
        pass

    # Per-thumbnail lock to avoid duplicate work under concurrency
    lock_name = f".lock_{stem}_w{w}_h{h}"
    lock_path = target.parent / lock_name
    acquired = False
    start = time.time()
    while not acquired:
        try:
            fd = os.open(str(lock_path), os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.close(fd)
            acquired = True
        except FileExistsError:
            # Another process/thread is building it; wait briefly
            if time.time() - start > 3.0:
                # Consider the lock stale; break and proceed
                try:
                    os.remove(str(lock_path))
                except Exception:
                    pass
                break
            time.sleep(0.05)
            # After wait, check again for a fresh cached file
            try:
                if target.exists() and target.stat().st_mtime >= file_path.stat().st_mtime:
                    return target
            except Exception:
                pass
    # Build thumbnail using atomic write (tmp file then replace) to avoid readers
    # seeing a partially-written file in concurrent requests.
    # Write to a temp file with the real image extension so PIL infers format
    tmp_target = target.with_name(f".tmp_{stem}_w{w}_h{h}_{uuid.uuid4().hex}{ext}")
    with PILImage.open(str(file_path)) as img:
        ow, oh = img.size
        if h <= 0:
            ratio = w / float(ow)
            h_eff = max(1, int(round(oh * ratio)))
        else:
            h_eff = h
        # Ensure compatibility with JPEG target by converting RGBA to RGB
        if ext in (".jpg", ".jpeg") and img.mode != "RGB":
            img = img.convert("RGB")
        elif img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        img_thumb = img.copy()
        img_thumb.thumbnail((w, h_eff))
        # Save to temp file first
        save_kwargs = {}
        if ext in (".jpg", ".jpeg"):
            save_kwargs.update({"quality": 82, "optimize": True, "progressive": True})
        img_thumb.save(str(tmp_target), **save_kwargs)
    try:
        # Atomic replace so consumers either see old or fully-written new file
        os.replace(str(tmp_target), str(target))
    except Exception:
        # If replace fails for any reason, fall back to rename/move
        try:
            os.rename(str(tmp_target), str(target))
        except Exception:
            # Best effort: if another process already created the file, discard tmp
            try:
                if os.path.exists(str(tmp_target)):
                    os.remove(str(tmp_target))
            except Exception:
                pass
    finally:
        # Release lock if held
        try:
            if os.path.exists(str(lock_path)):
                os.remove(str(lock_path))
        except Exception:
            pass
    return target


def _make_etag(path: Path) -> Optional[str]:
    try:
        return f'W/"{int(os.path.getmtime(path))}-{os.path.getsize(path)}"'
    except Exception:
        return None


def _file_response_with_etag(path: Path, cache_control: str, request: Optional[Request] = None) -> Response:
    etag = _make_etag(path)
    headers = {"Cache-Control": cache_control}
    if etag:
        headers["ETag"] = etag
        if request is not None:
            inm = request.headers.get("if-none-match")
            if inm and inm.strip() == etag:
                return Response(status_code=304, headers=headers)
    return FileResponse(str(path), headers=headers)

@router.get("/stories/cover")
def get_story_cover(path: str, request: Request, user = Depends(current_user)):
    if not path:
        raise HTTPException(status_code=400, detail="Missing path")
    file_path = _resolve_media_path(path)
    return _file_response_with_etag(file_path, "private, max-age=600", request)



