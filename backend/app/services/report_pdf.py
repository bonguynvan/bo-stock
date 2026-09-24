"""V-Investment OS — per-stock PDF report (research-only).

Assembles what the app already computes (fundamentals, Compass, valuation, the
objective "Tóm tắt để cân nhắc" digest, industry comparison, ROE/dividend history)
into one styled HTML document and renders it to PDF with the backend's Chromium.
No new analysis, no AI call (uses the STORED digest). Numbers + neutral framing —
never a buy/sell recommendation.
"""
from __future__ import annotations

import asyncio
import html
import logging
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import Document
from app.services import compass, consideration, peers, stock_service, valuation

logger = logging.getLogger("vnios.report")

DISCLAIMER = (
    "Báo cáo tổng hợp dữ liệu & phân tích tham khảo do V-Investment OS tạo tự động — "
    "KHÔNG phải khuyến nghị mua/bán. Số liệu từ nguồn công khai, hãy tự kiểm chứng "
    "với báo cáo gốc trước khi ra quyết định."
)


def _esc(s: object) -> str:
    return html.escape(str(s)) if s is not None else ""


def _num(v: object, dec: int = 0) -> str:
    if v is None:
        return "—"
    try:
        return f"{float(v):,.{dec}f}"
    except (TypeError, ValueError):
        return _esc(v)


def _pct(v: object, dec: int = 1) -> str:
    return "—" if v is None else f"{float(v):+.{dec}f}%"


def _band(score: float | None) -> str:
    if score is None:
        return "#8a8a8a"
    return "#1f9d55" if score >= 65 else "#c88a12" if score >= 40 else "#c0392b"


def _svg_bars(points: list[dict], val_key: str, unit: str, color: str) -> str:
    """Inline SVG bar chart from [{year, <val_key>}] (server-safe, print-perfect)."""
    pts = [p for p in points if p.get(val_key) is not None]
    if not pts:
        return ""
    vals = [float(p[val_key]) for p in pts]
    hi = max(vals + [0.0])
    lo = min(vals + [0.0])
    span = (hi - lo) or 1.0
    w, h, gap = 460, 90, 8
    bw = (w - gap * (len(pts) - 1)) / len(pts)
    bars = []
    zero_y = h - (0 - lo) / span * h
    for i, p in enumerate(pts):
        v = float(p[val_key])
        x = i * (bw + gap)
        y = h - (v - lo) / span * h
        top = min(y, zero_y)
        height = abs(y - zero_y)
        bars.append(
            f'<rect x="{x:.1f}" y="{top:.1f}" width="{bw:.1f}" height="{max(height, 1):.1f}" '
            f'fill="{color}" rx="2"/>'
            f'<text x="{x + bw / 2:.1f}" y="{h + 14}" font-size="10" fill="#666" '
            f'text-anchor="middle">{_esc(p.get("year"))}</text>'
            f'<text x="{x + bw / 2:.1f}" y="{top - 3:.1f}" font-size="9" fill="#333" '
            f'text-anchor="middle">{v:.1f}</text>'
        )
    return (
        f'<svg viewBox="0 0 {w} {h + 20}" width="100%" style="max-width:480px">'
        + "".join(bars)
        + "</svg>"
        + f'<div class="cap">{_esc(unit)}</div>'
    )


_PERIOD_VI = {"annual": "Năm", "quarterly": "Quý", "interim": "Bán niên"}


def _trend_table(trend: dict) -> str:
    """Merged multi-year financial series (from all analyzed ANNUAL BCTC), tỷ VND."""
    years = trend.get("years") or []
    if len(years) < 2:
        return ""
    specs = [
        ("revenue", "Doanh thu"),
        ("net_profit", "LNST"),
        ("operating_cashflow", "Dòng tiền HĐKD"),
        ("equity", "Vốn CSH"),
        ("roe_pct", "ROE %"),
    ]
    head = "".join(f"<th>{_esc(y)}</th>" for y in years)
    body = ""
    for key, label in specs:
        series = trend.get(key) or []
        if not any(v is not None for v in series):
            continue
        cells = "".join(f"<td>{_num(v, 1) if v is not None else '—'}</td>" for v in series)
        body += f"<tr><td>{label}</td>{cells}</tr>"
    if not body:
        return ""
    return (
        '<p class="muted">Gộp từ các BCTC năm đã phân tích (tỷ VND / %).</p>'
        f'<table class="trend"><thead><tr><th>Chỉ tiêu</th>{head}</tr></thead>'
        f"<tbody>{body}</tbody></table>"
    )


