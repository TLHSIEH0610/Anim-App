import gzip
import os
import re
import shutil
import subprocess
import tempfile
import threading
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlparse

import boto3

from .storage import MEDIA_ROOT


def _str_to_bool(value: Optional[str]) -> bool:
    if value is None:
        return False
    return str(value).strip().lower() in {"1", "true", "yes", "on"}


def _get_s3_client():
    region = os.getenv("AWS_REGION") or os.getenv("AWS_DEFAULT_REGION")
    session_kwargs = {}
    if region:
        session_kwargs["region_name"] = region
    return boto3.client("s3", **session_kwargs)


def _parse_database_url() -> Tuple[str, int, str, str, Optional[str]]:
    url = os.getenv("DATABASE_URL")
    if not url:
        raise RuntimeError("DATABASE_URL is not configured; cannot perform backup.")
    parsed = urlparse(url)
    if parsed.scheme not in {"postgresql", "postgres"}:
        raise RuntimeError("Only PostgreSQL URLs are supported for automated backups.")
    host = parsed.hostname or "localhost"
    port = parsed.port or 5432
    user = parsed.username or ""
    password = parsed.password
    database = (parsed.path or "").lstrip("/")
    if not database:
        raise RuntimeError("DATABASE_URL must include a database name.")
    return host, port, user, database, password


def _build_backup_prefixes() -> Tuple[str, str]:
    bucket = os.getenv("BACKUP_S3_BUCKET")
    if not bucket:
        raise RuntimeError("BACKUP_S3_BUCKET must be set to use backup features.")
    db_prefix = os.getenv("BACKUP_DB_PREFIX", "db").rstrip("/")
    media_prefix = os.getenv("BACKUP_MEDIA_PREFIX", "media").rstrip("/")
    return db_prefix, media_prefix


def perform_backup() -> Dict[str, str]:
    """Create a database dump and media archive and upload both to S3."""
    bucket = os.getenv("BACKUP_S3_BUCKET")
    if not bucket:
        raise RuntimeError("BACKUP_S3_BUCKET is not configured.")

    s3 = _get_s3_client()
    db_prefix, media_prefix = _build_backup_prefixes()

    timestamp = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    db_key = f"{db_prefix}/kid-to-story_{timestamp}.sql.gz"
    media_key = f"{media_prefix}/kid-to-story_media_{timestamp}.tar.gz"

    host, port, user, database, password = _parse_database_url()

    tmp_dir = tempfile.mkdtemp(prefix="kid_to_story_backup_")
    db_dump_path = os.path.join(tmp_dir, f"kid-to-story_{timestamp}.sql")
    db_dump_gz = db_dump_path + ".gz"

    env = os.environ.copy()
    if password:
        env["PGPASSWORD"] = password

    dump_args = [
        "pg_dump",
        "-h",
        host,
        "-p",
        str(port),
        "-U",
        user,
        "-d",
        database,
        "--no-owner",
        "--no-privileges",
    ]

    with open(db_dump_path, "wb") as dump_file:
        subprocess.run(dump_args, stdout=dump_file, check=True, env=env)

    with open(db_dump_path, "rb") as src, gzip.open(db_dump_gz, "wb") as dst:
        shutil.copyfileobj(src, dst)

    s3.upload_file(db_dump_gz, bucket, db_key)

    media_archive_base = os.path.join(tmp_dir, f"kid-to-story_media_{timestamp}")
    media_archive_path = shutil.make_archive(media_archive_base, "gztar", MEDIA_ROOT)
    s3.upload_file(media_archive_path, bucket, media_key)

    shutil.rmtree(tmp_dir, ignore_errors=True)

    return {
        "timestamp": timestamp,
        "db_key": db_key,
        "media_key": media_key,
    }


