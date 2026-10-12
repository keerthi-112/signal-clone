"""Attachment upload (two-step send: upload file, then send a message referencing it) and
media downloads (attachments and avatars)."""

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from fastapi.responses import Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Attachment, User
from ..schemas import AttachmentOut
from ..security import get_current_user
from ..services.media import media_response, save_upload
from ..services.serializers import attachment_out

router = APIRouter(tags=["attachments"])


@router.post("/api/attachments", response_model=AttachmentOut, status_code=status.HTTP_201_CREATED)
def upload_attachment(
    file: UploadFile = File(...), me: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> AttachmentOut:
    rel, size = save_upload(db, file, "attachments")
    attachment = Attachment(
        key=rel.removeprefix("attachments/"),
        uploader_id=me.id,
        file_name=(file.filename or "file")[:255],
        content_type=file.content_type or "application/octet-stream",
        size_bytes=size,
    )
    db.add(attachment)
    db.commit()
    return attachment_out(attachment)  # type: ignore[return-value]


@router.get("/media/attachments/{key}", include_in_schema=False)
def download_attachment(key: str, db: Session = Depends(get_db)) -> Response:
    """Served by unguessable key so <img src> works without auth headers."""
    attachment = db.scalar(select(Attachment).where(Attachment.key == key))
    if attachment is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attachment not found")
    return media_response(db, f"attachments/{key}", file_name=attachment.file_name)


@router.get("/media/avatars/{name}", include_in_schema=False)
def download_avatar(name: str, db: Session = Depends(get_db)) -> Response:
    return media_response(db, f"avatars/{name}")
