"""Real-time channel.

Client -> server frames
  {"type": "ping"}
  {"type": "typing", "conversation_id": 1, "is_typing": true}
  {"type": "delivered", "message_ids": [1, 2]}

Server -> client frames are `{"type": <event>, "data": {...}}`:
  hello, pong, presence, typing, message.created, message.status, message.reactions,
  message.deleted, conversation.created|updated|removed|read, user.updated

Messages themselves are sent over REST (reliable request/response with idempotency);
the socket is the push channel.
"""

import logging

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.concurrency import run_in_threadpool
from sqlalchemy import select

from ..database import SessionLocal, utcnow
from ..models import ConversationMember, User
from ..realtime import manager
from ..security import user_from_token
from ..services.conversations import related_user_ids
from ..services.messages import emit_status_updates, mark_delivered

log = logging.getLogger(__name__)
router = APIRouter()

WS_UNAUTHORIZED = 4401


def _authenticate(token: str | None) -> int | None:
    with SessionLocal() as db:
        user = user_from_token(db, token)
        return user.id if user else None


def _on_connect(user_id: int) -> tuple[set[int], list[int]]:
    """Returns (related users, those currently online) and flushes pending deliveries."""
    with SessionLocal() as db:
        related = related_user_ids(db, user_id)
        delivered = mark_delivered(db, user_id)
        emit_status_updates(db, delivered)
        return related, [uid for uid in related if manager.is_online(uid)]


def _on_disconnect(user_id: int) -> tuple[set[int], str]:
    with SessionLocal() as db:
        user = db.get(User, user_id)
        now = utcnow()
        if user:
            user.last_seen_at = now
            db.commit()
        return related_user_ids(db, user_id), now.isoformat()


def _typing_targets(user_id: int, conversation_id: int) -> list[int]:
    with SessionLocal() as db:
        ids = list(
            db.scalars(
                select(ConversationMember.user_id).where(
                    ConversationMember.conversation_id == conversation_id
                )
            )
        )
    return [uid for uid in ids if uid != user_id] if user_id in ids else []


def _ack_delivered(user_id: int, message_ids: list[int]) -> None:
    with SessionLocal() as db:
        emit_status_updates(db, mark_delivered(db, user_id, message_ids))


@router.websocket("/ws")
async def websocket_endpoint(ws: WebSocket) -> None:
    await ws.accept()
    user_id = await run_in_threadpool(_authenticate, ws.query_params.get("token"))
    if user_id is None:
        await ws.close(code=WS_UNAUTHORIZED, reason="unauthorized")
        return

    first = manager.connect(user_id, ws)
    try:
        related, online = await run_in_threadpool(_on_connect, user_id)
        await ws.send_json({"type": "hello", "data": {"user_id": user_id, "online_user_ids": online}})
        if first:
            await manager.send(
                related, {"type": "presence", "data": {"user_id": user_id, "online": True, "last_seen_at": None}}
            )

        while True:
            frame = await ws.receive_json()
            kind = frame.get("type") if isinstance(frame, dict) else None
            if kind == "ping":
                await ws.send_json({"type": "pong", "data": {}})
            elif kind == "typing":
                conversation_id = int(frame.get("conversation_id", 0))
                targets = await run_in_threadpool(_typing_targets, user_id, conversation_id)
                await manager.send(
                    targets,
                    {
                        "type": "typing",
                        "data": {
                            "conversation_id": conversation_id,
                            "user_id": user_id,
                            "is_typing": bool(frame.get("is_typing")),
                        },
                    },
                )
            elif kind == "delivered":
                ids = [int(i) for i in frame.get("message_ids", [])][:500]
                await run_in_threadpool(_ack_delivered, user_id, ids)
    except WebSocketDisconnect:
        pass
    except (ValueError, TypeError) as exc:  # malformed frame: drop the socket, client reconnects
        log.info("closing socket for user %s: bad frame (%s)", user_id, exc)
        try:
            await ws.close(code=1003)
        except RuntimeError:
            pass
    finally:
        if manager.disconnect(user_id, ws):
            related, last_seen = await run_in_threadpool(_on_disconnect, user_id)
            await manager.send(
                related,
                {"type": "presence", "data": {"user_id": user_id, "online": False, "last_seen_at": last_seen}},
            )
