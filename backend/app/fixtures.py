from __future__ import annotations

import json
import re
from pathlib import Path
from typing import Any, Dict, List, Tuple

from sqlalchemy.orm import Session, joinedload


FIXTURE_ROOT = Path(__file__).resolve().parent.parent / "fixtures"
STORIES_DIR = FIXTURE_ROOT / "stories"
WORKFLOWS_DIR = FIXTURE_ROOT / "workflows"
USERS_DIR = FIXTURE_ROOT / "users"


def _safe_filename(raw: str, *, fallback: str) -> str:
    value = raw.strip().lower()
    value = re.sub(r"[^a-z0-9._-]+", "-", value)
    value = value.strip("-")
    return value or fallback


def _read_fixtures(dir_path: Path) -> List[Tuple[Path, Dict[str, Any]]]:
    if not dir_path.exists():
        return []
    records: List[Tuple[Path, Dict[str, Any]]] = []
    for file_path in sorted(dir_path.glob("*.json")):
        with file_path.open("r", encoding="utf-8") as handle:
            records.append((file_path, json.load(handle)))
    return records


def load_story_fixtures() -> List[Tuple[Path, Dict[str, Any]]]:
    return _read_fixtures(STORIES_DIR)


def load_workflow_fixtures() -> List[Tuple[Path, Dict[str, Any]]]:
    return _read_fixtures(WORKFLOWS_DIR)


def load_user_fixtures() -> List[Tuple[Path, Dict[str, Any]]]:
    return _read_fixtures(USERS_DIR)


def _write_json(path: Path, payload: Dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, indent=2, sort_keys=True, ensure_ascii=False)
        handle.write("\n")

def _normalize_cover_text(value: Any) -> List[Dict[str, Any]]:
    """Export StoryTemplatePage.cover_text as a structured list (not a JSON string)."""
    if value is None or value == "" or value == []:
        return []

    defaults: Dict[str, Any] = {
        "text": "",
        "font_size": 60,
        "fill_color_hex": "#FFFFFF",
        "stroke_color_hex": "#000000",
        "x_shift": 0,
        "y_shift": -40,
        "vertical_alignment": "top",
    }

    data: Any = value
    if isinstance(value, str):
        raw = value.strip()
        if raw:
            try:
                data = json.loads(raw)
            except Exception:
                data = raw

    if isinstance(data, list):
        source = data
    elif isinstance(data, dict):
        source = [data]
    elif isinstance(data, str):
        source = [{"text": data}]
    else:
        source = [{"text": str(data)}]

    items: List[Dict[str, Any]] = []
    for item in source:
        if not isinstance(item, dict):
            item = {"text": str(item)}
        cfg = defaults.copy()
        try:
            cfg.update(item)
        except Exception:
            pass
        try:
            cfg["font_size"] = int(cfg.get("font_size", defaults["font_size"]))
        except Exception:
            cfg["font_size"] = defaults["font_size"]
        for key in ("fill_color_hex", "stroke_color_hex", "vertical_alignment"):
            try:
                cfg[key] = str(cfg.get(key) or defaults[key])
            except Exception:
                cfg[key] = defaults[key]
        for key in ("x_shift", "y_shift"):
            try:
                cfg[key] = int(cfg.get(key, defaults[key]))
            except Exception:
                cfg[key] = defaults[key]
        cfg["text"] = str(cfg.get("text") or "")
        items.append(cfg)
    return items


def _story_to_payload(story) -> Dict[str, Any]:
    payload: Dict[str, Any] = {
        "slug": story.slug,
        "name": story.name,
        "description": story.description,
        "age": getattr(story, "age", None),
        "version": getattr(story, "version", 1),
        "workflow_slug": story.workflow_slug,
        "is_active": bool(getattr(story, "is_active", True)),
        "free_trial_slug": getattr(story, "free_trial_slug", None),
        "price_dollars": str(story.price_dollars) if getattr(story, "price_dollars", None) is not None else None,
        "discount_price": str(story.discount_price) if getattr(story, "discount_price", None) is not None else None,
        "pages": [],
    }
    pages = getattr(story, "pages", []) or []
    for page in sorted(pages, key=lambda p: p.page_number):
        cover_text_items = _normalize_cover_text(getattr(page, "cover_text", None))
        payload["pages"].append(
            {
                "page_number": page.page_number,
                "story_text": page.story_text,
                "image_prompt": page.image_prompt,
                "positive_prompt": page.positive_prompt,
                "negative_prompt": page.negative_prompt,
                "pose_prompt": page.pose_prompt,
                "description": getattr(page, "description", None),
                # For Qwen workflows, this is the "story image" slug; legacy name remains keypoint_image.
                "story_image": getattr(page, "story_image", None),
                "keypoint_image": page.keypoint_image,
                "controlnet_image": page.controlnet_image,
                "workflow": getattr(page, "workflow_slug", None),
                "seed": getattr(page, "seed", None),
                "cover_text": cover_text_items or None,
            }
        )
    return payload


