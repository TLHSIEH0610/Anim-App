import json
import os
import threading
import time
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from typing import Dict, Optional

# Log ComfyUI metrics to newline-delimited JSON for easy ingestion
DEFAULT_LOG_PATH = Path(
    os.getenv("COMFYUI_METRICS_LOG", Path("infra/observability/comfyui_metrics.ndjson"))
)
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
