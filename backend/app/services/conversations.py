"""Conversation domain logic: membership, permissions, list projection, system notices."""

import random
from collections.abc import Sequence
from typing import Any

from fastapi import HTTPException, status
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import utcnow
from ..models import Contact, Conversation, ConversationMember, Message, User
from ..realtime import manager
from ..schemas import AVATAR_COLORS, ConversationOut
from .serializers import media_url, member_out, message_out


def direct_key(a: int, b: int) -> str:
    lo, hi = sorted((a, b))
    return f"{lo}:{hi}"


def get_membership(db: Session, conversation_id: int, user_id: int) -> ConversationMember:
    """Return the caller's membership row, or 404 (we don't reveal chats you aren't in)."""
    member = db.get(ConversationMember, (conversation_id, user_id))
    if member is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Conversation not found")
    return member


def require_admin(member: ConversationMember) -> None:
    if member.conversation.kind != "group":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only groups have admins")
    if member.role != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only group admins can do that")


def member_ids(conversation: Conversation) -> list[int]:
    return [m.user_id for m in conversation.members]


def load_users(db: Session, user_ids: Sequence[int]) -> list[User]:
    ids = set(user_ids)
    users = list(db.scalars(select(User).where(User.id.in_(ids)))) if ids else []
    if len(users) != len(ids):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "One or more users do not exist")
    return users


def add_system_message(
    db: Session, conversation: Conversation, event: str, actor_id: int | None, **meta: Any
) -> Message:
    """System notices ("Alice added Bob") are stored as messages so they appear in the
    timeline in order and persist. Names are rendered client-side relative to the viewer."""
    message = Message(
        conversation_id=conversation.id,
        sender_id=None,
        kind="system",
        meta={"event": event, "actor_id": actor_id, **meta},
    )
    db.add(message)
    conversation.last_activity_at = utcnow()
    return message


def get_or_create_direct(db: Session, me: User, other: User) -> tuple[Conversation, bool]:
    if me.id == other.id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "You can't start a chat with yourself")
    key = direct_key(me.id, other.id)
    existing = db.scalar(select(Conversation).where(Conversation.direct_key == key))
    if existing:
        return existing, False
    conversation = Conversation(kind="direct", direct_key=key)
    conversation.members = [
        ConversationMember(user_id=me.id, role="member"),
        ConversationMember(user_id=other.id, role="member"),
    ]
    db.add(conversation)
    db.flush()
    return conversation, True


def create_group(
    db: Session,
    creator: User,
    title: str,
    member_ids_: Sequence[int],
    description: str = "",
    avatar_color: str | None = None,
) -> Conversation:
    others = [uid for uid in dict.fromkeys(member_ids_) if uid != creator.id]
    load_users(db, others)
    conversation = Conversation(
        kind="group",
        title=title,
        description=description,
        avatar_color=avatar_color or random.choice(AVATAR_COLORS),
        created_by_id=creator.id,
    )
    conversation.members = [ConversationMember(user_id=creator.id, role="admin")] + [
        ConversationMember(user_id=uid, role="member") for uid in others
    ]
    db.add(conversation)
    db.flush()
    add_system_message(db, conversation, "group_created", creator.id, title=title)
    return conversation


def related_user_ids(db: Session, user_id: int) -> set[int]:
    """Everyone who should see this user's presence: chat partners and people who saved them."""
    my_convs = select(ConversationMember.conversation_id).where(ConversationMember.user_id == user_id)
    peers = db.scalars(
        select(ConversationMember.user_id).where(ConversationMember.conversation_id.in_(my_convs))
    )
    savers = db.scalars(select(Contact.owner_id).where(Contact.contact_id == user_id))
    return (set(peers) | set(savers)) - {user_id}


def _unread_counts(db: Session, user_id: int, conversation_ids: Sequence[int]) -> dict[int, int]:
    if not conversation_ids:
        return {}
    rows = db.execute(
        select(Message.conversation_id, func.count(Message.id))
        .join(
            ConversationMember,
            (ConversationMember.conversation_id == Message.conversation_id)
            & (ConversationMember.user_id == user_id),
        )
        .where(
            Message.conversation_id.in_(conversation_ids),
            Message.kind == "text",
            Message.id > ConversationMember.last_read_message_id,
            or_(Message.sender_id.is_(None), Message.sender_id != user_id),
        )
        .group_by(Message.conversation_id)
    )
    return {cid: count for cid, count in rows}


def _last_messages(db: Session, conversation_ids: Sequence[int]) -> dict[int, Message]:
    if not conversation_ids:
        return {}
    latest_ids = (
        select(func.max(Message.id))
        .where(Message.conversation_id.in_(conversation_ids))
        .group_by(Message.conversation_id)
    )
    return {m.conversation_id: m for m in db.scalars(select(Message).where(Message.id.in_(latest_ids)))}


def conversation_out(
    db: Session,
    conversation: Conversation,
    viewer_id: int,
    *,
    unread: dict[int, int] | None = None,
    last: dict[int, Message] | None = None,
) -> ConversationOut:
    if unread is None:
        unread = _unread_counts(db, viewer_id, [conversation.id])
    if last is None:
        last = _last_messages(db, [conversation.id])
    me = next(m for m in conversation.members if m.user_id == viewer_id)
    last_message = last.get(conversation.id)
    return ConversationOut(
        id=conversation.id,
        kind=conversation.kind,  # type: ignore[arg-type]
        title=conversation.title,
        description=conversation.description,
        avatar_url=media_url(conversation.avatar_path),
        avatar_color=conversation.avatar_color,
        created_at=conversation.created_at,
        last_activity_at=conversation.last_activity_at,
        disappearing_seconds=conversation.disappearing_seconds,
        members=[member_out(m) for m in conversation.members],
        my_role=me.role,  # type: ignore[arg-type]
        unread_count=unread.get(conversation.id, 0),
        last_message=message_out(last_message, viewer_id) if last_message else None,
    )


def list_for_user(db: Session, user_id: int) -> list[ConversationOut]:
    conversations = list(
        db.scalars(
            select(Conversation)
            .join(ConversationMember)
            .where(ConversationMember.user_id == user_id)
            .order_by(Conversation.last_activity_at.desc())
        )
    )
    ids = [c.id for c in conversations]
    unread = _unread_counts(db, user_id, ids)
    last = _last_messages(db, ids)
    return [conversation_out(db, c, user_id, unread=unread, last=last) for c in conversations]


def emit_conversation(
    db: Session, conversation: Conversation, event_type: str = "conversation.updated"
) -> None:
    """Push each member their own projection of the conversation (unread counts differ)."""
    for uid in member_ids(conversation):
        data = conversation_out(db, conversation, uid).model_dump(mode="json")
        manager.emit([uid], {"type": event_type, "data": data})
