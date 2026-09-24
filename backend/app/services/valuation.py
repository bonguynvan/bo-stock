"""Stock valuation (research-only): PE×EPS, PB×BVPS, Graham, simplified DCF.

Earnings-quality FIRST: periods whose profit looks abnormal (one-off other income,
profit diverging from operating cash flow, a non-trend EPS spike) are flagged and
excluded from the averages — so an inflated year (the SPH land-rent-reversal case)
does not skew fair value. The series comes from the latest analyzed BCTC's
multi_year_trend; shares are derived as market_cap / price. Pure functions below are
unit-tested without a DB.

NOT investment advice — numbers + neutral interpretation only.
"""
from __future__ import annotations

import math
import statistics

from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import MetricHistory, Stock, StockMetric
from app.models.document import Document
from app.services import roe_history, trend_merge

MOS = 0.75  # margin of safety applied to multiples-based fair value


def derive_shares(market_cap_billion: float | None, close_price: float | None) -> float | None:
    """Shares outstanding ≈ market cap (tỷ VND) / price (VND)."""
    if not market_cap_billion or not close_price:
        return None
    return market_cap_billion * 1e9 / close_price


def _per_share(values_billion: list[float | None], shares: float) -> list[float | None]:
    return [(v * 1e9 / shares if v is not None else None) for v in values_billion]


def detect_outliers(
    years: list[str],
    eps: list[float | None],
    net_profit: list[float | None],
    ocf: list[float | None],
    other_income: list[float | None],
) -> list[dict]:
    """Flag abnormal periods (one reason is enough). Does not drop anything."""
    n = len(years)

    def at(arr: list[float | None], i: int) -> float | None:
        return arr[i] if i < len(arr) else None

    flagged: list[dict] = []
    for i in range(n):
        reasons: list[str] = []
        e = at(eps, i)

        # 1) EPS spike vs the median of the OTHER periods (only when that median > 0)
        others = [at(eps, j) for j in range(n) if j != i]
        others = [v for v in others if v is not None]
        med = statistics.median(others) if others else None
        if e is not None and med is not None and med > 0 and e > 2 * med:
            reasons.append(
                f"EPS kỳ này ({e:,.0f}) > 2× trung vị các kỳ khác ({med:,.0f})"
            )

        # 2) Profit up YoY but operating cash flow not following (highest-priority signal)
        if i > 0:
            np_i, np_p = at(net_profit, i), at(net_profit, i - 1)
            o_i, o_p = at(ocf, i), at(ocf, i - 1)
            if np_i is not None and np_p is not None and np_i > np_p and np_i > 0:
                weak_cash = (
                    o_i is None
                    or o_i < 0
                    or (o_p is not None and o_i <= o_p)
                    or o_i < 0.6 * np_i
                )
                if weak_cash:
                    reasons.append(
                        "LNST tăng YoY nhưng dòng tiền HĐKD không tăng tương ứng"
                    )

        # 3) Other income dominates profit → likely non-recurring
        oi, np_i = at(other_income, i), at(net_profit, i)
        if oi is not None and np_i and np_i > 0 and oi > 0.3 * np_i:
            reasons.append(
                f"Thu nhập khác ({oi:g} tỷ) > 30% lợi nhuận ({np_i:g} tỷ) — nguồn không lặp lại"
            )

        if reasons:
            flagged.append({"year": years[i], "index": i, "reasons": reasons})
    return flagged


def _avg_positive(values: list[float | None]) -> tuple[float | None, int]:
    """Mean of positive values; returns (mean, count_excluded_nonpositive)."""
    pos = [v for v in values if v is not None and v > 0]
    excluded = sum(1 for v in values if v is None or v <= 0)
    return (sum(pos) / len(pos) if pos else None, excluded)


def _eps_growth_pct(eps_clean: list[float | None]) -> float | None:
    """Average YoY EPS growth (%) across consecutive positive points."""
    growths: list[float] = []
    for i in range(1, len(eps_clean)):
        a, b = eps_clean[i - 1], eps_clean[i]
        if a and b and a > 0 and b > 0:
            growths.append((b - a) / a * 100)
    return sum(growths) / len(growths) if growths else None


