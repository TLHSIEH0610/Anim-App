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
    Payment,
    WorkflowDefinition,
    StoryTemplate,
    StoryTemplatePage,
    ControlNetImage,
    SupportTicket,
)
from ..comfyui_client import ComfyUIClient
from ..worker.book_processor import (
    get_childbook_workflow,
    _load_story_template,
    _build_story_from_template,
    BookComposer,
    get_media_root,
)
from ..storage import save_upload, move_to
from ..fixtures import (
    export_all_fixtures,
    export_story_fixture,
    export_user_fixture,
    export_workflow_fixture,
)
from ..backup import perform_backup, list_backups, restore_backup
from PIL import Image as PILImage

ADMIN_API_KEY = os.getenv("ADMIN_API_KEY")
COMFYUI_SERVER = os.getenv("COMFYUI_SERVER", "host.docker.internal:8188")
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

_redis = redis.from_url(REDIS_URL)
queue = Queue("books", connection=_redis)

router = APIRouter(prefix="/admin", tags=["admin"])

# Optional Sentry import for explicit error capture on admin actions
try:  # pragma: no cover
    import sentry_sdk  # type: ignore
except Exception:  # pragma: no cover
    sentry_sdk = None  # type: ignore


def require_admin(x_admin_secret: Optional[str] = Header(None)) -> None:
    if not ADMIN_API_KEY:
        raise HTTPException(status_code=500, detail="Admin API key not configured")
    if x_admin_secret != ADMIN_API_KEY:
        raise HTTPException(status_code=403, detail="Admin access denied")


