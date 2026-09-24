"""Pure parser tests for the foreign-flow market summary."""
from __future__ import annotations

from app.services.foreign_flow import parse_foreign_summary


def _payload(tr: dict | None, date: str = "31/07/2026", index: str = "VNINDEX") -> dict:
    data: dict = {"DateIndex": date, "Index": index}
    if tr is not None:
        data["TradingReport"] = tr
    return {"Data": data}


def test_parses_market_summary_and_net() -> None:
    out = parse_foreign_summary(_payload({
        "klMua": 78186337, "klBan": 77288464, "gtMua": 2882.39, "gtBan": 2203.61,
        "percentBuyVal": "14.16 %", "percentSellVal": "10.83 %",
    }))
    assert out["available"] is True
    assert out["date"] == "31/07/2026" and out["index"] == "VNINDEX"
    assert out["buy_val"] == 2882.39 and out["sell_val"] == 2203.61
    assert round(out["net_val"], 2) == 678.78  # net foreign buy
    assert out["pct_buy_val"] == 14.16 and out["pct_sell_val"] == 10.83


def test_net_none_when_values_missing() -> None:
    out = parse_foreign_summary(_payload({"gtMua": 100}))  # no gtBan
    assert out["available"] is True
    assert out["net_val"] is None


def test_bad_payloads() -> None:
    assert parse_foreign_summary(None)["available"] is False
    assert parse_foreign_summary({})["available"] is False
    assert parse_foreign_summary(_payload(None))["available"] is False  # no TradingReport
