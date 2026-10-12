"""In-process WebSocket fan-out.

Every authenticated socket is registered under its user id (a user may have several
tabs/devices open). REST handlers run in a worker thread pool, so `emit()` is
thread-safe: it schedules delivery on the server's event loop and returns at once.

This is a single-process design; scaling horizontally would swap this class for a
pub/sub backend (e.g. Redis) behind the same `emit()` interface.
"""

import asyncio
import logging
from collections import defaultdict
from collections.abc import Iterable
from typing import Any

from fastapi import WebSocket

log = logging.getLogger(__name__)


class ConnectionManager:
    def __init__(self) -> None:
        self._sockets: dict[int, set[WebSocket]] = defaultdict(set)
        self._loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self._loop = loop

    def connect(self, user_id: int, ws: WebSocket) -> bool:
        """Register a socket. Returns True if this is the user's first live connection."""
        first = not self._sockets[user_id]
        self._sockets[user_id].add(ws)
        return first

    def disconnect(self, user_id: int, ws: WebSocket) -> bool:
        """Unregister a socket. Returns True if the user has no live connections left."""
        sockets = self._sockets.get(user_id)
        if not sockets:
            return False
        sockets.discard(ws)
        if not sockets:
            del self._sockets[user_id]
            return True
        return False

    def is_online(self, user_id: int) -> bool:
        return bool(self._sockets.get(user_id))

    async def send(self, user_ids: Iterable[int], event: dict[str, Any]) -> None:
        for user_id in set(user_ids):
            for ws in list(self._sockets.get(user_id, ())):
                try:
                    await ws.send_json(event)
                except Exception:  # socket closed mid-send; its handler will clean up
                    log.debug("dropping event for closed socket of user %s", user_id)

    def emit(self, user_ids: Iterable[int], event: dict[str, Any]) -> None:
        """Fire-and-forget delivery callable from sync code in any thread."""
        if self._loop is None or self._loop.is_closed():
            return
        targets = list(set(user_ids))
        if not targets:
            return
        coro = self.send(targets, event)
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self._loop:
            self._loop.create_task(coro)
        else:
            asyncio.run_coroutine_threadsafe(coro, self._loop)


manager = ConnectionManager()
