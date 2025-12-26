import json
import os
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

# Log ComfyUI metrics to newline-delimited JSON for easy ingestion.
#
# Default goes under MEDIA_ROOT so runtime logs don't dirty the source tree.
_default_root = Path(os.getenv("MEDIA_ROOT", "/data/media")).expanduser()
DEFAULT_LOG_PATH = Path(
    os.getenv(
        "COMFYUI_METRICS_LOG",
        str(_default_root / "observability" / "comfyui_metrics.ndjson"),
    )
)
# Rotation/retention controls (all optional)
MAX_BYTES = int(os.getenv("COMFYUI_METRICS_MAX_BYTES", "0"))  # e.g., 20_000_000 (20MB). 0 = disabled
MAX_AGE_DAYS = int(os.getenv("COMFYUI_METRICS_MAX_AGE_DAYS", "0"))  # 7 = purge older than 7 days
MAX_FILES = int(os.getenv("COMFYUI_METRICS_MAX_FILES", "0"))  # e.g., 10 rotated files. 0 = unlimited
DEFAULT_LOG_PATH.parent.mkdir(parents=True, exist_ok=True)

_write_lock = threading.Lock()


def _serialize(record: Dict) -> str:
    try:
        return json.dumps(record, ensure_ascii=True)
    except TypeError:
        sanitized = {k: str(v) for k, v in record.items()}
        return json.dumps(sanitized, ensure_ascii=True)


def _write_record(record: Dict) -> None:
    record.setdefault("timestamp", datetime.now(timezone.utc).isoformat())
    line = _serialize(record)
    with _write_lock:
        _rotate_if_needed()
        _purge_old_logs()
        with DEFAULT_LOG_PATH.open("a", encoding="utf-8") as fh:
            fh.write(line + "\n")


@contextmanager
def record_comfy_stage(stage: str, context: Optional[Dict] = None):
    """
    Context manager for timing ComfyUI operations.

    Usage:
        with record_comfy_stage("comfyui.queue", {"workflow": "base"}) as event:
            ... do work ...
            event["prompt_id"] = prompt_id
    """

    record = {
        "event": stage,
        "status": "ok",
        "context": dict(context or {}),
    }
    start = time.perf_counter()
    try:
        yield record
    except Exception as exc:
        record["status"] = "error"
        record["error"] = str(exc)
        raise
    finally:
        record["duration_ms"] = round((time.perf_counter() - start) * 1000, 2)
        _write_record(record)


def emit_comfy_event(event: str, context: Optional[Dict] = None) -> None:
    """Emit a one-off metric (e.g., for retries or state changes)."""
    payload = {
        "event": event,
        "context": dict(context or {}),
        "status": "ok",
    }
    _write_record(payload)


def log_comfy_poll(prompt_id: str, status: str, attempts: int, extra: Optional[Dict] = None) -> None:
    """Track each polling round so we can inspect queue depth and wait times later."""
    payload = {
        "event": "comfyui.poll",
        "prompt_id": prompt_id,
        "status": status,
        "attempt": attempts,
        "context": dict(extra or {}),
    }
    _write_record(payload)


def _rotate_if_needed() -> None:
    """Rotate the metrics file when it exceeds MAX_BYTES.

    Rotation scheme: rename current file to `comfyui_metrics-<UTC-iso>.ndjson`
    and start a fresh file. If MAX_BYTES is not set (>0), do nothing.
    """
    if MAX_BYTES <= 0:
        return
    path = DEFAULT_LOG_PATH
    try:
        if path.exists() and path.stat().st_size >= MAX_BYTES:
            ts = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S")
            rotated = path.with_name(f"{path.stem}-{ts}{path.suffix}")
            # Best-effort rename; if it fails, ignore
            path.rename(rotated)
    except Exception:
        # Non-fatal; keep logging
        pass


def _purge_old_logs() -> None:
    """Purge rotated logs by age and/or count.

    - If MAX_AGE_DAYS > 0, delete files older than that many days.
    - If MAX_FILES > 0, keep only the newest MAX_FILES rotated files (not the active one).
    """
    dir_ = DEFAULT_LOG_PATH.parent
    stem = DEFAULT_LOG_PATH.stem
    suffix = DEFAULT_LOG_PATH.suffix
    try:
        # Collect rotated files matching stem-*.suffix
        rotated = sorted(
            [p for p in dir_.glob(f"{stem}-*{suffix}") if p.is_file()],
            key=lambda p: p.stat().st_mtime,
            reverse=True,
        )
        now = time.time()
        # Age-based purge
        if MAX_AGE_DAYS > 0:
            cutoff = now - (MAX_AGE_DAYS * 24 * 3600)
            for p in list(rotated):
                try:
                    if p.stat().st_mtime < cutoff:
                        p.unlink(missing_ok=True)
                        rotated.remove(p)
                except Exception:
                    pass
        # Count-based purge
        if MAX_FILES > 0 and len(rotated) > MAX_FILES:
            for p in rotated[MAX_FILES:]:
                try:
                    p.unlink(missing_ok=True)
                except Exception:
                    pass
    except Exception:
        # Non-fatal
        pass
