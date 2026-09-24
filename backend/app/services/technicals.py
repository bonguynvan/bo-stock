"""Technical-indicator bundle for one symbol (research-only, descriptive numbers).

Assembles SMA/RSI/MACD/Bollinger/ATR/52w from OHLC bars using the pure ``indicators``
functions. No trade signals — just the values, for the user to interpret. Pure
``build_technicals`` is unit-tested; the router supplies the bars.
"""
from __future__ import annotations

from app.services import indicators


def _num(x: object) -> float | None:
    if isinstance(x, (int, float)):
        return float(x)
    return None


def build_technicals(bars: list[dict]) -> dict:
    """OHLC bars (ascending) → latest indicator values. Neutral/descriptive."""
    # Close-only indicators use the full close series.
    closes = [c for c in (_num(b.get("close")) for b in bars) if c is not None]
    if len(closes) < 2:
        return {"available": False, "bars_used": len(closes)}

    # ATR / 52-week need aligned high+low+close — only bars with all three present.
    highs: list[float] = []
    lows: list[float] = []
    ohlc_closes: list[float] = []
    for b in bars:
        hi, lo, cl = _num(b.get("high")), _num(b.get("low")), _num(b.get("close"))
        if hi is not None and lo is not None and cl is not None:
            highs.append(hi)
            lows.append(lo)
            ohlc_closes.append(cl)

    price = closes[-1]
    macd_line, signal, hist = indicators.macd(closes)
    upper, middle, lower = indicators.bollinger_bands(closes)
    w52h, w52l = indicators.week_52_range(highs, lows)

    return {
        "available": True,
        "bars_used": len(closes),
        "price": round(price, 2),
        "sma20": indicators.sma(closes, 20),
        "sma50": indicators.sma(closes, 50),
        "rsi14": indicators.rsi(closes, 14),
        "macd": {
            "line": round(macd_line, 3) if macd_line is not None else None,
            "signal": round(signal, 3) if signal is not None else None,
            "hist": round(hist, 3) if hist is not None else None,
        },
        "bollinger": {
            "upper": upper,
            "middle": middle,
            "lower": lower,
            "percent_b": indicators.percent_b(price, upper, lower),
            "width": (
                indicators.band_width(upper, middle, lower)
                if upper is not None and middle is not None and lower is not None
                else None
            ),
        },
        "atr14": indicators.atr(highs, lows, ohlc_closes, 14),
        "week52": {
            "high": w52h,
            "low": w52l,
            "position": indicators.position_in_range(price, w52h, w52l),
        },
    }