def _pe_eps(pe: float | None, eps_avg: float | None, n_loss: int) -> dict:
    if pe is None:
        return {"value": None, "note": "Thiếu P/E hiện tại."}
    if eps_avg is None:
        return {"value": None, "note": "Không có EPS dương sạch để tính trung bình."}
    note = (
        f"P/E hiện tại {pe:g} × EPS TB sạch {eps_avg:,.0f}đ × {MOS} (biên an toàn). "
        "Dùng P/E hiện tại vì không có chuỗi P/E lịch sử."
    )
    if n_loss:
        note = f"Đã loại {n_loss} kỳ lỗ/EPS≤0. " + note
    return {"value": round(pe * eps_avg * MOS), "note": note}


def _pb_bvps(pb: float | None, bvps_avg: float | None) -> dict:
    if pb is None:
        return {"value": None, "note": "Thiếu P/B hiện tại."}
    if bvps_avg is None:
        return {"value": None, "note": "Không tính được BVPS trung bình."}
    note = (
        f"P/B hiện tại {pb:g} × BVPS TB {bvps_avg:,.0f}đ × {MOS}. "
        "Dùng P/B hiện tại vì không có chuỗi P/B lịch sử."
    )
    return {"value": round(pb * bvps_avg * MOS), "note": note}


def _graham(eps_base: float | None, g_pct: float | None) -> dict:
    if eps_base is None or eps_base <= 0:
        return {"value": None, "note": "EPS ≤ 0 — không áp dụng được Graham."}
    g_eff = max(g_pct or 0.0, 0.0)
    value = eps_base * (8.5 + 2 * math.sqrt(2 * g_eff))
    note = (
        f"EPS {eps_base:,.0f}đ × (8.5 + 2×√(2×g)), g={g_eff:.1f}% (CAGR EPS, giới hạn 30%). "
        "Bản đơn giản hóa — không có hệ số điều chỉnh lãi suất trái phiếu AAA của công thức gốc."
    )
    if g_pct is not None and g_pct < 0:
        note += " g âm đã đưa về 0."
    return {"value": round(value), "note": note}


def _vs_current(median: float | None, price: float | None) -> dict:
    if median is None or not price:
        return {"discount_pct": None, "interpretation": "Không đủ dữ liệu để so sánh."}
    disc = (median - price) / price * 100
    if disc > 15:
        interp = f"Giá thị trường đang THẤP hơn vùng giá trị ước tính khoảng {disc:.0f}%."
    elif disc < -15:
        interp = f"Giá thị trường đang CAO hơn vùng giá trị ước tính khoảng {abs(disc):.0f}%."
    else:
        interp = "Giá thị trường nằm quanh vùng giá trị ước tính."
    return {"discount_pct": round(disc, 1), "interpretation": interp}


def build_valuation(
    *,
    current_price: float | None,
    pe: float | None,
    pb: float | None,
    years: list[str],
    net_profit: list[float | None],
    equity: list[float | None],
    operating_cashflow: list[float | None],
    other_income: list[float | None],
    shares: float | None,
    exclude_outliers: bool = True,
) -> dict:
    """Pure orchestrator — all inputs explicit so it is unit-testable."""
    if not shares or shares <= 0:
        return {"error": "Không xác định được số cổ phiếu lưu hành (thiếu vốn hóa/giá)."}
    if not years:
        return {"error": "Chưa có dữ liệu nhiều năm (cần phân tích BCTC trước)."}

    eps = _per_share(net_profit, shares)
    bvps = _per_share(equity, shares)

    outliers = (
        detect_outliers(years, eps, net_profit, operating_cashflow, other_income)
        if exclude_outliers
        else []
    )
    bad = {o["index"] for o in outliers}
    clean = [i for i in range(len(years)) if i not in bad]

    fallback = False
    fallback_note = ""
    if exclude_outliers and len(clean) < 2:
        clean = list(range(len(years)))
        fallback = True
        fallback_note = (
            "Không đủ dữ liệu sạch sau khi loại kỳ bất thường (còn < 2 kỳ) — "
            "đã dùng lại toàn bộ chuỗi gốc; định giá có thể bị ảnh hưởng bởi kỳ bất thường."
        )

    eps_clean = [eps[i] for i in clean]
    bvps_clean = [bvps[i] for i in clean]

    eps_avg, n_loss = _avg_positive(eps_clean)
    bvps_avg, _ = _avg_positive(bvps_clean)
    eps_base = next((v for v in reversed(eps_clean) if v is not None), None)
    g = _eps_growth_pct(eps_clean)

    methods = {
        "pe_eps_avg": _pe_eps(pe, eps_avg, n_loss),
        "pb_bvps_avg": _pb_bvps(pb, bvps_avg),
        "graham": _graham(eps_base, g),
    }

    vals = [m["value"] for m in methods.values() if m["value"] is not None]
    rng = (
        {"low": min(vals), "high": max(vals), "median": round(statistics.median(vals))}
        if vals
        else {"low": None, "high": None, "median": None}
    )

    return {
        "current_price": current_price,
        "shares_outstanding": round(shares),
        "methods": methods,
        "valuation_range": rng,
        "vs_current_price": _vs_current(rng["median"], current_price),
        "earnings_quality": {
            "outliers_detected": [
                {"year": o["year"], "reasons": o["reasons"]} for o in outliers
            ],
            "fallback_used": fallback,
            "note": fallback_note,
            "periods_used": [years[i] for i in clean],
        },
    }