def _rows(pairs: list[tuple[str, str]]) -> str:
    return "".join(
        f'<div class="kv"><span>{_esc(k)}</span><b>{v}</b></div>' for k, v in pairs
    )


async def gather(session: AsyncSession, symbol: str) -> dict:
    sym = symbol.upper()
    detail = await stock_service.get_stock_detail(session, sym)
    comp = await compass.get_compass(session, sym)
    val = await valuation.get_valuation(session, sym)
    digest = await consideration.get_stored(session, sym)
    bench = await peers.industry_benchmark(session, sym)
    # Every analyzed BCTC for this symbol → provenance list + the MERGED annual series
    # (valuation/compass/digest already use this merge; the report now shows it too).
    docs = (
        await session.execute(
            select(Document)
            .where(Document.symbol == sym, Document.analysis.isnot(None))
            .order_by(Document.analyzed_at.desc().nullslast(), Document.id.desc())
        )
    ).scalars().all()
    return {
        "symbol": sym,
        "detail": detail,
        "compass": comp,
        "valuation": val,
        "digest": digest,
        "bench": bench,
        "documents": [
            {"filename": d.filename, "period": d.report_period,
             "analyzed_at": d.analyzed_at.strftime("%d/%m/%Y") if d.analyzed_at else None}
            for d in docs
        ],
        "trend": await valuation.merged_trend(session, sym, annual_only=True),
        "generated_at": datetime.now(timezone.utc),
    }


