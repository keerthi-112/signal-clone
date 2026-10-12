"""Session-token authentication.

Tokens are random opaque strings handed to the client once; only their SHA-256 hash
is stored, so a leaked database cannot be replayed as live sessions.
"""

import hashlib
import secrets
from datetime import timedelta

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from .config import settings
from .database import get_db, utcnow
from .models import AuthSession, User

_bearer = HTTPBearer(auto_error=False)


def hash_token(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


def create_session(db: Session, user: User, user_agent: str = "") -> str:
    token = secrets.token_urlsafe(32)
    db.add(
        AuthSession(
            user_id=user.id,
            token_hash=hash_token(token),
            user_agent=user_agent[:255],
            expires_at=utcnow() + timedelta(days=settings.session_ttl_days),
        )
    )
    db.commit()
    return token


def user_from_token(db: Session, token: str | None) -> User | None:
    if not token:
        return None
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    if session is None or session.expires_at < utcnow():
        return None
    return session.user


def revoke_session(db: Session, token: str) -> None:
    session = db.scalar(select(AuthSession).where(AuthSession.token_hash == hash_token(token)))
    if session:
        db.delete(session)
        db.commit()


def get_token(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> str:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Not authenticated")
    return creds.credentials


def get_current_user(token: str = Depends(get_token), db: Session = Depends(get_db)) -> User:
    user = user_from_token(db, token)
    if user is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Session expired")
    return user