def _mean_pos(values: list[float | None]) -> float | None:
    pos = [v for v in values if v is not None and v > 0]
    return sum(pos) / len(pos) if pos else None


# A year whose P/E exceeds this (absolute or vs the median) reflects near-zero /
# depressed earnings — it must not set the "typical multiple", so it's excluded.
_PE_ABS_CAP = 60.0
_PE_REL_CAP = 3.0
_GROWTH_CAP = 30.0  # cap Graham's g so one-off recoveries don't explode the value


def _eps_cagr_pct(eps_clean: list[float | None]) -> float | None:
    """CAGR of EPS across the clean series (robust to a one-off intermediate jump)."""
    vals = [v for v in eps_clean if v is not None and v > 0]
    if len(vals) < 2 or vals[0] <= 0:
        return None
    return ((vals[-1] / vals[0]) ** (1 / (len(vals) - 1)) - 1) * 100


def _dirty_years(pts: list[dict], bctc_outlier_years: set[int] | frozenset[int]) -> dict:
    """Map year → reason for exclusion. Dirty = EPS≤0, absurd P/E (depressed earnings),
    or flagged by a BCTC. Median-relative cap makes it robust across sectors."""
    pes = [h["pe"] for h in pts if h.get("pe") and h["pe"] > 0]
    cap = max(_PE_ABS_CAP, _PE_REL_CAP * statistics.median(pes)) if pes else _PE_ABS_CAP
    dirty: dict[int, str] = {}
    for h in pts:
        y = h["year"]
        pe, eps = h.get("pe"), h.get("eps")
        if y in bctc_outlier_years:
            dirty[y] = "Đánh dấu bất thường từ phân tích BCTC"
        elif eps is None or eps <= 0:
            dirty[y] = "EPS ≤ 0 (kỳ lỗ)"
        elif pe is None or pe <= 0 or pe > cap:
            dirty[y] = f"P/E bất thường ({pe:.0f}) — kỳ lãi rất thấp, không đại diện"
    return dirty


def _pe_eps_hist(
    pe_avg: float | None, eps_avg: float | None, src: str, n_loss: int, low_conf: bool
) -> dict:
    if pe_avg is None:
        return {"value": None, "note": "Thiếu P/E."}
    if eps_avg is None:
        return {"value": None, "note": "Không có EPS dương sạch để tính trung bình."}
    note = f"{src} {pe_avg:.1f} × EPS TB sạch {eps_avg:,.0f}đ × {MOS} (biên an toàn)."
    if n_loss:
        note = f"Đã loại {n_loss} kỳ EPS≤0. " + note
    if low_conf:
        note += " Chỉ có <2 kỳ lịch sử sạch — dùng P/E hiện tại, kết quả kém tin cậy."
    return {"value": round(pe_avg * eps_avg * MOS), "note": note}


