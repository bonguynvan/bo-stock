"""Self-hosted auth: register / login / logout / me over an httpOnly JWT cookie."""
from __future__ import annotations

import hmac

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.database import get_db
from app.models import User
from app.schemas.stock import Envelope
from app.services import auth, ratelimit

router = APIRouter(prefix="/auth", tags=["auth"])

# Per-IP limits (sliding window) — brute-force / invite-guessing / spam guard.
_LOGIN_LIMIT, _LOGIN_WINDOW = 10, 300.0     # 10 attempts / 5 min
_REGISTER_LIMIT, _REGISTER_WINDOW = 5, 300.0  # 5 attempts / 5 min


def _rate_limit(request: Request, name: str, limit: int, window: float) -> None:
    if not ratelimit.allow(f"{name}:{ratelimit.client_ip(request)}", limit, window):
        raise HTTPException(status_code=429, detail="Quá nhiều yêu cầu — thử lại sau ít phút.")


class RegisterBody(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=200)
    invite_code: str | None = None


class LoginBody(BaseModel):
    email: str = Field(max_length=255)
    password: str = Field(max_length=200)


def _set_cookie(response: Response, token: str) -> None:
    s = get_settings()
    response.set_cookie(
        key=s.auth_cookie_name,
        value=token,
        httponly=True,
        secure=s.auth_cookie_secure,
        samesite="lax",
        max_age=s.jwt_expire_hours * 3600,
        path="/",
    )


def _user_out(u: User) -> dict:
    return {"id": u.id, "email": u.email, "is_admin": u.is_admin}


async def get_current_user(
    request: Request, db: AsyncSession = Depends(get_db)
) -> User:
    """Resolve the logged-in user from the session cookie, or 401."""
    s = get_settings()
    payload = auth.decode_token(request.cookies.get(s.auth_cookie_name) or "", s.jwt_secret)
    if not payload:
        raise HTTPException(status_code=401, detail="Chưa đăng nhập.")
    user = await db.get(User, int(payload.get("sub", 0) or 0))
    if user is None:
        raise HTTPException(status_code=401, detail="Phiên không hợp lệ.")
    return user


@router.post("/register", response_model=Envelope[dict])
async def register(
    body: RegisterBody, request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> Envelope[dict]:
    s = get_settings()
    _rate_limit(request, "register", _REGISTER_LIMIT, _REGISTER_WINDOW)
    email = auth.normalize_email(body.email)
    if not auth.is_valid_email(email):
        raise HTTPException(status_code=400, detail="Email không hợp lệ.")
    if not auth.is_valid_password(body.password):
        raise HTTPException(
            status_code=400,
            detail=f"Mật khẩu cần tối thiểu {auth.MIN_PASSWORD_LEN} ký tự.",
        )
    if s.auth_invite_code and not hmac.compare_digest(
        body.invite_code or "", s.auth_invite_code
    ):
        raise HTTPException(status_code=403, detail="Mã mời không đúng.")
    exists = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    if exists is not None:
        raise HTTPException(status_code=409, detail="Email đã được đăng ký.")

    user = User(
        email=email,
        password_hash=auth.hash_password(body.password),
        is_admin=auth.is_admin_email(email, s.admin_email_list),
    )
    db.add(user)
    await db.commit()
    await db.refresh(user)
    _set_cookie(response, auth.create_token(
        user_id=user.id, email=user.email, secret=s.jwt_secret, expire_hours=s.jwt_expire_hours
    ))
    return Envelope(data=_user_out(user))


@router.post("/login", response_model=Envelope[dict])
async def login(
    body: LoginBody, request: Request, response: Response, db: AsyncSession = Depends(get_db)
) -> Envelope[dict]:
    s = get_settings()
    _rate_limit(request, "login", _LOGIN_LIMIT, _LOGIN_WINDOW)
    email = auth.normalize_email(body.email)
    user = (
        await db.execute(select(User).where(User.email == email))
    ).scalar_one_or_none()
    # Verify even when the user is missing would leak timing; a constant-ish 401 is fine here.
    if user is None or not auth.verify_password(body.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Email hoặc mật khẩu không đúng.")
    # Reconcile admin grant from ADMIN_EMAILS (bootstrap without a DB edit).
    if auth.is_admin_email(user.email, s.admin_email_list) and not user.is_admin:
        user.is_admin = True
        await db.commit()
    _set_cookie(response, auth.create_token(
        user_id=user.id, email=user.email, secret=s.jwt_secret, expire_hours=s.jwt_expire_hours
    ))
    return Envelope(data=_user_out(user))


@router.post("/logout", response_model=Envelope[dict])
async def logout(response: Response) -> Envelope[dict]:
    response.delete_cookie(get_settings().auth_cookie_name, path="/")
    return Envelope(data={"ok": True})


@router.get("/me", response_model=Envelope[dict])
async def me(user: User = Depends(get_current_user)) -> Envelope[dict]:
    return Envelope(data=_user_out(user))
