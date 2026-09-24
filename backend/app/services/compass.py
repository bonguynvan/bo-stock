"""Investment Compass (Kim Chỉ Nam) — composite research scores, 3 horizons.

Research-only: every score is 0-100 with a transparent breakdown + Vietnamese
explanations. NO buy/sell/hold conclusions, no imperative language. Reuses the
existing pipeline — earnings-quality filter, valuation module, multi_year_trend,
ratios, OHLC — never recomputes fundamentals from scratch.

Missing-data rule: a component with no data is set to None, its weight is
redistributed across the available components, and the gap is listed in
``data_gaps`` — never silently filled with a guess.
"""
from __future__ import annotations

import statistics
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import CompassScore, MetricHistory, StockMetric
from app.models.document import Document
from app.services import dividends, indicators, roe_history, stock_service, valuation

DISCLAIMER = (
    "Điểm số tham khảo dựa trên dữ liệu lịch sử và công thức cố định, không phải "
    "khuyến nghị đầu tư. Quyết định cuối cùng là của bạn."
)


def _clamp(x: float, lo: float = 0.0, hi: float = 100.0) -> float:
    return max(lo, min(hi, x))


def _combine(components: list[tuple[str, float | None, float]]) -> tuple[float | None, dict]:
    """Weighted average over available components; weights of missing ones drop out."""
    avail = [(n, s, w) for n, s, w in components if s is not None]
    breakdown = {n: (round(s, 1) if s is not None else None) for n, s, _ in components}
    if not avail:
        return None, breakdown
    tw = sum(w for _, _, w in avail)
    score = sum(s * w for _, s, w in avail) / tw
    return round(score, 1), breakdown


# --- technical indicators (pure) ------------------------------------------


def sma(values: list[float], n: int) -> float | None:
    return sum(values[-n:]) / n if len(values) >= n else None


def rsi(closes: list[float], period: int = 14) -> float | None:
    if len(closes) < period + 1:
        return None
    deltas = [closes[i] - closes[i - 1] for i in range(1, len(closes))][-period:]
    gains = sum(d for d in deltas if d > 0)
    losses = sum(-d for d in deltas if d < 0)
    if losses == 0:
        return 100.0 if gains > 0 else 50.0
    rs = (gains / period) / (losses / period)
    return 100 - 100 / (1 + rs)


# --- SHORT TERM: momentum -------------------------------------------------


def short_term_technical(
    closes: list[float], volumes: list[float]
) -> tuple[float | None, list[str]]:
    parts: list[tuple[float, float]] = []  # (score, weight)
    expl: list[str] = []

    ma50 = sma(closes, 50)
    price = closes[-1] if closes else None
    if ma50 and price:
        pct = (price - ma50) / ma50 * 100
        s = _clamp(50 + pct * 2.5)
        parts.append((s, 1.0))
        expl.append(
            f"Giá {'trên' if pct >= 0 else 'dưới'} MA50 {pct:+.1f}% "
            f"({'tích cực' if pct >= 0 else 'kém tích cực'} cho động lượng ngắn hạn)."
        )

    r = rsi(closes)
    if r is not None:
        s = _clamp(100 - abs(r - 50) * 2)
        parts.append((s, 1.0))
        if r > 70:
            expl.append(f"RSI {r:.0f} (quá mua >70) — rủi ro đảo chiều giảm.")
        elif r < 30:
            expl.append(
                f"RSI {r:.0f} (quá bán <30) — có thể là cơ hội HOẶC dấu hiệu xấu, "
                "cần xem thêm yếu tố cơ bản."
            )
        else:
            expl.append(f"RSI {r:.0f} (vùng trung tính 30-70).")

    if len(volumes) >= 90:
        v30 = sum(volumes[-30:]) / 30
        v90 = sum(volumes[-90:]) / 90
        if v90 > 0:
            ratio = v30 / v90
            s = _clamp(50 + (ratio - 1) * 50)
            parts.append((s, 1.0))
            expl.append(
                f"Khối lượng 30 phiên {'cao' if ratio >= 1 else 'thấp'} hơn TB 90 phiên "
                f"({ratio:.2f}×) — xem khối lượng đi kèm chiều giá để diễn giải."
            )

    # MACD(12,26,9) — trend momentum from the moving-average spread.
    macd_line, signal_line, hist = indicators.macd(closes)
    if hist is not None:
        s = 65.0 if hist > 0 else 35.0
        parts.append((s, 1.0))
        expl.append(
            f"MACD {'trên' if hist > 0 else 'dưới'} đường tín hiệu "
            f"(histogram {hist:+.2f}) — động lượng {'tăng' if hist > 0 else 'giảm'}."
        )

    # Bollinger %B — where price sits within its 20-day volatility bands.
    if price is not None:
        upper, middle, lower = indicators.bollinger_bands(closes, 20, 2.0)
        pb = indicators.percent_b(price, upper, lower)
        if pb is not None:
            s = _clamp(50 + (pb - 0.5) * 80)
            if pb > 1:
                s = _clamp(s - 20)  # above the upper band → stretched
                expl.append(f"Giá trên dải Bollinger trên (%B {pb:.2f}) — có thể căng/quá mua.")
            elif pb < 0:
                expl.append(f"Giá dưới dải Bollinger dưới (%B {pb:.2f}) — có thể quá bán.")
            else:
                expl.append(f"Giá trong dải Bollinger (%B {pb:.2f}, 0=dưới · 1=trên).")
            parts.append((s, 0.5))

    # 52-week position (proxy from closes) — momentum context.
    if price is not None and len(closes) >= 60:
        hi, lo = indicators.week_52_range(closes, closes)
        pos = indicators.position_in_range(price, hi, lo)
        if pos is not None:
            s = _clamp(30 + pos * 0.5)
            parts.append((s, 0.5))
            expl.append(
                f"Giá ở {pos:.0f}% biên độ 52 tuần ({lo:,.0f}–{hi:,.0f}) "
                f"({'gần đỉnh' if pos >= 66 else 'gần đáy' if pos <= 33 else 'vùng giữa'})."
            )

    if not parts:
        return None, ["Không đủ dữ liệu giá để tính kỹ thuật (mã mới niêm yết?)."]
    score = sum(s * w for s, w in parts) / sum(w for _, w in parts)
    return round(score, 1), expl


