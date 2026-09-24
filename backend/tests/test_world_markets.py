"""Pure-parser tests for the world-markets (Yahoo) connector.

Network-free and DB-free — mirrors the ``test_vci.py`` parser-test style. Only the
pure ``parse_yahoo_chart`` mapper is exercised; the live HTTP fetch is not.
"""
from __future__ import annotations

from app.services.world_markets import WorldQuote, parse_yahoo_chart


def _chart(price: float | None, prev: float | None, currency: str = "USD") -> dict:
    """Build a minimal Yahoo v8 chart payload with the fields the parser reads."""
    return {
        "chart": {
            "result": [
                {
                    "meta": {
                        "symbol": "^GSPC",
                        "currency": currency,
                        "regularMarketPrice": price,
                        "chartPreviousClose": prev,
                    }
                }
            ],
            "error": None,
        }
    }


def test_parses_price_and_computes_change() -> None:
    q = parse_yahoo_chart(_chart(5500.0, 5450.0), symbol="^GSPC", name="S&P 500")

    assert isinstance(q, WorldQuote)
    assert q.symbol == "^GSPC"
    assert q.name == "S&P 500"
    assert q.price == 5500.0
    assert q.prev_close == 5450.0
    assert q.change == 50.0
    assert round(q.change_pct, 2) == 0.92
    assert q.currency == "USD"


def test_negative_change() -> None:
    q = parse_yahoo_chart(_chart(100.0, 125.0), symbol="^GSPC", name="X")
    assert q is not None
    assert q.change == -25.0
    assert q.change_pct == -20.0


def test_falls_back_to_previous_close_key() -> None:
    payload = {
        "chart": {
            "result": [
                {"meta": {"regularMarketPrice": 10.0, "previousClose": 8.0}}
            ],
            "error": None,
        }
    }
    q = parse_yahoo_chart(payload, symbol="BTC-USD", name="Bitcoin")
    assert q is not None
    assert q.prev_close == 8.0
    assert q.change == 2.0


def test_missing_price_returns_none() -> None:
    assert parse_yahoo_chart(_chart(None, 5450.0), symbol="^GSPC", name="X") is None


def test_missing_prev_close_leaves_change_none() -> None:
    q = parse_yahoo_chart(_chart(5500.0, None), symbol="^GSPC", name="X")
    assert q is not None
    assert q.price == 5500.0
    assert q.change is None
    assert q.change_pct is None


def test_yahoo_error_payload_returns_none() -> None:
    payload = {"chart": {"result": None, "error": {"code": "Not Found"}}}
    assert parse_yahoo_chart(payload, symbol="^BAD", name="X") is None


def test_empty_payload_returns_none() -> None:
    assert parse_yahoo_chart({}, symbol="^GSPC", name="X") is None
    assert parse_yahoo_chart({"chart": {"result": []}}, symbol="^GSPC", name="X") is None


def test_zero_prev_close_avoids_division_error() -> None:
    q = parse_yahoo_chart(_chart(100.0, 0.0), symbol="^GSPC", name="X")
    assert q is not None
    assert q.change == 100.0
    assert q.change_pct is None  # cannot compute % off a zero base
