from __future__ import annotations

import os


def ensure_default_stories(session_factory):
    """Optionally clear bundled story templates when explicitly requested via env."""

    reset_flag = os.getenv("RESET_STORY_TEMPLATES", "").strip().lower()
    if reset_flag not in {"1", "true", "yes"}:
        return

    from app.models import StoryTemplate, StoryTemplatePage  # local import to avoid circulars

    session = session_factory()
    try:
        session.query(StoryTemplatePage).delete()
        session.query(StoryTemplate).delete()
        session.commit()
    finally:
        session.close()
