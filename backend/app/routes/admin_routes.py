from __future__ import annotations

import os
import json
import base64
import copy
from datetime import datetime, timezone
from decimal import Decimal
from pathlib import Path
from typing import Optional, List, Dict, Any
from types import SimpleNamespace

from fastapi import APIRouter, Depends, HTTPException, Header, Query, UploadFile, File, Form
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session, joinedload
from sqlalchemy import func
from rq import Queue
import redis
from pydantic import BaseModel

from ..db import get_db
from ..models import (
    Book,
    BookPage,
    BookWorkflowSnapshot,
    User,
    WorkflowDefinition,
    StoryTemplate,
    StoryTemplatePage,
    ControlNetImage,
)
from ..comfyui_client import ComfyUIClient
from ..worker.book_processor import (
    get_childbook_workflow,
    _load_story_template,
    _build_story_from_template,
)
from ..storage import save_upload, move_to

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


def _is_super_admin(x_admin_email: Optional[str], db: Session) -> bool:
    if not x_admin_email:
        return False
    admin = db.query(User).filter(func.lower(User.email) == x_admin_email.lower()).first()
    return bool(admin and getattr(admin, "role", None) == "superadmin")


@router.get("/admin-status")
def admin_status(
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
    x_admin_email: Optional[str] = Header(None),
):
    return {
        "admin_email": x_admin_email,
        "is_super": _is_super_admin(x_admin_email, db),
    }


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



def _decimal_to_float(value: Optional[Decimal]) -> Optional[float]:
    if value is None:
        return None
    if not isinstance(value, Decimal):
        value = Decimal(str(value))
    return float(value.quantize(Decimal("0.01")))


def _to_decimal(value: Optional[float]) -> Optional[Decimal]:
    if value is None:
        return None
    return Decimal(str(value))


def _story_template_to_dict(template: StoryTemplate) -> dict:
    pages = [
        {
            "page_number": page.page_number,
            "story_text": page.story_text,
            "image_prompt": page.image_prompt,
            "positive_prompt": page.positive_prompt,
            "negative_prompt": page.negative_prompt or "",
            "pose_prompt": page.pose_prompt or "",
            "image_kp": page.keypoint_image,
        }
        for page in sorted(template.pages, key=lambda p: p.page_number)
    ]

    return {
        "id": template.id,
        "slug": template.slug,
        "name": template.name,
        "description": template.description,
        "default_age": template.default_age,
        "illustration_style": template.illustration_style,
        "workflow_slug": template.workflow_slug,
        "is_active": template.is_active,
        "free_trial_slug": template.free_trial_slug,
        "price_dollars": _decimal_to_float(template.price_dollars),
        "discount_price": _decimal_to_float(template.discount_price),
        "page_count": len(pages),
        "pages": pages,
        "created_at": template.created_at.isoformat() if template.created_at else None,
        "updated_at": template.updated_at.isoformat() if template.updated_at else None,
    }


def _resolve_keypoint_slug(value: Optional[str], db: Session) -> Optional[str]:
    if value is None:
        return None
    candidate = value.strip()
    if not candidate:
        return None

    record = (
        db.query(ControlNetImage)
        .filter(func.lower(ControlNetImage.slug) == candidate.lower())
        .first()
    )
    if not record:
        record = (
            db.query(ControlNetImage)
            .filter(func.lower(ControlNetImage.name) == candidate.lower())
            .first()
        )

    if not record:
        raise HTTPException(status_code=400, detail=f"Keypoint image '{value}' not found")

    return record.slug


def _keypoint_base_dir() -> Path:
    base = Path(os.getenv("MEDIA_ROOT", "/data/media")).expanduser()
    target = base / "controlnet" / "keypoints"
    target.mkdir(parents=True, exist_ok=True)
    return target


def _keypoint_upload_dir() -> Path:
    return _keypoint_base_dir()


def _controlnet_image_to_dict(image: ControlNetImage) -> dict:
    return {
        "id": image.id,
        "slug": image.slug,
        "name": image.name,
        "workflow_slug": image.workflow_slug,
        "image_path": image.image_path,
        "preview_path": None,
        "metadata": image.metadata_json or {},
        "created_at": image.created_at.isoformat() if image.created_at else None,
        "updated_at": image.updated_at.isoformat() if image.updated_at else None,
    }


