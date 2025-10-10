import os
import json
import base64
import copy
from pathlib import Path
from typing import Optional
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Header, Query
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from sqlalchemy import func
from rq import Queue
import redis
from pydantic import BaseModel

from ..db import get_db
from ..models import Book, BookPage, BookWorkflowSnapshot, User, WorkflowDefinition
from ..comfyui_client import ComfyUIClient
from ..worker.book_processor import THEME_WORKFLOW_SLUGS, _build_template_story
from ..story_templates import get_template

ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")
COMFYUI_SERVER = os.getenv("COMFYUI_SERVER", "host.docker.internal:8188")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

_redis = redis.from_url(REDIS_URL)
queue = Queue("books", connection=_redis)

router = APIRouter(prefix="/admin", tags=["admin"])


def require_admin(x_admin_secret: Optional[str] = Header(None)) -> None:
    if not ADMIN_API_KEY:
        raise HTTPException(status_code=500, detail="Admin API key not configured")
    if x_admin_secret != ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Admin access denied")


def _load_original_images(book: Book) -> list[str]:
    if not book.original_image_paths:
        return []
    try:
        paths = json.loads(book.original_image_paths)
        if isinstance(paths, list):
            return paths
    except Exception:
        pass
    return [book.original_image_paths]


def _load_story_data(book: Book) -> Optional[dict]:
    if not book.story_data:
        return None
    try:
        return json.loads(book.story_data)
    except Exception:
        return None


