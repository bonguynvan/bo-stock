"""Financial-trust profile — a deterministic synthesis of the Giai đoạn 1 signals.

Combines the forensic screens (Beneish / Altman Z'' / Piotroski), Quality of Earnings,
and the sector-relative valuation into ONE research-only profile per stock: a set of
quality/risk pillars, cross-signal corroboration notes, and a descriptive overall read.

PURE + deterministic — NO AI, NO buy/sell. It never emits a single numeric rating (that
would read like a recommendation); it reports each axis + where independent signals agree.
The pure ``build_conviction_profile`` takes already-computed inputs and is unit-tested; the
service layer just gathers them from ``fraud_api`` and ``valuation``.
"""
from __future__ import annotations

import asyncio

from sqlalchemy.ext.asyncio import AsyncSession

# pillar status: good | neutral | risk | unknown
_GOOD, _NEUTRAL, _RISK, _UNKNOWN = "good", "neutral", "risk", "unknown"
_SECTOR_REL_CAP = 15.0  # |premium%| beyond which valuation reads cheap/rich vs peers

DISCLAIMER = (
    "Hồ sơ tổng hợp từ các mô hình SÀNG LỌC định lượng — mô tả chất lượng & rủi ro theo "
    "từng trục, KHÔNG phải khuyến nghị mua/bán. Tín hiệu đồng thuận chỉ ra nên xem xét kỹ hơn."
)


def _qoe_pillar(flag: str | None, score: float | None) -> dict:
    status = {"strong": _GOOD, "adequate": _NEUTRAL, "weak": _RISK}.get(flag or "", _UNKNOWN)
    headline = {
        _GOOD: "Lợi nhuận có dòng tiền thực đỡ lưng tốt",
        _NEUTRAL: "Chất lượng lợi nhuận ở mức chấp nhận được",
        _RISK: "Lợi nhuận dựa nhiều vào bút toán dồn tích",
        _UNKNOWN: "Chưa đủ dữ liệu để đánh giá chất lượng lợi nhuận",
    }[status]
    if score is not None:
        headline += f" ({score:g}/100)"
    return {"key": "earnings_quality", "label": "Chất lượng lợi nhuận", "status": status,
            "headline": headline}


def _manipulation_pillar(flag: str | None) -> dict:
    status = {"low_risk": _GOOD, "medium_risk": _NEUTRAL, "high_risk": _RISK}.get(
        flag or "", _UNKNOWN
    )
    headline = {
        _GOOD: "Rủi ro thao túng lợi nhuận thấp (Beneish)",
        _NEUTRAL: "Vùng cảnh báo trung bình (Beneish)",
        _RISK: "Dấu hiệu thao túng lợi nhuận cao (Beneish)",
        _UNKNOWN: "Chưa đủ dữ liệu Beneish",
    }[status]
    return {"key": "manipulation", "label": "Rủi ro thao túng", "status": status,
            "headline": headline}


def _health_pillar(altman_zone: str | None, fscore: int | None, fmax: int | None) -> dict:
    z_bad = altman_zone == "distress"
    z_good = altman_zone == "safe"
    f_bad = fscore is not None and fscore <= 2
    f_good = fscore is not None and fscore >= 7
    if altman_zone in (None, "insufficient_data") and fscore is None:
        status = _UNKNOWN
    elif z_bad or f_bad:
        status = _RISK
    elif z_good and f_good:
        status = _GOOD
    else:
        status = _NEUTRAL
    parts = []
    if altman_zone and altman_zone not in ("insufficient_data",):
        parts.append({"safe": "Z'' an toàn", "grey": "Z'' vùng xám",
                      "distress": "Z'' nguy hiểm",
                      "not_applicable": "Z'' không áp dụng (tài chính)"}.get(altman_zone, altman_zone))
    if fscore is not None:
        parts.append(f"Piotroski {fscore}/{fmax if fmax is not None else 9}")
    headline = " · ".join(parts) if parts else "Chưa đủ dữ liệu sức khỏe tài chính"
    return {"key": "financial_health", "label": "Sức khỏe tài chính", "status": status,
            "headline": headline}


