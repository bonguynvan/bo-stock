"""Basic CRUD test for the single-row playbook."""
from __future__ import annotations

from app.routers.playbook import DEFAULT_CONTENT, _get_or_create


async def test_get_or_create_seeds_default_then_persists_one_row(session, user) -> None:
    first = await _get_or_create(session, user.id)
    assert first.content == DEFAULT_CONTENT  # seeded with the default process

    # Update content; still a single row.
    first.content = "## My process\n- step 1"
    await session.commit()

    again = await _get_or_create(session, user.id)
    assert again.id == first.id
    assert again.content == "## My process\n- step 1"
