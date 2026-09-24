"""Portfolio risk service — the no-holdings degrade path (pure math has its own tests)."""
from __future__ import annotations

from app.services.portfolio_risk import get_portfolio_risk


async def test_no_positions_degrades_gracefully(session) -> None:
    # The seeded fixture has stocks/metrics but no Positions.
    out = await get_portfolio_risk(session)
    assert out["available"] is False
    assert "note" in out and out["note"]
