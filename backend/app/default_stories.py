from __future__ import annotations

import json
import os
from decimal import Decimal
from typing import Any, Dict

from app.fixtures import load_story_fixtures


def _to_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    return Decimal(str(value))

def _cover_text_to_db(value: Any) -> str | None:
    if value is None or value == "" or value == []:
        return None
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
    items: list[Dict[str, Any]] = []
    for item in source:
        if not isinstance(item, dict):
            item = {"text": str(item)}
        cfg = defaults.copy()
        try:
            cfg.update(item)
        except Exception:
            pass
        cfg["text"] = str(cfg.get("text") or "")
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
        items.append(cfg)
    return json.dumps(items, ensure_ascii=False)


def ensure_default_stories(session_factory):
    """Ensure story templates exist by seeding from fixtures when necessary."""

    from app.models import StoryTemplate, StoryTemplatePage  # local import to avoid circulars

    reset_flag = os.getenv("RESET_STORY_TEMPLATES", "").strip().lower()
    fixture_records = load_story_fixtures()
    if not fixture_records:
        return

    session = session_factory()
    try:
        if reset_flag in {"1", "true", "yes"}:
            session.query(StoryTemplatePage).delete()
            session.query(StoryTemplate).delete()
            session.commit()

        for path, payload in fixture_records:
            slug = (payload.get("slug") or "").strip()
            if not slug:
                continue
            existing = session.query(StoryTemplate).filter(StoryTemplate.slug == slug).first()
            if existing:
                continue

            age_value = payload.get("age")
            if age_value is None:
                age_value = payload.get("default_age")

            version_value = payload.get("version")
            if version_value is None:
                version_value = 1
            try:
                version_int = int(version_value)
            except (TypeError, ValueError):
                version_int = 1

            template = StoryTemplate(
                slug=slug,
                name=payload.get("name") or slug,
                description=payload.get("description"),
                age=age_value,
                version=version_int,
                workflow_slug=payload.get("workflow_slug") or "base",
                is_active=bool(payload.get("is_active", True)),
                free_trial_slug=payload.get("free_trial_slug"),
                price_dollars=_to_decimal(payload.get("price_dollars")) or Decimal("1.50"),
                discount_price=_to_decimal(payload.get("discount_price")),
            )
            session.add(template)
            session.flush()

            pages: list[Dict[str, Any]] = payload.get("pages") or []
            for page in sorted(pages, key=lambda p: p.get("page_number", 0)):
                raw_seed = page.get("seed")
                if raw_seed in ("", None):
                    seed_int = None
                else:
                    try:
                        seed_int = int(raw_seed)
                    except (TypeError, ValueError):
                        seed_int = None
                workflow_value = page.get("workflow")
                if isinstance(workflow_value, str):
                    workflow_value = workflow_value.strip() or None
                elif workflow_value is not None:
                    workflow_value = str(workflow_value).strip() or None

                page_row = StoryTemplatePage(
                    story_template_id=template.id,
                    page_number=page.get("page_number") or 0,
                    story_text=page.get("story_text") or "",
                    image_prompt=page.get("image_prompt") or "",
                    positive_prompt=page.get("positive_prompt") or "",
                    negative_prompt=page.get("negative_prompt") or "",
                    pose_prompt=page.get("pose_prompt") or "",
                    controlnet_image=page.get("controlnet_image"),
                    keypoint_image=page.get("story_image") or page.get("keypoint_image"),
                    description=page.get("description"),
                    workflow_slug=workflow_value,
                    seed=seed_int,
                    cover_text=_cover_text_to_db(page.get("cover_text")),
                )
                session.add(page_row)

        session.commit()
    finally:
        session.close()
