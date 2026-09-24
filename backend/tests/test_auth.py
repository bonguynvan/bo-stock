"""Pure auth-primitive tests (no DB / no network)."""
from __future__ import annotations

from app.services.auth import (
    create_token,
    decode_token,
    hash_password,
    is_valid_email,
    is_valid_password,
    normalize_email,
    verify_password,
)

_SECRET = "test-secret"


def test_password_hash_roundtrip() -> None:
    h = hash_password("correct horse battery")
    assert h != "correct horse battery"  # never stored in the clear
    assert verify_password("correct horse battery", h) is True
    assert verify_password("wrong", h) is False


def test_verify_password_tolerates_garbage_hash() -> None:
    assert verify_password("x", "not-a-bcrypt-hash") is False


def test_token_roundtrip_carries_identity() -> None:
    token = create_token(user_id=42, email="a@b.co", secret=_SECRET, expire_hours=1)
    payload = decode_token(token, _SECRET)
    assert payload is not None
    assert payload["sub"] == "42" and payload["email"] == "a@b.co"


def test_token_rejects_wrong_secret_and_garbage() -> None:
    token = create_token(user_id=1, email="a@b.co", secret=_SECRET, expire_hours=1)
    assert decode_token(token, "other-secret") is None
    assert decode_token("garbage", _SECRET) is None
    assert decode_token("", _SECRET) is None


def test_expired_token_is_rejected() -> None:
    token = create_token(user_id=1, email="a@b.co", secret=_SECRET, expire_hours=-1)
    assert decode_token(token, _SECRET) is None


def test_email_and_password_validation() -> None:
    assert is_valid_email("A@B.Co") is True
    assert normalize_email("  A@B.Co ") == "a@b.co"
    assert is_valid_email("nope") is False
    assert is_valid_email("a@b") is False
    assert is_valid_password("12345678") is True
    assert is_valid_password("short") is False


def test_auth_gate_public_paths() -> None:
    from app.main import _is_public

    assert _is_public("/") is True
    assert _is_public("/health") is True
    assert _is_public("/auth/login") is True
    assert _is_public("/waitlist") is True
    assert _is_public("/stocks/FPT") is False
    assert _is_public("/screener/radar") is False
    # docs are gated (not public) so they're protected when auth_required
    assert _is_public("/docs") is False
    assert _is_public("/openapi.json") is False
    # segment-boundary match: a lookalike prefix must NOT slip through
    assert _is_public("/waitlistadmin") is False
    assert _is_public("/authorize-something") is False
