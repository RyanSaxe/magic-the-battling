# ruff: noqa: B008
from __future__ import annotations

import logging
from datetime import UTC, datetime, timedelta
from uuid import uuid4

import bcrypt
import jwt
from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from server.db import database
from server.db.models import User
from server.runtime_config import AUTH_SECRET_KEY, AUTH_TOKEN_EXPIRE_HOURS

logger = logging.getLogger(__name__)

ALGORITHM = "HS256"
COOKIE_NAME = "mtb_auth"


def _get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


def hash_password(plain: str) -> str:
    return bcrypt.hashpw(plain.encode(), bcrypt.gensalt()).decode()


def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode(), hashed.encode())


def create_access_token(user_id: str, username: str) -> str:
    expire = datetime.now(UTC) + timedelta(hours=AUTH_TOKEN_EXPIRE_HOURS)
    payload = {"user_id": user_id, "username": username, "exp": expire}
    return jwt.encode(payload, AUTH_SECRET_KEY, algorithm=ALGORITHM)


def decode_access_token(token: str) -> dict | None:
    try:
        return jwt.decode(token, AUTH_SECRET_KEY, algorithms=[ALGORITHM])
    except jwt.PyJWTError:
        return None


def _user_from_token(request: Request, db: Session) -> User | None:
    token = request.cookies.get(COOKIE_NAME)
    if not token:
        return None
    claims = decode_access_token(token)
    if not claims:
        return None
    user_id = claims.get("user_id")
    if not user_id:
        return None
    return db.query(User).filter(User.id == user_id).first()


def get_current_user(request: Request, db: Session = Depends(_get_db)) -> User:
    user = _user_from_token(request, db)
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user


def get_optional_user(request: Request, db: Session = Depends(_get_db)) -> User | None:
    return _user_from_token(request, db)


def create_user(db: Session, username: str, password: str, email: str | None = None) -> User:
    user = User(
        id=uuid4().hex,
        username=username,
        email=email,
        password_hash=hash_password(password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    return user
