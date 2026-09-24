"""Realistic sample data so the full pipeline can be verified without TCBS.

Values are representative (not live) for the five test tickers (VCB, FPT, MWG, VNM, HPG)
plus a few extras, enough to exercise filtering, sorting and the detail panel.
"""
from __future__ import annotations

from datetime import date, timedelta

from app.services.providers.base import FetchedMetrics, FetchedStock

_REPORT = date(2024, 3, 1)

# symbol: (company, exchange, industry, market_cap_bn)
_STOCKS: dict[str, tuple[str, str, str, int]] = {
    "VCB": ("Ngân hàng TMCP Ngoại thương VN", "HOSE", "Ngân hàng", 342105),
    "FPT": ("CTCP FPT", "HOSE", "Công nghệ thông tin", 154230),
    "HPG": ("CTCP Tập đoàn Hòa Phát", "HOSE", "Thép & Kim loại", 164200),
    "MWG": ("CTCP Đầu tư Thế Giới Di Động", "HOSE", "Bán lẻ", 94300),
    "VNM": ("CTCP Sữa Việt Nam", "HOSE", "Hàng tiêu dùng", 142800),
    "ACB": ("Ngân hàng TMCP Á Châu", "HOSE", "Ngân hàng", 98500),
    "VHM": ("CTCP Vinhomes", "HOSE", "Bất động sản", 179400),
    "PNJ": ("CTCP Vàng bạc Đá quý Phú Nhuận", "HOSE", "Bán lẻ", 31200),
}

# symbol: dict of metric overrides
_METRICS: dict[str, dict] = {
    "VCB": dict(pe=13.4, pb=2.1, roe=22.8, roa=1.8, net_margin=34.2, revenue_growth=11.2,
               eps_growth=9.4, debt_equity=0.0, current_ratio=1.1, dividend_yield=1.2,
               close_price=92400, change_pct=1.25, avg_volume_30d=2_100_000,
               eps_trailing=6120, charter_capital=55891, cash=480_000),
    "FPT": dict(pe=18.5, pb=4.2, roe=28.5, roa=12.6, net_margin=16.4, revenue_growth=21.0,
               eps_growth=19.8, debt_equity=0.6, current_ratio=1.3, dividend_yield=3.1,
               close_price=134200, change_pct=2.40, avg_volume_30d=3_400_000,
               eps_trailing=6842, charter_capital=12699, cash=26540, profit_growth=19.8),
    "HPG": dict(pe=11.2, pb=1.4, roe=12.5, roa=6.8, net_margin=8.2, revenue_growth=-4.0,
               eps_growth=-12.0, debt_equity=0.7, current_ratio=1.2, dividend_yield=0.0,
               close_price=28150, change_pct=-0.45, avg_volume_30d=22_000_000,
               eps_trailing=2510, charter_capital=58148, cash=34000),
    "MWG": dict(pe=24.5, pb=3.5, roe=14.1, roa=4.2, net_margin=2.8, revenue_growth=9.5,
               eps_growth=5.0, debt_equity=1.1, current_ratio=1.0, dividend_yield=1.5,
               close_price=64500, change_pct=0.80, avg_volume_30d=6_800_000,
               eps_trailing=2630, charter_capital=14622, cash=15300),
    "VNM": dict(pe=16.8, pb=3.9, roe=24.0, roa=17.5, net_margin=14.8, revenue_growth=3.5,
               eps_growth=4.2, debt_equity=0.2, current_ratio=2.1, dividend_yield=7.2,
               close_price=68900, change_pct=0.30, avg_volume_30d=3_900_000,
               eps_trailing=4100, charter_capital=20899, cash=22000),
    "ACB": dict(pe=6.8, pb=1.5, roe=24.5, roa=2.4, net_margin=42.0, revenue_growth=15.0,
               eps_growth=17.0, debt_equity=0.0, current_ratio=1.1, dividend_yield=2.0,
               close_price=24800, change_pct=0.61, avg_volume_30d=9_200_000,
               eps_trailing=3650, charter_capital=38840, cash=120000),
    "VHM": dict(pe=4.8, pb=0.8, roe=16.2, roa=8.1, net_margin=22.1, revenue_growth=-8.0,
               eps_growth=-15.0, debt_equity=0.5, current_ratio=1.4, dividend_yield=0.0,
               close_price=41200, change_pct=0.0, avg_volume_30d=11_500_000,
               eps_trailing=8580, charter_capital=43544, cash=18000),
    "PNJ": dict(pe=15.1, pb=2.8, roe=21.0, roa=12.0, net_margin=5.6, revenue_growth=12.5,
               eps_growth=10.2, debt_equity=0.3, current_ratio=2.4, dividend_yield=2.2,
               close_price=98500, change_pct=1.10, avg_volume_30d=1_400_000,
               eps_trailing=6520, charter_capital=3383, cash=2100),
}