def pe_hist_score(
    current_pe: float | None, pe_series: list[float | None]
) -> tuple[float | None, list[str]]:
    """Short-term valuation via mean-reversion: current P/E vs the stock's OWN clean
    historical average P/E. Cheaper than its history → higher score. Works from
    metric_history (universe-wide, no BCTC) — a stock-specific relative-value signal."""
    clean = [p for p in pe_series if p is not None and 0 < p < 60]
    if current_pe is None or current_pe <= 0 or len(clean) < 3:
        return None, []
    avg = sum(clean) / len(clean)
    vs = (current_pe - avg) / avg * 100  # negative = cheaper than its own history
    s = _clamp(50 - vs * 0.8)  # -50% → ~90, +50% → ~10
    framing = "rẻ hơn" if vs < 0 else "đắt hơn"
    return round(s, 1), [
        f"P/E {current_pe:.1f} {framing} TB {len(clean)} năm ({avg:.1f}) khoảng "
        f"{abs(vs):.0f}% — định giá tương đối theo lịch sử của chính mã (mean-reversion)."
    ]


def relative_valuation_score(val: dict) -> tuple[float | None, list[str]]:
    vc = val.get("vs_current_price") or {}
    disc = vc.get("discount_pct")
    if disc is None:
        return None, []
    s = _clamp(50 + disc)
    framing = "rẻ hơn" if disc > 0 else "đắt hơn"
    return round(s, 1), [
        f"Giá hiện tại {framing} vùng giá trị ước tính {abs(disc):.0f}% "
        "(so với giá trị nội tại từ module định giá)."
    ]


def catalyst_score(
    volumes: list[float], report_date, analyzed_at, now: datetime
) -> tuple[float, list[str]]:
    score = 50.0  # neutral baseline
    expl: list[str] = []

    if report_date is not None:
        age = (now.date() - report_date).days
        if age <= 100:
            score += 25
            expl.append(f"Có dữ liệu tài chính gần đây (cách ~{age} ngày) để đánh giá.")
    if analyzed_at is not None:
        age = (now - analyzed_at).days
        if age <= 30:
            score += 10
            expl.append("Có BCTC vừa được phân tích trong 30 ngày gần đây.")

    if len(volumes) >= 90:
        v5 = sum(volumes[-5:]) / 5
        v90 = sum(volumes[-90:]) / 90
        if v90 > 0 and v5 > 2 * v90:
            score += 15
            expl.append(
                "Khối lượng gần đây bất thường (>2× TB) — tín hiệu TRUNG LẬP, "
                "cần xem đi kèm tăng hay giảm giá."
            )

    if not expl:
        expl.append("Không có chất xúc tác/tín hiệu mới đáng chú ý gần đây.")
    return round(_clamp(score), 1), expl


