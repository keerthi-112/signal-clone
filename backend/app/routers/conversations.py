"""Conversations (direct + group), membership administration and read state."""

from fastapi import APIRouter, Body, Depends, File, HTTPException, UploadFile, status
from sqlalchemy import delete, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import ConversationMember, Message, MessageReceipt, User
from ..realtime import manager
from ..schemas import (
    AddMembersIn,
    ConversationOut,
    CreateDirectIn,
    CreateGroupIn,
    UpdateConversationIn,
    UpdateMemberIn,
)
from ..security import get_current_user
from ..services import conversations as svc
from ..services.media import IMAGE_TYPES, delete_media, save_upload
from ..services.messages import emit_message_created, emit_status_updates, mark_read

router = APIRouter(prefix="/api/conversations", tags=["conversations"])


def _publish_system(db: Session, conversation, message) -> None:
    db.commit()
    db.refresh(message)
    emit_message_created(message, svc.member_ids(conversation))


@router.get("", response_model=list[ConversationOut])
def list_conversations(me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return svc.list_for_user(db, me.id)


@router.post("/direct", response_model=ConversationOut)
def open_direct(data: CreateDirectIn, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Get or create the 1:1 chat with a user. The other side learns about it when the
    first message arrives (their client fetches unknown conversations on demand)."""
    other = db.get(User, data.user_id)
    if other is None or not other.is_profile_complete:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "User not found")
    conversation, _ = svc.get_or_create_direct(db, me, other)
    db.commit()
    return svc.conversation_out(db, conversation, me.id)


@router.post("/group", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
def create_group(data: CreateGroupIn, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    conversation = svc.create_group(
        db, me, data.title, data.member_ids, data.description, data.avatar_color
    )
    db.commit()
    db.refresh(conversation)
    svc.emit_conversation(db, conversation, "conversation.created")
    return svc.conversation_out(db, conversation, me.id)


@router.get("/{conversation_id}", response_model=ConversationOut)
def get_conversation(conversation_id: int, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    member = svc.get_membership(db, conversation_id, me.id)
    return svc.conversation_out(db, member.conversation, me.id)


@router.patch("/{conversation_id}", response_model=ConversationOut)
def update_conversation(
    conversation_id: int,
    data: UpdateConversationIn,
    me: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = svc.get_membership(db, conversation_id, me.id)
    conversation = member.conversation
    is_group = conversation.kind == "group"
    notices = []

    if (data.title is not None or data.description is not None) and not is_group:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only groups have a name and description")
    if is_group and any(v is not None for v in data.model_dump().values()):
        svc.require_admin(member)

    if data.title is not None and data.title != conversation.title:
        conversation.title = data.title
        notices.append(svc.add_system_message(db, conversation, "title_changed", me.id, title=data.title))
    if data.description is not None:
        conversation.description = data.description
    if data.disappearing_seconds is not None and data.disappearing_seconds != conversation.disappearing_seconds:
        conversation.disappearing_seconds = data.disappearing_seconds
        notices.append(
            svc.add_system_message(
                db, conversation, "timer_changed", me.id, seconds=data.disappearing_seconds
            )
        )

    db.commit()
    for notice in notices:
        db.refresh(notice)
        emit_message_created(notice, svc.member_ids(conversation))
    svc.emit_conversation(db, conversation)
    return svc.conversation_out(db, conversation, me.id)


@router.post("/{conversation_id}/avatar", response_model=ConversationOut)
def upload_group_avatar(
    conversation_id: int,
    file: UploadFile = File(...),
    me: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = svc.get_membership(db, conversation_id, me.id)
    svc.require_admin(member)
    rel, _ = save_upload(db, file, "avatars", allowed_types=IMAGE_TYPES, max_mb=5)
    conversation = member.conversation
    delete_media(db, conversation.avatar_path)
    conversation.avatar_path = rel
    db.commit()
    svc.emit_conversation(db, conversation)
    return svc.conversation_out(db, conversation, me.id)


@router.post("/{conversation_id}/members", response_model=ConversationOut)
def add_members(
    conversation_id: int,
    data: AddMembersIn,
    me: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = svc.get_membership(db, conversation_id, me.id)
    svc.require_admin(member)
    conversation = member.conversation
    current = set(svc.member_ids(conversation))
    new_ids = [uid for uid in dict.fromkeys(data.user_ids) if uid not in current]
    if not new_ids:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Those people are already in the group")
    svc.load_users(db, new_ids)

    for uid in new_ids:
        conversation.members.append(ConversationMember(user_id=uid, role="member"))
    notice = svc.add_system_message(db, conversation, "members_added", me.id, user_ids=new_ids)
    db.commit()
    db.refresh(conversation)
    _publish_system(db, conversation, notice)
    for uid in new_ids:
        data_out = svc.conversation_out(db, conversation, uid).model_dump(mode="json")
        manager.emit([uid], {"type": "conversation.created", "data": data_out})
    for uid in current:
        data_out = svc.conversation_out(db, conversation, uid).model_dump(mode="json")
        manager.emit([uid], {"type": "conversation.updated", "data": data_out})
    return svc.conversation_out(db, conversation, me.id)


@router.delete("/{conversation_id}/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_member(
    conversation_id: int, user_id: int, me: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> None:
    """Admins remove others; anyone can remove themselves (leave the group)."""
    member = svc.get_membership(db, conversation_id, me.id)
    conversation = member.conversation
    if conversation.kind != "group":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't leave a direct chat")
    leaving = user_id == me.id
    if not leaving:
        svc.require_admin(member)
    target = next((m for m in conversation.members if m.user_id == user_id), None)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not a member of this group")

    conversation.members.remove(target)
    # Drop their outstanding receipts so senders' ticks aren't stuck waiting on them.
    db.execute(
        delete(MessageReceipt).where(
            MessageReceipt.user_id == user_id,
            MessageReceipt.read_at.is_(None),
            MessageReceipt.message_id.in_(
                select(Message.id).where(Message.conversation_id == conversation_id)
            ),
        )
    )
    db.flush()

    if not conversation.members:
        db.delete(conversation)
        db.commit()
        manager.emit([user_id], {"type": "conversation.removed", "data": {"conversation_id": conversation_id}})
        return

    # A group must always keep an admin: promote the longest-standing member.
    if not any(m.role == "admin" for m in conversation.members):
        min(conversation.members, key=lambda m: m.joined_at).role = "admin"

    event = "member_left" if leaving else "member_removed"
    notice = svc.add_system_message(db, conversation, event, me.id, user_ids=[user_id])
    _publish_system(db, conversation, notice)
    manager.emit([user_id], {"type": "conversation.removed", "data": {"conversation_id": conversation_id}})
    svc.emit_conversation(db, conversation)


@router.patch("/{conversation_id}/members/{user_id}", response_model=ConversationOut)
def update_member(
    conversation_id: int,
    user_id: int,
    data: UpdateMemberIn,
    me: User = Depends(get_current_user),
    db: Session = Depends(get_db),
):
    member = svc.get_membership(db, conversation_id, me.id)
    svc.require_admin(member)
    conversation = member.conversation
    target = next((m for m in conversation.members if m.user_id == user_id), None)
    if target is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Not a member of this group")
    if target.role == data.role:
        return svc.conversation_out(db, conversation, me.id)
    if data.role == "member" and sum(m.role == "admin" for m in conversation.members) == 1:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "A group needs at least one admin")

    target.role = data.role
    event = "admin_granted" if data.role == "admin" else "admin_revoked"
    notice = svc.add_system_message(db, conversation, event, me.id, user_ids=[user_id])
    _publish_system(db, conversation, notice)
    svc.emit_conversation(db, conversation)
    return svc.conversation_out(db, conversation, me.id)


@router.post("/{conversation_id}/read", status_code=status.HTTP_204_NO_CONTENT)
def mark_conversation_read(
    conversation_id: int,
    up_to_id: int | None = Body(default=None, embed=True),
    me: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> None:
    member = svc.get_membership(db, conversation_id, me.id)
    changed = mark_read(db, member, up_to_id)
    emit_status_updates(db, changed)
    # Keep the user's other tabs/devices in sync (clears their unread badge).
    manager.emit(
        [me.id],
        {
            "type": "conversation.read",
            "data": {"conversation_id": conversation_id, "last_read_message_id": member.last_read_message_id},
        },
    )
