from __future__ import annotations

import os
from datetime import datetime, timezone
from typing import Any, Dict, Optional
import ipaddress

from fastapi import HTTPException, Request
from sqlalchemy.orm import Session

from .models import User, UserAttestation, AuditLogEntry


def _get_header(request: Request, name: str) -> Optional[str]:
    try:
        return request.headers.get(name)
    except Exception:
        return None


def _pick_valid_ip(value: Optional[str]) -> Optional[str]:
    if not value:
        return None
    candidate = value.strip()
    if not candidate:
        return None
    try:
        # Validate and normalise IP (supports IPv4/IPv6)
        ip_obj = ipaddress.ip_address(candidate)
        return ip_obj.compressed
    except Exception:
        return None


def _extract_client_ip(request: Request) -> Optional[str]:
    # 1) Prefer Cloudflare's original client header when present
    cf_ip = _get_header(request, "CF-Connecting-IP") or _get_header(request, "cf-connecting-ip")
    ip = _pick_valid_ip(cf_ip)
    if ip:
        return ip

    # 2) Fall back to first valid entry in X-Forwarded-For (left-most is the original client)
    xff = _get_header(request, "X-Forwarded-For") or _get_header(request, "x-forwarded-for")
    if xff:
        for part in (p.strip() for p in xff.split(",")):
            ip = _pick_valid_ip(part)
            if ip:
                return ip

    # 3) Nginx/other proxies sometimes set X-Real-IP
    xri = _get_header(request, "X-Real-IP") or _get_header(request, "x-real-ip")
    ip = _pick_valid_ip(xri)
    if ip:
        return ip

    # 4) Finally, use the socket peer seen by Starlette (Docker bridge in our setup)
    return getattr(request.client, "host", None) if request and request.client else None


def extract_client_signals(request: Request) -> Dict[str, Any]:
    return {
        "install_id": _get_header(request, "X-Install-Id"),
        "device_platform": (_get_header(request, "X-Device-Platform") or "").lower() or None,
        "app_package": _get_header(request, "X-App-Package"),
        "play_integrity": _get_header(request, "X-Play-Integrity"),
        "user_agent": _get_header(request, "user-agent"),
        "ip": _extract_client_ip(request),
        "path": str(getattr(request, "url", "")),
        # Optional Cloudflare context for forensics
        "cf_ipcountry": _get_header(request, "CF-IPCountry"),
        "cf_ray": _get_header(request, "CF-Ray"),
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
            user_email=getattr(user, "email", None),
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
