import os, shutil
from datetime import datetime, timezone, timedelta


MEDIA_ROOT = os.getenv("MEDIA_ROOT", "/data/media")
KEEP_DAYS = int(os.getenv("KEEP_DAYS", "3"))


os.makedirs(MEDIA_ROOT, exist_ok=True)


def save_upload(file_obj, subdir="inputs", filename=None) -> str:
    d = os.path.join(MEDIA_ROOT, subdir)
    os.makedirs(d, exist_ok=True)
    if filename:
        name = filename
    else:
        name = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
    path = os.path.join(d, name)
    with open(path, "wb") as f:
        shutil.copyfileobj(file_obj, f)
    return path

def purge_older_than(days: int = KEEP_DAYS) -> int:
    cutoff = datetime.now(timezone.utc).timestamp() - days * 24 * 3600
    removed = 0
    for root, _, files in os.walk(MEDIA_ROOT):
        for fn in files:
            p = os.path.join(root, fn)
            try:
                if os.path.getmtime(p) < cutoff:
                    os.remove(p); removed += 1
            except FileNotFoundError:
                pass
    return removed