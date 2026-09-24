"""Auth primitives — password hashing (bcrypt) + JWT session tokens (pure, testable).

No DB / no I/O here: hash/verify a password, encode/decode a session token, and validate
email/password shape. The router composes these with the User table. Research-tool auth:
gates access to the private beta, no per-user data scoping yet.
"""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt

_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")
MIN_PASSWORD_LEN = 8
_ALGO = "HS256"


def normalize_email(email: str) -> str:
    return (email or "").strip().lower()


def is_valid_email(email: str) -> bool:
    return bool(_EMAIL_RE.match(normalize_email(email))) and len(email) <= 255


def is_valid_password(password: str) -> bool:
    return isinstance(password, str) and MIN_PASSWORD_LEN <= len(password) <= 200


def is_admin_email(email: str, admin_emails: list[str]) -> bool:
    return normalize_email(email) in admin_emails


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def create_token(*, user_id: int, email: str, secret: str, expire_hours: int) -> str:
    now = datetime.now(timezone.utc)
    payload = {
        "sub": str(user_id),
        "email": email,
        "iat": int(now.timestamp()),
        "exp": int((now + timedelta(hours=expire_hours)).timestamp()),
    }
    return jwt.encode(payload, secret, algorithm=_ALGO)


def decode_token(token: str, secret: str) -> dict | None:
    """Return the payload, or None if the token is missing/invalid/expired."""
    if not token:
        return None
    try:
        return jwt.decode(token, secret, algorithms=[_ALGO])
    except jwt.PyJWTError:
        return None
