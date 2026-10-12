from fastapi import APIRouter, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import User
from ..realtime import manager
from ..schemas import MeOut, ProfileUpdateIn, UserOut
from ..security import get_current_user
from ..services.conversations import related_user_ids
from ..services.media import IMAGE_TYPES, delete_media, save_upload
from ..services.serializers import user_out
from .auth import me_out

router = APIRouter(prefix="/api/users", tags=["users"])


def _broadcast_profile(db: Session, user: User) -> None:
    payload = {"type": "user.updated", "data": user_out(user).model_dump(mode="json")}
    manager.emit(related_user_ids(db, user.id) | {user.id}, payload)


@router.get("/me", response_model=MeOut)
def get_me(me: User = Depends(get_current_user)) -> MeOut:
    return me_out(me)


@router.patch("/me", response_model=MeOut)
def update_me(
    data: ProfileUpdateIn, me: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> MeOut:
    changes = data.model_dump(exclude_unset=True)
    if "username" in changes:
        username = changes["username"] or None
        if username and db.scalar(select(User.id).where(User.username == username, User.id != me.id)):
            raise HTTPException(status.HTTP_409_CONFLICT, "This username is already taken")
        changes["username"] = username
    for field, value in changes.items():
        if value is not None or field == "username":
            setattr(me, field, value)
    db.add(me)
    db.commit()
    _broadcast_profile(db, me)
    return me_out(me)


@router.post("/me/avatar", response_model=MeOut)
def upload_avatar(
    file: UploadFile = File(...), me: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> MeOut:
    rel, _ = save_upload(file, "avatars", allowed_types=IMAGE_TYPES, max_mb=5)
    old = me.avatar_path
    me.avatar_path = rel
    db.add(me)
    db.commit()
    delete_media(old)
    _broadcast_profile(db, me)
    return me_out(me)


@router.delete("/me/avatar", response_model=MeOut)
def remove_avatar(me: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeOut:
    old = me.avatar_path
    me.avatar_path = None
    db.add(me)
    db.commit()
    delete_media(old)
    _broadcast_profile(db, me)
    return me_out(me)


@router.get("/{user_id}", response_model=UserOut)
def get_user(user_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)) -> UserOut:
    user = db.get(User, user_id)
    if user is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    return user_out(user)
