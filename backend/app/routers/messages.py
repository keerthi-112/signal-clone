from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Message, User
from ..realtime import manager
from ..schemas import (
    MessageInfoOut,
    MessageOut,
    MessagePage,
    ReactionIn,
    RecipientReceiptOut,
    SendMessageIn,
)
from ..security import get_current_user
from ..services.conversations import get_membership, member_ids
from ..services.messages import (
    emit_message_created,
    emit_status_updates,
    get_message_for_member,
    mark_delivered,
    send_message,
    set_reaction,
)
from ..services.serializers import message_out

router = APIRouter(prefix="/api", tags=["messages"])


@router.get("/conversations/{conversation_id}/messages", response_model=MessagePage)
def list_messages(
    conversation_id: int,
    before_id: int | None = Query(default=None, description="Return messages older than this id"),
    limit: int = Query(default=50, ge=1, le=200),
    me: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessagePage:
    """Keyset-paginated history, returned oldest -> newest."""
    get_membership(db, conversation_id, me.id)
    query = select(Message).where(Message.conversation_id == conversation_id)
    if before_id is not None:
        query = query.where(Message.id < before_id)
    rows = list(db.scalars(query.order_by(Message.id.desc()).limit(limit + 1)))
    has_more = len(rows) > limit
    rows = list(reversed(rows[:limit]))

    # Fetching history means this device now has these messages.
    delivered = mark_delivered(db, me.id, [m.id for m in rows if m.sender_id != me.id])
    emit_status_updates(db, delivered)
    if delivered:
        rows = list(
            db.scalars(
                select(Message)
                .where(Message.id.in_([m.id for m in rows]))
                .order_by(Message.id)
                .execution_options(populate_existing=True)
            )
        )
    return MessagePage(messages=[message_out(m, me.id) for m in rows], has_more=has_more)


@router.post("/conversations/{conversation_id}/messages", response_model=MessageOut)
def create_message(
    conversation_id: int,
    data: SendMessageIn,
    response: Response,
    me: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> MessageOut:
    member = get_membership(db, conversation_id, me.id)
    message, created = send_message(db, member, data)
    if created:
        response.status_code = status.HTTP_201_CREATED
        emit_message_created(message, member_ids(member.conversation))
    return message_out(message, me.id)


@router.get("/messages/{message_id}/info", response_model=MessageInfoOut)
def message_info(message_id: int, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    message = get_message_for_member(db, message_id, me.id)
    if message.sender_id != me.id:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Only the sender can see delivery details")
    return MessageInfoOut(
        message_id=message.id,
        recipients=[
            RecipientReceiptOut(user_id=r.user_id, delivered_at=r.delivered_at, read_at=r.read_at)
            for r in message.receipts
        ],
    )


def _react(db: Session, message_id: int, me: User, emoji: str | None) -> list[dict]:
    message = get_message_for_member(db, message_id, me.id)
    reactions = [r.model_dump() for r in set_reaction(db, message, me.id, emoji)]
    targets = member_ids(get_membership(db, message.conversation_id, me.id).conversation)
    manager.emit(
        targets,
        {
            "type": "message.reactions",
            "data": {
                "conversation_id": message.conversation_id,
                "message_id": message.id,
                "reactions": reactions,
            },
        },
    )
    return reactions


@router.put("/messages/{message_id}/reaction")
def react(message_id: int, data: ReactionIn, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"reactions": _react(db, message_id, me, data.emoji)}


@router.delete("/messages/{message_id}/reaction")
def unreact(message_id: int, me: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return {"reactions": _react(db, message_id, me, None)}
