"""Dividend-consistency analytics (pure, DB-free, unit-tested).

Fills the Compass long-term ``dividend_consistency`` component from the per-year
``dividend_yield`` series already stored in ``metric_history`` (VCI RATIO_YEAR).
Ported in spirit from vnmarket-stock's dividends page, but sourced from the yearly
ratio series we already persist — no events scraper needed.

Research-only: this measures *income reliability*, not overall quality. A company
that reinvests instead of paying (e.g. a growth stock) scores low here by design;
the modest weight and neutral framing keep that from reading as a verdict.
"""
from __future__ import annotations

import statistics

# Average yield (%) that maps to a full-marks level sub-score.
_YIELD_FULL = 5.0


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def _recent_streak(paid: list[bool]) -> int:
    """Consecutive most-recent years with a dividend."""
    streak = 0
    for flag in reversed(paid):
        if flag:
            streak += 1
        else:
            break
    return streak


def dividend_stats(history: list[dict]) -> dict:
    """Summarize a per-year dividend-yield series.

    ``history``: list of ``{year, dividend_yield}`` (any order; yield in percent).
    Returns ``{"available": False}`` when no year carries a dividend_yield value.
    """
    pts = sorted(
        (
            (int(r["year"]), float(r["dividend_yield"]))
            for r in history
            if r.get("year") is not None and r.get("dividend_yield") is not None
        ),
    )
    if not pts:
        return {"available": False, "series": []}

    years = [y for y, _ in pts]
    yields = [v for _, v in pts]
    paid = [v > 0 for v in yields]
    n = len(yields)
    years_paid = sum(paid)
    pay_ratio = years_paid / n
    streak = _recent_streak(paid)
    avg_yield = round(statistics.mean(yields), 2)
    avg_paid_yield = round(
        statistics.mean([v for v in yields if v > 0]) if years_paid else 0.0, 2
    )

    level = _clamp(avg_yield / _YIELD_FULL * 100)
    score = round(
        pay_ratio * 100 * 0.6 + (streak / n) * 100 * 0.25 + level * 0.15, 1
    )

    return {
        "available": True,
        "series": [{"year": y, "dividend_yield": round(v, 2)} for y, v in pts],
        "years": years,
        "n": n,
        "years_paid": years_paid,
        "pay_ratio": round(pay_ratio, 2),
        "recent_streak": streak,
        "avg_yield": avg_yield,
        "avg_paid_yield": avg_paid_yield,
        "score": score,
    }


def dividend_explanation(stats: dict) -> list[str]:
    """Vietnamese, neutral bullet points describing dividend reliability."""
    if not stats.get("available"):
        return ["Chưa có dữ liệu tỷ suất cổ tức nhiều năm để đánh giá."]
    if stats["years_paid"] == 0:
        return [
            f"{stats['n']} năm gần đây không trả cổ tức tiền mặt (tỷ suất ~0%) — "
            "có thể do tái đầu tư; không phải tín hiệu tốt/xấu tự thân."
        ]
    out = [
        f"Trả cổ tức {stats['years_paid']}/{stats['n']} năm "
        f"(chuỗi gần nhất {stats['recent_streak']} năm liên tiếp).",
        f"Tỷ suất cổ tức TB {stats['avg_yield']:.1f}% "
        f"(TB các năm có trả {stats['avg_paid_yield']:.1f}%).",
    ]
    return out
