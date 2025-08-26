import os, shutil
from datetime import datetime, timezone, timedelta


MEDIA_ROOT = os.getenv("MEDIA_ROOT", "/data/media")
KEEP_DAYS = int(os.getenv("KEEP_DAYS", "3"))


os.makedirs(MEDIA_ROOT, exist_ok=True)


def save_upload(file_obj, subdir="inputs") -> str:
d = os.path.join(MEDIA_ROOT, subdir)
os.makedirs(d, exist_ok=True)
name = datetime.now(timezone.utc).strftime("%Y%m%d-%H%M%S-%f")
path = os.path.join(d, name)
with open(path, "wb") as f:
shutil.copyfileobj(file_obj, f)
return path


def purge_older_than(days: int = KEEP_DAYS) -> int:
cutoff =