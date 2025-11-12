from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from .models import User, UserAttestation, AuditLogEntry


def _get_header(request: Request, name: str) -> Optional[str]:
    try:
        return request.headers.get(name)
    except Exception:
        return None


def extract_client_signals(request: Request) -> Dict[str, Any]:
    return {
        "install_id": _get_header(request, "X-Install-Id"),
        "device_platform": (_get_header(request, "X-Device-Platform") or "").lower() or None,
        "app_package": _get_header(request, "X-App-Package"),
        "play_integrity": _get_header(request, "X-Play-Integrity"),
        "user_agent": _get_header(request, "user-agent"),
        "ip": getattr(request.client, "host", None) if request and request.client else None,
        "path": str(getattr(request, "url", "")),
    }


def _integrity_policy() -> str:
    # Values: off|warn|require; default off for local/dev
    raw = (os.getenv("ANDROID_INTEGRITY_POLICY") or "").strip().lower()
    if raw in {"off", "warn", "require"}:
        return raw
    # fallback based on environment
    env = (os.getenv("SENTRY_ENV") or os.getenv("ENV") or "local").strip().lower()
    return "off" if env in {"local", "development", "dev"} else "warn"


def enforce_android_integrity_or_warn(request: Request, *, action: str) -> None:
    signals = extract_client_signals(request)
    policy = _integrity_policy()
    if signals.get("device_platform") == "android" and action in {
        "auth_google",
        "book_create",
        "free_trial_setup",
        "free_trial_complete",
    }:
        has_token = bool(signals.get("play_integrity"))
        if policy == "require" and not has_token:
            raise HTTPException(status_code=400, detail="Play Integrity token required on Android")
        # If warn, we just record an audit row; caller may also log


def record_user_attestation(db: Session, user: User, signals: Dict[str, Any]) -> None:
    try:
        ua = (
            db.query(UserAttestation)
            .filter(UserAttestation.user_id == user.id)
            .order_by(UserAttestation.updated_at.desc())
            .first()
        )
        if ua is None:
            ua = UserAttestation(user_id=user.id)
            db.add(ua)
        ua.device_platform = signals.get("device_platform") or ua.device_platform
        ua.install_id = signals.get("install_id") or ua.install_id
        ua.app_package = signals.get("app_package") or ua.app_package
        if signals.get("play_integrity"):
            ua.last_play_integrity_at = datetime.now(timezone.utc)
        # Keep a small snapshot of last headers/signals for debugging
        ua.last_seen_headers = {
            "device_platform": signals.get("device_platform"),
            "install_id": signals.get("install_id"),
            "app_package": signals.get("app_package"),
            "has_play_integrity": bool(signals.get("play_integrity")),
        }
        db.commit()
    except Exception:
        db.rollback()
        # best-effort; do not block main flow


def write_audit_log(
    db: Session,
    *,
    user: Optional[User],
    request: Request,
    action: str,
    status: Optional[int] = None,
    meta: Optional[Dict[str, Any]] = None,
) -> None:
    try:
        signals = extract_client_signals(request)
        entry = AuditLogEntry(
            user_id=getattr(user, "id", None),
            route=str(getattr(request, "url", "")),
            method=str(getattr(request, "method", "")).upper(),
            device_platform=signals.get("device_platform"),
            install_id=signals.get("install_id"),
            app_package=signals.get("app_package"),
            ip=signals.get("ip"),
            status=status,
            meta={"action": action, **(meta or {})},
        )
        db.add(entry)
        db.commit()
    except Exception:
        db.rollback()
        # best-effort; don't crash on audit