def _valuation_pillar(avg_premium_pct: float | None, available: bool) -> dict:
    if not available or avg_premium_pct is None:
        return {"key": "valuation", "label": "Định giá vs ngành", "status": _UNKNOWN,
                "headline": "Chưa đủ mã cùng ngành để so sánh định giá"}
    if avg_premium_pct > _SECTOR_REL_CAP:
        status, txt = _RISK, f"Đắt hơn mặt bằng ngành ~{avg_premium_pct:.0f}% (rủi ro định giá)"
    elif avg_premium_pct < -_SECTOR_REL_CAP:
        status, txt = _GOOD, f"Rẻ hơn mặt bằng ngành ~{abs(avg_premium_pct):.0f}%"
    else:
        status, txt = _NEUTRAL, "Định giá quanh mặt bằng ngành"
    return {"key": "valuation", "label": "Định giá vs ngành", "status": status, "headline": txt}


def _cross_signals(
    qoe: str | None, beneish: str | None, altman: str | None, fscore: int | None,
    premium: float | None,
) -> list[str]:
    """Where independent signals CORROBORATE — the point of the synthesis."""
    out: list[str] = []
    weak_qoe = qoe == "weak"
    if weak_qoe and beneish == "high_risk":
        out.append("Chất lượng lợi nhuận yếu TRÙNG với rủi ro thao túng cao (Beneish) — "
                   "hai tín hiệu độc lập cùng chỉ về chất lượng lợi nhuận, cần soi kỹ dòng tiền.")
    if weak_qoe and altman == "distress":
        out.append("Lợi nhuận chất lượng thấp trong khi sức khỏe tài chính ở vùng nguy hiểm (Altman Z'').")
    if beneish == "high_risk" and fscore is not None and fscore <= 3:
        out.append("Rủi ro thao túng cao đi kèm nền tảng cơ bản yếu (Piotroski thấp).")
    if premium is not None and premium > _SECTOR_REL_CAP and (weak_qoe or beneish == "high_risk"):
        out.append("Định giá cao hơn ngành trong khi chất lượng/độ tin cậy lợi nhuận còn nghi vấn.")
    if qoe == "strong" and beneish == "low_risk" and fscore is not None and fscore >= 7:
        out.append("Chất lượng lợi nhuận tốt, không cờ đỏ pháp y, nền tảng vững — "
                   "các tín hiệu chất lượng đồng thuận tích cực.")
    return out


def _fmt_shares(n: float) -> str:
    a = abs(n)
    if a >= 1e6:
        return f"{a / 1e6:.2f}M"
    if a >= 1e3:
        return f"{a / 1e3:.0f}K"
    return str(round(a))


def _direction(v: float | None) -> str | None:
    """Signed net → 'buy' (>0) | 'sell' (<0) | 'neutral' (0); None if no data."""
    if v is None:
        return None
    return "buy" if v > 0 else "sell" if v < 0 else "neutral"


def _flow_signals(
    insider_net_shares: float | None, foreign_net_val: float | None, prop_net_val: float | None
) -> list[dict]:
    """Descriptive organizational-flow lines (only those with data). Corroboration
    context — NOT a pillar, NOT part of the deterministic overall read."""
    out: list[dict] = []
    di = _direction(insider_net_shares)
    if di is not None:
        verb = {"buy": "mua ròng", "sell": "bán ròng", "neutral": "cân bằng"}[di]
        tail = f" {_fmt_shares(insider_net_shares)} cp" if di != "neutral" else ""  # type: ignore[arg-type]
        out.append({"key": "insider", "label": "Nội bộ (6 tháng)", "direction": di,
                    "text": f"Nội bộ {verb}{tail}"})
    for key, label, val in (("foreign", "Khối ngoại", foreign_net_val), ("prop", "Tự doanh", prop_net_val)):
        d = _direction(val)
        if d is None:
            continue
        verb = {"buy": "mua ròng", "sell": "bán ròng", "neutral": "cân bằng"}[d]
        tail = f" {abs(val):.1f} tỷ" if d != "neutral" else ""  # type: ignore[arg-type]
        out.append({"key": key, "label": label, "direction": d,
                    "text": f"{label} {verb}{tail} (phiên gần nhất)"})
    return out