_DETAIL_EXTRAS: dict[str, dict] = {
    "FPT": dict(
        quarterly_profit=[
            {"period": "Q2 '23", "value": 1820},
            {"period": "Q3 '23", "value": 2010},
            {"period": "Q4 '23", "value": 2240},
            {"period": "Q1 '24", "value": 2680},
        ],
        ownership=[
            {"name": "Tổng công ty SCIC", "pct": 5.75},
            {"name": "Trương Gia Bình (Chủ tịch)", "pct": 6.08},
            {"name": "Khối ngoại (FII)", "pct": 49.00},
        ],
        tags=["VN30"],
    ),
}


def _synth_ohlc(base: float, n: int) -> list[dict]:
    """Deterministic daily bars around ``base`` (no randomness → stable tests)."""
    out: list[dict] = []
    prev = base
    start = date(2024, 1, 1)
    for i in range(n):
        delta = ((i * 37) % 11 - 5) / 100.0  # pseudo-wiggle in [-0.05, 0.05]
        close = round(prev * (1 + delta))
        high = round(max(prev, close) * 1.01)
        low = round(min(prev, close) * 0.99)
        out.append(
            {
                "time": (start + timedelta(days=i)).strftime("%Y-%m-%d"),
                "open": round(prev),
                "high": high,
                "low": low,
                "close": close,
                "volume": 100000 + i * 1000,
            }
        )
        prev = close
    return out


class FixtureProvider:
    name = "fixtures"

    async def fetch_stock_list(self) -> list[FetchedStock]:
        return [
            FetchedStock(symbol=s, company_name=c, exchange=ex, industry=ind, market_cap=mc)
            for s, (c, ex, ind, mc) in _STOCKS.items()
        ]

    async def fetch_stock_metrics(self, symbol: str) -> FetchedMetrics:
        symbol = symbol.upper()
        base = _METRICS.get(symbol, {})
        extras = _DETAIL_EXTRAS.get(symbol, {})
        return FetchedMetrics(
            symbol=symbol,
            report_date=_REPORT,
            period="quarterly",
            quarterly_profit=extras.get("quarterly_profit", []),
            ownership=extras.get("ownership", []),
            tags=extras.get("tags", []),
            **base,
        )

    async def fetch_ownership(self, symbol: str) -> list[dict]:
        return _DETAIL_EXTRAS.get(symbol.upper(), {}).get("ownership", [])

    async def fetch_ohlc(self, symbol: str, count: int = 120) -> list[dict]:
        base = _METRICS.get(symbol.upper(), {}).get("close_price") or 20000
        return _synth_ohlc(float(base), min(count, 60))

    async def fetch_fundamentals(self, symbol: str) -> dict:
        extras = _DETAIL_EXTRAS.get(symbol.upper(), {})
        metrics = _METRICS.get(symbol.upper(), {})
        return {
            "quarterly_profit": extras.get("quarterly_profit", []),
            "profit_growth": metrics.get("profit_growth"),
            "charter_capital": metrics.get("charter_capital"),
            "cash": metrics.get("cash"),
        }