def _store_keypoint_upload(upload: UploadFile, slug: str) -> str:
    filename = Path(upload.filename or f"{slug}.png").name
    if not filename:
        filename = f"{slug}.png"
    upload.file.seek(0)
    temp_path = save_upload(upload.file, subdir="controlnet/keypoints", filename=filename)
    return _rename_keypoint(temp_path, slug)


def _rename_keypoint(path: str, slug: str) -> str:
    if not path or not os.path.exists(path):
        return path
    return move_to(path, str(_keypoint_base_dir()), slug)


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


# Legacy implementation retained for reference
def _legacy_admin_get_workflow(
    book_id: int,
    page: int = Query(1, ge=1),
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    story_template = _load_story_template(book.template_key)
    workflow_slug = story_template.workflow_slug if story_template else "base"

    definition = (
        db.query(WorkflowDefinition)
        .filter(WorkflowDefinition.slug == workflow_slug, WorkflowDefinition.is_active.is_(True))
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

    if book.story_source == "template" and book.template_key and story_template:
        try:
            temp_book = SimpleNamespace(
                title=book.title,
                template_key=book.template_key,
                page_count=book.page_count,
                story_source=book.story_source,
                template_params=book.template_params,
                target_age=book.target_age or story_template.default_age,
                character_description=book.character_description,
            )
            _, overrides = _build_story_from_template(temp_book, story_template)
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
                "role": getattr(user, "role", "user"),
                "credits": user.credits,
                "created_at": user.created_at.isoformat() if user.created_at else None,
                "book_count": len(books),
                "books": books,
            }
        )
    return {"users": items}


@router.get("/controlnet-images")
@router.get("/keypoint-images")
def admin_list_controlnet_images(_: None = Depends(require_admin), db: Session = Depends(get_db)):
    images = (
        db.query(ControlNetImage)
        .order_by(ControlNetImage.created_at.desc().nullslast())
        .all()
    )
    return {"images": [_controlnet_image_to_dict(image) for image in images]}


