from __future__ import annotations

from decimal import Decimal
from typing import Any

from app.fixtures import load_user_fixtures


def _to_decimal(value: Any) -> Decimal:
    if value is None or value == "":
        return Decimal("0")
    return Decimal(str(value))


def ensure_default_users(session_factory):
    from app.models import User  # local import to avoid circulars

    fixture_records = load_user_fixtures()
    if not fixture_records:
        return

    session = session_factory()
    try:
        for path, payload in fixture_records:
            email = (payload.get("email") or "").strip().lower()
            if not email:
                continue

            existing = session.query(User).filter(User.email == email).first()
            if existing:
                continue

            user = User(
                email=email,
                password_hash=payload.get("password_hash") or "",
                role=payload.get("role") or "user",
                credits=_to_decimal(payload.get("credits")),
                free_trials_used=payload.get("free_trials_used") or [],
            )
            session.add(user)
        session.commit()
    finally:
        session.close()
