from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from ..database import get_db
from ..models import Contact, Conversation, ConversationMember, Message, User
from ..schemas import MessageHitOut, SearchOut
from ..security import get_current_user
from ..services.serializers import message_out, user_out

router = APIRouter(prefix="/api", tags=["search"])


def _escape_like(term: str) -> str:
    return term.replace("\\", "\\\\").replace("%", "\\%").replace("_", "\\_")


@router.get("/search", response_model=SearchOut)
def search(
    q: str = Query(min_length=1, max_length=100),
    me: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SearchOut:
    """Signal-style global search: matching chats, contacts and messages."""
    pattern = f"%{_escape_like(q.strip().lower())}%"
    my_convs = select(ConversationMember.conversation_id).where(ConversationMember.user_id == me.id)

    contacts = db.scalars(
        select(User)
        .join(Contact, Contact.contact_id == User.id)
        .where(
            Contact.owner_id == me.id,
            or_(
                func.lower(User.display_name).like(pattern, escape="\\"),
                func.lower(User.username).like(pattern, escape="\\"),
                User.phone.like(pattern, escape="\\"),
            ),
        )
        .order_by(func.lower(User.display_name))
        .limit(20)
    )

    # Groups by title, direct chats by the other participant's name.
    group_ids = db.scalars(
        select(Conversation.id).where(
            Conversation.id.in_(my_convs),
            Conversation.kind == "group",
            func.lower(Conversation.title).like(pattern, escape="\\"),
        )
    )
    direct_ids = db.scalars(
        select(Conversation.id)
        .join(ConversationMember, ConversationMember.conversation_id == Conversation.id)
        .join(User, User.id == ConversationMember.user_id)
        .where(
            Conversation.id.in_(my_convs),
            Conversation.kind == "direct",
            User.id != me.id,
            or_(
                func.lower(User.display_name).like(pattern, escape="\\"),
                User.phone.like(pattern, escape="\\"),
            ),
        )
    )

    messages = db.scalars(
        select(Message)
        .where(
            Message.conversation_id.in_(my_convs),
            Message.kind == "text",
            func.lower(Message.body).like(pattern, escape="\\"),
        )
        .order_by(Message.id.desc())
        .limit(30)
    )

    return SearchOut(
        conversations=list(dict.fromkeys([*group_ids, *direct_ids])),
        contacts=[user_out(u) for u in contacts],
        messages=[
            MessageHitOut(message=message_out(m, me.id), conversation_id=m.conversation_id) for m in messages
        ],
    )
