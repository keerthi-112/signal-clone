import asyncio
import contextlib
import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from .config import settings
from .database import Base, SessionLocal, engine
from .realtime import manager
from .routers import attachments, auth, contacts, conversations, messages, search, users, ws
from .seed import seed_if_empty
from .services.messages import purge_expired

log = logging.getLogger("signal")
EXPIRY_SWEEP_SECONDS = 2


def _sweep_once() -> None:
    with SessionLocal() as db:
        for conversation_id, message_id, member_ids in purge_expired(db):
            manager.emit(
                member_ids,
                {"type": "message.deleted", "data": {"conversation_id": conversation_id, "message_id": message_id}},
            )


async def _expiry_loop() -> None:
    """Background job that deletes disappearing messages once their timer runs out."""
    while True:
        try:
            await run_in_threadpool(_sweep_once)
        except Exception:
            log.exception("disappearing-message sweep failed")
        await asyncio.sleep(EXPIRY_SWEEP_SECONDS)


@asynccontextmanager
async def lifespan(_: FastAPI):
    Base.metadata.create_all(engine)
    settings.media_dir.mkdir(parents=True, exist_ok=True)
    if settings.seed_on_startup and seed_if_empty():
        log.info("seeded demo data")
    manager.bind_loop(asyncio.get_running_loop())
    sweeper = asyncio.create_task(_expiry_loop())
    yield
    sweeper.cancel()
    with contextlib.suppress(asyncio.CancelledError):
        await sweeper


app = FastAPI(title="Signal Clone API", version="1.0.0", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # Auth uses bearer tokens, not cookies, so credentials mode isn't needed.
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)

for module in (auth, users, contacts, conversations, messages, attachments, search, ws):
    app.include_router(module.router)

settings.media_dir.mkdir(parents=True, exist_ok=True)
app.mount("/media", StaticFiles(directory=settings.media_dir), name="media")


@app.get("/api/health", tags=["meta"])
def health() -> dict[str, str]:
    return {"status": "ok"}