def list_backups() -> List[Dict[str, str]]:
    bucket = os.getenv("BACKUP_S3_BUCKET")
    if not bucket:
        raise RuntimeError("BACKUP_S3_BUCKET is not configured.")

    s3 = _get_s3_client()
    db_prefix, media_prefix = _build_backup_prefixes()

    def _collect(prefix: str) -> Dict[str, Dict[str, str]]:
        paginator = s3.get_paginator("list_objects_v2")
        results: Dict[str, Dict[str, str]] = {}
        for page in paginator.paginate(Bucket=bucket, Prefix=f"{prefix}/"):
            for obj in page.get("Contents", []):
                key = obj["Key"]
                basename = os.path.basename(key)
                match = re.search(r"(\d{8}_\d{6})", basename)
                if not match:
                    continue
                timestamp = match.group(1)
                results.setdefault(timestamp, {})
                results[timestamp].update(
                    {
                        "key": key,
                        "size": str(obj.get("Size", 0)),
                        "last_modified": obj.get("LastModified").isoformat()
                        if obj.get("LastModified")
                        else "",
                    }
                )
        return results

    db_objects = _collect(db_prefix)
    media_objects = _collect(media_prefix)

    merged: Dict[str, Dict[str, str]] = {}
    for ts, info in db_objects.items():
        merged.setdefault(ts, {}).update({"db": info})
    for ts, info in media_objects.items():
        merged.setdefault(ts, {}).update({"media": info})

    entries: List[Dict[str, str]] = []
    for ts, data in merged.items():
        entries.append(
            {
                "timestamp": ts,
                "db_key": data.get("db", {}).get("key"),
                "media_key": data.get("media", {}).get("key"),
                "db_size": data.get("db", {}).get("size"),
                "media_size": data.get("media", {}).get("size"),
                "last_modified": data.get("db", {}).get("last_modified")
                or data.get("media", {}).get("last_modified"),
            }
        )

    return sorted(entries, key=lambda item: item["timestamp"], reverse=True)


def restore_backup(timestamp: str) -> None:
    bucket = os.getenv("BACKUP_S3_BUCKET")
    if not bucket:
        raise RuntimeError("BACKUP_S3_BUCKET is not configured.")

    s3 = _get_s3_client()
    db_prefix, media_prefix = _build_backup_prefixes()

    db_key = f"{db_prefix}/kid-to-story_{timestamp}.sql.gz"
    media_key = f"{media_prefix}/kid-to-story_media_{timestamp}.tar.gz"

    tmp_dir = tempfile.mkdtemp(prefix="kid_to_story_restore_")
    db_gz_path = os.path.join(tmp_dir, os.path.basename(db_key))
    media_archive_path = os.path.join(tmp_dir, os.path.basename(media_key))

    s3.download_file(bucket, db_key, db_gz_path)
    s3.download_file(bucket, media_key, media_archive_path)

    db_sql_path = db_gz_path.rstrip(".gz")
    with gzip.open(db_gz_path, "rb") as src, open(db_sql_path, "wb") as dst:
        shutil.copyfileobj(src, dst)

    host, port, user, database, password = _parse_database_url()
    env = os.environ.copy()
    if password:
        env["PGPASSWORD"] = password

    drop_args = [
        "psql",
        "-h",
        host,
        "-p",
        str(port),
        "-U",
        user,
        "-d",
        database,
        "-c",
        "DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    ]
    subprocess.run(drop_args, check=True, env=env)

    restore_args = [
        "psql",
        "-h",
        host,
        "-p",
        str(port),
        "-U",
        user,
        "-d",
        database,
        "-f",
        db_sql_path,
    ]
    subprocess.run(restore_args, check=True, env=env)

    if os.path.exists(MEDIA_ROOT):
        backup_existing = f"{MEDIA_ROOT}_pre_restore_{timestamp}"
        candidate = backup_existing
        suffix = 1
        while os.path.exists(candidate):
            candidate = f"{backup_existing}_{suffix}"
            suffix += 1
        try:
            # Prefer an atomic move of the entire directory when possible
            shutil.move(MEDIA_ROOT, candidate)
        except OSError as exc:
            # When MEDIA_ROOT is a mount point or busy, moving the root may fail (e.g., Errno 16)
            # Fallback: create a sibling backup and move the contents instead
            os.makedirs(candidate, exist_ok=True)
            for name in os.listdir(MEDIA_ROOT):
                src = os.path.join(MEDIA_ROOT, name)
                dst = os.path.join(candidate, name)
                try:
                    shutil.move(src, dst)
                except Exception:
                    # Best-effort; skip files that cannot be moved
                    pass
    os.makedirs(MEDIA_ROOT, exist_ok=True)
    # Unpack into MEDIA_ROOT; archive contains the media directory contents
    shutil.unpack_archive(media_archive_path, MEDIA_ROOT)

    shutil.rmtree(tmp_dir, ignore_errors=True)


def maybe_schedule_automatic_backups():
    if not _str_to_bool(os.getenv("BACKUP_AUTO_ENABLED", "false")):
        return
    if not os.getenv("BACKUP_S3_BUCKET"):
        print("[Backups] BACKUP_AUTO_ENABLED is true but BACKUP_S3_BUCKET is not set; skipping auto backup scheduler.")
        return

    interval_hours = float(os.getenv("BACKUP_AUTO_INTERVAL_HOURS", "24"))
    interval_seconds = max(3600, int(interval_hours * 3600))

    def _runner():
        while True:
            try:
                perform_backup()
            except Exception as exc:
                print(f"[Backups] Automatic backup failed: {exc}")
            time.sleep(interval_seconds)

    thread = threading.Thread(target=_runner, daemon=True)
    thread.start()