def render_html(data: dict) -> str:
    sym = data["symbol"]
    d = data["detail"]
    comp = data["compass"]
    val = data["valuation"]
    digest = data["digest"]
    bench = data["bench"]
    gen = data["generated_at"].strftime("%d/%m/%Y")

    name = _esc(getattr(d, "company_name", None)) if d else ""
    industry = _esc(getattr(d, "industry", None)) if d else ""

    # --- fundamentals ---
    fund = ""
    if d:
        fund = _rows([
            ("Giá", f"{_num(d.close_price)} đ"),
            ("% Ngày", _pct(d.change_pct, 2)),
            ("Vốn hóa (tỷ)", _num(d.market_cap)),
            ("P/E", _num(d.pe, 1)),
            ("P/B", _num(d.pb, 1)),
            ("ROE %", _num(d.roe, 1)),
            ("EPS (trailing)", _num(d.eps_trailing, 0)),
            ("Vốn điều lệ (tỷ)", _num(d.charter_capital)),
        ])

    # --- compass ---
    def horizon(key: str, label: str) -> str:
        hz = comp.get(key) or {}
        sc = hz.get("score")
        bullets = "".join(f"<li>{_esc(x)}</li>" for x in (hz.get("explanation") or [])[:4])
        return (
            f'<div class="hz"><div class="hz-h">{label}</div>'
            f'<div class="hz-s" style="color:{_band(sc)}">{"—" if sc is None else round(sc)}</div>'
            f'<ul>{bullets}</ul></div>'
        )

    compass_html = (
        '<div class="hz-row">'
        + horizon("short_term", "Ngắn hạn")
        + horizon("mid_term", "Trung hạn")
        + horizon("long_term", "Dài hạn")
        + "</div>"
    )

    # --- valuation ---
    if "error" in val:
        val_html = f'<p class="muted">{_esc(val["error"])}</p>'
    else:
        rng = val.get("valuation_range") or {}
        vc = val.get("vs_current_price") or {}
        methods = "".join(
            f'<div class="kv"><span>{_esc(k)}</span><b>{_num(m.get("value"))} đ</b></div>'
            for k, m in (val.get("methods") or {}).items()
            if m.get("value") is not None
        )
        val_html = (
            f'<div class="kv"><span>Vùng giá trị ước tính</span>'
            f'<b>{_num(rng.get("low"))} – {_num(rng.get("high"))} đ (TV {_num(rng.get("median"))})</b></div>'
            + methods
            + f'<p class="muted">{_esc(vc.get("interpretation"))}</p>'
        )

    # --- industry comparison ---
    bench_html = ""
    if bench:
        rows = "".join(
            f"<tr><td>{_esc(m['label'])}</td><td>{_num(m['value'], 2)}</td>"
            f"<td>{_num(m['median'], 2)}</td>"
            f"<td>{'—' if m['percentile'] is None else f'top {100 - m['percentile']}%'}</td></tr>"
            for m in bench["metrics"]
        )
        bench_html = (
            f'<p class="muted">Ngành: {_esc(bench["industry"])} · {bench["peer_count"]} mã</p>'
            '<table><thead><tr><th>Chỉ số</th><th>Mã này</th><th>TB ngành</th>'
            f'<th>Xếp hạng</th></tr></thead><tbody>{rows}</tbody></table>'
        )

    # --- ROE / dividend history charts ---
    charts = ""
    roe_h = comp.get("roe_history")
    if roe_h and roe_h.get("series"):
        charts += f'<div class="chart"><h4>ROE {roe_h["n"]} năm (%)</h4>{_svg_bars(roe_h["series"], "roe", "ROE % theo năm", "#2b6cb0")}</div>'
    div_h = comp.get("dividend_history")
    if div_h and div_h.get("series"):
        charts += f'<div class="chart"><h4>Cổ tức {div_h["n"]} năm (%)</h4>{_svg_bars(div_h["series"], "dividend_yield", "Tỷ suất cổ tức % theo năm", "#c88a12")}</div>'

    # --- analyzed BCTC sources + merged multi-year trend ---
    docs = data.get("documents") or []
    trend_table = _trend_table(data.get("trend") or {})
    sources_html = ""
    if docs:
        items = "".join(
            f"<li>{_esc(x['filename'])} · <span class='muted'>{_PERIOD_VI.get(x['period'], x['period'] or '—')}"
            + (f" · phân tích {x['analyzed_at']}" if x.get("analyzed_at") else "")
            + "</span></li>"
            for x in docs
        )
        sources_html = (
            f'<p class="muted">{len(docs)} báo cáo đã phân tích bằng AI (định giá &amp; xu hướng '
            "dùng các BCTC năm; báo cáo quý phản ánh hiện trạng gần nhất):</p>"
            f"<ul class='src'>{items}</ul>"
        )

    # --- consideration digest ---
    digest_html = '<p class="muted">Chưa có "Tóm tắt để cân nhắc" — phân tích một BCTC để tạo.</p>'
    if digest:
        def pts(items: list[dict], third: str) -> str:
            return "".join(
                f"<li><b>{_esc(it.get('point'))}</b>"
                + (f"<br><span class='ev'>Bằng chứng: {_esc(it.get('evidence'))}</span>" if it.get("evidence") else "")
                + (f"<br><span class='ev'>{_esc(it.get(third))}</span>" if it.get(third) else "")
                + "</li>"
                for it in items
            )
        strengths = pts(digest.get("strengths") or [], "significance")
        concerns = pts(digest.get("concerns") or [], "implication")
        questions = "".join(
            f"<li>{_esc(q.get('question') if isinstance(q, dict) else q)}</li>"
            for q in (digest.get("questions_to_answer") or [])
        )
        devs = "".join(
            f"<li><b>{_esc(x.get('headline'))}</b>"
            + (f"<br><span class='ev'>{_esc(x.get('note'))}</span>" if x.get("note") else "")
            + "</li>"
            for x in (digest.get("recent_developments") or [])
        )
        vc = digest.get("valuation_context")
        digest_html = (
            f'<div class="two"><div><h4>Điểm mạnh</h4><ul>{strengths}</ul></div>'
            f'<div><h4>Điểm cần cân nhắc</h4><ul>{concerns}</ul></div></div>'
            + (f'<h4>Bối cảnh định giá</h4><p>{_esc(vc.get("summary"))} {_esc(vc.get("key_uncertainty"))}</p>' if vc else "")
            + (f'<h4>Diễn biến gần đây · cần kiểm chứng</h4><ul>{devs}</ul>' if devs else "")
            + (f'<h4>Câu hỏi cần tự trả lời</h4><ul>{questions}</ul>' if questions else "")
            + (f'<p class="muted">{_esc(digest.get("compass_interpretation"))}</p>' if digest.get("compass_interpretation") else "")
        )

    return f"""<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<style>
  * {{ box-sizing: border-box; }}
  body {{ font-family: -apple-system, "Segoe UI", Roboto, Arial, sans-serif; color:#1a1a1a; margin:0; font-size:12px; }}
  .page {{ padding: 28px 34px; }}
  h1 {{ font-size: 26px; margin:0; color:#0b4a8f; }}
  h2 {{ font-size: 14px; text-transform:uppercase; letter-spacing:.5px; color:#0b4a8f;
        border-bottom:2px solid #0b4a8f; padding-bottom:3px; margin:22px 0 10px; }}
  h4 {{ font-size:12px; margin:12px 0 5px; color:#333; }}
  .sub {{ color:#555; margin:3px 0 0; }}
  .grid {{ display:grid; grid-template-columns:repeat(4,1fr); gap:8px; }}
  .kv {{ display:flex; justify-content:space-between; border:1px solid #e2e2e2; padding:6px 9px; border-radius:4px; background:#fafafa; }}
  .kv span {{ color:#666; }}
  .hz-row {{ display:grid; grid-template-columns:repeat(3,1fr); gap:10px; }}
  .hz {{ border:1px solid #e2e2e2; border-radius:6px; padding:10px; }}
  .hz-h {{ text-transform:uppercase; font-size:10px; color:#666; letter-spacing:.5px; }}
  .hz-s {{ font-size:30px; font-weight:700; line-height:1.1; }}
  .hz ul {{ margin:4px 0 0; padding-left:15px; color:#444; }}
  .hz li {{ margin:2px 0; }}
  table {{ width:100%; border-collapse:collapse; }}
  th, td {{ text-align:left; padding:5px 8px; border-bottom:1px solid #eee; }}
  th {{ color:#666; font-size:10px; text-transform:uppercase; }}
  td:not(:first-child), th:not(:first-child) {{ text-align:right; }}
  .two {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }}
  .two ul, .cons ul {{ padding-left:16px; margin:4px 0; }}
  .two li {{ margin:5px 0; }}
  .ev {{ color:#555; font-size:11px; }}
  .muted {{ color:#666; }}
  .cap {{ color:#888; font-size:10px; margin-top:2px; }}
  .charts {{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }}
  .trend td:first-child {{ color:#555; }}
  .src {{ padding-left:16px; margin:4px 0; }}
  .src li {{ margin:2px 0; }}
  .banner {{ background:#eaf2fb; border-left:3px solid #0b4a8f; padding:8px 12px; margin:14px 0; color:#333; }}
  .foot {{ margin-top:22px; border-top:1px solid #ddd; padding-top:8px; color:#777; font-size:10px; }}
</style></head>
<body><div class="page">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div>
      <h1>{sym}</h1>
      <p class="sub">{name}{(" · " + industry) if industry else ""}</p>
    </div>
    <div style="text-align:right;color:#666">
      <div style="font-weight:700;color:#0b4a8f">V-Investment OS</div>
      <div>Báo cáo nghiên cứu · {gen}</div>
    </div>
  </div>

  <div class="banner">{DISCLAIMER}</div>

  <h2>Số liệu chính</h2>
  <div class="grid">{fund}</div>

  <h2>Kim Chỉ Nam</h2>
  {compass_html}

  <h2>Định giá</h2>
  {val_html}

  {"<h2>So sánh ngành</h2>" + bench_html if bench_html else ""}

  {"<h2>Xu hướng nhiều năm</h2><div class='charts'>" + charts + "</div>" if charts else ""}

  {"<h2>Xu hướng tài chính (từ BCTC đã phân tích)</h2>" + trend_table if trend_table else ""}

  <h2>Tóm tắt để cân nhắc</h2>
  <div class="cons">{digest_html}</div>

  {"<h2>Nguồn BCTC đã phân tích</h2>" + sources_html if sources_html else ""}

  <div class="foot">{DISCLAIMER}</div>
</div></body></html>"""


# Cap concurrent headless-Chromium renders — each launch is memory/CPU heavy, so a
# burst of report requests can't spawn unbounded browser processes.
_render_sem = asyncio.Semaphore(2)


async def html_to_pdf(html_str: str) -> bytes:
    from playwright.async_api import async_playwright

    async with _render_sem, async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            page = await browser.new_page()
            await page.set_content(html_str, wait_until="networkidle")
            return await page.pdf(
                format="A4",
                print_background=True,
                margin={"top": "12mm", "bottom": "12mm", "left": "10mm", "right": "10mm"},
            )
        finally:
            await browser.close()


async def generate(session: AsyncSession, symbol: str) -> tuple[bytes, str]:
    data = await gather(session, symbol)
    pdf = await html_to_pdf(render_html(data))
    stamp = data["generated_at"].strftime("%d%m%y")
    return pdf, f"VI-OS_{data['symbol']}_{stamp}.pdf"
