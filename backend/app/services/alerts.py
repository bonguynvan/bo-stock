"""Watchlist alert rules — normalize + evaluate threshold flags (research-only).

A rule fires a descriptive FLAG when a symbol's metric crosses a threshold — never an
order or advice. Pure ``normalize_rules`` / ``evaluate_rules`` are unit-tested; the
router persists the list (single-row, like the dashboard layout) and evaluates against
the latest metrics.
"""
from __future__ import annotations

# Metric keys that can be alerted on (subset of StockResult numeric fields).
ALLOWED_METRICS: tuple[str, ...] = (
    "pe", "pb", "roe", "roa", "net_margin", "revenue_growth", "debt_equity",
    "current_ratio", "dividend_yield", "close_price", "change_pct", "market_cap",
    "quant_score",
)
_METRICS = set(ALLOWED_METRICS)
OPS: dict[str, str] = {"lt": "<", "lte": "≤", "gt": ">", "gte": "≥"}


def _num(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if isinstance(value, str):
        try:
            return float(value.strip())
        except ValueError:
            return None
    return None


def normalize_rules(raw: object) -> list[dict]:
    """Keep only well-formed rules; assign stable 1-based ids. Order preserved."""
    if not isinstance(raw, list):
        return []
    out: list[dict] = []
    for item in raw:
        if not isinstance(item, dict):
            continue
        symbol = str(item.get("symbol") or "").strip().upper()
        metric = str(item.get("metric") or "").strip()
        op = str(item.get("op") or "").strip()
        value = _num(item.get("value"))
        if not symbol or metric not in _METRICS or op not in OPS or value is None:
            continue
        out.append({
            "id": len(out) + 1,
            "symbol": symbol,
            "metric": metric,
            "op": op,
            "value": value,
            "note": str(item.get("note") or "").strip(),
        })
    return out


def _cmp(op: str, a: float, b: float) -> bool:
    if op == "lt":
        return a < b
    if op == "lte":
        return a <= b
    if op == "gt":
        return a > b
    if op == "gte":
        return a >= b
    return False


def evaluate_rules(rules: list[dict], values_by_symbol: dict[str, dict]) -> list[dict]:
    """Return the rules that currently fire, each with the metric's current value.

    ``values_by_symbol`` = {SYMBOL: {metric: value}}. A rule whose symbol/metric has no
    current value is skipped (can't evaluate), never counted as fired.
    """
    fired: list[dict] = []
    for r in rules:
        current = _num((values_by_symbol.get(r["symbol"]) or {}).get(r["metric"]))
        if current is None:
            continue
        if _cmp(r["op"], current, r["value"]):
            fired.append({**r, "current": round(current, 4)})
    return fired
