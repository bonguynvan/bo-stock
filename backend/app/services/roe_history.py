"""Real ROE-history analytics (pure functions, DB-free, unit-tested).

Turns the per-year ROE series (from ``metric_history``) into interpretable signals
for Compass and Valuation: level, consistency, trend, and a spike check that finally
replaces the EPS-growth proxy. Research-only — numbers + neutral framing, no verdict.
"""
from __future__ import annotations

import statistics

# ROE level that maps to a full-marks 100 on the level sub-score (≈ excellent).
_ROE_EXCELLENT = 25.0
# A year's ROE this far above the prior average counts as a "spike" to inspect.
_SPIKE_FACTOR = 1.5
# Trend classification band (percentage points of ROE change).
_TREND_BAND = 1.0


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def _trend(roes: list[float]) -> str:
    """rising / stable / falling from recent-vs-earlier average ROE."""
    if len(roes) < 2:
        return "stable"
    half = max(1, len(roes) // 2)
    earlier = statistics.mean(roes[:half])
    recent = statistics.mean(roes[-half:])
    delta = recent - earlier
    if delta > _TREND_BAND:
        return "rising"
    if delta < -_TREND_BAND:
        return "falling"
    return "stable"


def _consistency_score(roes: list[float]) -> float:
    """0-100: rewards all-positive ROE with low volatility."""
    positive_ratio = sum(1 for v in roes if v > 0) / len(roes)
    if len(roes) >= 2:
        mean = statistics.mean(roes)
        cv = statistics.pstdev(roes) / abs(mean) if mean else 5.0
        stability = _clamp(100 - cv * 100)
    else:
        stability = 60.0
    return round(positive_ratio * 100 * 0.6 + stability * 0.4, 1)


def roe_stats(history: list[dict]) -> dict:
    """Summarize a per-year ROE series.

    ``history``: list of ``{year, roe, ...}`` (any order; roe in percent). Returns a
    dict with ``available`` False when there's no usable ROE point.
    """
    pts = sorted(
        (
            (int(r["year"]), float(r["roe"]))
            for r in history
            if r.get("year") is not None and r.get("roe") is not None
        ),
    )
    if not pts:
        return {"available": False, "series": []}

    years = [y for y, _ in pts]
    roes = [v for _, v in pts]
    latest = roes[-1]
    prior = roes[:-1]
    avg_prior = round(statistics.mean(prior), 2) if prior else None
    avg_recent = round(statistics.mean(roes[-3:]), 2)

    is_spike = bool(avg_prior is not None and avg_prior > 0 and latest > _SPIKE_FACTOR * avg_prior)
    spike_factor = round(latest / avg_prior, 2) if avg_prior and avg_prior > 0 else None

    level_score = _clamp(avg_recent / _ROE_EXCELLENT * 100)
    consistency = _consistency_score(roes)
    trend = _trend(roes)
    trend_score = {"rising": 100.0, "stable": 60.0, "falling": 20.0}[trend]
    quality_score = round(level_score * 0.5 + consistency * 0.3 + trend_score * 0.2, 1)

    return {
        "available": True,
        "series": [{"year": y, "roe": round(v, 2)} for y, v in pts],
        "years": years,
        "latest": round(latest, 2),
        "avg_prior": avg_prior,
        "avg_recent": avg_recent,
        "trend": trend,
        "is_spike": is_spike,
        "spike_factor": spike_factor,
        "positive_years": sum(1 for v in roes if v > 0),
        "n": len(roes),
        "level_score": round(level_score, 1),
        "consistency_score": consistency,
        "quality_score": quality_score,
    }


def roe_explanation(stats: dict) -> list[str]:
    """Vietnamese, neutral bullet points describing the ROE history."""
    if not stats.get("available"):
        return ["Chưa có chuỗi ROE nhiều năm để đánh giá."]
    trend_vi = {"rising": "xu hướng tăng", "stable": "đi ngang", "falling": "xu hướng giảm"}
    out = [
        f"ROE {stats['n']} năm: mới nhất {stats['latest']:.1f}%, "
        f"TB 3 năm gần {stats['avg_recent']:.1f}% ({trend_vi[stats['trend']]}).",
        f"{stats['positive_years']}/{stats['n']} năm ROE dương "
        f"(độ ổn định {stats['consistency_score']:.0f}/100).",
    ]
    if stats["is_spike"]:
        out.append(
            f"ROE năm mới nhất cao bất thường ({stats['spike_factor']:.1f}× TB các năm trước) "
            "— nên xem kỹ nguồn lợi nhuận (có thể là khoản không lặp lại)."
        )
    return out
