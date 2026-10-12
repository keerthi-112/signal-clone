"""SQLAlchemy ORM models.

Entity overview
---------------
users ─┬─< sessions                  (login sessions, opaque bearer tokens stored hashed)
       ├─< contacts >─ users         (directed "address book" edges)
       ├─< conversation_members >─ conversations
       ├─< messages                  (sender)
       ├─< message_receipts          (per-recipient delivered/read state)
       ├─< reactions
       └─< attachments               (uploader)
conversations ─< messages ─< message_receipts / reactions
"""

from datetime import datetime
from typing import Any

from sqlalchemy import (
    JSON,
    CheckConstraint,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base, utcnow


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(primary_key=True)
    phone: Mapped[str] = mapped_column(String(20), unique=True, index=True)
    username: Mapped[str | None] = mapped_column(String(32), unique=True, index=True)
    display_name: Mapped[str] = mapped_column(String(64), default="")
    about: Mapped[str] = mapped_column(String(140), default="")
    avatar_path: Mapped[str | None] = mapped_column(String(255))
    avatar_color: Mapped[str] = mapped_column(String(8), default="A100")
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    last_seen_at: Mapped[datetime | None] = mapped_column()

    @property
    def is_profile_complete(self) -> bool:
        return bool(self.display_name.strip())


class AuthSession(Base):
    __tablename__ = "sessions"

    id: Mapped[int] = mapped_column(primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True)
    user_agent: Mapped[str] = mapped_column(String(255), default="")
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    expires_at: Mapped[datetime] = mapped_column()

    user: Mapped[User] = relationship()


class Contact(Base):
    __tablename__ = "contacts"
    __table_args__ = (
        UniqueConstraint("owner_id", "contact_id", name="uq_contact_pair"),
        CheckConstraint("owner_id <> contact_id", name="ck_contact_not_self"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    owner_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    contact_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    contact: Mapped[User] = relationship(foreign_keys=[contact_id])


class Conversation(Base):
    __tablename__ = "conversations"
    __table_args__ = (
        CheckConstraint("kind IN ('direct', 'group')", name="ck_conversation_kind"),
        CheckConstraint("disappearing_seconds >= 0", name="ck_disappearing_non_negative"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    kind: Mapped[str] = mapped_column(String(10))
    # Only for groups.
    title: Mapped[str | None] = mapped_column(String(64))
    description: Mapped[str] = mapped_column(String(480), default="")
    avatar_path: Mapped[str | None] = mapped_column(String(255))
    avatar_color: Mapped[str] = mapped_column(String(8), default="A100")
    # "<low_user_id>:<high_user_id>" for direct chats; guarantees one chat per pair.
    direct_key: Mapped[str | None] = mapped_column(String(32), unique=True)
    created_by_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    # Denormalised for cheap "sort by most recent activity".
    last_activity_at: Mapped[datetime] = mapped_column(default=utcnow, index=True)
    # 0 = off. Applies to messages sent after the setting changes.
    disappearing_seconds: Mapped[int] = mapped_column(Integer, default=0)

    members: Mapped[list["ConversationMember"]] = relationship(
        back_populates="conversation", cascade="all, delete-orphan", lazy="selectin"
    )


class ConversationMember(Base):
    __tablename__ = "conversation_members"
    __table_args__ = (CheckConstraint("role IN ('admin', 'member')", name="ck_member_role"),)

    conversation_id: Mapped[int] = mapped_column(
        ForeignKey("conversations.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True, index=True
    )
    role: Mapped[str] = mapped_column(String(10), default="member")
    joined_at: Mapped[datetime] = mapped_column(default=utcnow)
    # Read watermark: every message with id <= this has been read by this member.
    last_read_message_id: Mapped[int] = mapped_column(Integer, default=0)

    conversation: Mapped[Conversation] = relationship(back_populates="members")
    user: Mapped[User] = relationship(lazy="joined")


class Attachment(Base):
    __tablename__ = "attachments"

    id: Mapped[int] = mapped_column(primary_key=True)
    # Random public key used in the media URL (the URL is a capability).
    key: Mapped[str] = mapped_column(String(64), unique=True)
    uploader_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    file_name: Mapped[str] = mapped_column(String(255))
    content_type: Mapped[str] = mapped_column(String(127))
    size_bytes: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = mapped_column(default=utcnow)


class Message(Base):
    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint("kind IN ('text', 'system')", name="ck_message_kind"),
        # Idempotent sends: a retried request with the same client_id is not duplicated.
        UniqueConstraint("sender_id", "client_id", name="uq_message_client_id"),
        Index("ix_messages_conversation_id_id", "conversation_id", "id"),
    )

    id: Mapped[int] = mapped_column(primary_key=True)
    conversation_id: Mapped[int] = mapped_column(ForeignKey("conversations.id", ondelete="CASCADE"))
    # NULL for system notices (member added, timer changed, ...).
    sender_id: Mapped[int | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    kind: Mapped[str] = mapped_column(String(10), default="text")
    client_id: Mapped[str | None] = mapped_column(String(64))
    body: Mapped[str] = mapped_column(Text, default="")
    # Structured payload for system notices, e.g. {"event": "member_added", "actor_id": 1, "user_ids": [2]}.
    meta: Mapped[dict[str, Any] | None] = mapped_column(JSON)
    reply_to_id: Mapped[int | None] = mapped_column(ForeignKey("messages.id", ondelete="SET NULL"))
    attachment_id: Mapped[int | None] = mapped_column(ForeignKey("attachments.id", ondelete="SET NULL"))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)
    expires_at: Mapped[datetime | None] = mapped_column(index=True)

    sender: Mapped[User | None] = relationship(lazy="joined")
    attachment: Mapped[Attachment | None] = relationship(lazy="joined")
    reply_to: Mapped["Message | None"] = relationship(remote_side=[id], lazy="joined", join_depth=1)
    receipts: Mapped[list["MessageReceipt"]] = relationship(
        cascade="all, delete-orphan", lazy="selectin"
    )
    reactions: Mapped[list["Reaction"]] = relationship(cascade="all, delete-orphan", lazy="selectin")


class MessageReceipt(Base):
    """One row per (message, recipient). Drives the sent / delivered / read ticks."""

    __tablename__ = "message_receipts"
    __table_args__ = (Index("ix_receipts_user_pending", "user_id", "delivered_at"),)

    message_id: Mapped[int] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    delivered_at: Mapped[datetime | None] = mapped_column()
    read_at: Mapped[datetime | None] = mapped_column()


class Reaction(Base):
    """Signal allows a single reaction per person per message."""

    __tablename__ = "reactions"

    message_id: Mapped[int] = mapped_column(
        ForeignKey("messages.id", ondelete="CASCADE"), primary_key=True
    )
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), primary_key=True)
    emoji: Mapped[str] = mapped_column(String(16))
    created_at: Mapped[datetime] = mapped_column(default=utcnow)

    user: Mapped[User] = relationship(lazy="joined")
