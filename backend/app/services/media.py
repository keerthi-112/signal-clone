"""Upload storage on the local filesystem under settings.media_dir."""

import mimetypes
import secrets
from pathlib import Path

from fastapi import HTTPException, UploadFile, status

from ..config import settings

IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
_CHUNK = 1024 * 1024


def save_upload(
    file: UploadFile, subdir: str, *, allowed_types: set[str] | None = None, max_mb: int | None = None
) -> tuple[str, int]:
    """Stream an upload to disk under a random name. Returns (path relative to media dir, size)."""
    content_type = file.content_type or "application/octet-stream"
    if allowed_types is not None and content_type not in allowed_types:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Unsupported file type")

    limit = (max_mb or settings.max_upload_mb) * 1024 * 1024
    ext = Path(file.filename or "").suffix.lower()[:10] or (mimetypes.guess_extension(content_type) or "")
    rel = f"{subdir}/{secrets.token_urlsafe(16)}{ext}"
    target = settings.media_dir / rel
    target.parent.mkdir(parents=True, exist_ok=True)

    size = 0
    try:
        with target.open("wb") as out:
            while chunk := file.file.read(_CHUNK):
                size += len(chunk)
                if size > limit:
                    raise HTTPException(
                        status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                        f"Files must be smaller than {limit // (1024 * 1024)} MB",
                    )
                out.write(chunk)
    except BaseException:
        target.unlink(missing_ok=True)
        raise
    if size == 0:
        target.unlink(missing_ok=True)
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "File is empty")
    return rel, size


def delete_media(rel: str | None) -> None:
    if rel:
        (settings.media_dir / rel).unlink(missing_ok=True)
