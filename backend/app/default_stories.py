from __future__ import annotations

import os
from decimal import Decimal
from typing import Any, Dict

from app.fixtures import load_story_fixtures


def _to_decimal(value: Any) -> Decimal | None:
    if value is None or value == "":
        return None
    return Decimal(str(value))


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
                page_row = StoryTemplatePage(
                    story_template_id=template.id,
                    page_number=page.get("page_number") or 0,
                    story_text=page.get("story_text") or "",
                    image_prompt=page.get("image_prompt") or "",
                    positive_prompt=page.get("positive_prompt") or "",
                    negative_prompt=page.get("negative_prompt") or "",
                    pose_prompt=page.get("pose_prompt") or "",
                    controlnet_image=page.get("controlnet_image"),
                    keypoint_image=page.get("keypoint_image"),
                )
                session.add(page_row)

        session.commit()
    finally:
        session.close()
