"""Message domain logic: sending, receipts (delivered/read), reactions and expiry."""

from collections import defaultdict
from collections.abc import Iterable, Sequence
from datetime import timedelta

from fastapi import HTTPException, status
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from ..database import utcnow
from ..models import Attachment, ConversationMember, Message, MessageReceipt, Reaction
from ..realtime import manager
from ..schemas import ReactionOut, SendMessageIn
from .conversations import member_ids
from .serializers import message_out, message_status


def get_message_for_member(db: Session, message_id: int, user_id: int) -> Message:
    message = db.get(Message, message_id)
    if message is None or db.get(ConversationMember, (message.conversation_id, user_id)) is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Message not found")
    return message


def send_message(db: Session, member: ConversationMember, data: SendMessageIn) -> tuple[Message, bool]:
    """Persist a message. Idempotent on (sender, client_id): a client retrying after a
    dropped response gets the original message back instead of a duplicate."""
    sender_id = member.user_id
    conversation = member.conversation

    existing = _by_client_id(db, sender_id, data.client_id)
    if existing is not None:
        if existing.conversation_id != conversation.id:
            raise HTTPException(status.HTTP_409_CONFLICT, "client_id already used")
        return existing, False

    body = data.body.strip()
    if not body and data.attachment_id is None:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Message is empty")

    if data.reply_to_id is not None:
        quoted = db.get(Message, data.reply_to_id)
        if quoted is None or quoted.conversation_id != conversation.id or quoted.kind != "text":
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Quoted message not found")

    if data.attachment_id is not None:
        attachment = db.get(Attachment, data.attachment_id)
        if attachment is None or attachment.uploader_id != sender_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Attachment not found")

    now = utcnow()
    message = Message(
        conversation_id=conversation.id,
        sender_id=sender_id,
        kind="text",
        client_id=data.client_id,
        body=body,
        reply_to_id=data.reply_to_id,
        attachment_id=data.attachment_id,
        created_at=now,
        expires_at=(
            now + timedelta(seconds=conversation.disappearing_seconds)
            if conversation.disappearing_seconds
            else None
        ),
    )
    message.receipts = [
        MessageReceipt(user_id=uid) for uid in member_ids(conversation) if uid != sender_id
    ]
    conversation.last_activity_at = now
    db.add(message)
    try:
        db.flush()
        # Sending implies you've read everything before it.
        member.last_read_message_id = max(member.last_read_message_id, message.id)
        db.commit()
    except IntegrityError:
        # Lost a race with a concurrent retry of the same client_id.
        db.rollback()
        existing = _by_client_id(db, sender_id, data.client_id)
        if existing is None:
            raise
        return existing, False
    db.refresh(message)
    return message, True


def _by_client_id(db: Session, sender_id: int, client_id: str) -> Message | None:
    return db.scalar(
        select(Message).where(Message.sender_id == sender_id, Message.client_id == client_id)
    )


def emit_message_created(message: Message, recipients: Iterable[int]) -> None:
    """Each viewer gets their own projection (only the sender sees tick status)."""
    for uid in set(recipients):
        manager.emit(
            [uid],
            {"type": "message.created", "data": message_out(message, uid).model_dump(mode="json")},
        )


def mark_delivered(db: Session, user_id: int, message_ids: Sequence[int] | None = None) -> list[int]:
    """Mark the user's pending receipts as delivered. `None` means all pending ones
    (used when a device connects and syncs). Returns affected message ids."""
    query = select(MessageReceipt).where(
        MessageReceipt.user_id == user_id, MessageReceipt.delivered_at.is_(None)
    )
    if message_ids is not None:
        if not message_ids:
            return []
        query = query.where(MessageReceipt.message_id.in_(message_ids))
    receipts = list(db.scalars(query))
    now = utcnow()
    for receipt in receipts:
        receipt.delivered_at = now
    db.commit()
    return [r.message_id for r in receipts]


def mark_read(db: Session, member: ConversationMember, up_to_id: int | None = None) -> list[int]:
    """Advance the read watermark and stamp read receipts. Returns affected message ids."""
    if up_to_id is None:
        up_to_id = db.scalar(
            select(Message.id)
            .where(Message.conversation_id == member.conversation_id)
            .order_by(Message.id.desc())
            .limit(1)
        ) or 0
    member.last_read_message_id = max(member.last_read_message_id, up_to_id)

    receipts = list(
        db.scalars(
            select(MessageReceipt)
            .join(Message, Message.id == MessageReceipt.message_id)
            .where(
                Message.conversation_id == member.conversation_id,
                Message.id <= up_to_id,
                MessageReceipt.user_id == member.user_id,
                MessageReceipt.read_at.is_(None),
            )
        )
    )
    now = utcnow()
    for receipt in receipts:
        receipt.delivered_at = receipt.delivered_at or now
        receipt.read_at = now
    db.commit()
    return [r.message_id for r in receipts]


def emit_status_updates(db: Session, message_ids: Sequence[int]) -> None:
    """Tell each sender the new aggregate tick state of their affected messages."""
    if not message_ids:
        return
    messages = db.scalars(
        select(Message)
        .where(Message.id.in_(set(message_ids)))
        .execution_options(populate_existing=True)
    )
    by_sender: dict[int, list[dict]] = defaultdict(list)
    for m in messages:
        if m.sender_id is not None:
            by_sender[m.sender_id].append(
                {"message_id": m.id, "conversation_id": m.conversation_id, "status": message_status(m)}
            )
    for sender_id, updates in by_sender.items():
        manager.emit([sender_id], {"type": "message.status", "data": {"updates": updates}})


def set_reaction(db: Session, message: Message, user_id: int, emoji: str | None) -> list[ReactionOut]:
    """Add, replace or (emoji=None) remove the user's single reaction on a message."""
    if message.kind != "text":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Can't react to this message")
    existing = db.get(Reaction, (message.id, user_id))
    if emoji is None:
        if existing:
            db.delete(existing)
    elif existing:
        existing.emoji = emoji
        existing.created_at = utcnow()
    else:
        db.add(Reaction(message_id=message.id, user_id=user_id, emoji=emoji))
    db.commit()
    db.refresh(message)
    return [ReactionOut(user_id=r.user_id, emoji=r.emoji) for r in message.reactions]


def purge_expired(db: Session) -> list[tuple[int, int, list[int]]]:
    """Delete disappearing messages past their expiry.
    Returns (conversation_id, message_id, member_ids) for each deletion."""
    expired = list(
        db.scalars(select(Message).where(Message.expires_at.is_not(None), Message.expires_at <= utcnow()))
    )
    if not expired:
        return []
    conv_ids = {m.conversation_id for m in expired}
    members: dict[int, list[int]] = defaultdict(list)
    for cid, uid in db.execute(
        select(ConversationMember.conversation_id, ConversationMember.user_id).where(
            ConversationMember.conversation_id.in_(conv_ids)
        )
    ):
        members[cid].append(uid)
    result = [(m.conversation_id, m.id, members[m.conversation_id]) for m in expired]
    for m in expired:
        db.delete(m)
    db.commit()
    return result