def _workflow_to_payload(workflow) -> Dict[str, Any]:
    return {
        "slug": workflow.slug,
        "name": workflow.name,
        "type": workflow.type,
        "version": workflow.version,
        "is_active": bool(getattr(workflow, "is_active", True)),
        "content": workflow.content,
    }



def _user_to_payload(user) -> Dict[str, Any]:
    return {
        "email": user.email,
        "password_hash": user.password_hash,
        "role": user.role,
        "credits": str(user.credits) if getattr(user, "credits", None) is not None else "0",
        "free_trials_used": getattr(user, "free_trials_used", []) or [],
    }


def export_all_fixtures(db: Session) -> Dict[str, Any]:
    from app.models import StoryTemplate, User, WorkflowDefinition

    stories_exported = 0
    workflows_exported = 0
    users_exported = 0

    stories = (
        db.query(StoryTemplate)
        .options(joinedload(StoryTemplate.pages))
        .order_by(StoryTemplate.slug.asc())
        .all()
    )
    for story in stories:
        story_payload = _story_to_payload(story)
        file_name = f"{_safe_filename(story.slug, fallback='story')}.json"
        _write_json(STORIES_DIR / file_name, story_payload)
        stories_exported += 1

    workflows = (
        db.query(WorkflowDefinition)
        .order_by(WorkflowDefinition.slug.asc(), WorkflowDefinition.version.asc())
        .all()
    )
    for workflow in workflows:
        payload = _workflow_to_payload(workflow)
        file_name = f"{_safe_filename(f'{workflow.slug}-v{workflow.version}', fallback='workflow')}.json"
        _write_json(WORKFLOWS_DIR / file_name, payload)
        workflows_exported += 1

    users = db.query(User).order_by(User.email.asc()).all()
    for user in users:
        payload = _user_to_payload(user)
        file_name = f"{_safe_filename(user.email.replace('@', '-at-'), fallback='user')}.json"
        _write_json(USERS_DIR / file_name, payload)
        users_exported += 1

    return {
        "stories_exported": stories_exported,
        "workflows_exported": workflows_exported,
        "users_exported": users_exported,
    }


def export_story_fixture(db: Session, slug: str) -> Dict[str, Any]:
    from app.models import StoryTemplate

    story = (
        db.query(StoryTemplate)
        .options(joinedload(StoryTemplate.pages))
        .filter(StoryTemplate.slug == slug)
        .first()
    )
    if not story:
        raise LookupError(f"Story template '{slug}' not found")

    payload = _story_to_payload(story)
    file_name = f"{_safe_filename(story.slug, fallback='story')}.json"
    path = STORIES_DIR / file_name
    _write_json(path, payload)
    return {"slug": story.slug, "path": str(path)}


def export_workflow_fixture(db: Session, workflow_id: int) -> Dict[str, Any]:
    from app.models import WorkflowDefinition

    workflow = db.query(WorkflowDefinition).filter(WorkflowDefinition.id == workflow_id).first()
    if not workflow:
        raise LookupError(f"Workflow definition '{workflow_id}' not found")

    payload = _workflow_to_payload(workflow)
    file_name = f"{_safe_filename(f'{workflow.slug}-v{workflow.version}', fallback='workflow')}.json"
    path = WORKFLOWS_DIR / file_name
    _write_json(path, payload)
    return {
        "slug": workflow.slug,
        "version": workflow.version,
        "path": str(path),
    }


def export_user_fixture(db: Session, user_id: int) -> Dict[str, Any]:
    from app.models import User

    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise LookupError(f"User '{user_id}' not found")

    payload = _user_to_payload(user)
    base_name = user.email.replace("@", "-at-") if user.email else f"user-{user_id}"
    file_name = f"{_safe_filename(base_name, fallback='user')}.json"
    path = USERS_DIR / file_name
    _write_json(path, payload)
    return {
        "id": user.id,
        "email": user.email,
        "path": str(path),
    }