def _flow_cross_signals(
    flows: list[dict], weak_qoe: bool, beneish_high: bool, positive_ctx: bool
) -> list[str]:
    """Corroboration where organizational flow agrees with the fundamental read."""
    dirs = {f["key"]: f["direction"] for f in flows}
    risk_ctx = weak_qoe or beneish_high
    out: list[str] = []
    if dirs.get("insider") == "sell" and risk_ctx:
        out.append("Người trong cuộc bán ròng trong khi chất lượng/độ tin cậy lợi nhuận còn "
                   "nghi vấn — dòng tiền nội bộ cùng chiều với rủi ro cơ bản.")
    if dirs.get("foreign") == "sell" and dirs.get("prop") == "sell" and risk_ctx:
        out.append("Cả khối ngoại và tự doanh cùng bán ròng trên nền rủi ro cơ bản — "
                   "dòng tiền tổ chức không đỡ giá.")
    if dirs.get("insider") == "buy" and positive_ctx:
        out.append("Người trong cuộc mua ròng, đồng thuận với chất lượng lợi nhuận tốt.")
    return out


def build_conviction_profile(
    *,
    beneish_flag: str | None,
    altman_zone: str | None,
    piotroski_score: int | None,
    piotroski_max: int | None,
    qoe_flag: str | None,
    qoe_score: float | None,
    sector_avg_premium_pct: float | None,
    sector_available: bool,
    insider_net_shares: float | None = None,
    foreign_net_val: float | None = None,
    prop_net_val: float | None = None,
) -> dict:
    """Synthesize the pillars + cross-signals + a descriptive overall read (pure).

    Organizational flow (insider / foreign / tự doanh), when supplied, adds a descriptive
    ``flow_signals`` block and extra corroboration ``cross_signals`` — it never changes the
    pillar statuses or the ``overall`` read (those stay purely fundamental & deterministic)."""
    pillars = [
        _qoe_pillar(qoe_flag, qoe_score),
        _manipulation_pillar(beneish_flag),
        _health_pillar(altman_zone, piotroski_score, piotroski_max),
        _valuation_pillar(sector_avg_premium_pct, sector_available),
    ]
    tally = {_GOOD: 0, _NEUTRAL: 0, _RISK: 0, _UNKNOWN: 0}
    for p in pillars:
        tally[p["status"]] += 1

    cross = _cross_signals(
        qoe_flag, beneish_flag, altman_zone, piotroski_score, sector_avg_premium_pct
    )
    flows = _flow_signals(insider_net_shares, foreign_net_val, prop_net_val)
    positive_ctx = qoe_flag == "strong" and beneish_flag == "low_risk"
    cross += _flow_cross_signals(
        flows, weak_qoe=qoe_flag == "weak", beneish_high=beneish_flag == "high_risk",
        positive_ctx=positive_ctx,
    )

    known = tally[_GOOD] + tally[_NEUTRAL] + tally[_RISK]
    severe = beneish_flag == "high_risk" or altman_zone == "distress"
    if known < 2:
        overall, overall_text = "insufficient", "Chưa đủ dữ liệu để dựng hồ sơ tin cậy."
    elif tally[_RISK] >= 2 or severe:
        overall = "elevated_risk"
        overall_text = f"{tally[_RISK]} trục rủi ro cần lưu ý — xem các cảnh báo bên dưới."
    elif tally[_RISK] == 1:
        overall = "watch"
        overall_text = "Phần lớn ổn, có 1 trục cần theo dõi."
    elif tally[_GOOD] >= 3:
        overall = "solid"
        overall_text = "Các trục chất lượng & độ tin cậy nhìn chung tích cực."
    else:
        overall = "mixed"
        overall_text = "Bức tranh hỗn hợp, không có cờ đỏ rõ rệt."

    return {
        "overall": overall,
        "overall_text": overall_text,
        "pillars": pillars,
        "flag_counts": tally,
        "cross_signals": cross,
        "flow_signals": flows,
        "disclaimer": DISCLAIMER,
    }


