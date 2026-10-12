"""Demo data so the app is immediately usable.

Run manually with `python -m app.seed --reset` (drops and recreates all tables).
On startup the app seeds automatically when the users table is empty.

Every seeded account logs in with its phone number and the mock code 123456.
"""

import argparse
from dataclasses import dataclass, field
from datetime import timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from .database import Base, SessionLocal, engine, utcnow
from .models import (
    Contact,
    Conversation,
    ConversationMember,
    Message,
    MessageReceipt,
    Reaction,
    User,
)
from .services.conversations import direct_key

USERS = {
    "alex": ("+15550100001", "alex_rivera", "Alex Rivera", "Coffee first, then code ☕", "A110"),
    "priya": ("+15550100002", "priya", "Priya Sharma", "Available", "A160"),
    "jordan": ("+15550100003", "jordan_lee", "Jordan Lee", "On the trail 🥾", "A130"),
    "maya": ("+15550100004", "maya_chen", "Maya Chen", "Designing things", "A150"),
    "sam": ("+15550100005", "sam_okafor", "Sam Okafor", "", "A180"),
    "elena": ("+15550100006", "elena_p", "Elena Petrova", "Product @ Northwind", "A140"),
    "diego": ("+15550100007", "diego_s", "Diego Santos", "Busy", "A120"),
    "noah": ("+15550100008", "noah_w", "Noah Williams", "Signal only, please", "A200"),
}

# (sender, text, minutes_ago, extras) — extras: reply=<index>, react={user: emoji}
Line = tuple


@dataclass
class ChatSpec:
    members: list[str]
    lines: list[Line]
    title: str | None = None
    admins: list[str] = field(default_factory=list)
    color: str = "A100"
    # user -> how many of the newest messages from others they haven't read yet
    unread: dict[str, int] = field(default_factory=dict)
    # users whose device hasn't received the newest messages yet (single tick for sender)
    undelivered: dict[str, int] = field(default_factory=dict)
    disappearing: int = 0


H = 60
D = 24 * H

