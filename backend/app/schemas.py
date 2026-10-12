"""Pydantic request/response models (the public API contract)."""

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

PHONE_RE = re.compile(r"^\+[1-9]\d{6,14}$")
USERNAME_RE = re.compile(r"^[a-z_][a-z0-9_]{2,31}$")
AVATAR_COLORS = [f"A{n}" for n in range(100, 211, 10)]

MessageStatus = Literal["sent", "delivered", "read"]


def normalize_phone(value: str) -> str:
    digits = re.sub(r"[^\d+]", "", value.strip())
    if not digits.startswith("+"):
        digits = "+" + digits
    if not PHONE_RE.match(digits):
        raise ValueError("Enter a valid phone number with country code")
    return digits


class ApiModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


# ---------- Auth ----------


class PhoneIn(BaseModel):
    phone: str

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str) -> str:
        return normalize_phone(v)


class RequestCodeIn(PhoneIn):
    pass


class RequestCodeOut(BaseModel):
    phone: str
    is_registered: bool
    # Exposed only because verification is mocked; a real system would SMS it.
    mock_code: str


class VerifyCodeIn(PhoneIn):
    code: str = Field(min_length=4, max_length=8)


# ---------- Users ----------


class UserOut(ApiModel):
    id: int
    phone: str
    username: str | None
    display_name: str
    about: str
    avatar_url: str | None
    avatar_color: str
    last_seen_at: datetime | None
    is_online: bool = False


class MeOut(UserOut):
    is_profile_complete: bool


class AuthOut(BaseModel):
    token: str
    user: MeOut
    is_new_user: bool


class ProfileUpdateIn(BaseModel):
    display_name: str | None = Field(default=None, max_length=64)
    about: str | None = Field(default=None, max_length=140)
    username: str | None = Field(default=None, max_length=32)
    avatar_color: str | None = None

    @field_validator("display_name")
    @classmethod
    def _name(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("Name cannot be empty")
        return v.strip() if v else v

    @field_validator("username")
    @classmethod
    def _username(cls, v: str | None) -> str | None:
        if v is None or v == "":
            return v
        v = v.strip().lower()
        if not USERNAME_RE.match(v):
            raise ValueError(
                "Usernames are 3-32 characters: lowercase letters, numbers and underscores"
            )
        return v

    @field_validator("avatar_color")
    @classmethod
    def _color(cls, v: str | None) -> str | None:
        if v is not None and v not in AVATAR_COLORS:
            raise ValueError("Unknown avatar color")
        return v


# ---------- Contacts ----------


class AddContactIn(BaseModel):
    """Find a Signal user by phone number or username and save them as a contact."""

    phone: str | None = None
    username: str | None = None

    @field_validator("phone")
    @classmethod
    def _phone(cls, v: str | None) -> str | None:
        return normalize_phone(v) if v else None


# ---------- Messages ----------


class AttachmentOut(ApiModel):
    id: int
    url: str
    file_name: str
    content_type: str
    size_bytes: int


class QuoteOut(BaseModel):
    id: int
    sender_id: int | None
    body: str
    attachment: AttachmentOut | None


class ReactionOut(BaseModel):
    user_id: int
    emoji: str


class MessageOut(BaseModel):
    id: int
    conversation_id: int
    sender_id: int | None
    kind: Literal["text", "system"]
    client_id: str | None
    body: str
    meta: dict[str, Any] | None
    created_at: datetime
    expires_at: datetime | None
    reply_to: QuoteOut | None
    attachment: AttachmentOut | None
    reactions: list[ReactionOut]
    # Only populated for messages the requesting user sent.
    status: MessageStatus | None


class SendMessageIn(BaseModel):
    client_id: str = Field(min_length=1, max_length=64)
    body: str = Field(default="", max_length=8000)
    reply_to_id: int | None = None
    attachment_id: int | None = None


class ReactionIn(BaseModel):
    emoji: str = Field(min_length=1, max_length=16)


class MessagePage(BaseModel):
    messages: list[MessageOut]
    has_more: bool


class RecipientReceiptOut(BaseModel):
    user_id: int
    delivered_at: datetime | None
    read_at: datetime | None


class MessageInfoOut(BaseModel):
    """Per-recipient receipt breakdown (Signal's "Message details" screen)."""

    message_id: int
    recipients: list[RecipientReceiptOut]


# ---------- Conversations ----------


class MemberOut(BaseModel):
    user: UserOut
    role: Literal["admin", "member"]
    joined_at: datetime


class ConversationOut(BaseModel):
    id: int
    kind: Literal["direct", "group"]
    title: str | None
    description: str
    avatar_url: str | None
    avatar_color: str
    created_at: datetime
    last_activity_at: datetime
    disappearing_seconds: int
    members: list[MemberOut]
    my_role: Literal["admin", "member"]
    unread_count: int
    last_message: MessageOut | None


class CreateDirectIn(BaseModel):
    user_id: int


class CreateGroupIn(BaseModel):
    title: str = Field(min_length=1, max_length=64)
    member_ids: list[int] = Field(min_length=1, max_length=999)
    description: str = Field(default="", max_length=480)
    avatar_color: str | None = None

    @field_validator("title")
    @classmethod
    def _title(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Group name is required")
        return v.strip()


class UpdateConversationIn(BaseModel):
    title: str | None = Field(default=None, max_length=64)
    description: str | None = Field(default=None, max_length=480)
    disappearing_seconds: int | None = Field(default=None, ge=0, le=60 * 60 * 24 * 28)

    @field_validator("title")
    @classmethod
    def _title(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("Group name is required")
        return v.strip() if v else v


class AddMembersIn(BaseModel):
    user_ids: list[int] = Field(min_length=1)


class UpdateMemberIn(BaseModel):
    role: Literal["admin", "member"]


# ---------- Search ----------


class MessageHitOut(BaseModel):
    message: MessageOut
    conversation_id: int


class SearchOut(BaseModel):
    conversations: list[int]
    contacts: list[UserOut]
    messages: list[MessageHitOut]