# --- MID TERM: growth consistency + fair valuation ------------------------


def growth_consistency_score(
    years: list[str],
    revenue: list[float | None],
    net_profit: list[float | None],
    outlier_years: set[str],
) -> tuple[float | None, list[str]]:
    clean = [i for i, y in enumerate(years) if y not in outlier_years]
    if len(clean) < 2:
        return None, [
            "Không đủ kỳ 'sạch' (sau khi loại kỳ bất thường) để đánh giá tăng "
            "trưởng liên tục."
        ]
    rev = [revenue[i] for i in clean]
    npf = [net_profit[i] for i in clean]
    steps = len(clean) - 1
    both_up = sum(
        1
        for i in range(1, len(clean))
        if rev[i] is not None and rev[i - 1] is not None and rev[i] > rev[i - 1]
        and npf[i] is not None and npf[i - 1] is not None and npf[i] > npf[i - 1]
    )
    up_ratio = both_up / steps

    growths = [
        (npf[i] - npf[i - 1]) / abs(npf[i - 1])
        for i in range(1, len(clean))
        if npf[i] is not None and npf[i - 1] not in (None, 0)
    ]
    if len(growths) >= 2:
        mean = statistics.mean(growths)
        cv = statistics.pstdev(growths) / abs(mean) if mean else 5.0
        vol_score = _clamp(100 - cv * 50)
    else:
        vol_score = 50.0

    score = up_ratio * 100 * 0.6 + vol_score * 0.4
    expl = [
        f"{both_up}/{steps} kỳ liên tiếp tăng cả doanh thu VÀ lợi nhuận "
        f"(dựa trên {len(clean)} kỳ sạch).",
        f"Độ ổn định tăng trưởng: {'đều' if vol_score >= 60 else 'biến động'} "
        f"({vol_score:.0f}/100).",
    ]
    return round(score, 1), expl


def fair_valuation_score(val: dict) -> tuple[float | None, list[str]]:
    vc = val.get("vs_current_price") or {}
    disc = vc.get("discount_pct")
    rng = val.get("valuation_range") or {}
    if disc is None or rng.get("median") is None:
        return None, []
    s = _clamp(50 + disc)
    return round(s, 1), [
        f"Giá {rng.get('low')}–{rng.get('high')}đ (trung vị {rng.get('median')}đ); "
        f"{val['vs_current_price']['interpretation']}"
    ]


# --- LONG TERM: financial quality + dividend consistency ------------------


def financial_quality_score(
    years: list[str],
    net_profit: list[float | None],
    operating_cashflow: list[float | None],
    capital_structure: list[dict],
    outlier_years: set[str],
    debt_equity: float | None,
) -> tuple[float | None, list[str], list[str]]:
    comps: list[tuple[str, float | None, float]] = []
    expl: list[str] = []
    gaps: list[str] = []
    n = len(years)

    # The multi-year fundamentals ARE the quality signal. Without them (no BCTC
    # analysis), debt/equity alone must NOT pass as "high quality" — return null so
    # the score honestly reflects "không đủ dữ liệu" instead of a misleading number.
    if n == 0:
        return None, [], [
            "Thiếu chuỗi nhiều năm (cần phân tích BCTC) — chưa đánh giá được chất lượng tài chính."
        ]

    prof = [p for p in net_profit if p is not None]
    if prof:
        ratio = sum(1 for p in prof if p > 0) / len(prof) * 100
        comps.append(("profit_positive", ratio, 0.20))
        expl.append(f"{sum(1 for p in prof if p>0)}/{len(prof)} kỳ có lợi nhuận dương.")
    ocf = [c for c in operating_cashflow if c is not None]
    if ocf:
        ratio = sum(1 for c in ocf if c > 0) / len(ocf) * 100
        comps.append(("ocf_positive", ratio, 0.25))
        expl.append(f"{sum(1 for c in ocf if c>0)}/{len(ocf)} kỳ có dòng tiền HĐKD dương.")
    clean_ratio = (n - len(outlier_years & set(years))) / n * 100
    comps.append(("earnings_cleanliness", clean_ratio, 0.15))
    expl.append(f"{n - len(outlier_years & set(years))}/{n} kỳ không bị đánh dấu bất thường.")

    # Retained earnings (accumulated profit) from capital structure
    retained = next(
        (
            it
            for it in capital_structure
            if any(k in (it.get("label") or "").lower() for k in ("chưa phân phối", "lũy kế"))
        ),
        None,
    )
    if retained is not None and retained.get("value") is not None:
        positive = retained["value"] >= 0
        comps.append(("retained_earnings", 100.0 if positive else 0.0, 0.25))
        expl.append(
            f"Lợi nhuận lũy kế {'dương' if positive else 'ÂM'} ({retained['value']:g} tỷ)"
            + ("" if positive else " — rủi ro chất lượng tài chính.")
        )

    if debt_equity is not None:
        s = _clamp(100 - max(debt_equity - 0.5, 0) * 40)
        comps.append(("debt_equity_health", s, 0.15))
        expl.append(f"Nợ/Vốn CSH {debt_equity:.2f} ({'lành mạnh' if debt_equity < 1 else 'đòn bẩy cao'}).")

    score, _ = _combine(comps)
    if score is None:
        gaps.append("Không đủ dữ liệu để tính chất lượng tài chính.")
    return score, expl, gaps


