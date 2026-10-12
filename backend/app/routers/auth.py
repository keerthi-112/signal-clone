"""Mocked phone-number registration / login.

Flow (mirrors Signal): enter phone -> receive code -> verify -> (new users) set up profile.
There is no password: possession of the phone number (here: the fixed mock code) is the
credential, exactly like Signal.
"""

import random

from fastapi import APIRouter, Depends, HTTPException, Request, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..config import settings
from ..database import get_db
from ..models import User
from ..schemas import AVATAR_COLORS, AuthOut, MeOut, RequestCodeIn, RequestCodeOut, VerifyCodeIn
from ..security import create_session, get_token, revoke_session
from ..services.serializers import user_out

router = APIRouter(prefix="/api/auth", tags=["auth"])


def me_out(user: User) -> MeOut:
    return MeOut(**user_out(user).model_dump(), is_profile_complete=user.is_profile_complete)


@router.post("/request-code", response_model=RequestCodeOut)
def request_code(data: RequestCodeIn, db: Session = Depends(get_db)) -> RequestCodeOut:
    exists = db.scalar(select(User.id).where(User.phone == data.phone)) is not None
    return RequestCodeOut(phone=data.phone, is_registered=exists, mock_code=settings.mock_otp_code)


@router.post("/verify", response_model=AuthOut)
def verify_code(data: VerifyCodeIn, request: Request, db: Session = Depends(get_db)) -> AuthOut:
    if data.code != settings.mock_otp_code:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Incorrect code. Try again.")

    user = db.scalar(select(User).where(User.phone == data.phone))
    if user is None:
        user = User(phone=data.phone, avatar_color=random.choice(AVATAR_COLORS))
        db.add(user)
        db.commit()

    token = create_session(db, user, request.headers.get("user-agent", ""))
    return AuthOut(token=token, user=me_out(user), is_new_user=not user.is_profile_complete)


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
def logout(token: str = Depends(get_token), db: Session = Depends(get_db)) -> None:
    revoke_session(db, token)
