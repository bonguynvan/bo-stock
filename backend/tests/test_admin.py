"""Admin router — gating + waitlist listing (direct-call, seeded session)."""
from __future__ import annotations

import pytest
from fastapi import HTTPException

from app.models import User, WaitlistEntry
from app.routers.admin import list_waitlist, require_admin, stats
from app.services.auth import is_admin_email


def test_is_admin_email() -> None:
    admins = ["boss@x.co", "cto@x.co"]
    assert is_admin_email("BOSS@X.co", admins) is True
    assert is_admin_email("nobody@x.co", admins) is False


async def test_require_admin_blocks_non_admin(user) -> None:
    # `user` fixture is a normal (non-admin) account.
    with pytest.raises(HTTPException) as exc:
        await require_admin(user=user)
    assert exc.value.status_code == 403


async def test_admin_lists_waitlist_and_stats(session) -> None:
    admin = User(email="boss@x.co", password_hash="x", is_admin=True)
    session.add_all([
        admin,
        WaitlistEntry(email="a@x.co"),
        WaitlistEntry(email="b@x.co", note="quan tâm QoE"),
    ])
    await session.commit()

    assert await require_admin(user=admin) is admin  # admin passes the gate

    wl = await list_waitlist(db=session, _admin=admin)
    emails = {e["email"] for e in wl.data}
    assert emails == {"a@x.co", "b@x.co"}

    s = await stats(db=session, _admin=admin)
    assert s.data["waitlist"] == 2
    assert s.data["users"] >= 1
