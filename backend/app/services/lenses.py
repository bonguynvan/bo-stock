"""Investment "lenses" — criteria checklists per investing school (research-only).

Each lens (Graham value, Lynch GARP, Quality) is a set of transparent, published-metric
criteria. We report which criteria a stock MEETS — a descriptive checklist, never a
buy/sell verdict. Pure ``evaluate_lenses`` is unit-tested.

Criteria are adaptations of well-known heuristics for the metrics we have; they are a
research aid, not the schools' full methodologies.
"""
from __future__ import annotations

from typing import Callable

# A criterion returns (status, detail): status ∈ {"pass","fail","na"}; detail is the
# numeric value it looked at (or None when not available).
Criterion = tuple[str, Callable[[dict], tuple[str, float | None]]]


def _val(m: dict, key: str) -> float | None:
    v = m.get(key)
    return float(v) if isinstance(v, (int, float)) and not isinstance(v, bool) else None


def _threshold(key: str, op: str, thr: float) -> Callable[[dict], tuple[str, float | None]]:
    def f(m: dict) -> tuple[str, float | None]:
        v = _val(m, key)
        if v is None:
            return ("na", None)
        ok = v <= thr if op == "lte" else v >= thr if op == "gte" else v > thr if op == "gt" else False
        return ("pass" if ok else "fail", round(v, 2))

    return f


def _graham_number(m: dict) -> tuple[str, float | None]:
    pe, pb = _val(m, "pe"), _val(m, "pb")
    if pe is None or pb is None or pe <= 0 or pb <= 0:
        return ("na", None)  # undefined for loss-making / negative-book companies
    prod = pe * pb
    return ("pass" if prod <= 22.5 else "fail", round(prod, 1))


def _growth(m: dict) -> float | None:
    g = _val(m, "eps_growth")
    return g if g is not None else _val(m, "revenue_growth")


def _positive_growth(m: dict) -> tuple[str, float | None]:
    g = _growth(m)
    if g is None:
        return ("na", None)
    return ("pass" if g > 0 else "fail", round(g, 1))


def _peg(m: dict) -> tuple[str, float | None]:
    pe, g = _val(m, "pe"), _growth(m)
    if pe is None or pe <= 0 or g is None or g <= 0:
        return ("na", None)  # PEG is undefined for a negative P/E or non-positive growth
    peg = pe / g
    return ("pass" if peg <= 1 else "fail", round(peg, 2))


LENSES: tuple[dict, ...] = (
    {
        "key": "graham",
        "name": "Graham · Giá trị",
        "description": "Định giá thấp, đòn bẩy thấp, có cổ tức, thanh khoản tốt.",
        "criteria": [
            ("P/E ≤ 15", _threshold("pe", "lte", 15)),
            ("P/B ≤ 1.5", _threshold("pb", "lte", 1.5)),
            ("P/E × P/B ≤ 22.5 (Graham number)", _graham_number),
            ("Nợ/VCSH ≤ 1", _threshold("debt_equity", "lte", 1)),
            ("Thanh khoản hiện hành ≥ 1.5", _threshold("current_ratio", "gte", 1.5)),
            ("Có trả cổ tức (> 0%)", _threshold("dividend_yield", "gt", 0)),
        ],
    },
    {
        "key": "lynch",
        "name": "Lynch · GARP",
        "description": "Tăng trưởng ở mức giá hợp lý (PEG), doanh nghiệp tốt.",
        "criteria": [
            ("Tăng trưởng dương", _positive_growth),
            ("PEG ≤ 1", _peg),
            ("ROE ≥ 15%", _threshold("roe", "gte", 15)),
            ("Nợ/VCSH ≤ 1", _threshold("debt_equity", "lte", 1)),
        ],
    },
    {
        "key": "quality",
        "name": "Chất lượng",
        "description": "Sinh lời bền, biên lợi nhuận cao, đòn bẩy thấp, tăng trưởng.",
        "criteria": [
            ("ROE ≥ 15%", _threshold("roe", "gte", 15)),
            ("ROA ≥ 7%", _threshold("roa", "gte", 7)),
            ("Biên LN ròng ≥ 10%", _threshold("net_margin", "gte", 10)),
            ("Nợ/VCSH ≤ 0.5", _threshold("debt_equity", "lte", 0.5)),
            ("Tăng trưởng dương", _positive_growth),
        ],
    },
)


def evaluate_lenses(metrics: dict) -> list[dict]:
    """Evaluate every lens against a metrics dict → met/total + per-criterion status."""
    out: list[dict] = []
    for lens in LENSES:
        checks = []
        met = total = 0
        for label, fn in lens["criteria"]:
            status, detail = fn(metrics)
            checks.append({"label": label, "status": status, "detail": detail})
            if status in ("pass", "fail"):
                total += 1
                if status == "pass":
                    met += 1
        out.append(
            {
                "key": lens["key"],
                "name": lens["name"],
                "description": lens["description"],
                "met": met,
                "total": total,
                "criteria": checks,
            }
        )
    return out
