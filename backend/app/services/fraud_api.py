"""Build the per-symbol fraud-scores API response from stored raw statements.

Recomputes the 3 models on the fly (pure math, instant) so the response can expose
full transparency — Beneish top contributors, Piotroski criteria — not just the
stored headline. Research-only: a screening signal, never a fraud verdict.
"""
from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models import FinancialStatement, Stock
from app.services.earnings_quality import calculate_earnings_quality
from app.services.fraud_detection import (
    calculate_altman,
    calculate_altman_emerging,
    calculate_beneish,
    calculate_piotroski,
)
from app.services.fraud_scan import _period

DISCLAIMER = (
    "Các mô hình định lượng này là công cụ SÀNG LỌC thống kê, KHÔNG phải kết luận về "
    "gian lận. Điểm cao chỉ ra nên xem xét kỹ hơn, không khẳng định công ty đang gian lận."
)

_BENEISH_MEANING = {
    "TATA": "Lợi nhuận kế toán vượt xa dòng tiền thực",
    "DSRI": "Phải thu tăng nhanh hơn doanh thu (ghi nhận doanh thu sớm?)",
    "SGI": "Tăng trưởng doanh thu cao (áp lực duy trì)",
    "GMI": "Biên lợi nhuận gộp suy giảm",
    "AQI": "Tỷ trọng tài sản khó xác minh tăng",
    "DEPI": "Tốc độ khấu hao chậm lại",
    "SGAI": "Hiệu quả chi phí SG&A thay đổi",
    "LVGI": "Đòn bẩy tài chính tăng",
}
_BENEISH_FLAG_VI = {
    "high_risk": "Điểm vượt ngưỡng −1.78 — có dấu hiệu cần soi kỹ lợi nhuận",
    "medium_risk": "Vùng cảnh báo trung bình",
    "low_risk": "Rủi ro thao túng lợi nhuận thấp",
    "insufficient_data": "Thiếu dữ liệu (<6/8 biến) — chưa đủ tin cậy để kết luận",
}
_ZONE_VI = {
    "safe": "Vùng an toàn, rủi ro kiệt quệ thấp",
    "grey": "Vùng cảnh báo (grey zone)",
    "distress": "Vùng nguy hiểm (kiệt quệ tài chính)",
    "not_applicable": "Không áp dụng (ngân hàng/tài chính — cấu trúc khác)",
    "insufficient_data": "Thiếu dữ liệu để tính",
}
_QOE_FLAG_VI = {
    "strong": "Lợi nhuận có dòng tiền thực đỡ lưng tốt",
    "adequate": "Chất lượng lợi nhuận ở mức chấp nhận được",
    "weak": "Lợi nhuận dựa nhiều vào bút toán dồn tích — soi kỹ dòng tiền",
    "insufficient_data": "Thiếu dữ liệu (<2 thành phần) — chưa đủ tin cậy",
}
_QOE_COMPONENT_VI = {
    "accruals": "Dồn tích Sloan: (LNST − dòng tiền HĐKD)/tài sản BQ (thấp/âm là tốt)",
    "cash_conversion": "Chuyển đổi tiền mặt: dòng tiền HĐKD / LNST (≥1 là lợi nhuận thu được tiền)",
    "receivables": "Tăng trưởng doanh thu so với phải thu (phải thu vượt doanh thu là cảnh báo)",
    "margin_trend": "Xu hướng biên lợi nhuận gộp (tăng/ổn định là tốt)",
}


async def build_fraud_response(session: AsyncSession, symbol: str) -> dict | None:
    sym = symbol.upper()
    rows = (await session.execute(
        select(FinancialStatement)
        .where(FinancialStatement.symbol == sym, FinancialStatement.period_type == "year")
        .order_by(FinancialStatement.period)
    )).scalars().all()
    if len(rows) < 2:
        return None
    cur, prior = rows[-1], rows[-2]
    st = (await session.execute(select(Stock).where(Stock.symbol == sym))).scalar_one_or_none()
    mcap = st.market_cap if st else None
    sector = st.industry if st else None

    curd, priord = _period(cur, mcap), _period(prior)
    b = calculate_beneish(curd, priord)
    a = calculate_altman(curd, sector)
    aem = calculate_altman_emerging(curd, sector)
    p = calculate_piotroski(curd, priord)
    q = calculate_earnings_quality(curd, priord)

    top = sorted(
        (k for k, v in b.contributions.items()),
        key=lambda k: abs(b.contributions[k]), reverse=True,
    )[:3]
    contributors = [
        {"variable": k, "contribution": round(b.contributions[k], 3),
         "meaning": _BENEISH_MEANING.get(k, "")}
        for k in top
    ]

    return {
        "symbol": sym,
        "period": cur.period,
        "beneish": {
            "score": b.score, "flag": b.flag,
            "interpretation": _BENEISH_FLAG_VI.get(b.flag, ""),
            "variables_used": b.variables_used,
            "top_contributors": contributors,
        },
        "altman": {  # Z'' emerging-markets is primary for VN
            "score": aem.score, "zone": aem.zone,
            "interpretation": _ZONE_VI.get(aem.zone, ""),
            "model": "Z'' (emerging markets)",
            "original": {"score": a.score, "zone": a.zone,
                         "interpretation": _ZONE_VI.get(a.zone, ""), "model": "Z (1968, US)"},
        },
        "piotroski": {
            "score": p.score, "max_score": p.max_score,
            "criteria": [
                {"name": c["name"], "passed": c["passed"]} for c in p.criteria
            ],
        },
        "earnings_quality": {
            "score": q.score, "flag": q.flag,
            "interpretation": _QOE_FLAG_VI.get(q.flag, ""),
            "components_used": q.components_used,
            "components": [
                {"name": name, "value": c["value"], "sub_score": c["sub_score"],
                 "meaning": _QOE_COMPONENT_VI.get(name, "")}
                for name, c in q.components.items()
            ],
        },
        "disclaimer": DISCLAIMER,
    }
