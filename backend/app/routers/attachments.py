"""Attachment upload (two-step send: upload file, then send a message referencing it)."""

from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import Attachment, User
from ..schemas import AttachmentOut
from ..security import get_current_user
from ..services.media import IMAGE_TYPES, save_upload
from ..services.serializers import attachment_out

router = APIRouter(tags=["attachments"])


@router.post("/api/attachments", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
def upload_attachment(
    file: UploadFile = File(...), me: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AttachmentOut:
    rel, size = save_upload(file, "attachments")
    attachment = Attachment(
        key=Path(rel).name,
        uploader_id=me.id,
        file_name=(file.filename or "file")[:255],
        content_type=file.content_type or "application/octet-stream",
        size_bytes=size,
    )
    db.add(attachment)
    db.commit()
    return attachment_out(attachment)  # type: ignore[return-value]


@router.get("/media/attachments/{key}", include_in_schema=False)
def download_attachment(key: str, db: Session = Depends(get_db)) -> FileResponse:
    """Served by unguessable key so <img src> works without auth headers."""
    attachment = db.scalar(select(Attachment).where(Attachment.key == key))
    path = settings.media_dir / "attachments" / key
    if attachment is None or not path.is_file():
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    # Only raster images render inline; everything else (incl. SVG/HTML) is forced to download.
    inline = attachment.content_type in IMAGE_TYPES
    return FileResponse(
        path,
        media_type=attachment.content_type if inline else "application/octet-stream",
        filename=attachment.file_name,
        content_disposition_type="inline" if inline else "attachment",
        headers={
            "Cache-Control": "private, max-age=31536000, immutable",
            "X-Content-Type-Options": "nosniff",
        },
    )
