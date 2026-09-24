"""Algorithmic screening models — Beneish M-Score, Altman Z-Score, Piotroski F-Score.

PURE MATH. No AI, no I/O. Each function takes explicit numeric inputs for two
consecutive periods and returns the score + per-variable transparency. Missing
inputs are reported as None (never fabricated) and the count of variables actually
used is surfaced, per the "N/8 biến" transparency requirement.

These are statistical SCREENING tools, not proof of fraud — a high score means
"look closer", not "guilty". Callers must present them with that disclaimer.
"""
from __future__ import annotations

from dataclasses import dataclass, field

# --- Beneish (1999) original coefficients ---
_B = {
    "const": -4.84, "DSRI": 0.920, "GMI": 0.528, "AQI": 0.404, "SGI": 0.892,
    "DEPI": 0.115, "SGAI": -0.172, "TATA": 4.679, "LVGI": -0.327,
}
BENEISH_HIGH = -1.78
BENEISH_MED = -2.22
BENEISH_MIN_VARS = 6  # below this, flag insufficient_data (don't trust the threshold)


def _ratio(num: float | None, den: float | None) -> float | None:
    if num is None or den is None or den == 0:
        return None
    return num / den


@dataclass
class BeneishResult:
    score: float | None
    variables: dict[str, float | None]
    variables_used: int
    flag: str  # high_risk | medium_risk | low_risk | insufficient_data
    contributions: dict[str, float] = field(default_factory=dict)


def calculate_beneish(cur: dict, prior: dict) -> BeneishResult:
    """Beneish M-Score from two periods. Each period dict may contain:
    revenue, receivables, gross_margin (fraction or %), current_assets, ppe,
    securities, total_assets, depreciation, sga, current_liabilities,
    long_term_debt, net_income, operating_cashflow. Absent keys → that variable
    is None and dropped from the score (with variables_used reduced)."""
    v: dict[str, float | None] = {}

    # DSRI = (AR_t/Rev_t) / (AR_{t-1}/Rev_{t-1})
    v["DSRI"] = _ratio(
        _ratio(cur.get("receivables"), cur.get("revenue")),
        _ratio(prior.get("receivables"), prior.get("revenue")),
    )
    # GMI = GM_{t-1} / GM_t
    v["GMI"] = _ratio(prior.get("gross_margin"), cur.get("gross_margin"))
    # AQI = [1 - (CA+PPE+Sec)/TA]_t / [...]_{t-1}
    def _asset_quality(p: dict) -> float | None:
        ta = p.get("total_assets")
        parts = [p.get("current_assets"), p.get("ppe"), p.get("securities")]
        if ta in (None, 0) or any(x is None for x in parts):
            return None
        return 1 - (sum(parts) / ta)
    v["AQI"] = _ratio(_asset_quality(cur), _asset_quality(prior))
    # SGI = Rev_t / Rev_{t-1}
    v["SGI"] = _ratio(cur.get("revenue"), prior.get("revenue"))
    # DEPI = [Dep/(Dep+PPE)]_{t-1} / [Dep/(Dep+PPE)]_t
    def _dep_rate(p: dict) -> float | None:
        d, ppe = p.get("depreciation"), p.get("ppe")
        if d is None or ppe is None or (d + ppe) == 0:
            return None
        return d / (d + ppe)
    v["DEPI"] = _ratio(_dep_rate(prior), _dep_rate(cur))
    # SGAI = (SGA_t/Rev_t) / (SGA_{t-1}/Rev_{t-1})
    v["SGAI"] = _ratio(
        _ratio(cur.get("sga"), cur.get("revenue")),
        _ratio(prior.get("sga"), prior.get("revenue")),
    )
    # TATA = (NetIncome - OCF) / TotalAssets  — the highest-weight variable.
    ni, ocf, ta = cur.get("net_income"), cur.get("operating_cashflow"), cur.get("total_assets")
    v["TATA"] = None if (ni is None or ocf is None or ta in (None, 0)) else (ni - ocf) / ta
    # LVGI = [(CL+LTD)/TA]_t / [...]_{t-1}
    def _leverage(p: dict) -> float | None:
        ta = p.get("total_assets")
        cl, ltd = p.get("current_liabilities"), p.get("long_term_debt")
        if ta in (None, 0) or cl is None or ltd is None:
            return None
        return (cl + ltd) / ta
    v["LVGI"] = _ratio(_leverage(cur), _leverage(prior))

    contributions: dict[str, float] = {}
    total = _B["const"]
    used = 0
    for name, val in v.items():
        if val is None:
            continue
        term = _B[name] * val
        contributions[name] = round(term, 4)
        total += term
        used += 1

    # <6/8 variables → the score can't be trusted against the calibrated threshold
    # (learned: a 3/8 M-Score misleads even when TATA alone is right).
    if used < BENEISH_MIN_VARS:
        return BeneishResult(round(total, 3) if used else None, v, used, "insufficient_data", contributions)
    score = round(total, 3)
    flag = (
        "high_risk" if score > BENEISH_HIGH
        else "medium_risk" if score > BENEISH_MED
        else "low_risk"
    )
    return BeneishResult(score, v, used, flag, contributions)