# --- orchestration --------------------------------------------------------


async def _latest_metric(session: AsyncSession, symbol: str) -> StockMetric | None:
    return (
        await session.execute(
            select(StockMetric)
            .where(StockMetric.symbol == symbol.upper())
            .order_by(StockMetric.report_date.desc().nullslast(), StockMetric.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def _metric_history(session: AsyncSession, symbol: str) -> list[dict]:
    rows = (
        await session.execute(
            select(MetricHistory)
            .where(MetricHistory.symbol == symbol.upper())
            .order_by(MetricHistory.year)
        )
    ).scalars().all()
    return [
        {"year": r.year, "roe": r.roe, "dividend_yield": r.dividend_yield, "pe": r.pe}
        for r in rows
    ]


async def _latest_document(session: AsyncSession, symbol: str) -> Document | None:
    return (
        await session.execute(
            select(Document)
            .where(Document.symbol == symbol.upper(), Document.analysis.isnot(None))
            .order_by(Document.analyzed_at.desc().nullslast(), Document.id.desc())
            .limit(1)
        )
    ).scalar_one_or_none()


async def get_compass(session: AsyncSession, symbol: str) -> dict:
    now = datetime.now(timezone.utc)
    bars = await stock_service.get_ohlc(symbol, 150)
    closes = [b["close"] for b in bars if b.get("close") is not None]
    volumes = [b["volume"] for b in bars if b.get("volume") is not None]

    metric = await _latest_metric(session, symbol)
    doc = await _latest_document(session, symbol)
    analysis = doc.analysis if doc else None
    val = await valuation.get_valuation(session, symbol)
    val_ok = "error" not in val

    # Real ROE + dividend history (ride on the metrics sync — no BCTC needed).
    hist = await _metric_history(session, symbol)
    roe_stats = roe_history.roe_stats(hist)
    roe_ok = roe_stats.get("available", False)
    div_stats = dividends.dividend_stats(hist)
    div_ok = div_stats.get("available", False)

    # Merged multi-year series across ANNUAL reports (year-over-year growth/quality
    # needs full-year figures, not quarterly comparatives).
    myt = await valuation.merged_trend(session, symbol, annual_only=True)
    years = myt.get("years") or []
    outlier_years = (
        {o["year"] for o in val["earnings_quality"]["outliers_detected"]}
        if val_ok
        else set()
    )
    data_gaps: list[str] = []
    if not val_ok:
        data_gaps.append("Chưa phân tích BCTC — thiếu dữ liệu định giá & nhiều năm (ảnh hưởng trung & dài hạn).")

    # SHORT TERM
    tech_s, tech_e = short_term_technical(closes, volumes)
    # Primary relative-value signal: current P/E vs the stock's OWN 5yr-avg P/E
    # (mean-reversion, universe-wide). The BCTC fair-value discount supplements it.
    pehist_s, pehist_e = pe_hist_score(
        metric.pe if metric else None, [h.get("pe") for h in hist]
    )
    relval_s, relval_e = relative_valuation_score(val) if val_ok else (None, [])
    cat_s, cat_e = catalyst_score(
        volumes,
        metric.report_date if metric else None,
        doc.analyzed_at if doc else None,
        now,
    )
    short_score, short_bd = _combine(
        [
            ("technical", tech_s, 0.4),
            ("valuation_pe_hist", pehist_s, 0.25),
            ("valuation_relative", relval_s, 0.15),
            ("catalyst", cat_s, 0.2),
        ]
    )
    if tech_s is None:
        data_gaps.append("Thiếu dữ liệu giá cho điểm kỹ thuật ngắn hạn.")
    if pehist_s is None and relval_s is None:
        data_gaps.append("Thiếu P/E lịch sử & định giá cho điểm 'giá tương đối' ngắn hạn.")

    # MID TERM — ROE trajectory supplements BCTC growth/valuation (and stands in
    # for them when no BCTC has been analyzed).
    growth_s, growth_e = growth_consistency_score(
        years, myt.get("revenue") or [], myt.get("net_profit") or [], outlier_years
    )
    fair_s, fair_e = fair_valuation_score(val) if val_ok else (None, [])
    roe_mid_s = roe_stats["quality_score"] if roe_ok else None
    roe_e = roe_history.roe_explanation(roe_stats) if roe_ok else []
    mid_score, mid_bd = _combine(
        [
            ("growth_consistency", growth_s, 0.4),
            ("valuation_fair", fair_s, 0.4),
            ("roe_trend", roe_mid_s, 0.2),
        ]
    )
    if growth_s is None and not roe_ok:
        data_gaps.append("Không đủ kỳ sạch để đánh giá tăng trưởng trung hạn.")

    # LONG TERM — real ROE quality now carries the score even without a BCTC.
    fin_s, fin_e, fin_gaps = financial_quality_score(
        years,
        myt.get("net_profit") or [],
        myt.get("operating_cashflow") or [],
        (analysis or {}).get("capital_structure") or [],
        outlier_years,
        metric.debt_equity if metric else None,
    )
    roe_long_s = roe_stats["quality_score"] if roe_ok else None
    if fin_s is None and roe_ok:
        # ROE history alone covers the BCTC-quality gap — drop the "cần BCTC" note.
        fin_gaps = [g for g in fin_gaps if "chất lượng tài chính" not in g]
    data_gaps.extend(fin_gaps)
    if not roe_ok:
        data_gaps.append("Chưa có chuỗi ROE nhiều năm — điểm dài hạn kém tin cậy.")
    # Dividend consistency: now sourced from the per-year dividend_yield series.
    div_long_s = div_stats["score"] if div_ok else None
    div_e = dividends.dividend_explanation(div_stats) if div_ok else []
    if not div_ok:
        data_gaps.append("Thiếu tỷ suất cổ tức lịch sử — bỏ qua thành phần cổ tức dài hạn.")
    long_score, long_bd = _combine(
        [
            ("financial_quality", fin_s, 0.5),
            ("roe_quality", roe_long_s, 0.35),
            ("dividend_consistency", div_long_s, 0.15),
        ]
    )
    fin_e = fin_e + roe_e + div_e

    result = {
        "disclaimer": DISCLAIMER,
        "short_term": {"score": short_score, "breakdown": short_bd, "explanation": tech_e + pehist_e + relval_e + cat_e},
        "mid_term": {"score": mid_score, "breakdown": mid_bd, "explanation": growth_e + fair_e + roe_e},
        "long_term": {"score": long_score, "breakdown": long_bd, "explanation": fin_e},
        "roe_history": roe_stats if roe_ok else None,
        "dividend_history": div_stats if div_ok else None,
        "data_gaps": data_gaps,
    }
    # Cache the badge scores when there's real signal (BCTC-derived OR ROE history),
    # so the screener badge shows a value once fundamentals are known, "—" otherwise.
    if mid_score is not None or long_score is not None:
        await _store_scores(session, symbol, short_score, mid_score, long_score)
    return result


async def _store_scores(
    session: AsyncSession,
    symbol: str,
    short: float | None,
    mid: float | None,
    long: float | None,
) -> None:
    sym = symbol.upper()
    row = await session.get(CompassScore, sym)
    if row is None:
        session.add(CompassScore(symbol=sym, short_score=short, mid_score=mid, long_score=long))
    else:
        row.short_score, row.mid_score, row.long_score = short, mid, long
    await session.commit()


async def get_scores_batch(session: AsyncSession, symbols: list[str]) -> dict:
    """Read precomputed compass scores for a set of symbols (no AI, no recompute)."""
    syms = [s.upper() for s in symbols if s]
    if not syms:
        return {}
    rows = (
        await session.execute(select(CompassScore).where(CompassScore.symbol.in_(syms)))
    ).scalars().all()
    return {
        r.symbol: {
            "short": r.short_score,
            "mid": r.mid_score,
            "long": r.long_score,
            "computed_at": r.computed_at.isoformat() if r.computed_at else None,
        }
        for r in rows
    }
