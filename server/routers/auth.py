# ruff: noqa: B008
import logging

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import JSONResponse
from sqlalchemy.orm import Session

from server.db import database
from server.db.models import User
from server.runtime_config import AUTH_COOKIE_SECURE
from server.schemas.auth import LoginRequest, RegisterRequest, UserResponse
from server.services.auth import (
    COOKIE_NAME,
    create_access_token,
    create_user,
    get_current_user,
    verify_password,
)

logger = logging.getLogger(__name__)


def _get_db():
    db = database.SessionLocal()
    try:
        yield db
    finally:
        db.close()


router = APIRouter(prefix="/api/auth", tags=["auth"])


def _set_auth_cookie(response: JSONResponse, token: str) -> None:
    response.set_cookie(
        key=COOKIE_NAME,
        value=token,
        httponly=True,
        samesite="lax",
        secure=AUTH_COOKIE_SECURE,
        max_age=60 * 60 * 24 * 7,
        path="/",
    )


@router.post("/register", response_model=UserResponse)
def register(request: RegisterRequest, db: Session = Depends(_get_db)):
    existing = db.query(User).filter(User.username == request.username).first()
    if existing:
        raise HTTPException(status_code=409, detail="Username already taken")

    if request.email:
        email_exists = db.query(User).filter(User.email == request.email).first()
        if email_exists:
            raise HTTPException(status_code=409, detail="Email already in use")

    user = create_user(db, request.username, request.password, request.email)
    token = create_access_token(str(user.id), str(user.username))

    body = UserResponse(
        user_id=str(user.id), username=str(user.username), email=str(user.email) if user.email else None
    )
    response = JSONResponse(content=body.model_dump())
    _set_auth_cookie(response, token)
    return response


@router.post("/login", response_model=UserResponse)
def login(request: LoginRequest, db: Session = Depends(_get_db)):
    user = db.query(User).filter(User.username == request.username).first()
    if not user or not verify_password(request.password, str(user.password_hash)):
        raise HTTPException(status_code=401, detail="Invalid username or password")

    token = create_access_token(str(user.id), str(user.username))

    body = UserResponse(
        user_id=str(user.id), username=str(user.username), email=str(user.email) if user.email else None
    )
    response = JSONResponse(content=body.model_dump())
    _set_auth_cookie(response, token)
    return response


@router.post("/logout")
def logout():
    response = JSONResponse(content={"ok": True})
    response.delete_cookie(key=COOKIE_NAME, path="/")
    return response


@router.get("/me", response_model=UserResponse)
def me(user: User = Depends(get_current_user)):
    return UserResponse(
        user_id=str(user.id),
        username=str(user.username),
        email=str(user.email) if user.email else None,
    )
