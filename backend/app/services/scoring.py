"""Quant scoring — pure functions, no I/O so they are trivially testable.

Produces a 0-100 composite score and a letter grade from fundamental metrics.
The weighting is intentionally simple and transparent (Phase 1); it favours
profitability and growth, penalises rich valuation and leverage.
"""
from __future__ import annotations

from dataclasses import dataclass

# Grade thresholds (inclusive lower bounds), highest first.
_GRADE_BANDS: tuple[tuple[float, str], ...] = (
    (90, "A++"),
    (80, "A+"),
    (70, "B++"),
    (60, "B"),
    (45, "C+"),
    (0, "C"),
)


@dataclass(frozen=True)
class MetricInputs:
    roe: float | None = None
    roa: float | None = None
    net_margin: float | None = None
    revenue_growth: float | None = None
    eps_growth: float | None = None
    pe: float | None = None
    pb: float | None = None
    debt_equity: float | None = None


def _clamp(value: float, low: float = 0.0, high: float = 100.0) -> float:
    return max(low, min(high, value))


def _scale(value: float | None, lo: float, hi: float) -> float | None:
    """Linear-scale ``value`` from [lo, hi] onto [0, 100]; None passes through."""
    if value is None:
        return None
    if hi == lo:
        return 50.0
    return _clamp((value - lo) / (hi - lo) * 100.0)


def _scale_inverse(value: float | None, best: float, worst: float) -> float | None:
    """Lower is better (e.g. P/E). ``best`` scores 100, ``worst`` scores 0."""
    if value is None:
        return None
    if value <= 0:  # negative/zero earnings or book → not attractive
        return 0.0
    if worst == best:
        return 50.0
    return _clamp((worst - value) / (worst - best) * 100.0)


# (component score, weight)
def compute_quant_score(m: MetricInputs) -> float:
    components: list[tuple[float | None, float]] = [
        (_scale(m.roe, 0, 30), 0.25),
        (_scale(m.roa, 0, 15), 0.12),
        (_scale(m.net_margin, 0, 30), 0.13),
        (_scale(m.revenue_growth, -10, 40), 0.15),
        (_scale(m.eps_growth, -10, 40), 0.10),
        (_scale_inverse(m.pe, best=5, worst=30), 0.10),
        (_scale_inverse(m.pb, best=0.5, worst=5), 0.08),
        (_scale_inverse(m.debt_equity, best=0.0, worst=2.0), 0.07),
    ]
    present = [(s, w) for s, w in components if s is not None]
    if not present:
        return 0.0
    total_weight = sum(w for _, w in present)
    score = sum(s * w for s, w in present) / total_weight
    return round(_clamp(score), 1)


def score_to_grade(score: float | None) -> str | None:
    if score is None:
        return None
    for lower, grade in _GRADE_BANDS:
        if score >= lower:
            return grade
    return "C"
