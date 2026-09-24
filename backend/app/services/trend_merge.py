"""Merge multi-year trends from several analyzed BCTC reports into one series.

Each analyzed annual report carries a ``multi_year_trend`` covering ~2 years (the
report year + its comparative). Analyzing several years' reports and stitching them
yields a long, deduped series that Valuation (earnings quality, DCF) and Compass can
reason over. Pure + unit-tested — no DB.

Per (year, field), the value from the report whose *headline* year IS that year wins
(it's the audited primary source for that year); otherwise the most-recent report that
carries a non-null value is used. This respects restatements without dropping data.
"""
from __future__ import annotations

# Parallel numeric arrays in a multi_year_trend (indexed by ``years``).
FIELDS = (
    "revenue",
    "net_profit",
    "gross_margin_pct",
    "net_margin_pct",
    "roe_pct",
    "roa_pct",
    "total_debt",
    "equity",
    "operating_cashflow",
    "other_income",
)


def _primary_year(trend: dict) -> int:
    ys = [int(y) for y in (trend.get("years") or []) if str(y).isdigit()]
    return max(ys) if ys else 0


def _index(trend: dict) -> dict[str, dict]:
    """year(str) → {field: value} for one trend."""
    years = trend.get("years") or []
    out: dict[str, dict] = {}
    for i, y in enumerate(years):
        rec = {}
        for f in FIELDS:
            arr = trend.get(f) or []
            rec[f] = arr[i] if i < len(arr) else None
        out[str(y)] = rec
    return out


def merge_trends(trends: list[dict]) -> dict:
    """Merge ``multi_year_trend`` dicts → one long, deduped, year-sorted trend."""
    usable = [t for t in trends if t.get("years")]
    if not usable:
        return {}
    # Latest report first, so "most-recent non-null" falls out naturally.
    ordered = sorted(usable, key=_primary_year, reverse=True)
    indexed = [(_primary_year(t), _index(t)) for t in ordered]

    all_years = sorted(
        {y for _, idx in indexed for y in idx},
        key=lambda s: int(s) if str(s).isdigit() else 0,
    )
    merged: dict[str, list] = {f: [] for f in FIELDS}
    for y in all_years:
        for f in FIELDS:
            val = None
            # 1) the report whose headline year IS this year (audited source)
            for py, idx in indexed:
                if str(py) == y and y in idx and idx[y][f] is not None:
                    val = idx[y][f]
                    break
            # 2) else the most-recent report carrying a non-null value
            if val is None:
                for _, idx in indexed:
                    if y in idx and idx[y][f] is not None:
                        val = idx[y][f]
                        break
            merged[f].append(val)

    note = (
        f"Gộp từ {len(usable)} báo cáo BCTC ({all_years[0]}–{all_years[-1]})"
        if len(usable) > 1
        else (usable[0].get("note") or "")
    )
    return {"years": all_years, **merged, "note": note}