CHATS = [
    ChatSpec(
        members=["alex", "priya"],
        unread={"alex": 2},
        lines=[
            ("priya", "Hey! Are we still on for dinner Friday?", 3 * H + 20),
            ("alex", "Yes! 7:30 at that Thai place?", 3 * H + 12),
            ("priya", "Perfect. I'll book a table for four", 3 * H + 10, {"react": {"alex": "👍"}}),
            ("alex", "Jordan said he might bring Maya too", 3 * H + 2),
            ("priya", "The more the merrier 😄", 3 * H),
            ("priya", "Also — did you see the photos from last weekend?", 14),
            ("priya", "I'll send them over tonight", 13),
        ],
    ),
    ChatSpec(
        members=["alex", "maya"],
        lines=[
            ("maya", "Can you take a look at the new onboarding mockups?", 2 * D + 5 * H),
            ("alex", "Sure, sending feedback in a bit", 2 * D + 4 * H + 50),
            ("alex", "The flow is really clean. Step 3 feels a bit crowded though", 2 * D + 3 * H),
            ("maya", "Agreed, I'll split it into two screens", 2 * D + 2 * H + 55, {"reply": 2}),
            ("alex", "Love it 🙌", 2 * D + 2 * H + 50, {"react": {"maya": "❤️"}}),
            ("maya", "Updated version is in the shared folder", 50),
            ("alex", "On it!", 40),
        ],
    ),
    ChatSpec(
        members=["alex", "jordan"],
        lines=[
            ("jordan", "Trail conditions look great for Saturday", 1 * D + 6 * H),
            ("alex", "Nice. What time are we leaving?", 1 * D + 5 * H + 40),
            ("jordan", "6am sharp. Sunrise at the summit 🌄", 1 * D + 5 * H + 30),
            ("alex", "Ugh, early. But worth it", 1 * D + 5 * H + 20, {"react": {"jordan": "😂"}}),
            ("jordan", "Bring layers, it gets cold up there", 1 * D + 2 * H),
            ("alex", "Will do 👍", 1 * D + H + 58),
        ],
    ),
    ChatSpec(
        members=["alex", "sam"],
        undelivered={"sam": 1},
        lines=[
            ("sam", "Thanks for helping me move last week!", 6 * D + 3 * H),
            ("alex", "Anytime! How's the new place?", 6 * D + 2 * H),
            ("sam", "Still unpacking boxes 📦 but loving it", 6 * D + H),
            ("alex", "Housewarming party when you're settled?", 5 * D),
        ],
    ),
    ChatSpec(
        members=["alex", "diego"],
        disappearing=24 * 3600,
        lines=[
            ("diego", "Sending you the wifi password for the office", 4 * D + 2 * H),
            ("alex", "Thanks!", 4 * D + 2 * H - 3),
        ],
    ),
    ChatSpec(
        members=["alex", "priya", "jordan", "maya"],
        title="Weekend Hiking 🏔️",
        admins=["alex"],
        color="A130",
        unread={"alex": 2, "maya": 4},
        lines=[
            ("alex", "Who's in for Saturday's hike?", 1 * D + 8 * H),
            ("priya", "Me!", 1 * D + 7 * H + 55),
            ("jordan", "Count me in. I'll drive", 1 * D + 7 * H + 50, {"react": {"alex": "🙏", "priya": "❤️"}}),
            ("maya", "I'm in if we stop for coffee on the way ☕", 1 * D + 7 * H),
            ("alex", "Obviously", 1 * D + 6 * H + 58, {"reply": 3}),
            ("jordan", "Weather update: sunny, 18°C", 35),
            ("priya", "Perfect hiking weather!", 30),
        ],
    ),
    ChatSpec(
        members=["elena", "alex", "diego", "noah"],
        title="Product Team",
        admins=["elena"],
        color="A140",
        unread={"alex": 1},
        lines=[
            ("elena", "Reminder: sprint review moves to Thursday 2pm", 3 * D),
            ("noah", "Noted 👍", 3 * D - 10),
            ("diego", "Can we get the demo build by Wednesday?", 2 * D + 4 * H),
            ("alex", "Yes, I'll have it ready Wednesday morning", 2 * D + 3 * H + 30),
            ("elena", "Great work on the release everyone 🎉", 2 * H + 5, {"react": {"noah": "🎉", "diego": "🎉"}}),
        ],
    ),
    ChatSpec(
        members=["priya", "jordan"],
        lines=[
            ("jordan", "Do you have Alex's new address?", 2 * D),
            ("priya", "Yep, I'll text it to you", 2 * D - 5),
        ],
    ),
    ChatSpec(
        members=["maya", "noah"],
        lines=[
            ("noah", "Loved your talk at the meetup!", 4 * D),
            ("maya", "Thank you so much! 😊", 4 * D - 20),
        ],
    ),
]

# Each pair here becomes mutual contacts.
CONTACTS = {
    "alex": ["priya", "jordan", "maya", "sam", "elena", "diego", "noah"],
    "priya": ["alex", "jordan", "maya"],
    "jordan": ["alex", "priya", "maya"],
    "maya": ["alex", "priya", "jordan", "noah"],
    "sam": ["alex"],
    "elena": ["alex", "diego", "noah"],
    "diego": ["alex", "elena", "noah"],
    "noah": ["alex", "elena", "diego", "maya"],
}


