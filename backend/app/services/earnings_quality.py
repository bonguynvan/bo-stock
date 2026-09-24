"""Quality of Earnings (QoE) — is reported profit backed by real cash?

PURE MATH. No AI, no I/O. Takes the same two-period input dicts as the fraud models
(see ``fraud_scan._period``) and returns a 0-100 quality score (higher = better) plus
per-component transparency. Missing inputs drop that component (never fabricated) and
``components_used`` is surfaced, mirroring the "N/8 biến" honesty of the Beneish model.

This is DISTINCT from the fraud/health scores:
  - Beneish measures *manipulation likelihood*; Piotroski measures *general health*.
  - QoE isolates one axis: how well earnings convert to cash and how conservative the
    revenue recognition looks. Low QoE ≠ fraud — it flags earnings that lean on accruals.

Four components (each scored 0-100, higher = better), literature-anchored but the exact
score bands are heuristic (documented inline), same status as the Beneish thresholds:
  1. accruals        — Sloan accrual ratio (NI-OCF)/avg-assets; low/negative is best.
  2. cash_conversion — OCF / net income; ≥1 means profit is fully cash-backed.
  3. receivables     — revenue growth vs receivables growth; receivables outpacing sales
                        is an aggressive-recognition red flag (the DSRI intuition).
  4. margin_trend    — gross-margin change; rising/stable margin is higher quality.
"""
from __future__ import annotations

from dataclasses import dataclass, field

QOE_STRONG = 70.0
QOE_ADEQUATE = 45.0
QOE_MIN_COMPONENTS = 2  # below this the composite is not trustworthy


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


@dataclass
class EarningsQualityResult:
    score: float | None  # 0-100 composite (higher = better), None if insufficient
    flag: str  # strong | adequate | weak | insufficient_data
    components: dict[str, dict] = field(default_factory=dict)  # name -> {value, sub_score}
    components_used: int = 0


def _accruals(cur: dict, prior: dict) -> tuple[float, float] | None:
    ni, ocf = cur.get("net_income"), cur.get("operating_cashflow")
    ta_c, ta_p = cur.get("total_assets"), prior.get("total_assets")
    if ni is None or ocf is None or ta_c is None or ta_p is None:
        return None
    avg_ta = (ta_c + ta_p) / 2
    if avg_ta == 0:
        return None
    ratio = (ni - ocf) / avg_ta
    # ratio ≤ -0.04 → 100 (cash exceeds earnings); 0 → 80; +0.16 → 0.
    return round(ratio, 4), _clamp(80 - ratio * 500)


def _cash_conversion(cur: dict) -> tuple[float, float] | None:
    ni, ocf = cur.get("net_income"), cur.get("operating_cashflow")
    if ni is None or ocf is None or ni <= 0:  # cc is meaningless when NI ≤ 0
        return None
    cc = ocf / ni
    # cc ≥ 1.25 → 100; cc = 1.0 → 80; cc ≤ 0 → 0.
    return round(cc, 3), _clamp(cc / 1.25 * 100)


def _receivables(cur: dict, prior: dict) -> tuple[float, float] | None:
    rev_c, rev_p = cur.get("revenue"), prior.get("revenue")
    rec_c, rec_p = cur.get("receivables"), prior.get("receivables")
    if None in (rev_c, rev_p, rec_c, rec_p) or rev_p == 0 or rec_p == 0:
        return None
    diff = (rev_c / rev_p - 1) - (rec_c / rec_p - 1)  # revenue growth minus receivables growth
    # receivables not outpacing sales (diff ≥ 0) → 100; diff = -0.5 → 0.
    return round(diff, 4), _clamp(100 + diff * 200)


def _margin_trend(cur: dict, prior: dict) -> tuple[float, float] | None:
    gm_c, gm_p = cur.get("gross_margin"), prior.get("gross_margin")
    if gm_c is None or gm_p is None:
        return None
    delta = gm_c - gm_p
    # flat margin → 70; +3pp → 100; -7pp → 0.
    return round(delta, 4), _clamp(70 + delta * 1000)


def calculate_earnings_quality(cur: dict, prior: dict) -> EarningsQualityResult:
    """Composite QoE (0-100) from two consecutive periods. See module docstring."""
    parts = {
        "accruals": _accruals(cur, prior),
        "cash_conversion": _cash_conversion(cur),
        "receivables": _receivables(cur, prior),
        "margin_trend": _margin_trend(cur, prior),
    }
    components: dict[str, dict] = {}
    subs: list[float] = []
    for name, res in parts.items():
        if res is None:
            continue
        value, sub = res
        components[name] = {"value": value, "sub_score": round(sub, 1)}
        subs.append(sub)

    used = len(subs)
    if used < QOE_MIN_COMPONENTS:
        return EarningsQualityResult(None, "insufficient_data", components, used)
    score = round(sum(subs) / used, 1)
    flag = "strong" if score >= QOE_STRONG else "adequate" if score >= QOE_ADEQUATE else "weak"
    return EarningsQualityResult(score, flag, components, used)
