"""Portfolio risk analytics — assemble a return series from holdings' price history.

Reuses ``portfolio.get_analysis`` for weights and ``stock_service.get_ohlc`` for close
series, then runs the pure ``risk`` math. Research-only, descriptive. Degrades to a note
when there isn't enough price history (OHLC may be unsynced / WAF-blocked).
"""
from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

from app.services import portfolio, risk, stock_service

_MAX_HOLDINGS = 12
_DAYS = 180
_MIN_BARS = 20  # per symbol
_MIN_COMMON = 21  # aligned sessions across symbols


async def get_portfolio_risk(session: AsyncSession, user_id: int | None = None) -> dict:
    analysis = await portfolio.get_analysis(session, user_id)
    priced = [
        h for h in analysis["holdings"] if h.get("market_value") and h.get("weight")
    ]
    if not priced:
        return {"available": False, "note": "Chưa có vị thế được định giá để tính rủi ro."}

    priced.sort(key=lambda h: h["weight"] or 0, reverse=True)
    priced = priced[:_MAX_HOLDINGS]

    bars_list = await asyncio.gather(
        *(stock_service.get_ohlc(h["symbol"], _DAYS) for h in priced)
    )
    closes: dict[str, dict[str, float]] = {}
    for h, bars in zip(priced, bars_list):
        series = {b["time"]: b["close"] for b in bars if b.get("close") is not None}
        if len(series) >= _MIN_BARS:
            closes[h["symbol"]] = series

    if not closes:
        return {"available": False, "note": "Chưa có dữ liệu giá lịch sử (cần đồng bộ OHLC)."}

    common = sorted(set.intersection(*(set(s) for s in closes.values())))
    if len(common) < _MIN_COMMON:
        return {"available": False, "note": "Không đủ phiên chung giữa các mã để tính rủi ro."}

    returns: dict[str, list[float]] = {}
    for sym, series in closes.items():
        returns[sym] = risk.daily_returns([series[d] for d in common])

    # Renormalize weights over the symbols that had usable price data.
    wsum = sum(h["weight"] for h in priced if h["symbol"] in closes)
    if not wsum:
        return {"available": False, "note": "Trọng số danh mục không hợp lệ."}
    weights = {h["symbol"]: h["weight"] / wsum for h in priced if h["symbol"] in closes}

    n = len(common) - 1
    port_returns = [sum(weights[s] * returns[s][i] for s in weights) for i in range(n)]
    port_prices = [1.0]
    for r in port_returns:
        port_prices.append(port_prices[-1] * (1 + r))

    return {
        "available": True,
        "note": "Rủi ro tính trên chuỗi giá lịch sử — số liệu mô tả, không phải khuyến nghị.",
        "symbols": list(weights.keys()),
        "metrics": {
            "days": len(common),
            "annual_volatility": risk.annualized_volatility(port_returns),
            "sharpe": risk.sharpe_ratio(port_returns),
            "max_drawdown": risk.max_drawdown(port_prices),
            "var_95": risk.historical_var(port_returns, 0.95),
        },
        "correlations": risk.correlation_matrix(returns),
    }