def _pb_bvps_hist(
    pb_avg: float | None, bvps_avg: float | None, src: str, low_conf: bool
) -> dict:
    if pb_avg is None:
        return {"value": None, "note": "Thiếu P/B."}
    if bvps_avg is None:
        return {"value": None, "note": "Không tính được BVPS trung bình."}
    note = f"{src} {pb_avg:.1f} × BVPS TB {bvps_avg:,.0f}đ × {MOS}."
    if low_conf:
        note += " Chỉ có <2 kỳ lịch sử sạch — dùng P/B hiện tại, kết quả kém tin cậy."
    return {"value": round(pb_avg * bvps_avg * MOS), "note": note}


def build_history_valuation(
    *,
    history: list[dict],
    current_pe: float | None,
    current_pb: float | None,
    current_price: float | None,
    shares: float | None = None,
    bctc_outlier_years: set[int] | frozenset[int] = frozenset(),
    exclude_outliers: bool = True,
) -> dict:
    """Multiples valuation from the per-year metric_history series (pure).

    Uses HISTORICAL-average P/E and P/B (not the current snapshot) × clean average
    EPS/BVPS. Earnings-quality: excludes years with an EPS spike (vs the series median)
    plus any year flagged by a BCTC analysis. Falls back to the current P/E-P/B with a
    low-confidence note when <2 clean history periods remain.
    """
    pts = sorted(
        (h for h in history if h.get("year") is not None and (h.get("pe") or h.get("eps"))),
        key=lambda h: h["year"],
    )
    if not pts:
        return {"error": "Chưa có chuỗi P/E lịch sử để định giá (cần đồng bộ chỉ số)."}

    dirty = _dirty_years(pts, bctc_outlier_years) if exclude_outliers else {}
    outliers_display = [{"year": str(y), "reasons": [r]} for y, r in sorted(dirty.items())]

    clean = [h for h in pts if h["year"] not in dirty]
    low_conf = len(clean) < 2
    if low_conf:
        clean = pts  # not enough clean history → use all + flag low confidence

    pe_avg = current_pe if low_conf else _mean_pos([h.get("pe") for h in clean])
    pb_avg = current_pb if low_conf else _mean_pos([h.get("pb") for h in clean])
    eps_avg, n_loss = _avg_positive([h.get("eps") for h in clean])
    bvps_avg, _ = _avg_positive([h.get("bvps") for h in clean])
    eps_base = next((h.get("eps") for h in reversed(clean) if h.get("eps") and h["eps"] > 0), None)
    g = _eps_cagr_pct([h.get("eps") for h in clean])

    y0, y1, n = clean[0]["year"], clean[-1]["year"], len(clean)
    src_pe = "P/E hiện tại" if low_conf else f"P/E TB {n} kỳ ({y0}-{y1})"
    src_pb = "P/B hiện tại" if low_conf else f"P/B TB {n} kỳ ({y0}-{y1})"

    g_capped = min(g, _GROWTH_CAP) if g is not None else None
    methods = {
        "pe_eps_avg": _pe_eps_hist(pe_avg, eps_avg, src_pe, n_loss, low_conf),
        "pb_bvps_avg": _pb_bvps_hist(pb_avg, bvps_avg, src_pb, low_conf),
        "graham": _graham(eps_base, g_capped),
    }
    vals = [m["value"] for m in methods.values() if m["value"] is not None]
    rng = (
        {"low": min(vals), "high": max(vals), "median": round(statistics.median(vals))}
        if vals
        else {"low": None, "high": None, "median": None}
    )
    return {
        "current_price": current_price,
        "shares_outstanding": round(shares) if shares else None,
        "methods": methods,
        "valuation_range": rng,
        "vs_current_price": _vs_current(rng["median"], current_price),
        "earnings_quality": {
            "outliers_detected": outliers_display,
            "fallback_used": low_conf,
            "note": (
                f"Chỉ có {len(pts)} kỳ lịch sử, <2 kỳ sạch — kết quả kém tin cậy."
                if low_conf
                else f"Định giá theo {n} kỳ lịch sử sạch ({y0}-{y1})."
            ),
            "periods_used": [str(h["year"]) for h in clean],
        },
    }