def _build_chat(db: Session, users: dict[str, User], spec: ChatSpec) -> None:
    now = utcnow()
    first_ts = now - timedelta(minutes=spec.lines[0][2]) - timedelta(minutes=5)
    if spec.title:
        conversation = Conversation(
            kind="group",
            title=spec.title,
            avatar_color=spec.color,
            created_by_id=users[spec.admins[0]].id,
            created_at=first_ts,
        )
    else:
        a, b = (users[k].id for k in spec.members)
        conversation = Conversation(kind="direct", direct_key=direct_key(a, b), created_at=first_ts)
    conversation.members = [
        ConversationMember(
            user_id=users[k].id, role="admin" if k in spec.admins else "member", joined_at=first_ts
        )
        for k in spec.members
    ]
    db.add(conversation)
    db.flush()

    if spec.title:
        db.add(
            Message(
                conversation_id=conversation.id,
                kind="system",
                meta={"event": "group_created", "actor_id": users[spec.admins[0]].id, "title": spec.title},
                created_at=first_ts,
            )
        )

    created: list[Message] = []
    for i, line in enumerate(spec.lines):
        sender_key, text, minutes_ago = line[:3]
        extras = line[3] if len(line) > 3 else {}
        ts = now - timedelta(minutes=minutes_ago)
        msg = Message(
            conversation_id=conversation.id,
            sender_id=users[sender_key].id,
            kind="text",
            client_id=f"seed-{conversation.id}-{i}",
            body=text,
            created_at=ts,
            reply_to_id=created[extras["reply"]].id if "reply" in extras else None,
        )
        db.add(msg)
        db.flush()
        for reactor, emoji in extras.get("react", {}).items():
            db.add(Reaction(message_id=msg.id, user_id=users[reactor].id, emoji=emoji, created_at=ts))
        created.append(msg)

    if spec.disappearing:
        conversation.disappearing_seconds = spec.disappearing
        db.add(
            Message(
                conversation_id=conversation.id,
                kind="system",
                meta={"event": "timer_changed", "actor_id": users[spec.members[1]].id, "seconds": spec.disappearing},
                created_at=created[-1].created_at + timedelta(minutes=1),
            )
        )

    conversation.last_activity_at = created[-1].created_at

    # Receipts + read watermarks.
    for member in conversation.members:
        key = next(k for k, u in users.items() if u.id == member.user_id)
        from_others = [m for m in created if m.sender_id != member.user_id]
        unread_n = spec.unread.get(key, 0)
        undelivered_n = spec.undelivered.get(key, 0)
        unread = {m.id for m in from_others[len(from_others) - unread_n:]} if unread_n else set()
        undelivered = {m.id for m in from_others[len(from_others) - undelivered_n:]} if undelivered_n else set()
        read_ids = [m.id for m in created if m.id not in unread and m.id not in undelivered]
        member.last_read_message_id = max(read_ids, default=0)
        for m in from_others:
            later = m.created_at + timedelta(minutes=1)
            db.add(
                MessageReceipt(
                    message_id=m.id,
                    user_id=member.user_id,
                    delivered_at=None if m.id in undelivered else later,
                    read_at=None if (m.id in unread or m.id in undelivered) else later,
                )
            )


def seed(db: Session) -> None:
    now = utcnow()
    users: dict[str, User] = {}
    for i, (key, (phone, username, name, about, color)) in enumerate(USERS.items()):
        user = User(
            phone=phone,
            username=username,
            display_name=name,
            about=about,
            avatar_color=color,
            created_at=now - timedelta(days=30),
            last_seen_at=now - timedelta(minutes=7 * (i + 1)),
        )
        db.add(user)
        users[key] = user
    db.flush()

    for owner, contacts in CONTACTS.items():
        for other in contacts:
            db.add(Contact(owner_id=users[owner].id, contact_id=users[other].id))

    for spec in CHATS:
        _build_chat(db, users, spec)
    db.commit()


def seed_if_empty() -> bool:
    with SessionLocal() as db:
        if db.scalar(select(User.id).limit(1)) is not None:
            return False
        seed(db)
        return True


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed the Signal clone database")
    parser.add_argument("--reset", action="store_true", help="drop all tables first")
    args = parser.parse_args()
    if args.reset:
        Base.metadata.drop_all(engine)
    Base.metadata.create_all(engine)
    print("Seeded demo data." if seed_if_empty() else "Database already has data; use --reset.")


if __name__ == "__main__":
    main()