def _encode_image_base64(path: Optional[str]) -> Optional[str]:
    if not path or not os.path.exists(path):
        return None
    try:
        with open(path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode()
            mime = "image/png" if path.lower().endswith(".png") else "image/jpeg"
            return f"data:{mime};base64,{b64}"
    except Exception:
        return None


@router.get("/books")
def admin_list_books(_: None = Depends(require_admin), db: Session = Depends(get_db)):
    books = db.query(Book).order_by(Book.created_at.desc().nullslast()).all()
    items = []
    for book in books:
        pages = (
            db.query(BookPage)
            .filter(BookPage.book_id == book.id)
            .order_by(BookPage.page_number)
            .all()
        )
        page_payload = []
        for page in pages:
            page_payload.append(
                {
                    "id": page.id,
                    "page_number": page.page_number,
                    "text_content": page.text_content,
                    "image_description": page.image_description,
                    "enhanced_prompt": page.enhanced_prompt,
                    "image_path": page.image_path,
                    "image_status": page.image_status,
                    "created_at": page.created_at.isoformat() if page.created_at else None,
                    "image_completed_at": page.image_completed_at.isoformat()
                    if page.image_completed_at
                    else None,
                }
            )
        items.append(
            {
                "id": book.id,
                "title": book.title,
                "story_source": book.story_source,
                "template_key": book.template_key,
                "template_params": book.template_params,
                "theme": book.theme,
                "target_age": book.target_age,
                "page_count": book.page_count,
                "status": book.status,
                "progress_percentage": book.progress_percentage,
                "error_message": book.error_message,
                "pdf_path": book.pdf_path,
                "preview_image_path": book.preview_image_path,
                "created_at": book.created_at.isoformat() if book.created_at else None,
                "completed_at": book.completed_at.isoformat() if book.completed_at else None,
                "character_description": book.character_description,
                "positive_prompt": book.positive_prompt,
                "negative_prompt": book.negative_prompt,
                "story_data": _load_story_data(book),
                "original_image_paths": _load_original_images(book),
                "pages": page_payload,
            }
        )
    return {"books": items}


@router.get("/books/{book_id}/workflow")
def admin_get_workflow(
    book_id: int,
    page: int = Query(1, ge=1),
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    workflow_slug = THEME_WORKFLOW_SLUGS.get(book.theme, "childbook_adventure_v2")
    definition = (
        db.query(WorkflowDefinition)
        .filter(WorkflowDefinition.slug == workflow_slug)
        .order_by(WorkflowDefinition.version.desc())
        .first()
    )
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow definition not found")

    base_workflow = definition.content if isinstance(definition.content, dict) else json.loads(definition.content)

    image_paths = _load_original_images(book)
    filenames = [Path(p).name for p in image_paths]

    snapshots = (
        db.query(BookWorkflowSnapshot.page_number)
        .filter(BookWorkflowSnapshot.book_id == book_id)
        .distinct()
        .order_by(BookWorkflowSnapshot.page_number)
        .all()
    )
    available_pages = [row.page_number for row in snapshots]

    snapshot = (
        db.query(BookWorkflowSnapshot)
        .filter(
            BookWorkflowSnapshot.book_id == book_id,
            BookWorkflowSnapshot.page_number == page,
        )
        .order_by(BookWorkflowSnapshot.created_at.desc())
        .first()
    )

    if snapshot:
        prompt = None
        page_record = (
            db.query(BookPage)
            .filter(
                BookPage.book_id == book_id,
                BookPage.page_number == page,
            )
            .first()
        )
        if page_record and page_record.enhanced_prompt:
            prompt = page_record.enhanced_prompt
        elif book.positive_prompt:
            prompt = book.positive_prompt

        return {
            "book_id": book.id,
            "image_filenames": filenames,
            "prompt": prompt,
            "story_source": book.story_source,
            "template_key": book.template_key,
            "template_params": book.template_params,
            "page_number": page,
            "prompt_id": snapshot.prompt_id,
            "workflow": snapshot.workflow_json,
            "source": "stored",
            "page_count": book.page_count,
            "available_pages": available_pages,
            "workflow_version": snapshot.workflow_version,
            "workflow_slug": snapshot.workflow_slug,
        }

    comfy_client = ComfyUIClient(COMFYUI_SERVER)
    workflow = copy.deepcopy(base_workflow)
    if filenames:
        workflow = comfy_client.prepare_dynamic_workflow(workflow, filenames)

    prompt = None
    target_page = (
        db.query(BookPage)
        .filter(
            BookPage.book_id == book_id,
            BookPage.page_number == page,
        )
        .first()
    )
    if target_page and target_page.enhanced_prompt:
        prompt = target_page.enhanced_prompt
    elif book.positive_prompt:
        prompt = book.positive_prompt

    control_prompt = None

    if book.story_source == "template" and book.template_key:
        template_obj = get_template(book.template_key)
        if template_obj:
            try:
                temp_book = SimpleNamespace(
                    title=book.title,
                    template_key=book.template_key,
                    page_count=book.page_count,
                    story_source=book.story_source,
                    template_params=book.template_params,
                    target_age=book.target_age or template_obj.default_age,
                    character_description=book.character_description,
                )
                _, overrides = _build_template_story(temp_book, template_obj)
                if target_page:
                    override = overrides.get(target_page.page_number)
                    if override:
                        control_prompt = override.get("control")
            except Exception:
                control_prompt = None

    if not control_prompt and target_page and target_page.image_description:
        control_prompt = target_page.image_description

    if prompt:
        workflow = comfy_client._update_prompt(workflow, prompt, control_prompt)  # type: ignore[attr-defined]

        return {
            "book_id": book.id,
            "image_filenames": filenames,
            "prompt": prompt,
            "story_source": book.story_source,
            "template_key": book.template_key,
            "template_params": book.template_params,
        "page_number": page,
        "source": "reconstructed",
        "workflow": workflow,
        "page_count": book.page_count,
        "available_pages": available_pages,
        "workflow_version": definition.version,
        "workflow_slug": workflow_slug,
    }


@router.get("/books/{book_id}/images")
def admin_get_images(
    book_id: int,
    include_data: bool = True,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    original_images = []
    for path in _load_original_images(book):
        data_uri = None
        if include_data and path and os.path.exists(path):
            try:
                with open(path, "rb") as f:
                    b64 = base64.b64encode(f.read()).decode()
                    mime = "image/png" if path.lower().endswith(".png") else "image/jpeg"
                    data_uri = f"data:{mime};base64,{b64}"
            except Exception:
                data_uri = None
        original_images.append({
            "path": path,
            "data_uri": data_uri,
        })

    page_images = []
    pages = (
        db.query(BookPage)
        .filter(BookPage.book_id == book.id)
        .order_by(BookPage.page_number)
        .all()
    )
    for page in pages:
        data_uri = None
        if include_data and page.image_path and os.path.exists(page.image_path):
            try:
                with open(page.image_path, "rb") as f:
                    b64 = base64.b64encode(f.read()).decode()
                    mime = "image/png" if page.image_path.lower().endswith(".png") else "image/jpeg"
                    data_uri = f"data:{mime};base64,{b64}"
            except Exception:
                data_uri = None
        page_images.append(
            {
                "page_number": page.page_number,
                "status": page.image_status,
                "path": page.image_path,
                "data_uri": data_uri,
            }
        )

    control_images = []
    snapshots = (
        db.query(BookWorkflowSnapshot)
        .filter(BookWorkflowSnapshot.book_id == book.id)
        .order_by(BookWorkflowSnapshot.page_number)
        .all()
    )
    for snapshot in snapshots:
        control_images.append(
            {
                "page_number": snapshot.page_number,
                "path": snapshot.vae_image_path,
                "data_uri": _encode_image_base64(snapshot.vae_image_path) if include_data else None,
            }
        )

    return {
        "book_id": book.id,
        "original_images": original_images,
        "page_images": page_images,
        "control_images": control_images,
    }


@router.get("/users")
def admin_list_users(_: None = Depends(require_admin), db: Session = Depends(get_db)):
    users = db.query(User).order_by(User.created_at.desc().nullslast()).all()
    items = []
    for user in users:
        books = [
            {
                "id": b.id,
                "title": b.title,
                "status": b.status,
                "created_at": b.created_at.isoformat() if b.created_at else None,
            }
            for b in user.books
        ]
        items.append(
            {
                "id": user.id,
                "email": user.email,
                "credits": user.credits,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "book_count": len(books),
                "books": books,
            }
        )
    return {"users": items}


class AdminUserUpdatePayload(BaseModel):
    email: Optional[str] = None
    credits: Optional[int] = None


@router.post("/users/{user_id}/update")
def admin_update_user(
    user_id: int,
    payload: AdminUserUpdatePayload,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    if payload.email is not None:
        email = payload.email.strip()
        if not email:
            raise HTTPException(status_code=400, detail="Email cannot be empty")
        user.email = email

    if payload.credits is not None:
        user.credits = payload.credits

    db.commit()
    return {
        "message": "User updated",
        "user": {
            "id": user.id,
            "email": user.email,
            "credits": user.credits,
        },
    }


class AdminRegeneratePayload(BaseModel):
    new_prompt: Optional[str] = None


class WorkflowUpsertPayload(BaseModel):
    slug: str
    name: str
    type: str
    content: dict
    version: Optional[int] = None
    is_active: Optional[bool] = True


class AdminStoryUpdatePayload(BaseModel):
    story: dict


@router.post("/books/{book_id}/regenerate")
def admin_regenerate_book(
    book_id: int,
    payload: AdminRegeneratePayload,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    job = queue.enqueue(
        "app.worker.book_processor.admin_regenerate_book",
        book.id,
        new_prompt=payload.new_prompt,
        job_timeout=1800,
    )
    return {"message": "Book regeneration queued", "job_id": job.id}


@router.get("/books/{book_id}/story")
def admin_get_story(book_id: int, _: None = Depends(require_admin), db: Session = Depends(get_db)):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    try:
        story = json.loads(book.story_data) if book.story_data else None
    except Exception:
        story = None
    return {
        "book_id": book.id,
        "story": story,
    }


@router.put("/books/{book_id}/story")
def admin_update_story(
    book_id: int,
    payload: AdminStoryUpdatePayload,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    book.story_data = json.dumps(payload.story)
    db.commit()
    return {"message": "Story updated"}


@router.get("/workflows")
def admin_list_workflows(_: None = Depends(require_admin), db: Session = Depends(get_db)):
    definitions = (
        db.query(WorkflowDefinition)
        .order_by(WorkflowDefinition.slug.asc(), WorkflowDefinition.version.desc())
        .all()
    )
    items = []
    for definition in definitions:
        items.append(
            {
                "id": definition.id,
                "slug": definition.slug,
                "name": definition.name,
                "type": definition.type,
                "version": definition.version,
                "is_active": definition.is_active,
                "created_at": definition.created_at.isoformat() if definition.created_at else None,
                "updated_at": definition.updated_at.isoformat() if definition.updated_at else None,
            }
        )
    return {"workflows": items}


@router.get("/workflows/{workflow_id}")
def admin_get_workflow_definition(workflow_id: int, _: None = Depends(require_admin), db: Session = Depends(get_db)):
    definition = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {
        "id": definition.id,
        "slug": definition.slug,
        "name": definition.name,
        "type": definition.type,
        "version": definition.version,
        "is_active": definition.is_active,
        "content": definition.content,
        "created_at": definition.created_at.isoformat() if definition.created_at else None,
        "updated_at": definition.updated_at.isoformat() if definition.updated_at else None,
    }


@router.post("/workflows")
def admin_create_workflow(
    payload: WorkflowUpsertPayload,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    max_version = (
        db.query(func.max(WorkflowDefinition.version))
        .filter(WorkflowDefinition.slug == payload.slug)
        .scalar()
        or 0
    )
    version = payload.version or (max_version + 1)
    definition = WorkflowDefinition(
        slug=payload.slug,
        name=payload.name,
        type=payload.type,
        version=version,
        content=payload.content,
        is_active=payload.is_active if payload.is_active is not None else True,
    )
    db.add(definition)
    db.commit()
    db.refresh(definition)
    return {
        "message": "Workflow created",
        "workflow": {
            "id": definition.id,
            "slug": definition.slug,
            "version": definition.version,
        },
    }


@router.put("/workflows/{workflow_id}")
def admin_update_workflow(
    workflow_id: int,
    payload: WorkflowUpsertPayload,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    definition = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow not found")

    definition.slug = payload.slug
    definition.name = payload.name
    definition.type = payload.type
    definition.content = payload.content
    if payload.version is not None:
        definition.version = payload.version
    if payload.is_active is not None:
        definition.is_active = payload.is_active

    db.commit()
    return {"message": "Workflow updated"}


@router.delete("/books/{book_id}")
def admin_delete_book(
    book_id: int,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    try:
        if book.pdf_path and os.path.exists(book.pdf_path):
            try:
                os.remove(book.pdf_path)
            except FileNotFoundError:
                pass

        original_images = _load_original_images(book)
        for image_path in original_images:
            if image_path and os.path.exists(image_path):
                try:
                    os.remove(image_path)
                except FileNotFoundError:
                    pass

        pages = db.query(BookPage).filter(BookPage.book_id == book_id).all()
        for page in pages:
            if page.image_path and os.path.exists(page.image_path):
                try:
                    os.remove(page.image_path)
                except FileNotFoundError:
                    pass

        db.query(BookPage).filter(BookPage.book_id == book_id).delete()
        db.delete(book)
        db.commit()
        return {"message": "Book deleted"}
    except Exception as exc:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to delete book: {exc}")


def _resolve_media_path(raw_path: str) -> Path:
    media_root = Path(os.getenv("MEDIA_ROOT", "/data/media")).resolve()
    candidate = Path(raw_path).expanduser().resolve()
    if not str(candidate).startswith(str(media_root)):
        raise HTTPException(status_code=400, detail="Path outside media root")
    if not candidate.exists() or not candidate.is_file():
        raise HTTPException(status_code=404, detail="File not found")
    return candidate


@router.get("/files")
def admin_get_file(path: str, _: None = Depends(require_admin)):
    if not path:
        raise HTTPException(status_code=400, detail="Missing path")
    file_path = _resolve_media_path(path)
    return FileResponse(file_path)