def _inject_keypoint_into_workflow(workflow: Dict[str, Any], filename: str) -> None:
    """Best-effort: set the keypoint/pose LoadImage node to a given filename.

    Heuristics:
      - Prefer known node ids used in our workflows: 109, 100, 128
      - Otherwise, find a LoadImage node whose current image contains 'keypoint' or 'pose'
    """
    candidate_ids = ["109", "100", "128"]
    for node_id in candidate_ids:
        node = workflow.get(node_id)
        if node and node.get("class_type") == "LoadImage" and isinstance(node.get("inputs"), dict):
            node["inputs"]["image"] = filename
            # Many workflows respect this toggle for uploaded files
            node["inputs"]["load_from_upload"] = True
            return

    # Fallback heuristic: find any LoadImage with an image field hinting at keypoints
    for node_id, node in workflow.items():
        if node.get("class_type") != "LoadImage":
            continue
        inputs = node.get("inputs", {})
        img = inputs.get("image")
        if isinstance(img, str) and any(hint in img.lower() for hint in ("keypoint", "pose", "instantid")):
            inputs["image"] = filename
            inputs["load_from_upload"] = True
            return


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
            "workflow": page.workflow_slug,
            "seed": page.seed,
            "cover_text": getattr(page, 'cover_text', None),
        }
        for page in sorted(template.pages, key=lambda p: p.page_number)
    ]

    return {
        "id": template.id,
        "slug": template.slug,
        "name": template.name,
        "description": template.description,
        "age": template.age,
        "version": template.version,
        "workflow_slug": template.workflow_slug,
        "is_active": template.is_active,
        "cover_image_url": template.cover_image_url,
        "demo_images": [
            template.demo_image_1,
            template.demo_image_2,
            template.demo_image_3,
            template.demo_image_4,
        ],
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


def _covers_base_dir() -> Path:
    base = Path(os.getenv("MEDIA_ROOT", "/data/media")).expanduser()
    target = base / "covers"
    target.mkdir(parents=True, exist_ok=True)
    return target

def _demo_image_path(slug: str, index: int, orig_filename: Optional[str]) -> Path:
    base = _covers_base_dir()
    ext = ".png"
    if orig_filename and "." in orig_filename:
        ext = "." + orig_filename.split(".")[-1]
    return base / f"{slug}_demo_{index}{ext}"


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

@router.post("/story-templates/{slug}/demo/{index}")
def admin_upload_demo_image(
    slug: str,
    index: int,
    demo_file: UploadFile = File(...),
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    if index not in {1, 2, 3, 4}:
        raise HTTPException(status_code=400, detail="index must be 1..4")

    template = (
        db.query(StoryTemplate)
        .filter(StoryTemplate.slug == slug)
        .first()
    )
    if not template:
        raise HTTPException(status_code=404, detail="Story template not found")

    # Persist under covers with deterministic name per slot
    path = _demo_image_path(slug, index, demo_file.filename)
    demo_file.file.seek(0)
    temp_path = save_upload(demo_file.file, subdir="covers", filename=path.name)

    if index == 1:
        template.demo_image_1 = temp_path
    elif index == 2:
        template.demo_image_2 = temp_path
    elif index == 3:
        template.demo_image_3 = temp_path
    else:
        template.demo_image_4 = temp_path

    db.add(template)
    db.commit()
    db.refresh(template)
    return {"message": "Demo image uploaded", "index": index, "path": temp_path}


@router.post("/story-templates/{slug}/cover")
def admin_upload_template_cover(
    slug: str,
    cover_file: UploadFile = File(...),
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    template = db.query(StoryTemplate).filter(StoryTemplate.slug == slug).first()
    if not template:
        raise HTTPException(status_code=404, detail="Story template not found")

    # Use original extension if present
    orig_name = cover_file.filename or f"{slug}.png"
    ext = "." + orig_name.split(".")[-1] if "." in orig_name else ".png"
    filename = f"{slug}{ext}"

    cover_file.file.seek(0)
    temp_path = save_upload(cover_file.file, subdir="covers", filename=filename)
    # Persist relative path under MEDIA_ROOT
    template.cover_image_url = str(temp_path)
    db.add(template)
    db.commit()
    db.refresh(template)

    return {"message": "Cover uploaded", "cover_image_url": template.cover_image_url}


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


@router.get("/rq/summary")
def admin_rq_summary(_: None = Depends(require_admin)):
    """Basic RQ summary: queue sizes and workers."""
    try:
        from rq import Worker
    except Exception:
        Worker = None  # type: ignore
    try:
        books_q = Queue("books", connection=_redis)
        jobs_q = Queue("jobs", connection=_redis)
        data = {
            "queues": {
                "books": {"count": len(books_q)},
                "jobs": {"count": len(jobs_q)},
            },
            "workers": [],
        }
        if Worker is not None:
            for w in Worker.all(connection=_redis):  # type: ignore[attr-defined]
                item = {
                    "name": getattr(w, "name", None),
                    "state": getattr(w, "state", None),
                }
                try:
                    job = w.get_current_job()  # type: ignore[attr-defined]
                    if job is not None:
                        item["current_job_id"] = getattr(job, "id", None)
                        item["origin"] = getattr(job, "origin", None)
                except Exception:
                    pass
                data["workers"].append(item)
        return data
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@router.post("/books/{book_id}/cancel")
def admin_cancel_book(book_id: int, _: None = Depends(require_admin)):
    """Request cooperative cancellation for a running/queued book job.

    The worker checks this flag between pages/stages and exits early.
    """
    try:
        _redis.setex(f"book:cancel:{book_id}", 3600, "1")
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"message": "Cancel requested", "book_id": book_id}


# Legacy implementation retained for reference
def _legacy_admin_get_workflow(
    book_id: int,
    page: int = Query(1, ge=0),
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

        # Prepare workflow JSON for display, injecting keypoint filename if known
        wf = copy.deepcopy(snapshot.workflow_json)
        try:
            keypoint_slug_for_page: Optional[str] = None
            if book.story_source == "template" and book.template_key and story_template:
                temp_book = SimpleNamespace(
                    title=book.title,
                    template_key=book.template_key,
                    page_count=book.page_count,
                    story_source=book.story_source,
                    template_params=book.template_params,
                    target_age=book.target_age or story_template.age,
                    character_description=book.character_description,
                )
                _, overrides = _build_story_from_template(temp_book, story_template)
                override = overrides.get(page)
                if override:
                    keypoint_slug_for_page = override.get("keypoint")
            if keypoint_slug_for_page:
                kp_record = (
                    db.query(ControlNetImage)
                    .filter(ControlNetImage.slug == keypoint_slug_for_page)
                    .first()
                )
                if kp_record and kp_record.image_path:
                    image_filename = Path(kp_record.image_path).name
                else:
                    image_filename = f"{keypoint_slug_for_page}.png"
                _inject_keypoint_into_workflow(wf, image_filename)
        except Exception:
            pass

        return {
            "book_id": book.id,
            "image_filenames": filenames,
            "prompt": prompt,
            "story_source": book.story_source,
            "template_key": book.template_key,
            "template_params": book.template_params,
            "page_number": page,
            "prompt_id": snapshot.prompt_id,
            "workflow": wf,
            "source": "stored",
            "page_count": book.page_count,
            "available_pages": available_pages,
            "workflow_version": snapshot.workflow_version,
            "workflow_slug": snapshot.workflow_slug,
            "image_status": page_record.image_status if page_record else None,
            "image_error": page_record.image_error if page_record else None,
            "book_status": book.status,
            "book_error_message": book.error_message,
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
    keypoint_slug_for_page: Optional[str] = None

    if book.story_source == "template" and book.template_key and story_template:
        try:
            temp_book = SimpleNamespace(
                title=book.title,
                template_key=book.template_key,
                page_count=book.page_count,
                story_source=book.story_source,
                template_params=book.template_params,
                target_age=book.target_age or story_template.age,
                character_description=book.character_description,
            )
            _, overrides = _build_story_from_template(temp_book, story_template)
            if target_page:
                override = overrides.get(target_page.page_number)
                if override:
                    control_prompt = override.get("control")
                    keypoint_slug_for_page = override.get("keypoint")
        except Exception:
            control_prompt = None

    if not control_prompt and target_page and target_page.image_description:
        control_prompt = target_page.image_description

    if prompt:
        workflow = comfy_client._update_prompt(workflow, prompt, control_prompt)  # type: ignore[attr-defined]

    # Inject keypoint file name into workflow for inspector when available
    if keypoint_slug_for_page:
        kp_record = (
            db.query(ControlNetImage)
            .filter(ControlNetImage.slug == keypoint_slug_for_page)
            .first()
        )
        if kp_record and kp_record.image_path:
            try:
                image_filename = Path(kp_record.image_path).name
            except Exception:
                image_filename = f"{keypoint_slug_for_page}.png"
            _inject_keypoint_into_workflow(workflow, image_filename)
        else:
            # Fall back to slug-based filename for clarity
            _inject_keypoint_into_workflow(workflow, f"{keypoint_slug_for_page}.png")

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
        "image_status": target_page.image_status if target_page else None,
        "image_error": target_page.image_error if target_page else None,
        "book_status": book.status,
        "book_error_message": book.error_message,
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


class BackupRestorePayload(BaseModel):
    timestamp: str


@router.get("/backups")
def admin_list_backups(_: None = Depends(require_admin)):
    if not os.getenv("BACKUP_S3_BUCKET"):
        raise HTTPException(status_code=503, detail="Backups are not configured.")
    try:
        backups = list_backups()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"backups": backups}


@router.post("/backups/run")
def admin_run_backup(_: None = Depends(require_admin)):
    if not os.getenv("BACKUP_S3_BUCKET"):
        raise HTTPException(status_code=503, detail="Backups are not configured.")
    try:
        info = perform_backup()
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"message": "Backup created", "backup": info}


@router.post("/backups/restore")
def admin_restore_backup(payload: BackupRestorePayload, _: None = Depends(require_admin)):
    if not os.getenv("BACKUP_S3_BUCKET"):
        raise HTTPException(status_code=503, detail="Backups are not configured.")
    try:
        restore_backup(payload.timestamp)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc
    return {"message": f"Restore of {payload.timestamp} completed"}


@router.get("/support/tickets")
def admin_list_support_tickets(_: None = Depends(require_admin), db: Session = Depends(get_db)):
    rows = (
        db.query(SupportTicket)
        .order_by(SupportTicket.created_at.desc())
        .limit(200)
        .all()
    )
    items = []
    for t in rows:
        items.append(
            {
                "id": t.id,
                "user_email": t.user_email,
                "subject": t.subject,
                "category": t.category,
                "status": t.status,
                "created_at": t.created_at.isoformat() if t.created_at else None,
            }
        )
    return {"tickets": items}


@router.get("/support/tickets/{ticket_id}")
def admin_get_support_ticket(ticket_id: int, _: None = Depends(require_admin), db: Session = Depends(get_db)):
    t = db.query(SupportTicket).filter(SupportTicket.id == ticket_id).first()
    if not t:
        raise HTTPException(status_code=404, detail="Ticket not found")
    return {
        "id": t.id,
        "user_id": t.user_id,
        "user_email": t.user_email,
        "subject": t.subject,
        "body": t.body,
        "category": t.category,
        "book_id": t.book_id,
        "status": t.status,
        "app_version": t.app_version,
        "build": t.build,
        "device_os": t.device_os,
        "api_base": t.api_base,
        "created_at": t.created_at.isoformat() if t.created_at else None,
        "updated_at": t.updated_at.isoformat() if t.updated_at else None,
    }


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
        age=payload.age,
        version=payload.version or 1,
        workflow_slug=payload.workflow_slug or "base",
        is_active=payload.is_active if payload.is_active is not None else True,
        cover_image_url=(payload.cover_image_url or None),
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
        workflow_value = None
        if page.workflow is not None:
            try:
                workflow_value = str(page.workflow).strip()
            except Exception as exc:
                raise HTTPException(
                    status_code=400,
                    detail=f"Page {page.page_number} workflow must be text",
                ) from exc
            if not workflow_value:
                workflow_value = None
        seed_value = None
        if page.seed is not None:
            try:
                seed_value = int(page.seed)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400,
                    detail=f"Page {page.page_number} seed must be an integer",
                ) from None
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
            workflow_slug=workflow_value,
            seed=seed_value,
            cover_text=page.cover_text or None,
        )
        db.add(page_row)

    db.commit()
    db.refresh(template)
    return _story_template_to_dict(template)


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


