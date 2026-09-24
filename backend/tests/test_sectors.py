"""Unit tests for the pure sector aggregation."""
from __future__ import annotations

from app.models import StockMetric
from app.services.sectors import build_sectors


def _m(**kw) -> StockMetric:
    return StockMetric(symbol=kw.pop("symbol", "X"), **kw)


def test_groups_by_industry_and_aggregates_medians() -> None:
    rows = [
        ("Tech", 5000, _m(pe=10, pb=2, roe=20, net_margin=15, change_pct=1.0)),
        ("Tech", 3000, _m(pe=20, pb=4, roe=30, net_margin=25, change_pct=-1.0)),
        ("Bank", 9000, _m(pe=8, pb=1.5, roe=18, net_margin=40, change_pct=2.0)),
    ]
    out = build_sectors(rows)
    assert [s["industry"] for s in out] == ["Bank", "Tech"]  # sorted by mcap desc (9000 > 8000)
    tech = next(s for s in out if s["industry"] == "Tech")
    assert tech["count"] == 2
    assert tech["total_market_cap"] == 8000
    assert tech["median_pe"] == 15.0  # median(10, 20)
    assert tech["median_roe"] == 25.0
    assert tech["avg_change_pct"] == 0.0  # mean(1, -1)


def test_skips_rows_without_industry() -> None:
    rows = [
        (None, 1000, _m(pe=10)),
        ("Tech", 2000, _m(pe=12)),
    ]
    out = build_sectors(rows)
    assert len(out) == 1 and out[0]["industry"] == "Tech"


def test_change_pct_null_when_unpopulated() -> None:
    rows = [("Tech", 1000, _m(pe=10, change_pct=None))]
    out = build_sectors(rows)
    assert out[0]["avg_change_pct"] is None