# --- Altman Z-Score (1968 original, public manufacturers) ---
ALTMAN_SAFE = 2.99
ALTMAN_DISTRESS = 1.81
_FIN_SECTORS = ("ngân hàng", "bảo hiểm", "chứng khoán", "bank", "insurance", "securities")


@dataclass
class AltmanResult:
    score: float | None
    zone: str  # safe | grey | distress | not_applicable | insufficient_data
    components: dict[str, float | None] = field(default_factory=dict)


def calculate_altman(p: dict, sector: str | None = None) -> AltmanResult:
    """Z = 1.2A + 1.4B + 3.3C + 0.6D + 1.0E. Financials are excluded (different
    balance-sheet structure). Requires the full component set — no partial Z."""
    if sector and any(s in sector.lower() for s in _FIN_SECTORS):
        return AltmanResult(None, "not_applicable")
    ta = p.get("total_assets")
    comps = {
        "A": _ratio(p.get("working_capital"), ta),
        "B": _ratio(p.get("retained_earnings"), ta),
        "C": _ratio(p.get("ebit"), ta),
        "D": _ratio(p.get("market_cap"), p.get("total_liabilities")),
        "E": _ratio(p.get("revenue"), ta),
    }
    if any(c is None for c in comps.values()):
        return AltmanResult(None, "insufficient_data", comps)
    z = round(1.2 * comps["A"] + 1.4 * comps["B"] + 3.3 * comps["C"]
              + 0.6 * comps["D"] + 1.0 * comps["E"], 3)
    zone = "safe" if z > ALTMAN_SAFE else "distress" if z < ALTMAN_DISTRESS else "grey"
    return AltmanResult(z, zone, comps)


# --- Altman Z''-Score (1995, emerging markets / non-manufacturers) ---
# Drops the sales/assets term, uses BOOK equity (not market cap), recalibrated.
ALTMAN_EM_SAFE = 2.6
ALTMAN_EM_DISTRESS = 1.1


def calculate_altman_emerging(p: dict, sector: str | None = None) -> AltmanResult:
    """Z'' = 3.25 + 6.56A + 3.26B + 6.72C + 1.05D, D = book equity / total liabilities.
    Better fit for emerging markets like VN (the 1968 Z overstates distress here)."""
    if sector and any(s in sector.lower() for s in _FIN_SECTORS):
        return AltmanResult(None, "not_applicable")
    ta, tl = p.get("total_assets"), p.get("total_liabilities")
    book_equity = (ta - tl) if (ta is not None and tl is not None) else None
    comps = {
        "A": _ratio(p.get("working_capital"), ta),
        "B": _ratio(p.get("retained_earnings"), ta),
        "C": _ratio(p.get("ebit"), ta),
        "D": _ratio(book_equity, tl),
    }
    if any(c is None for c in comps.values()):
        return AltmanResult(None, "insufficient_data", comps)
    z = round(3.25 + 6.56 * comps["A"] + 3.26 * comps["B"] + 6.72 * comps["C"]
              + 1.05 * comps["D"], 3)
    zone = "safe" if z > ALTMAN_EM_SAFE else "distress" if z < ALTMAN_EM_DISTRESS else "grey"
    return AltmanResult(z, zone, comps)


# --- Piotroski F-Score (9 binary criteria) ---
@dataclass
class PiotroskiResult:
    score: int
    max_score: int  # how many criteria had data
    criteria: list[dict]


def calculate_piotroski(cur: dict, prior: dict) -> PiotroskiResult:
    """9 binary tests; a criterion with missing data is marked passed=None and
    excluded from max_score (so score/max_score stays honest)."""
    def gt(a, b):
        return None if a is None or b is None else a > b

    roa_c, roa_p = cur.get("roa"), prior.get("roa")
    ocf_c = cur.get("operating_cashflow")
    ni_c = cur.get("net_income")
    ta_c = cur.get("total_assets")
    ta_p = prior.get("total_assets")
    tests = [
        ("ROA dương", gt(roa_c, 0), roa_c),
        ("Dòng tiền HĐKD dương", gt(ocf_c, 0), ocf_c),
        ("ROA cải thiện", gt(roa_c, roa_p), (roa_c, roa_p)),
        ("OCF > LNST (chất lượng LN)", gt(ocf_c, ni_c), (ocf_c, ni_c)),
        ("Đòn bẩy dài hạn giảm",
         gt(_ratio(prior.get("long_term_debt"), ta_p), _ratio(cur.get("long_term_debt"), ta_c)),
         None),
        ("Thanh khoản (current ratio) tăng",
         gt(cur.get("current_ratio"), prior.get("current_ratio")), None),
        ("Không phát hành pha loãng",
         (None if cur.get("shares") is None or prior.get("shares") is None
          else cur["shares"] <= prior["shares"]), None),
        ("Biên gộp tăng", gt(cur.get("gross_margin"), prior.get("gross_margin")), None),
        ("Vòng quay tài sản tăng",
         gt(_ratio(cur.get("revenue"), ta_c), _ratio(prior.get("revenue"), ta_p)), None),
    ]
    criteria = []
    score = maxs = 0
    for name, passed, val in tests:
        criteria.append({"name": name, "passed": passed, "value": val})
        if passed is not None:
            maxs += 1
            if passed:
                score += 1
    return PiotroskiResult(score, maxs, criteria)
