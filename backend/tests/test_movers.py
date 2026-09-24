"""Pure builder tests for the VN market-pulse (movers) service."""
from __future__ import annotations

from app.services.movers import build_movers


def _r(sym: str, chg: float | None, vol: int | None = None) -> dict:
    return {"symbol": sym, "company_name": f"{sym} Co", "close_price": 10.0,
            "change_pct": chg, "avg_volume_30d": vol}


def test_splits_gainers_losers_by_sign_and_ranks() -> None:
    rows = [_r("A", 3.0), _r("B", -1.5), _r("C", 5.0), _r("D", -4.0), _r("E", 0.0)]
    out = build_movers(rows, n=2)
    assert [g["symbol"] for g in out["gainers"]] == ["C", "A"]  # desc
    assert [l["symbol"] for l in out["losers"]] == ["D", "B"]  # most negative first
    assert out["breadth"] == {"advancers": 2, "decliners": 2, "unchanged": 1, "total": 5}
    assert out["change_available"] is True


def test_most_active_by_volume_desc() -> None:
    rows = [_r("A", 1.0, 100), _r("B", 1.0, 500), _r("C", 1.0, None)]
    out = build_movers(rows, n=10)
    assert [a["symbol"] for a in out["most_active"]] == ["B", "A"]  # C dropped (no volume)


def test_no_change_data_degrades_gracefully() -> None:
    rows = [_r("A", None, 100), _r("B", None, 200)]
    out = build_movers(rows)
    assert out["gainers"] == [] and out["losers"] == []
    assert out["change_available"] is False
    assert out["breadth"]["total"] == 0
    # Volume still ranks even without day-change.
    assert [a["symbol"] for a in out["most_active"]] == ["B", "A"]


def test_respects_top_n() -> None:
    rows = [_r(f"S{i}", float(i)) for i in range(1, 20)]
    out = build_movers(rows, n=5)
    assert len(out["gainers"]) == 5