# --- Sector-relative (comparable multiples) valuation ----------------------
# Descriptive "what if it traded at the sector-typical multiple" — NOT a safe-buy
# price, so NO margin of safety is applied here (unlike the intrinsic methods above).
_FIN_SECTOR_KW = ("ngân hàng", "bảo hiểm", "chứng khoán", "bank", "insurance", "securities")
_SECTOR_REL_CAP = 15.0  # |premium%| beyond which we call it cheap/rich vs peers
_MIN_PEERS_CONF = 3  # fewer peers → sector median is noisy → low-confidence note


def _relative_method(
    price: float | None, own: float | None, sector_median: float | None, label: str
) -> dict:
    """Fair value if the stock traded at the sector-median multiple, + its premium."""
    if not sector_median or sector_median <= 0:
        return {"value": None, "own_multiple": own, "sector_multiple": sector_median,
                "premium_pct": None, "note": f"Thiếu trung vị {label} ngành."}
    if own is None or own <= 0:
        return {"value": None, "own_multiple": own, "sector_multiple": round(sector_median, 2),
                "premium_pct": None,
                "note": f"{label} ≤ 0 (kỳ lỗ / không có) — không so sánh được theo {label}."}
    if not price:
        return {"value": None, "own_multiple": round(own, 2),
                "sector_multiple": round(sector_median, 2), "premium_pct": None,
                "note": "Thiếu giá hiện tại."}
    value = round(price * sector_median / own)
    premium = (own / sector_median - 1) * 100  # >0 = đắt hơn trung vị ngành
    note = (
        f"{label} của mã {own:.1f} so với trung vị ngành {sector_median:.1f} "
        f"({'cao hơn' if premium >= 0 else 'thấp hơn'} {abs(premium):.0f}%). "
        f"Giá nếu về đúng bội số ngành: {value:,.0f}đ."
    )
    return {"value": value, "own_multiple": round(own, 2),
            "sector_multiple": round(sector_median, 2),
            "premium_pct": round(premium, 1), "note": note}


def build_sector_valuation(
    *,
    industry: str | None,
    current_price: float | None,
    own_pe: float | None,
    own_pb: float | None,
    sector_pe_median: float | None,
    sector_pb_median: float | None,
    peer_count: int,
) -> dict:
    """Relative valuation vs same-industry peers (pure). Describes where the stock's
    own P/E and P/B sit against the sector median, and the price implied if it reverted
    to those medians. No margin of safety (this is a relative, not intrinsic, estimate)."""
    methods = {
        "pe_relative": _relative_method(current_price, own_pe, sector_pe_median, "P/E"),
        "pb_relative": _relative_method(current_price, own_pb, sector_pb_median, "P/B"),
    }
    vals = [m["value"] for m in methods.values() if m["value"] is not None]
    rng = (
        {"low": min(vals), "high": max(vals), "median": round(statistics.median(vals))}
        if vals else {"low": None, "high": None, "median": None}
    )
    prems = [m["premium_pct"] for m in methods.values() if m["premium_pct"] is not None]
    avg_prem = sum(prems) / len(prems) if prems else None
    if avg_prem is None:
        position = "Không đủ dữ liệu bội số để so sánh với ngành."
    elif avg_prem > _SECTOR_REL_CAP:
        position = f"Đang được định giá CAO hơn mặt bằng ngành khoảng {avg_prem:.0f}%."
    elif avg_prem < -_SECTOR_REL_CAP:
        position = f"Đang được định giá THẤP hơn mặt bằng ngành khoảng {abs(avg_prem):.0f}%."
    else:
        position = "Được định giá quanh mặt bằng ngành."

    notes: list[str] = []
    if peer_count < _MIN_PEERS_CONF:
        notes.append(
            f"Chỉ có {peer_count} mã cùng ngành có dữ liệu — trung vị ngành kém tin cậy."
        )
    if industry and any(k in industry.lower() for k in _FIN_SECTOR_KW):
        notes.append(
            "Ngành tài chính: P/B thường là bội số chính; định giá theo P/E kém tin cậy."
        )

    return {
        "industry": industry,
        "peer_count": peer_count,
        "current_price": current_price,
        "methods": methods,
        "valuation_range": rng,
        "vs_current_price": _vs_current(rng["median"], current_price),
        "relative_position": position,
        "avg_premium_pct": round(avg_prem, 1) if avg_prem is not None else None,
        "notes": notes,
    }


