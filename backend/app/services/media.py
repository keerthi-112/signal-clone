"""Upload storage in the `media_files` table, so uploads persist wherever the database does."""

import mimetypes
import secrets
from pathlib import Path
from urllib.parse import quote

from fastapi import HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import delete
from sqlalchemy.orm import Session

from ..config import settings
from ..models import MediaFile

IMAGE_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
_CHUNK = 1024 * 1024


def save_upload(
    db: Session,
    file: UploadFile,
    subdir: str,
    *,
    allowed_types: set[str] | None = None,
    max_mb: int | None = None,
) -> tuple[str, int]:
    """Read an upload into a new MediaFile under a random name; the caller commits.

    Returns (media path, size).
    """
    content_type = file.content_type or "application/octet-stream"
    if allowed_types is not None and content_type not in allowed_types:
        raise HTTPException(status.HTTP_415_UNSUPPORTED_MEDIA_TYPE, "Unsupported file type")

    limit = (max_mb or settings.max_upload_mb) * 1024 * 1024
    data = bytearray()
    while chunk := file.file.read(_CHUNK):
        data += chunk
        if len(data) > limit:
            raise HTTPException(
                status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
                f"Files must be smaller than {limit // (1024 * 1024)} MB",
            )
    if not data:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "File is empty")

    ext = Path(file.filename or "").suffix.lower()[:10] or (mimetypes.guess_extension(content_type) or "")
    rel = f"{subdir}/{secrets.token_urlsafe(16)}{ext}"
    db.add(MediaFile(path=rel, content_type=content_type, data=bytes(data)))
    return rel, len(data)


def delete_media(db: Session, rel: str | None) -> None:
    """Delete a stored file; the caller commits."""
    if rel:
        db.execute(delete(MediaFile).where(MediaFile.path == rel))


def media_response(db: Session, rel: str, *, file_name: str | None = None) -> Response:
    """Serve a stored file.

    Only raster images render inline; everything else (incl. SVG/HTML) is forced to download.
    """
    media = db.get(MediaFile, rel)
    if media is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "File not found")
    inline = media.content_type in IMAGE_TYPES
    disposition = "inline" if inline else "attachment"
    if file_name:
        disposition += f"; filename*=utf-8''{quote(file_name)}"
    return Response(
        media.data,
        media_type=media.content_type if inline else "application/octet-stream",
        headers={
            "Content-Disposition": disposition,
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
