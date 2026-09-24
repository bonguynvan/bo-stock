"""Multi-symbol comparison PDF report (research-only).

Puts several stocks side by side: a metric comparison table + a per-symbol summary of
the investment lenses (met/total per school) and the fraud/strength screen. Reuses
``report_pdf``'s HTML→Chromium renderer and helpers. Numbers + neutral framing only.
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FraudScore
from app.services import lenses, stock_service
from app.services.report_pdf import DISCLAIMER, _esc, _num, _pct, html_to_pdf

# (metric key, label, format) — format: int decimals, or "pct".
_COMPARE_ROWS: tuple[tuple[str, str, object], ...] = (
    ("close_price", "Giá", 0),
    ("change_pct", "% Ngày", "pct"),
    ("market_cap", "Vốn hóa (tỷ)", 0),
    ("pe", "P/E", 1),
    ("pb", "P/B", 1),
    ("roe", "ROE %", 1),
    ("roa", "ROA %", 1),
    ("net_margin", "Biên LN %", 1),
    ("debt_equity", "Nợ/VCSH", 2),
    ("dividend_yield", "Cổ tức %", 1),
    ("quant_score", "Quant", 0),
)


async def gather_multi(session: AsyncSession, symbols: list[str]) -> list[dict]:
    rows = await stock_service.metrics_for_symbols(session, symbols)
    syms = [r.symbol for r in rows]

    # Latest fraud score per symbol in one query (newest period wins).
    latest_fraud: dict[str, FraudScore] = {}
    if syms:
        fraud_rows = (
            await session.execute(
                select(FraudScore).where(FraudScore.symbol.in_(syms))
                .order_by(FraudScore.symbol, FraudScore.period.asc())
            )
        ).scalars().all()
        for fs in fraud_rows:  # ascending period → last write per symbol = latest
            latest_fraud[fs.symbol] = fs

    items: list[dict] = []
    for r in rows:
        m = r.model_dump()
        fraud = latest_fraud.get(r.symbol)
        items.append({
            "symbol": r.symbol,
            "name": r.company_name,
            "metrics": m,
            "lenses": lenses.evaluate_lenses(m),
            "fraud": None if fraud is None else {
                "beneish": fraud.beneish_flag,
                "altman": fraud.altman_em_zone,
                "piotroski": fraud.piotroski_fscore,
            },
        })
    return items


def _cell(value: object, fmt: object) -> str:
    if fmt == "pct":
        return _pct(value, 2)
    return _num(value, fmt if isinstance(fmt, int) else 0)


def render_multi_html(items: list[dict], generated_at: datetime) -> str:
    gen = generated_at.strftime("%d/%m/%Y")
    syms = [it["symbol"] for it in items]
    head = "".join(f"<th>{_esc(s)}</th>" for s in syms)
    body = ""
    for key, label, fmt in _COMPARE_ROWS:
        cells = "".join(f"<td>{_cell(it['metrics'].get(key), fmt)}</td>" for it in items)
        body += f"<tr><td>{_esc(label)}</td>{cells}</tr>"

    cards = ""
    for it in items:
        lens_line = " · ".join(f"{_esc(l['name'])}: {l['met']}/{l['total']}" for l in it["lenses"])
        fr = it["fraud"]
        fraud_line = (
            f"Beneish {_esc(fr['beneish'])} · Altman {_esc(fr['altman'])} · Piotroski {_esc(fr['piotroski'])}"
            if fr else "chưa có điểm sàng lọc"
        )
        cards += (
            f'<div class="card"><h4>{_esc(it["symbol"])} '
            f'<span class="muted">{_esc(it["name"])}</span></h4>'
            f'<p>Lăng kính đầu tư — {lens_line}</p>'
            f'<p class="muted">Sàng lọc định lượng — {fraud_line}</p></div>'
        )

    return f"""<!DOCTYPE html><html lang="vi"><head><meta charset="utf-8">
<style>
  * {{ box-sizing:border-box; }}
  body {{ font-family:-apple-system,"Segoe UI",Roboto,Arial,sans-serif; color:#1a1a1a; margin:0; font-size:12px; }}
  .page {{ padding:28px 34px; }}
  h1 {{ font-size:24px; margin:0; color:#0b4a8f; }}
  h2 {{ font-size:14px; text-transform:uppercase; letter-spacing:.5px; color:#0b4a8f;
        border-bottom:2px solid #0b4a8f; padding-bottom:3px; margin:22px 0 10px; }}
  h4 {{ font-size:12px; margin:0 0 4px; color:#333; }}
  table {{ width:100%; border-collapse:collapse; }}
  th, td {{ text-align:right; padding:5px 8px; border-bottom:1px solid #eee; }}
  th:first-child, td:first-child {{ text-align:left; color:#555; }}
  th {{ color:#666; font-size:10px; text-transform:uppercase; }}
  .muted {{ color:#666; }}
  .cards {{ display:grid; grid-template-columns:1fr 1fr; gap:10px; }}
  .card {{ border:1px solid #e2e2e2; border-radius:6px; padding:10px; background:#fafafa; }}
  .card p {{ margin:3px 0; }}
  .banner {{ background:#eaf2fb; border-left:3px solid #0b4a8f; padding:8px 12px; margin:14px 0; color:#333; }}
  .foot {{ margin-top:22px; border-top:1px solid #ddd; padding-top:8px; color:#777; font-size:10px; }}
</style></head>
<body><div class="page">
  <div style="display:flex;justify-content:space-between;align-items:flex-start">
    <div><h1>So sánh cổ phiếu</h1><p class="muted">{_esc(", ".join(syms))}</p></div>
    <div style="text-align:right;color:#666">
      <div style="font-weight:700;color:#0b4a8f">V-Investment OS</div>
      <div>Báo cáo so sánh · {gen}</div>
    </div>
  </div>
  <div class="banner">{DISCLAIMER}</div>
  <h2>Bảng so sánh chỉ số</h2>
  <table><thead><tr><th>Chỉ số</th>{head}</tr></thead><tbody>{body}</tbody></table>
  <h2>Lăng kính &amp; sàng lọc theo mã</h2>
  <div class="cards">{cards}</div>
  <div class="foot">{DISCLAIMER}</div>
</div></body></html>"""


async def generate_compare(session: AsyncSession, symbols: list[str]) -> tuple[bytes, str]:
    items = await gather_multi(session, symbols)
    generated_at = datetime.now(timezone.utc)
    pdf = await html_to_pdf(render_multi_html(items, generated_at))
    return pdf, f"VI-OS_SoSanh_{generated_at.strftime('%d%m%y')}.pdf"