def classify_sector_relative(
    own_pe: float | None, own_pb: float | None,
    sector_pe: float | None, sector_pb: float | None,
) -> dict:
    """Pure: where a stock's P/E & P/B sit vs its sector median → cheap/fair/rich.

    Averages the P/E and P/B premia (only positive multiples count). Returns
    ``valuation_flag`` in {cheap, fair, rich, unknown} + the average premium %."""
    prems: list[float] = []
    if own_pe and own_pe > 0 and sector_pe and sector_pe > 0:
        prems.append((own_pe / sector_pe - 1) * 100)
    if own_pb and own_pb > 0 and sector_pb and sector_pb > 0:
        prems.append((own_pb / sector_pb - 1) * 100)
    if not prems:
        return {"valuation_flag": "unknown", "premium_pct": None}
    avg = sum(prems) / len(prems)  # >0 = đắt hơn trung vị ngành
    flag = "rich" if avg > _SECTOR_REL_CAP else "cheap" if avg < -_SECTOR_REL_CAP else "fair"
    return {"valuation_flag": flag, "premium_pct": round(avg, 1)}


async def batch_sector_relative(session: AsyncSession, symbols: list[str]) -> dict[str, dict]:
    """Sector-relative valuation flag for many symbols in ONE universe pass.

    Computes each industry's median P/E & P/B from the latest metrics across the whole
    universe (in-memory), then classifies each requested symbol. Cheap DB-only — used to
    fold the valuation pillar into the market-wide radar without N per-symbol queries."""
    from app.services.screener import _latest_metric_ids  # local import avoids a cycle

    want = {s.upper() for s in symbols if s}
    if not want:
        return {}
    latest = _latest_metric_ids()
    rows = (
        await session.execute(
            select(Stock.symbol, Stock.industry, StockMetric.pe, StockMetric.pb)
            .join(Stock, Stock.symbol == StockMetric.symbol)
            .where(StockMetric.id.in_(latest))
        )
    ).all()

    from collections import defaultdict

    pe_by_ind: dict[str, list[float]] = defaultdict(list)
    pb_by_ind: dict[str, list[float]] = defaultdict(list)
    own: dict[str, tuple[str | None, float | None, float | None]] = {}
    for sym, industry, pe, pb in rows:
        own[sym] = (industry, pe, pb)
        if industry:
            if pe and pe > 0:
                pe_by_ind[industry].append(pe)
            if pb and pb > 0:
                pb_by_ind[industry].append(pb)

    out: dict[str, dict] = {}
    for sym in want:
        rec = own.get(sym)
        if not rec:
            out[sym] = {"valuation_flag": "unknown", "premium_pct": None}
            continue
        industry, pe, pb = rec
        sec_pe = statistics.median(pe_by_ind[industry]) if industry and pe_by_ind.get(industry) else None
        sec_pb = statistics.median(pb_by_ind[industry]) if industry and pb_by_ind.get(industry) else None
        out[sym] = classify_sector_relative(pe, pb, sec_pe, sec_pb)
    return out


def build_dcf(
    *,
    base_ocf_billion: float | None,
    growth_pct: float,
    discount_pct: float,
    years: int,
    shares: float | None,
    terminal_growth_pct: float = 3.0,
) -> dict:
    """Simplified DCF on real operating cash flow (proxy for FCF — no capex/debt)."""
    assumptions = {
        "growth_pct": growth_pct,
        "discount_pct": discount_pct,
        "years": years,
        "terminal_growth_pct": terminal_growth_pct,
        "base_operating_cashflow_billion": base_ocf_billion,
    }
    if base_ocf_billion is None or base_ocf_billion <= 0:
        return {
            "dcf_value": None,
            "assumptions_used": assumptions,
            "sensitivity_note": "Dòng tiền HĐKD cơ sở ≤ 0 — không áp dụng được DCF.",
        }
    if not shares or shares <= 0:
        return {
            "dcf_value": None,
            "assumptions_used": assumptions,
            "sensitivity_note": "Thiếu số cổ phiếu lưu hành.",
        }

    r, g, tg = discount_pct / 100, growth_pct / 100, terminal_growth_pct / 100
    if r <= tg:
        tg = max(r - 0.01, 0.0)
        assumptions["terminal_growth_pct"] = round(tg * 100, 2)

    pv = 0.0
    cf = base_ocf_billion
    for y in range(1, years + 1):
        cf *= 1 + g
        pv += cf / (1 + r) ** y
    terminal = cf * (1 + tg) / (r - tg) if r > tg else 0.0
    pv += terminal / (1 + r) ** years

    per_share = round(pv * 1e9 / shares)
    return {
        "dcf_value": per_share,
        "assumptions_used": assumptions,
        "sensitivity_note": (
            "DCF dùng dòng tiền HĐKD thực (proxy cho FCF, chưa trừ capex/nợ). "
            "Kết quả rất nhạy với tốc độ tăng trưởng & tỷ lệ chiết khấu — hãy thử nhiều kịch bản."
        ),
    }


