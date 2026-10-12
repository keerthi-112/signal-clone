"""ORM -> API model conversion. Kept in one place so every endpoint and WebSocket
event emits exactly the same shapes."""

from ..models import Attachment, ConversationMember, Message, User
from ..realtime import manager
from ..schemas import (
    AttachmentOut,
    MemberOut,
    MessageOut,
    MessageStatus,
    QuoteOut,
    ReactionOut,
    UserOut,
)


def media_url(path: str | None) -> str | None:
    return f"/media/{path}" if path else None


def user_out(user: User) -> UserOut:
    return UserOut(
        id=user.id,
        phone=user.phone,
        username=user.username,
        display_name=user.display_name,
        about=user.about,
        avatar_url=media_url(user.avatar_path),
        avatar_color=user.avatar_color,
        last_seen_at=user.last_seen_at,
        is_online=manager.is_online(user.id),
    )


def attachment_out(att: Attachment | None) -> AttachmentOut | None:
    if att is None:
        return None
    return AttachmentOut(
        id=att.id,
        url=f"/media/attachments/{att.key}",
        file_name=att.file_name,
        content_type=att.content_type,
        size_bytes=att.size_bytes,
    )


def message_status(message: Message) -> MessageStatus:
    """Aggregate per-recipient receipts into the sender's tick state.

    read      -> every recipient has read it
    delivered -> every recipient's device has received it
    sent      -> stored on the server, not yet on every recipient's device
    """
    receipts = message.receipts
    if receipts and all(r.read_at for r in receipts):
        return "read"
    if receipts and all(r.delivered_at for r in receipts):
        return "delivered"
    return "sent"


def message_out(message: Message, viewer_id: int) -> MessageOut:
    quote = None
    if message.reply_to is not None:
        quote = QuoteOut(
            id=message.reply_to.id,
            sender_id=message.reply_to.sender_id,
            body=message.reply_to.body,
            attachment=attachment_out(message.reply_to.attachment),
        )
    is_own = message.sender_id == viewer_id and message.kind == "text"
    return MessageOut(
        id=message.id,
        conversation_id=message.conversation_id,
        sender_id=message.sender_id,
        kind=message.kind,  # type: ignore[arg-type]
        client_id=message.client_id if is_own else None,
        body=message.body,
        meta=message.meta,
        created_at=message.created_at,
        expires_at=message.expires_at,
        reply_to=quote,
        attachment=attachment_out(message.attachment),
        reactions=[ReactionOut(user_id=r.user_id, emoji=r.emoji) for r in message.reactions],
        status=message_status(message) if is_own else None,
    )


def member_out(member: ConversationMember) -> MemberOut:
    return MemberOut(user=user_out(member.user), role=member.role, joined_at=member.joined_at)  # type: ignore[arg-type]
