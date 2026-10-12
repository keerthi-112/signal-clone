from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Contact, User
from ..schemas import AddContactIn, UserOut
from ..security import get_current_user
from ..services.serializers import user_out

router = APIRouter(prefix="/api/contacts", tags=["contacts"])


@router.get("", response_model=list[UserOut])
def list_contacts(me: User = Depends(get_current_user), db: Session = Depends(get_db)) -> list[UserOut]:
    users = db.scalars(
        select(User)
        .join(Contact, Contact.contact_id == User.id)
        .where(Contact.owner_id == me.id)
        .order_by(func.lower(User.display_name))
    )
    return [user_out(u) for u in users]


@router.post("", response_model=UserOut)
def add_contact(
    data: AddContactIn,
    response: Response,
    me: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserOut:
    """Look a user up by phone number or username and save them. Idempotent."""
    if data.phone:
        target = db.scalar(select(User).where(User.phone == data.phone))
        not_found = f"{data.phone} is not a Signal user"
    elif data.username:
        username = data.username.strip().lstrip("@").lower()
        target = db.scalar(select(User).where(User.username == username))
        not_found = f"Username @{username} not found"
    else:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Provide a phone number or username")

    if target is None or not target.is_profile_complete:
        raise HTTPException(status.HTTP_404_NOT_FOUND, not_found)
    if target.id == me.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't add yourself as a contact")

    exists = db.scalar(select(Contact).where(Contact.owner_id == me.id, Contact.contact_id == target.id))
    if exists is None:
        db.add(Contact(owner_id=me.id, contact_id=target.id))
        db.commit()
        response.status_code = status.HTTP_201_CREATED
    return user_out(target)


@router.delete("/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_contact(user_id: int, me: User = Depends(get_current_user), db: Session = Depends(get_db)) -> None:
    contact = db.scalar(select(Contact).where(Contact.owner_id == me.id, Contact.contact_id == user_id))
    if contact is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Contact not found")
    db.delete(contact)
    db.commit()