# --- DB orchestration ------------------------------------------------------


async def _latest_analysis(session: AsyncSession, symbol: str) -> dict | None:
    row = (
        await session.execute(
            select(Document)
            .where(Document.symbol == symbol.upper(), Document.analysis.isnot(None))
            .order_by(Document.analyzed_at.desc().nullslast(), Document.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    return row.analysis if row else None


async def merged_trend(
    session: AsyncSession, symbol: str, annual_only: bool = False
) -> dict:
    """Union the multi_year_trend across analyzed BCTC reports for a symbol.

    One report ≈ 2 years; analyzing several yields a long series. With ``annual_only``,
    quarterly/interim reports are excluded (their comparatives are quarter-over-quarter,
    not full-year) so the valuation series stays apples-to-apples. Uploaded docs
    (report_period NULL) are treated as annual. Empty when nothing qualifies.
    """
    stmt = select(Document).where(
        Document.symbol == symbol.upper(), Document.analysis.isnot(None)
    )
    if annual_only:
        # Keep annual + uploads (NULL); exclude quarterly/interim. NULL ∉ notin_, so
        # the explicit is_(None) is required to keep uploaded reports.
        stmt = stmt.where(
            or_(
                Document.report_period.is_(None),
                Document.report_period.notin_(("quarterly", "interim")),
            )
        )
    rows = (await session.execute(stmt)).scalars().all()
    trends = [(r.analysis or {}).get("multi_year_trend") or {} for r in rows]
    return trend_merge.merge_trends([t for t in trends if t.get("years")])


async def _market_inputs(session: AsyncSession, symbol: str) -> dict:
    sym = symbol.upper()
    metric = (
        await session.execute(
            select(StockMetric)
            .where(StockMetric.symbol == sym)
            .order_by(StockMetric.report_date.desc().nullslast(), StockMetric.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()
    stock = await session.get(Stock, sym)
    return {
        "close_price": metric.close_price if metric else None,
        "pe": metric.pe if metric else None,
        "pb": metric.pb if metric else None,
        "market_cap": stock.market_cap if stock else None,
    }


async def _history_rows(session: AsyncSession, symbol: str) -> list[dict]:
    rows = (
        await session.execute(
            select(MetricHistory)
            .where(MetricHistory.symbol == symbol.upper())
            .order_by(MetricHistory.year)
        )
    ).scalars().all()
    return [
        {"year": r.year, "pe": r.pe, "pb": r.pb, "eps": r.eps, "bvps": r.bvps}
        for r in rows
    ]


async def _bctc_outlier_years(session: AsyncSession, symbol: str, mkt: dict) -> set[int]:
    """Outlier years flagged by an ANNUAL BCTC's earnings-quality check (if any)."""
    t = await merged_trend(session, symbol, annual_only=True)
    if not t.get("years"):
        return set()
    shares = derive_shares(mkt["market_cap"], mkt["close_price"])
    if not shares:
        return set()
    eps = _per_share(t.get("net_profit") or [], shares)
    flagged = detect_outliers(
        t["years"], eps, t.get("net_profit") or [],
        t.get("operating_cashflow") or [], t.get("other_income") or [],
    )
    out: set[int] = set()
    for o in flagged:
        try:
            out.add(int(str(o["year"])[:4]))
        except ValueError:
            pass
    return out


async def get_valuation(
    session: AsyncSession, symbol: str, exclude_outliers: bool = True
) -> dict:
    # Multiples valuation is driven by the per-year metric_history (real historical
    # P/E, P/B, EPS, BVPS) — no BCTC required. A BCTC, when present, only contributes
    # extra earnings-quality outlier years.
    mkt = await _market_inputs(session, symbol)
    history = await _history_rows(session, symbol)
    if not any(h.get("pe") or h.get("eps") for h in history):
        return {
            "error": "Chưa có chuỗi chỉ số lịch sử để định giá — hãy đồng bộ chỉ số cho mã này."
        }
    bctc_outliers = (
        await _bctc_outlier_years(session, symbol, mkt) if exclude_outliers else set()
    )
    result = build_history_valuation(
        history=history,
        current_pe=mkt["pe"],
        current_pb=mkt["pb"],
        current_price=mkt["close_price"],
        shares=derive_shares(mkt["market_cap"], mkt["close_price"]),
        bctc_outlier_years=bctc_outliers,
        exclude_outliers=exclude_outliers,
    )
    # Real ROE history corroborates the earnings-quality check (independent of BCTC).
    if "error" not in result:
        stats = roe_history.roe_stats(await _roe_history(session, symbol))
        if stats.get("available"):
            result["roe_history"] = stats
            eq = result.get("earnings_quality")
            if isinstance(eq, dict) and stats["is_spike"]:
                eq.setdefault("notes", []).append(
                    f"ROE năm gần nhất cao bất thường ({stats['spike_factor']:.1f}× TB các "
                    "năm trước) — kiểm tra xem lợi nhuận có bền vững không trước khi định giá."
                )
    return result


async def _roe_history(session: AsyncSession, symbol: str) -> list[dict]:
    rows = (
        await session.execute(
            select(MetricHistory)
            .where(MetricHistory.symbol == symbol.upper())
            .order_by(MetricHistory.year)
        )
    ).scalars().all()
    return [{"year": r.year, "roe": r.roe} for r in rows]


async def get_sector_valuation(session: AsyncSession, symbol: str) -> dict:
    """Relative valuation of a stock vs its same-industry peers (median P/E & P/B).

    Reuses ``peers.industry_benchmark`` for the sector medians + peer count. Works from
    current metrics alone (no BCTC / history required)."""
    from app.services import peers  # local import avoids a cycle at module load

    sym = symbol.upper()
    stock = await session.get(Stock, sym)
    if stock is None:
        return {"error": f"Không tìm thấy mã '{sym}'."}
    if not stock.industry:
        return {"error": "Mã này chưa có thông tin ngành để định giá theo ngành."}

    bench = await peers.industry_benchmark(session, sym)
    if not bench:
        return {"error": "Chưa đủ mã cùng ngành có dữ liệu để định giá theo ngành."}

    med = {m["key"]: m["median"] for m in bench.get("metrics", [])}
    mkt = await _market_inputs(session, sym)
    return build_sector_valuation(
        industry=bench["industry"],
        current_price=mkt["close_price"],
        own_pe=mkt["pe"],
        own_pb=mkt["pb"],
        sector_pe_median=med.get("pe"),
        sector_pb_median=med.get("pb"),
        peer_count=bench["peer_count"],
    )


async def get_dcf(
    session: AsyncSession,
    symbol: str,
    growth_pct: float,
    discount_pct: float,
    years: int,
) -> dict:
    analysis = await _latest_analysis(session, symbol)
    if not analysis:
        return {"error": "Chưa có phân tích BCTC cho mã này."}
    mkt = await _market_inputs(session, symbol)
    shares = derive_shares(mkt["market_cap"], mkt["close_price"])
    t = await merged_trend(session, symbol, annual_only=True)
    ocf_series = t.get("operating_cashflow") or []
    base_ocf = next((v for v in reversed(ocf_series) if v is not None), None)
    if base_ocf is None:
        cf = (analysis.get("cashflow") or {}).get("operating") or {}
        base_ocf = cf.get("net")
    return build_dcf(
        base_ocf_billion=base_ocf,
        growth_pct=growth_pct,
        discount_pct=discount_pct,
        years=years,
        shares=shares,
    )