@router.put("/story-templates/{slug}")
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
    template.age = payload.age
    template.cover_image_url = payload.cover_image_url or None
    if payload.version is not None:
        template.version = payload.version
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
        workflow_value = None
        if page.workflow is not None:
            try:
                workflow_value = str(page.workflow).strip()
            except Exception as exc:
                raise HTTPException(
                    status_code=400,
                    detail=f"Page {page.page_number} workflow must be text",
                ) from exc
            if not workflow_value:
                workflow_value = None
        seed_value = None
        if page.seed is not None:
            try:
                seed_value = int(page.seed)
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400,
                    detail=f"Page {page.page_number} seed must be an integer",
                ) from None
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
            workflow_slug=workflow_value,
            seed=seed_value,
            cover_text=page.cover_text or None,
        )
        db.add(page_row)

    db.commit()
    db.refresh(template)
    return _story_template_to_dict(template)


@router.post("/story-templates/{slug}/duplicate")
def admin_duplicate_story_template(
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

    def _next_copy(value: Optional[str], field: str) -> str:
        base = (value or "").strip() or "story-template"
        candidate = f"{base}-copy"
        while (
            db.query(StoryTemplate)
            .filter(getattr(StoryTemplate, field) == candidate)
            .first()
        ):
            base = candidate
            candidate = f"{base}-copy"
        return candidate

    new_slug = _next_copy(template.slug, "slug")
    new_name = _next_copy(template.name or template.slug, "name")

    clone = StoryTemplate(
        slug=new_slug,
        name=new_name,
        description=template.description,
        age=template.age,
        version=1,
        workflow_slug=template.workflow_slug,
        is_active=template.is_active,
        cover_image_url=template.cover_image_url,
        free_trial_slug=template.free_trial_slug,
        price_dollars=template.price_dollars,
        discount_price=template.discount_price,
    )
    db.add(clone)
    db.flush()

    for page in sorted(template.pages or [], key=lambda p: p.page_number):
        clone_page = StoryTemplatePage(
            story_template_id=clone.id,
            page_number=page.page_number,
            story_text=page.story_text,
            image_prompt=page.image_prompt,
            positive_prompt=page.positive_prompt,
            negative_prompt=page.negative_prompt,
            pose_prompt=page.pose_prompt,
            controlnet_image=page.controlnet_image,
            keypoint_image=page.keypoint_image,
            workflow_slug=page.workflow_slug,
            seed=page.seed,
            cover_text=page.cover_text,
        )
        db.add(clone_page)

    db.commit()
    db.refresh(clone)
    return {
        "message": "Story template duplicated",
        "story": _story_template_to_dict(clone),
    }


@router.post("/story-templates/{slug}/export")
def admin_export_story_template(
    slug: str,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        info = export_story_fixture(db, slug)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"message": "Story template exported", **info}


@router.post("/fixtures/export")
def admin_export_fixtures(
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    summary = export_all_fixtures(db)
    return {"message": "Fixtures exported", **summary}


@router.post("/workflows/{workflow_id}/export")
def admin_export_workflow(
    workflow_id: int,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        info = export_workflow_fixture(db, workflow_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"message": "Workflow exported", **info}


@router.post("/users/{user_id}/export")
def admin_export_user(
    user_id: int,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    try:
        info = export_user_fixture(db, user_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    return {"message": "User exported", **info}


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
    workflow: Optional[str] = None
    seed: Optional[int] = None
    cover_text: Optional[str] = None


class StoryTemplatePayload(BaseModel):
    slug: str
    name: str
    description: Optional[str] = None
    age: Optional[str] = None
    version: Optional[int] = 1
    workflow_slug: Optional[str] = "base"
    is_active: Optional[bool] = True
    cover_image_url: Optional[str] = None
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


@router.post("/books/{book_id}/rebuild-pdf")
def admin_rebuild_pdf(
    book_id: int,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Rebuild the PDF from existing page images without regenerating images."""
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")

    pages = (
        db.query(BookPage)
        .filter(BookPage.book_id == book.id)
        .order_by(BookPage.page_number)
        .all()
    )
    if not pages:
        raise HTTPException(status_code=409, detail="No pages found for this book")

    pages_data = []
    for p in pages:
        pages_data.append(
            {
                "text_content": p.text_content,
                "image_path": p.image_path,
                "page_number": p.page_number,
            }
        )

    media_root = get_media_root()
    books_dir = media_root / "books"
    books_dir.mkdir(parents=True, exist_ok=True)
    pdf_filename = f"book_{book.id}_{(book.title or 'book').replace(' ', '_')}.pdf"
    pdf_path = books_dir / pdf_filename

    if pdf_path.exists():
        try:
            pdf_path.unlink()
        except OSError:
            pass

    composer = BookComposer()
    try:
        pdf_path_str = composer.create_book_pdf(
            {
                "title": book.title or "",
                "theme": book.theme or "",
                "target_age": book.target_age or "",
                "preview_image_path": book.preview_image_path,
            },
            pages_data,
            str(pdf_path),
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Failed to compose PDF: {exc}")

    book.pdf_path = pdf_path_str
    book.pdf_generated_at = datetime.now(timezone.utc)
    db.commit()

    return {"message": "PDF rebuilt", "pdf_path": pdf_path_str}


class PageRegeneratePayload(BaseModel):
    mode: str  # 'edited' | 'template'
    workflow_json: Optional[dict] = None


@router.post("/books/{book_id}/pages/{page}/regenerate")
def admin_regenerate_page(
    book_id: int,
    page: int,
    payload: PageRegeneratePayload,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Regenerate a single page image for a book and store an exact workflow snapshot.

    Top-level exception handling added to surface failures in logs and Sentry.
    """
    try:
        print(f"[AdminRegenerate] start book={book_id} page={page} mode={payload.mode}")
    except Exception:
        pass
    book = db.query(Book).filter(Book.id == book_id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    page_rec = (
        db.query(BookPage)
        .filter(BookPage.book_id == book.id, BookPage.page_number == page)
        .first()
    )
    if not page_rec:
        raise HTTPException(status_code=404, detail="Page not found")

    comfy_client = ComfyUIClient(COMFYUI_SERVER)

    # Determine workflow and prompts
    story_template = _load_story_template(book.template_key)
    workflow_json: dict
    workflow_slug: str = (story_template.workflow_slug if story_template else "base")
    workflow_version: int = 0
    positive_prompt: Optional[str] = None
    negative_prompt: Optional[str] = None
    keypoint_slug: Optional[str] = None

    # Use template overrides when in template mode
    overrides = {}
    if book.story_source == "template" and story_template:
        temp_book = SimpleNamespace(
            title=book.title,
            template_key=book.template_key,
            page_count=book.page_count,
            story_source=book.story_source,
            template_params=book.template_params,
            target_age=book.target_age or story_template.age,
            character_description=book.character_description,
        )
        _, overrides = _build_story_from_template(temp_book, story_template)
        ovr = overrides.get(page, {})
        if isinstance(ovr, dict):
            positive_prompt = ovr.get("positive") or page_rec.enhanced_prompt or book.positive_prompt
            negative_prompt = ovr.get("negative") or book.negative_prompt
            keypoint_slug = ovr.get("keypoint")
            if ovr.get("workflow"):
                workflow_slug = ovr.get("workflow")

    # Pick prompts if not set
    if not positive_prompt:
        positive_prompt = page_rec.enhanced_prompt or book.positive_prompt or page_rec.image_description
    if not negative_prompt:
        negative_prompt = book.negative_prompt

    # Resolve base workflow
    if payload.mode == "edited":
        if not payload.workflow_json or not isinstance(payload.workflow_json, dict):
            raise HTTPException(status_code=400, detail="workflow_json required for edited mode")
        workflow_json = copy.deepcopy(payload.workflow_json)
        workflow_version = 0
    elif payload.mode == "template":
        base_wf, wf_version, wf_slug_active = get_childbook_workflow(workflow_slug)
        workflow_version = wf_version
        workflow_slug = wf_slug_active
        workflow_json = copy.deepcopy(base_wf)
    else:
        raise HTTPException(status_code=400, detail="Invalid mode; use 'edited' or 'template'")

    # Upload keypoint image if provided in overrides
    kp_uploaded: Optional[str] = None
    if keypoint_slug:
        kp_record = db.query(ControlNetImage).filter(ControlNetImage.slug == keypoint_slug).first()
        if kp_record and kp_record.image_path and os.path.exists(kp_record.image_path):
            try:
                kp_uploaded = comfy_client._upload_image(kp_record.image_path)
            except Exception as exc:
                # Surface keypoint upload failures explicitly
                try:
                    if sentry_sdk is not None:  # type: ignore[name-defined]
                        from sentry_sdk import push_scope  # type: ignore
                        with push_scope() as scope:  # type: ignore
                            scope.set_tag("feature", "admin_regenerate_page")
                            scope.set_tag("stage", "upload_keypoint")
                            scope.set_tag("book_id", str(book.id))
                            scope.set_tag("page", str(page))
                            scope.set_extra("keypoint_slug", keypoint_slug)
                            scope.set_extra("error", str(exc))
                            sentry_sdk.capture_message(
                                f"Keypoint upload failed (book={book.id}, page={page}, slug={keypoint_slug})",
                                level="error",
                            )
                    # Console log for quick verification
                    print(
                        f"[Sentry] keypoint upload failure captured: book={book.id} page={page} slug={keypoint_slug} err={exc}"
                    )
                except Exception:
                    pass
                raise HTTPException(status_code=500, detail=f"Failed to upload keypoint image: {exc}")

    # Prepare input reference images
    try:
        input_paths = json.loads(book.original_image_paths) if book.original_image_paths else []
    except Exception:
        input_paths = [book.original_image_paths] if book.original_image_paths else []

    # Run ComfyUI
    if payload.mode == "edited":
        # Strict mode: do not mutate the edited workflow; only upload inputs
        result = comfy_client.process_strict(
            workflow_json=workflow_json,
            upload_image_paths=input_paths,
            fixed_basename=f"book{book.id}_p{page}",
        )
    else:
        result = comfy_client.process_image_to_animation(
            input_image_paths=input_paths,
            workflow_json=workflow_json,
            custom_prompt=positive_prompt,
            control_prompt=negative_prompt,
            keypoint_filename=kp_uploaded,
            fixed_basename=f"book{book.id}_p{page}",
        )

    if result.get("status") != "success" or not result.get("output_path"):
        # Explicitly surface admin regenerate failures to Sentry even if this is not a Python exception
        try:
            if sentry_sdk is not None:  # type: ignore[name-defined]
                from sentry_sdk import push_scope  # type: ignore
                with push_scope() as scope:  # type: ignore
                    scope.set_tag("feature", "admin_regenerate_page")
                    scope.set_tag("book_id", str(book.id))
                    scope.set_tag("page", str(page))
                    scope.set_tag("mode", payload.mode)
                    scope.set_extra("result_status", result.get("status"))
                    scope.set_extra("result_error", result.get("error"))
                    scope.set_extra("workflow_slug", workflow_slug)
                    scope.set_extra("workflow_version", workflow_version)
                    scope.set_extra("prompt_id", result.get("prompt_id"))
                    event_id = sentry_sdk.capture_message(
                        f"Admin page regenerate failed (book={book.id}, page={page})",
                        level="error",
                    )
                    # Console visibility for quick verification in container logs
                    try:
                        print(
                            f"[Sentry] admin_regenerate_page failure captured: book={book.id} page={page} event_id={event_id}"
                        )
                    except Exception:
                        pass
        except Exception:
            # Never block API response due to telemetry issues
            pass
        try:
            print(f"[AdminRegenerate] failed book={book.id} page={page} status={result.get('status')} error={result.get('error')}")
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=f"Regeneration failed: {result.get('error')}")

    # Move output and update DB
    final_output_path = Path(result["output_path"])
    target_dir = Path(get_media_root()) / "outputs"
    new_name = f"{book.id}_page_{page}"
    new_output_path = move_to(str(final_output_path), str(target_dir), new_name)

    page_rec.image_path = new_output_path
    page_rec.image_status = "completed"
    page_rec.image_error = None
    page_rec.image_completed_at = datetime.now(timezone.utc)
    if page == 0:
        book.preview_image_path = new_output_path

    # VAE/control preview move
    vae_preview_path = result.get("vae_preview_path")
    if vae_preview_path:
        target_dir2 = Path(get_media_root()) / "intermediates"
        new_name2 = f"{book.id}_controlnet_{page}"
        new_vae_path = move_to(vae_preview_path, str(target_dir2), new_name2)
        result["vae_preview_path"] = new_vae_path

    # Store exact workflow payload
    # For auditing: if the mode was 'edited', persist exactly the edited JSON the admin submitted
    if payload.mode == "edited":
        workflow_payload = workflow_json
    else:
        workflow_payload = result.get("workflow") or workflow_json
    try:
        serialized_workflow = json.loads(json.dumps(workflow_payload))
    except TypeError:
        serialized_workflow = workflow_payload
    # Tag workflow_slug so UI can indicate origin
    tagged_slug = f"{workflow_slug}:{'edited' if payload.mode == 'edited' else 'template'}"
    snapshot = BookWorkflowSnapshot(
        book_id=book.id,
        page_number=page,
        prompt_id=result.get("prompt_id"),
        workflow_json=serialized_workflow,
        vae_image_path=result.get("vae_preview_path"),
        workflow_version=workflow_version,
        workflow_slug=tagged_slug,
    )
    db.add(snapshot)

    db.commit()

    try:
        print(f"[AdminRegenerate] success book={book.id} page={page} output={new_output_path}")
    except Exception:
        pass
    return {
        "message": "Page regenerated",
        "output_path": new_output_path,
        "page": page,
    }




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
    old_slug = definition.slug
    new_slug = payload.slug

    # Update definition
    definition.slug = new_slug
    definition.name = payload.name
    definition.type = payload.type
    definition.content = payload.content
    if payload.version is not None:
        definition.version = payload.version
    if payload.is_active is not None:
        definition.is_active = payload.is_active

    # If slug changed, cascade update story templates that reference the old slug
    if new_slug != old_slug:
        db.query(StoryTemplate).filter(StoryTemplate.workflow_slug == old_slug).update(
            {StoryTemplate.workflow_slug: new_slug}, synchronize_session=False
        )

    db.commit()
    return {"message": "Workflow updated"}


@router.post("/workflows/{workflow_id}/duplicate")
def admin_duplicate_workflow(
    workflow_id: int,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    definition = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow not found")

    def _next_copy(value: str, field: str) -> str:
        base = (value or "").strip() or "workflow"
        candidate = f"{base}-copy"
        while (
            db.query(WorkflowDefinition)
            .filter(getattr(WorkflowDefinition, field) == candidate)
            .first()
        ):
            base = candidate
            candidate = f"{base}-copy"
        return candidate

    new_slug = _next_copy(definition.slug, "slug")
    new_name = _next_copy(definition.name or definition.slug, "name")

    content = definition.content
    if isinstance(content, (dict, list)):
        content_payload = copy.deepcopy(content)
    else:
        try:
            content_payload = json.loads(content)
        except Exception:
            content_payload = content

    clone = WorkflowDefinition(
        slug=new_slug,
        name=new_name,
        type=definition.type,
        version=1,
        content=content_payload,
        is_active=False,
    )
    db.add(clone)
    db.commit()
    db.refresh(clone)

    return {
        "message": "Workflow duplicated",
        "workflow": {
            "id": clone.id,
            "slug": clone.slug,
            "name": clone.name,
            "version": clone.version,
        },
    }


@router.delete("/workflows/{workflow_id}")
def admin_delete_workflow(
    workflow_id: int,
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    definition = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow not found")
    old_slug = definition.slug

    # Find a replacement workflow (any other definition). Prefer active and most recent.
    replacement = (
        db.query(WorkflowDefinition)
        .filter(WorkflowDefinition.id != workflow_id)
        .order_by(WorkflowDefinition.is_active.desc(), WorkflowDefinition.updated_at.desc(), WorkflowDefinition.version.desc())
        .first()
    )

    # If there are story templates using this slug and no replacement exists, block deletion
    in_use_count = db.query(func.count(StoryTemplate.id)).filter(StoryTemplate.workflow_slug == old_slug).scalar()
    if in_use_count and not replacement:
        raise HTTPException(status_code=409, detail="Cannot delete: no other workflow available to reassign templates.")

    # Reassign any story templates using the deleted slug to the replacement's slug
    if replacement:
        db.query(StoryTemplate).filter(StoryTemplate.workflow_slug == old_slug).update(
            {StoryTemplate.workflow_slug: replacement.slug}, synchronize_session=False
        )

    db.delete(definition)
    db.commit()
    return {"message": "Workflow deleted", "reassigned_to": replacement.slug if replacement else None}


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
        # Disassociate any payments that reference this book to satisfy FK constraints
        db.query(Payment).filter(Payment.book_id == book_id).update(
            {Payment.book_id: None}, synchronize_session=False
        )

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

def _thumbs_dir() -> Path:
    media_root = Path(os.getenv("MEDIA_ROOT", "/data/media")).resolve()
    d = media_root / "thumbs"
    d.mkdir(parents=True, exist_ok=True)
    return d


def _build_thumb(file_path: Path, width: int, height: Optional[int] = None) -> Path:
    """Create or return a cached thumbnail for the given file and size for admin previews.

    Preserves aspect ratio; if height is None, computes based on width.
    Saves under MEDIA_ROOT/thumbs with a deterministic name.
    """
    file_path = Path(file_path)
    w = max(1, int(width))
    h = int(height) if (height and int(height) > 0) else 0
    stem = file_path.stem
    ext = file_path.suffix.lower() or ".jpg"
    target = _thumbs_dir() / f"{stem}_w{w}_h{h}{ext}"
    try:
        if target.exists() and target.stat().st_mtime >= file_path.stat().st_mtime:
            return target
    except Exception:
        pass
    with PILImage.open(str(file_path)) as img:
        ow, oh = img.size
        if h <= 0:
            ratio = w / float(ow)
            h_eff = max(1, int(round(oh * ratio)))
        else:
            h_eff = h
        # Ensure JPEG target compatibility
        if ext in (".jpg", ".jpeg") and img.mode != "RGB":
            img = img.convert("RGB")
        elif img.mode not in ("RGB", "RGBA"):
            img = img.convert("RGB")
        img_thumb = img.copy()
        img_thumb.thumbnail((w, h_eff))
        save_kwargs = {}
        if ext in (".jpg", ".jpeg"):
            save_kwargs.update({"quality": 82, "optimize": True, "progressive": True})
        img_thumb.save(str(target), **save_kwargs)
    return target


@router.get("/files")
def admin_get_file(path: str, _: None = Depends(require_admin)):
    if not path:
        raise HTTPException(status_code=400, detail="Missing path")
    file_path = _resolve_media_path(path)
    return FileResponse(file_path)

@router.get("/media/resize")
def admin_media_resize(
    path: str = Query(...),
    w: int = Query(320, ge=1),
    h: Optional[int] = Query(None, ge=1),
    _: None = Depends(require_admin),
):
    if not path:
        raise HTTPException(status_code=400, detail="Missing path")
    file_path = _resolve_media_path(path)
    try:
        thumb = _build_thumb(Path(file_path), int(w), int(h) if h else None)
        return FileResponse(str(thumb), headers={"Cache-Control": "public, max-age=86400"})
    except Exception as exc:
        # Fallback to original image on failure
        try:
            print(f"[AdminResize] Failed to resize '{file_path}': {exc}")
        except Exception:
            pass
        return FileResponse(str(file_path), headers={"Cache-Control": "public, max-age=600"})
# New workflow inspector using DB-backed stories/workflows
@router.get("/books/{book_id}/workflow")
def admin_get_workflow(
    book_id: int,

    page: int = Query(0, ge=0),
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

    snapshot_rows = (
        db.query(BookWorkflowSnapshot.page_number)
        .filter(BookWorkflowSnapshot.book_id == book_id)
        .distinct()
        .all()
    )
    snapshot_pages = [row.page_number for row in snapshot_rows]

    page_rows = (
        db.query(BookPage.page_number)
        .filter(BookPage.book_id == book_id)
        .all()
    )
    page_numbers = [row.page_number for row in page_rows]

    available_set = {0}
    available_set.update(p for p in snapshot_pages if p is not None)
    available_set.update(p for p in page_numbers if p is not None)
    if page not in available_set:
        available_set.add(page)
    available_pages = sorted(available_set)

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

        # Derive regenerate mode tag from workflow_slug suffix if present
        regen_mode = None
        try:
            if isinstance(snapshot.workflow_slug, str):
                if snapshot.workflow_slug.endswith(":edited"):
                    regen_mode = "edited"
                elif snapshot.workflow_slug.endswith(":template"):
                    regen_mode = "template"
        except Exception:
            regen_mode = None

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
            "regenerate_mode": regen_mode,
            "snapshot_created_at": snapshot.created_at.isoformat() if snapshot.created_at else None,
            "page_count": book.page_count,
            "available_pages": available_pages,
            "workflow_version": snapshot.workflow_version,
            "workflow_slug": snapshot.workflow_slug,
            # Include page/book error metadata for admin UI
            "image_status": page_record.image_status if page_record else None,
            "image_error": page_record.image_error if page_record else None,
            "book_status": book.status,
            "book_error_message": book.error_message,
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
                target_age=book.target_age or story_template.age,
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
        # Include page/book error metadata for admin UI
        "image_status": target_page.image_status if target_page else None,
        "image_error": target_page.image_error if target_page else None,
        "book_status": book.status,
        "book_error_message": book.error_message,
    }

@router.post("/test/comfy-run")
def admin_test_comfy_run(
    workflow_slug: str = Form(...),
    positive_prompt: Optional[str] = Form(None),
    negative_prompt: Optional[str] = Form(None),
    images: Optional[List[UploadFile]] = File(None),
    image_kp: UploadFile | None = File(None),
    _: None = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Run a lightweight ComfyUI test with a selected workflow and inputs.

    Accepts a single reference image (e.g., for InstantID), optional positive/negative prompts,
    and a workflow slug. Returns the output image path and the exact workflow payload queued.
    """
    # Resolve workflow definition by slug (latest active)
    definition = (
        db.query(WorkflowDefinition)
        .filter(WorkflowDefinition.slug == workflow_slug, WorkflowDefinition.is_active.is_(True))
        .order_by(WorkflowDefinition.version.desc())
        .first()
    )
    if not definition:
        raise HTTPException(status_code=404, detail="Workflow definition not found")

    try:
        base_workflow = (
            definition.content if isinstance(definition.content, dict) else json.loads(definition.content)
        )
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Invalid workflow JSON: {exc}")

    # Save uploaded image(s) to MEDIA_ROOT/uploads for ComfyUI upload
    input_paths: list[str] = []
    if images:
        for f in images:
            if f is None or not getattr(f, "filename", ""):
                continue
            try:
                f.file.seek(0)
            except Exception:
                pass
            saved = save_upload(f.file, subdir="uploads", filename=f.filename)
            input_paths.append(saved)

    comfy_client = ComfyUIClient(COMFYUI_SERVER)
    # Process via ComfyUI
    # Upload keypoint image to ComfyUI if provided
    kp_uploaded: Optional[str] = None
    if image_kp is not None and getattr(image_kp, "filename", ""):
        try:
            image_kp.file.seek(0)
        except Exception:
            pass
        kp_local = save_upload(image_kp.file, subdir="uploads", filename=image_kp.filename)
        try:
            kp_uploaded = comfy_client._upload_image(kp_local)
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to upload keypoint image: {exc}")

    result = comfy_client.process_image_to_animation(
        input_image_paths=input_paths,
        workflow_json=base_workflow,
        custom_prompt=(positive_prompt or None),
        control_prompt=(negative_prompt or None),
        keypoint_filename=kp_uploaded,
        fixed_basename="test_result",
    )

    status_text = result.get("status")
    payload = {
        "status": status_text,
        "message": "ComfyUI test completed" if status_text == "success" else "ComfyUI test failed",
        "output_path": result.get("output_path"),
        "prompt_id": result.get("prompt_id"),
        "workflow_payload": result.get("workflow"),
        "error": result.get("error"),
        "inputs": {
            "workflow_slug": workflow_slug,
            "positive_prompt": positive_prompt,
            "negative_prompt": negative_prompt,
            "reference_images": [getattr(f, "filename", None) for f in (images or []) if getattr(f, "filename", None)],
            "image_kp": (image_kp.filename if image_kp else None),
        },
    }
    return payload
