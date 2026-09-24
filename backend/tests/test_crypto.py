"""Pure-parser tests for the crypto (CoinGecko) connector — network/DB-free."""
from __future__ import annotations

from app.services.crypto import CryptoQuote, parse_coingecko_markets


def _row(**over: object) -> dict:
    base = {
        "id": "bitcoin",
        "symbol": "btc",
        "name": "Bitcoin",
        "current_price": 60000.0,
        "market_cap": 1_200_000_000_000,
        "price_change_percentage_24h": -1.64,
    }
    base.update(over)
    return base


def test_parses_rows_in_order() -> None:
    out = parse_coingecko_markets([_row(), _row(id="ethereum", symbol="eth", name="Ethereum", current_price=3200.0)])
    assert [q.symbol for q in out] == ["BTC", "ETH"]
    assert isinstance(out[0], CryptoQuote)
    assert out[0].name == "Bitcoin"
    assert out[0].price == 60000.0
    assert out[0].change_pct == -1.64
    assert out[0].market_cap == 1_200_000_000_000


def test_skips_rows_without_price() -> None:
    out = parse_coingecko_markets([_row(current_price=None), _row(id="x", symbol="x")])
    assert len(out) == 1
    assert out[0].symbol == "X"


def test_missing_change_is_none_not_zero() -> None:
    out = parse_coingecko_markets([_row(price_change_percentage_24h=None)])
    assert out[0].change_pct is None


def test_non_list_payload_returns_empty() -> None:
    assert parse_coingecko_markets({"error": "rate limited"}) == []
    assert parse_coingecko_markets(None) == []