def overall_from_scores(
    *,
    beneish_flag: str | None,
    altman_zone: str | None,
    piotroski_score: int | None,
    qoe_flag: str | None,
    qoe_score: float | None,
) -> str:
    """Just the `overall` label from persisted forensic + QoE scores (no valuation).

    For the market-wide screener column: cheap (no per-stock recompute), so the valuation
    pillar is left unknown — the per-stock card is the richer version that adds it."""
    return build_conviction_profile(
        beneish_flag=beneish_flag, altman_zone=altman_zone,
        piotroski_score=piotroski_score, piotroski_max=None,
        qoe_flag=qoe_flag, qoe_score=qoe_score,
        sector_avg_premium_pct=None, sector_available=False,
    )["overall"]


async def _gather_flows(symbol: str) -> dict:
    """Best-effort organizational flow (insider / foreign / tự doanh) — concurrent, each
    failure degrades to None so the card never breaks on an external-source hiccup."""
    from app.services import foreign_stock, insider, prop_trading  # local: avoid a cycle

    ins, frn, prp = await asyncio.gather(
        insider.get_insider(symbol), foreign_stock.get_symbol_foreign(symbol),
        prop_trading.get_symbol_prop(symbol), return_exceptions=True,
    )

    def _ok(x: object) -> dict | None:
        return x if isinstance(x, dict) and x.get("available") else None

    ins_d, frn_d, prp_d = _ok(ins), _ok(frn), _ok(prp)
    return {
        "insider_net_shares": (ins_d.get("summary") or {}).get("net_shares") if ins_d else None,
        "foreign_net_val": frn_d.get("net_val") if frn_d else None,
        "prop_net_val": prp_d.get("net_val") if prp_d else None,
    }


async def get_conviction(session: AsyncSession, symbol: str, with_flows: bool = True) -> dict | None:
    """Gather forensic + sector valuation (+ organizational flow) and synthesize (no AI).

    Returns None only when NEITHER the forensic scores nor the sector valuation are
    available (nothing to synthesize). ``with_flows`` overlays insider/foreign/tự doanh
    corroboration best-effort; set False to skip the network fetch (offline/tests)."""
    from app.services import fraud_api, valuation  # local import avoids a cycle

    sym = symbol.upper()
    fraud = await fraud_api.build_fraud_response(session, sym)  # None if <2 annual statements
    sector = await valuation.get_sector_valuation(session, sym)  # {"error"} if no peers
    sector_ok = isinstance(sector, dict) and "error" not in sector
    if fraud is None and not sector_ok:
        return None

    b = (fraud or {}).get("beneish") or {}
    a = (fraud or {}).get("altman") or {}
    p = (fraud or {}).get("piotroski") or {}
    q = (fraud or {}).get("earnings_quality") or {}

    flows = await _gather_flows(sym) if with_flows else {}

    profile = build_conviction_profile(
        beneish_flag=b.get("flag"),
        altman_zone=a.get("zone"),
        piotroski_score=p.get("score"),
        piotroski_max=p.get("max_score"),
        qoe_flag=q.get("flag"),
        qoe_score=q.get("score"),
        sector_avg_premium_pct=sector.get("avg_premium_pct") if sector_ok else None,
        sector_available=sector_ok,
        insider_net_shares=flows.get("insider_net_shares"),
        foreign_net_val=flows.get("foreign_net_val"),
        prop_net_val=flows.get("prop_net_val"),
    )
    profile["symbol"] = sym
    profile["sources"] = {"forensic": fraud is not None, "sector_valuation": sector_ok}
    return profile