@router.get("/controlnet-images/{slug}")
@router.get("/keypoint-images/{slug}")
def admin_get_controlnet_image(
    slug: str,
    include_data: bool = False,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    image = db.query(ControlNetImage).filter(ControlNetImage.slug == slug).first()
    if not image:
        raise HTTPException(status_code=404, detail="Keypoint image not found")

    payload = _controlnet_image_to_dict(image)
    if include_data and image.image_path:
        payload["data_uri"] = _encode_image_base64(image.image_path)

    return payload


@router.post("/controlnet-images")
@router.post("/keypoint-images")
async def admin_create_controlnet_image(
    slug: str = Form(...),
    name: str = Form(...),
    image_file: UploadFile = File(...),
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    slug_value = slug.strip()
    if not slug_value:
        raise HTTPException(status_code=400, detail="Slug is required")

    existing = db.query(ControlNetImage).filter(ControlNetImage.slug == slug_value).first()
    if existing:
        raise HTTPException(status_code=400, detail="Keypoint image with this slug already exists")

    stored_path = _store_keypoint_upload(image_file, slug_value)

    record = ControlNetImage(
        slug=slug_value,
        name=name.strip() or slug_value,
        workflow_slug="keypoint",
        image_path=stored_path,
        preview_path=None,
        metadata_json={},
    )
    db.add(record)
    db.commit()
    db.refresh(record)
    return _controlnet_image_to_dict(record)


@router.put("/controlnet-images/{slug}")
@router.put("/keypoint-images/{slug}")
async def admin_update_controlnet_image(
    slug: str,
    new_slug: Optional[str] = Form(None),
    name: Optional[str] = Form(None),
    image_file: Optional[UploadFile] = File(None),
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    record = db.query(ControlNetImage).filter(ControlNetImage.slug == slug).first()
    if not record:
        raise HTTPException(status_code=404, detail="ControlNet image not found")

    target_slug = (new_slug or record.slug).strip()
    if not target_slug:
        raise HTTPException(status_code=400, detail="Slug cannot be empty")

    if target_slug != record.slug:
        conflict = db.query(ControlNetImage).filter(ControlNetImage.slug == target_slug).first()
        if conflict:
            raise HTTPException(status_code=400, detail="Another ControlNet image already uses that slug")

    updated_path = record.image_path

    if image_file is not None:
        new_path = _store_keypoint_upload(image_file, target_slug)
        if updated_path and updated_path != new_path and os.path.exists(updated_path):
            try:
                os.remove(updated_path)
            except OSError:
                pass
        updated_path = new_path
    elif target_slug != record.slug:
        updated_path = _rename_keypoint(record.image_path, target_slug)

    record.slug = target_slug
    if name is not None:
        record.name = name.strip() or target_slug
    record.workflow_slug = "keypoint"

    if updated_path:
        record.image_path = updated_path
    record.preview_path = None
    record.metadata_json = record.metadata_json or {}

    db.commit()
    db.refresh(record)
    return _controlnet_image_to_dict(record)


@router.delete("/controlnet-images/{slug}")
@router.delete("/keypoint-images/{slug}")
def admin_delete_controlnet_image(slug: str, _: None = Depends(require_admin), db: Session = Depends(get_db)):
    record = db.query(ControlNetImage).filter(ControlNetImage.slug == slug).first()
    if not record:
        raise HTTPException(status_code=404, detail="ControlNet image not found")

    if record.image_path and os.path.exists(record.image_path):
        try:
            os.remove(record.image_path)
        except OSError:
            pass
    db.delete(record)
    db.commit()
    return {"message": "ControlNet image deleted"}


class AdminUserUpdatePayload(BaseModel):
    email: Optional[str] = None
    credits: Optional[int] = None
    role: Optional[str] = None


@router.post("/users/{user_id}/update")
def admin_update_user(
    user_id: int,
    payload: AdminUserUpdatePayload,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
    x_admin_email: Optional[str] = Header(None),
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

    if payload.role is not None:
        # Only super admins (from DB) can change roles via API.
        if not _is_super_admin(x_admin_email, db):
            raise HTTPException(status_code=403, detail="Only super admin can modify roles")
        role_value = payload.role.strip().lower()
        # Do not allow granting superadmin via API; must be set directly in DB.
        if role_value not in {"user", "admin"}:
            raise HTTPException(status_code=400, detail="Invalid role; must be 'user' or 'admin'")
        user.role = role_value

    db.commit()
    return {
        "message": "User updated",
        "user": {
            "id": user.id,
            "email": user.email,
            "role": getattr(user, "role", "user"),
            "credits": user.credits,
        },
    }


@router.get("/story-templates")
def admin_list_story_templates(_: None = Depends(require_admin), db: Session = Depends(get_db)):
    templates = (
        db.query(StoryTemplate)
        .options(joinedload(StoryTemplate.pages))
        .order_by(StoryTemplate.name.asc())
        .all()
    )
    return {"stories": [_story_template_to_dict(t) for t in templates]}


@router.get("/story-templates/{slug}")
def admin_get_story_template(slug: str, _: None = Depends(require_admin), db: Session = Depends(get_db)):
    template = (
        db.query(StoryTemplate)
        .options(joinedload(StoryTemplate.pages))
        .filter(StoryTemplate.slug == slug)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Story template not found")
    return _story_template_to_dict(template)


@router.post("/story-templates")
def admin_create_story_template(
    payload: StoryTemplatePayload,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    existing = db.query(StoryTemplate).filter(StoryTemplate.slug == payload.slug).first()
    if existing:
        raise HTTPException(status_code=400, detail="Story template with this slug already exists")

    template = StoryTemplate(
        slug=payload.slug,
        name=payload.name,
        description=payload.description,
        default_age=payload.default_age,
        illustration_style=payload.illustration_style,
        workflow_slug=payload.workflow_slug or "base",
        is_active=payload.is_active if payload.is_active is not None else True,
        free_trial_slug=(payload.free_trial_slug or None),
        price_dollars=_to_decimal(payload.price_dollars) or Decimal("1.50"),
        discount_price=_to_decimal(payload.discount_price),
    )
    db.add(template)
    db.flush()

    for page in sorted(payload.pages, key=lambda p: p.page_number):
        keypoint_slug = _resolve_keypoint_slug(page.image_kp, db)
        if keypoint_slug is None:
            raise HTTPException(
                status_code=400,
                detail=f"Page {page.page_number} requires an 'image_kp' slug",
            )
        page_row = StoryTemplatePage(
            story_template_id=template.id,
            page_number=page.page_number,
            story_text=page.story_text,
            image_prompt=page.image_prompt,
            positive_prompt=page.positive_prompt,
            negative_prompt=page.negative_prompt or "",
            pose_prompt=page.pose_prompt or "",
            controlnet_image=None,
            keypoint_image=keypoint_slug,
        )
        db.add(page_row)

    db.commit()
    db.refresh(template)
    return _story_template_to_dict(template)


@router.put("/story-templates/{slug}")
@router.delete("/story-templates/{slug}")
def admin_delete_story_template(
    slug: str,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    template = (
        db.query(StoryTemplate)
        .options(joinedload(StoryTemplate.pages))
        .filter(StoryTemplate.slug == slug)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Story template not found")

    page_count = len(template.pages) if template.pages else 0
    db.delete(template)
    db.commit()

    return {"message": "Story template deleted", "slug": slug, "page_count": page_count}


def admin_update_story_template(
    slug: str,
    payload: StoryTemplatePayload,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    template = (
        db.query(StoryTemplate)
        .options(joinedload(StoryTemplate.pages))
        .filter(StoryTemplate.slug == slug)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Story template not found")

    template.slug = payload.slug
    template.name = payload.name
    template.description = payload.description
    template.default_age = payload.default_age
    template.illustration_style = payload.illustration_style
    template.workflow_slug = payload.workflow_slug or "base"
    template.free_trial_slug = payload.free_trial_slug or None
    template.price_dollars = _to_decimal(payload.price_dollars) or Decimal("1.50")
    template.discount_price = _to_decimal(payload.discount_price)
    if payload.is_active is not None:
        template.is_active = payload.is_active

    db.query(StoryTemplatePage).filter(StoryTemplatePage.story_template_id == template.id).delete()

    for page in sorted(payload.pages, key=lambda p: p.page_number):
        keypoint_slug = _resolve_keypoint_slug(page.image_kp, db)
        if keypoint_slug is None:
            raise HTTPException(
                status_code=400,
                detail=f"Page {page.page_number} requires an 'image_kp' slug",
            )
        page_row = StoryTemplatePage(
            story_template_id=template.id,
            page_number=page.page_number,
            story_text=page.story_text,
            image_prompt=page.image_prompt,
            positive_prompt=page.positive_prompt,
            negative_prompt=page.negative_prompt or "",
            pose_prompt=page.pose_prompt or "",
            controlnet_image=None,
            keypoint_image=keypoint_slug,
        )
        db.add(page_row)

    db.commit()
    db.refresh(template)
    return _story_template_to_dict(template)


class AdminRegeneratePayload(BaseModel):
    new_prompt: Optional[str] = None


class WorkflowUpsertPayload(BaseModel):
    slug: str
    name: str
    type: str
    content: dict
    version: Optional[int] = None
    is_active: Optional[bool] = True


class StoryTemplatePagePayload(BaseModel):
    page_number: int
    story_text: str
    image_prompt: str
    positive_prompt: str
    negative_prompt: Optional[str] = None
    pose_prompt: Optional[str] = None
    image_kp: str


class StoryTemplatePayload(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    default_age: Optional[str] = None
    illustration_style: Optional[str] = None
    workflow_slug: Optional[str] = "base"
    is_active: Optional[bool] = True
    free_trial_slug: Optional[str] = None
    price_dollars: Optional[float] = None
    discount_price: Optional[float] = None
    pages: List[StoryTemplatePagePayload]


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


@router.delete("/workflows/{workflow_id}")
def admin_delete_workflow(
    workflow_id: int,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    definition = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow not found")

    db.delete(definition)
    db.commit()
    return {"message": "Workflow deleted"}


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
# New workflow inspector using DB-backed stories/workflows
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

    story_template = _load_story_template(book.template_key)
    workflow_slug = story_template.workflow_slug if story_template else "base"

    definition = (
        db.query(WorkflowDefinition)
        .filter(WorkflowDefinition.slug == workflow_slug, WorkflowDefinition.is_active.is_(True))
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

    if book.story_source == "template" and book.template_key and story_template:
        try:
            temp_book = SimpleNamespace(
                title=book.title,
                template_key=book.template_key,
                page_count=book.page_count,
                story_source=book.story_source,
                template_params=book.template_params,
                target_age=book.target_age or story_template.default_age,
                character_description=book.character_description,
            )
            _, overrides = _build_story_from_template(temp_book, story_template)
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



