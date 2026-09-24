"""Anthropic Claude client for BCTC (financial report) analysis.

Research-only: the model extracts and summarizes figures. The system prompt
forbids buy/sell/hold recommendations, price targets, or investment advice.
PDF is sent as a native document block (handles scanned reports without OCR).
"""
from __future__ import annotations

import base64
import json
import logging

import httpx

from app.config import get_settings

logger = logging.getLogger("vnios.llm")


class LLMNotConfigured(RuntimeError):
    """Raised when no API key is configured."""


class AnalysisParseError(RuntimeError):
    """Raised when the model response is truncated or not valid JSON."""


SYSTEM_PROMPT = (
    "You are a financial-statement (BCTC) analysis assistant for a Vietnamese equity "
    "research tool. Analyze the report ONLY — extract, structure, and explain its "
    "figures. Do NOT give buy/sell/hold recommendations, price targets, valuations, "
    "or any investment advice. Respond in Vietnamese. Return ONLY a JSON object (no "
    "prose outside it) matching EXACTLY this schema:\n"
    "{\n"
    '"key_figures":[{"label":str,"value":str,"unit":str|null}],\n'
    '"summary":str,\n'
    '"yoy_changes":[str],\n'
    '"risk_flags":[str],\n'
    '"multi_year_trend":{"years":[str],"revenue":[number|null],"net_profit":[number|null],'
    '"gross_margin_pct":[number|null],"net_margin_pct":[number|null],"roe_pct":[number|null],'
    '"roa_pct":[number|null],"total_debt":[number|null],"equity":[number|null],'
    '"operating_cashflow":[number|null],"other_income":[number|null],"note":str},\n'
    '"asset_structure":[{"label":str,"value":number,"pct":number|null}],\n'
    '"capital_structure":[{"label":str,"value":number,"pct":number|null}],\n'
    '"revenue_breakdown":{"items":[{"label":str,"value":number,"pct":number|null}],"note":str},\n'
    '"ratios":[{"label":str,"value":str,"benchmark":str|null}],\n'
    '"cashflow":{"operating":{"net":number,"items":[{"label":str,"value":number}]},'
    '"investing":{"net":number,"items":[{"label":str,"value":number}]},'
    '"financing":{"net":number,"items":[{"label":str,"value":number}]}},\n'
    '"notes":[str]\n'
    "}\n\n"
    "QUY TẮC ĐƠN VỊ: mọi number tiền tệ (revenue, net_profit, total_debt, equity, "
    "asset_structure.value, capital_structure.value, revenue_breakdown.value, "
    "cashflow.*.net và items.value) PHẢI là số thô theo ĐƠN VỊ TỶ VND (vd 82.29), "
    "không kèm chữ, không dấu phân cách. Các *_pct (biên LN, ROE, ROA) là số phần trăm.\n\n"
    "key_figures: CHỈ ~10-12 chỉ tiêu HEADLINE kỳ hiện tại (doanh thu thuần, lợi nhuận "
    "gộp, biên LN gộp, LNST, biên LN ròng, EPS, tổng tài sản, vốn CSH, tổng nợ, nợ/vốn "
    "CSH, tiền & tương đương, dòng tiền HĐKD) — value là chuỗi hiển thị có đơn vị.\n"
    "summary: tóm tắt các điểm chính. yoy_changes: thay đổi đáng chú ý so với kỳ trước. "
    "risk_flags: điểm cần lưu ý (lợi nhuận bất thường, nợ xấu/phải thu khó đòi, tranh "
    "chấp pháp lý, dòng tiền cốt lõi yếu...).\n"
    "multi_year_trend: nếu BCTC có bảng so sánh nhiều năm (ở phụ lục/thuyết minh) hãy "
    "trích FULL chuỗi theo từng năm; nếu file chỉ có 2 năm thì trả 2 phần tử và đặt "
    'note "chỉ có dữ liệu 2 năm" — TUYỆT ĐỐI không suy diễn số không có trong báo cáo. '
    "operating_cashflow = dòng tiền thuần từ HĐKD mỗi năm; other_income = thu nhập khác/"
    "lợi nhuận khác mỗi năm (để phát hiện lợi nhuận bất thường). Các mảng phải cùng độ "
    "dài và cùng thứ tự với years.\n"
    "asset_structure & capital_structure: cơ cấu cuối kỳ (TS ngắn/dài hạn: tiền, phải "
    "thu, tồn kho, TSCĐ...; nguồn vốn: nợ ngắn/dài hạn, vốn góp, LN chưa phân phối, các "
    "quỹ), kèm pct trên tổng.\n"
    'revenue_breakdown: theo mảng/sản phẩm/khu vực nếu có; nếu không, items rỗng và note '
    '"không có dữ liệu".\n'
    "ratios: ROE, ROA, biên LN gộp, biên LN ròng, current ratio, quick ratio, nợ/vốn "
    "CSH... benchmark = so sánh với TRUNG BÌNH NGÀNH. Nếu phần dữ liệu người dùng có "
    "cung cấp 'SỐ LIỆU TRUNG BÌNH NGÀNH', BẮT BUỘC dùng số thật đó để so sánh trực tiếp "
    '(vd "ROE 57% so với TB ngành 9.5% — cao hơn ~6x"); CHỈ khi không có số liệu ngành '
    'mới ghi "cần so sánh ngành để đánh giá đầy đủ".\n'
    "cashflow: đủ 3 hoạt động (HĐKD, đầu tư, tài chính) — net + các khoản lớn (items).\n"
    "notes: thuyết minh quan trọng (cam kết, nghĩa vụ tiềm tàng, giao dịch bên liên "
    "quan, sự kiện sau ngày báo cáo, tài sản tranh chấp...).\n\n"
    "Với BẤT KỲ mục nào báo cáo không có dữ liệu: để mảng rỗng và/hoặc ghi note "
    '"không có dữ liệu" — KHÔNG bịa số, KHÔNG bỏ qua im lặng.'
)


CONSIDERATION_SYSTEM = (
    "Bạn là công cụ phân tích tài chính. Dựa trên DỮ LIỆU JSON được cung cấp (đã có sẵn: "
    "phân tích BCTC, định giá, điểm Compass), hãy viết một bản \"Tóm tắt để cân nhắc\" "
    "KHÁCH QUAN cho nhà đầu tư cá nhân tự quyết định.\n\n"
    "TUYỆT ĐỐI KHÔNG dùng ngôn ngữ khuyến nghị:\n"
    "- Không viết: \"Nên mua\", \"Nên bán\", \"Khuyến nghị\", \"Đây là cơ hội\", \"Tránh xa\", "
    "\"Rủi ro quá cao\", hay bất kỳ kết luận đóng nào.\n"
    "Thay vào đó:\n"
    "- Trình bày THỰC TẾ: số liệu, xu hướng, so sánh — để người đọc tự phán xét.\n"
    "- Mỗi điểm mạnh/điểm cân nhắc PHẢI có evidence cụ thể trích từ dữ liệu (số liệu thật).\n"
    "- Điểm cần cân nhắc nêu rõ implication (ảnh hưởng cụ thể), không chỉ gọi tên rủi ro.\n"
    "- questions_to_answer: câu hỏi mở, CỤ THỂ với chính công ty này (dựa trên số liệu/rủi ro/"
    "ghi chú trong dữ liệu), KHÔNG phải câu hỏi template chung chung.\n\n"
    "Ngôn ngữ: tiếng Việt, ngắn gọn, không hoa mỹ. Trả về CHỈ một JSON object (không văn xuôi "
    "ngoài JSON) đúng schema:\n"
    "{\n"
    '"strengths":[{"point":str,"evidence":str,"significance":str}],\n'
    '"concerns":[{"point":str,"evidence":str,"implication":str}],\n'
    '"valuation_context":{"summary":str,"what_market_implies":str,"key_uncertainty":str}|null,\n'
    '"questions_to_answer":[{"question":str,"search_keywords":[str],"question_type":str}],\n'
    '"compass_interpretation":str|null,\n'
    '"recent_developments":[{"headline":str,"note":str}]\n'
    "}\n\n"
    "questions_to_answer: mỗi câu hỏi PHẢI đủ cụ thể để tìm kiếm được, gồm: question (câu hỏi), "
    "search_keywords (2-4 cụm từ khóa tiếng Việt để search tin/CBTT — NÊN có cả mã và TÊN CÔNG TY "
    "đầy đủ, vd \"SBH cổ tức 2025\", \"Thủy điện Sông Ba Hạ ĐHCĐ 2026\"), và question_type một trong: "
    "dividend | agm | capex | business_update | shareholder | regulatory | other.\n"
    "3-5 strengths và 3-5 concerns. Nếu dữ liệu KHÔNG có phần \"valuation\" → đặt "
    "valuation_context = null. Nếu KHÔNG có phần \"compass\" → đặt compass_interpretation = null. "
    "Nếu dữ liệu có phần \"industry_comparison\" (số liệu trung bình ngành), hãy SO SÁNH trực tiếp "
    "trong strengths/concerns bằng số thật (vd \"ROE 57% vs TB ngành 9.5% — top ~1% ngành\"). "
    "KHÔNG xuất trường industry_comparison trong JSON (hệ thống tự thêm bảng). "
    "Nếu dữ liệu có phần \"recent_news\" (tiêu đề tin gần đây): chọn 2-4 tin LIÊN QUAN đến cơ bản/"
    "rủi ro của doanh nghiệp → recent_developments, mỗi mục gồm headline (tóm tắt tin) và note "
    "(vì sao đáng chú ý + CẦN KIỂM CHỨNG gì). Coi tin là CHƯA xác minh, KHÔNG dùng làm căn cứ chắc "
    "chắn, KHÔNG khuyến nghị mua/bán từ tin. Nếu không có tin liên quan, để recent_developments = []. "
    "Có thể lồng tin vào questions_to_answer khi phù hợp. "
    "Không bịa số không có trong dữ liệu."
)


NEWS_SIGNALS_SYSTEM = (
    "Bạn là công cụ PHÂN LOẠI TIN TỨC cho nghiên cứu cổ phiếu Việt Nam. Với danh sách tiêu "
    "đề tin (mỗi tin có số thứ tự i), hãy phân loại MỖI tin liên quan trực tiếp đến doanh "
    "nghiệp: loại sự kiện, sắc thái, và trích 1 câu KHÁCH QUAN tin nói gì.\n\n"
    "TUYỆT ĐỐI KHÔNG khuyến nghị mua/bán/nắm giữ, KHÔNG dự đoán giá, KHÔNG lời khuyên đầu tư. "
    "Sắc thái (sentiment) là đánh giá NỘI DUNG TIN đối với doanh nghiệp (tích cực/tiêu cực/"
    "trung tính) — KHÔNG phải khuyến nghị hành động. Coi tin là CHƯA kiểm chứng; CHỈ dựa trên "
    "tiêu đề/mô tả được cung cấp, KHÔNG bịa thông tin ngoài dữ liệu.\n\n"
    "Trả về CHỈ một JSON object (không văn xuôi ngoài JSON) đúng schema:\n"
    '{"signals":[{"i":int,"event_type":str,"sentiment":"positive|negative|neutral","extract":str}],'
    '"summary":{"net_sentiment":"positive|negative|mixed|neutral","dominant_events":[str],"note":str}}\n\n'
    "event_type ∈ {business_update, earnings, dividend, capital_raise, insider_shareholder, "
    "management, mna, regulatory_legal, macro_sector, other}. Trong đó: earnings = kết quả kinh "
    "doanh/lợi nhuận; capital_raise = phát hành/tăng vốn; insider_shareholder = giao dịch nội "
    "bộ / cổ đông lớn; management = thay đổi nhân sự lãnh đạo; mna = M&A/thoái vốn; "
    "regulatory_legal = pháp lý/xử phạt/thanh tra/kiện tụng; macro_sector = tin vĩ mô/ngành.\n"
    "BỎ QUA tin không liên quan trực tiếp đến mã (không đưa vào signals). extract: 1 câu tiếng "
    "Việt ngắn gọn, khách quan. summary.note: 1 câu, nhắc tin CHƯA kiểm chứng. Nếu không có tin "
    "liên quan, signals = [] và net_sentiment = \"neutral\"."
)

_EVENT_TYPES = {
    "business_update", "earnings", "dividend", "capital_raise", "insider_shareholder",
    "management", "mna", "regulatory_legal", "macro_sector", "other",
}
_SENTIMENTS = {"positive", "negative", "neutral"}
_NET_SENTIMENTS = {"positive", "negative", "mixed", "neutral"}


def normalize_news_signals(raw: dict, items: list[dict]) -> dict:
    """Coerce the model output into the NewsSignals shape (pure).

    The model classifies by item index ``i``; authoritative link/source/published come
    from ``items`` (never from the model), so metadata can't be fabricated."""
    by_i = {i: it for i, it in enumerate(items)}
    signals: list[dict] = []
    for s in raw.get("signals") or []:
        if not isinstance(s, dict):
            continue
        it = by_i.get(s.get("i")) if isinstance(s.get("i"), int) else None
        headline = (it or {}).get("title") or str(s.get("headline") or "")
        if not headline:
            continue
        et = str(s.get("event_type") or "other")
        sent = str(s.get("sentiment") or "neutral")
        signals.append({
            "headline": headline,
            "event_type": et if et in _EVENT_TYPES else "other",
            "sentiment": sent if sent in _SENTIMENTS else "neutral",
            "extract": str(s.get("extract", "")),
            "published": (it or {}).get("published_iso"),
            "source": (it or {}).get("source"),
            "link": (it or {}).get("link"),
        })
    summ = raw.get("summary") or {}
    net = str(summ.get("net_sentiment") or "neutral")
    return {
        "signals": signals,
        "summary": {
            "net_sentiment": net if net in _NET_SENTIMENTS else "neutral",
            "dominant_events": [str(e) for e in (summ.get("dominant_events") or []) if e][:5],
            "note": str(summ.get("note", "")),
        },
    }


async def classify_news_signals(symbol: str, items: list[dict]) -> dict:
    """Classify recent headlines into structured signals (event + sentiment). Cheap
    (titles only, no PDF). Returns the normalized NewsSignals dict."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise LLMNotConfigured(
            "ANTHROPIC_API_KEY chưa được cấu hình. Đặt biến môi trường để bật phân tích AI."
        )
    compact = [
        {"i": i, "title": it.get("title"), "source": it.get("source"),
         "published": it.get("published_iso"), "summary": it.get("summary")}
        for i, it in enumerate(items)
    ]
    user_text = (
        f"Mã: {symbol.upper()}. Phân loại các tin sau (JSON):\n"
        + json.dumps(compact, ensure_ascii=False)
    )
    body = {
        "model": settings.anthropic_model,
        "max_tokens": 3000,
        "system": NEWS_SIGNALS_SYSTEM,
        "messages": [{"role": "user", "content": [{"type": "text", "text": user_text}]}],
    }
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=90.0) as client:
        resp = await client.post(
            f"{settings.anthropic_base_url}/v1/messages", json=body, headers=headers
        )
        resp.raise_for_status()
        data = resp.json()

    usage = data.get("usage", {}) or {}
    cost = (
        usage.get("input_tokens", 0) / 1_000_000 * settings.anthropic_price_in_per_mtok
        + usage.get("output_tokens", 0) / 1_000_000 * settings.anthropic_price_out_per_mtok
    )
    logger.info(
        "[LLM] news-signals %s: input=%d output=%d ≈ $%.4f",
        symbol, usage.get("input_tokens", 0), usage.get("output_tokens", 0), cost,
    )
    if data.get("stop_reason") == "max_tokens":
        raise AnalysisParseError("Phản hồi AI bị cắt (max_tokens) — thử lại.")
    text = "".join(
        b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"
    )
    try:
        raw = _extract_json(text)
    except (ValueError, json.JSONDecodeError) as exc:
        raise AnalysisParseError("Không phân tích được phản hồi AI (JSON không hợp lệ).") from exc
    return normalize_news_signals(raw, items)


def normalize_consideration(raw: dict) -> dict:
    """Coerce the model output into the ConsiderationSummary shape, defensively."""

    def _points(key: str, third: str) -> list[dict]:
        out: list[dict] = []
        for it in raw.get(key) or []:
            if isinstance(it, dict) and it.get("point"):
                out.append(
                    {
                        "point": str(it.get("point", "")),
                        "evidence": str(it.get("evidence", "")),
                        third: str(it.get(third, "")),
                    }
                )
        return out

    vc = raw.get("valuation_context")
    valuation_context = (
        {
            "summary": str(vc.get("summary", "")),
            "what_market_implies": str(vc.get("what_market_implies", "")),
            "key_uncertainty": str(vc.get("key_uncertainty", "")),
        }
        if isinstance(vc, dict)
        else None
    )
    ci = raw.get("compass_interpretation")
    developments = [
        {"headline": str(d.get("headline", "")), "note": str(d.get("note", ""))}
        for d in (raw.get("recent_developments") or [])
        if isinstance(d, dict) and d.get("headline")
    ]
    questions = []
    for q in raw.get("questions_to_answer") or []:
        if isinstance(q, str) and q.strip():
            questions.append({"question": q.strip(), "search_keywords": [], "question_type": "other"})
        elif isinstance(q, dict) and q.get("question"):
            questions.append({
                "question": str(q["question"]),
                "search_keywords": [str(k) for k in (q.get("search_keywords") or []) if k][:5],
                "question_type": str(q.get("question_type") or "other"),
            })
    return {
        "strengths": _points("strengths", "significance"),
        "concerns": _points("concerns", "implication"),
        "valuation_context": valuation_context,
        "questions_to_answer": questions,
        "compass_interpretation": str(ci) if ci else None,
        "recent_developments": developments,
    }


async def summarize_for_consideration(payload: dict) -> dict:
    """Synthesize a \"Tóm tắt để cân nhắc\" from existing JSON data (no PDF, cheap)."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise LLMNotConfigured(
            "ANTHROPIC_API_KEY chưa được cấu hình. Đặt biến môi trường để bật phân tích AI."
        )
    user_text = (
        "Dữ liệu (JSON) để tổng hợp thành \"Tóm tắt để cân nhắc\":\n"
        + json.dumps(payload, ensure_ascii=False)
    )
    body = {
        "model": settings.anthropic_model,
        "max_tokens": 6000,
        "system": CONSIDERATION_SYSTEM,
        "messages": [{"role": "user", "content": [{"type": "text", "text": user_text}]}],
    }
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=120.0) as client:
        resp = await client.post(
            f"{settings.anthropic_base_url}/v1/messages", json=body, headers=headers
        )
        resp.raise_for_status()
        data = resp.json()

    usage = data.get("usage", {}) or {}
    cost = (
        usage.get("input_tokens", 0) / 1_000_000 * settings.anthropic_price_in_per_mtok
        + usage.get("output_tokens", 0) / 1_000_000 * settings.anthropic_price_out_per_mtok
    )
    logger.info(
        "[LLM] consideration %s: input=%d output=%d ≈ $%.4f",
        payload.get("symbol", "?"), usage.get("input_tokens", 0),
        usage.get("output_tokens", 0), cost,
    )
    if data.get("stop_reason") == "max_tokens":
        raise AnalysisParseError("Phản hồi AI bị cắt (max_tokens) — thử lại.")
    text = "".join(
        b.get("text", "") for b in data.get("content", []) if b.get("type") == "text"
    )
    try:
        raw = _extract_json(text)
    except (ValueError, json.JSONDecodeError) as exc:
        raise AnalysisParseError("Không phân tích được phản hồi AI (JSON không hợp lệ).") from exc
    return normalize_consideration(raw)


def _extract_json(text: str) -> dict:
    """Parse the model's JSON, tolerating code fences / surrounding text."""
    text = text.strip()
    if text.startswith("```"):
        text = text.split("```", 2)[1]
        if text.startswith("json"):
            text = text[4:]
    start, end = text.find("{"), text.rfind("}")
    if start == -1 or end == -1:
        raise ValueError("No JSON object in model response")
    return json.loads(text[start : end + 1])


def _num(x: object) -> float | None:
    """Parse a number from int/float/str (tolerating commas, %, spaces)."""
    if isinstance(x, (int, float)):
        return float(x)
    if isinstance(x, str):
        s = x.replace(",", "").replace("%", "").strip()
        try:
            return float(s)
        except ValueError:
            return None
    return None


def _num_list(x: object) -> list[float | None]:
    return [_num(v) for v in x] if isinstance(x, list) else []


def _structure(x: object) -> list[dict]:
    out: list[dict] = []
    for it in x if isinstance(x, list) else []:
        if isinstance(it, dict) and it.get("label"):
            out.append(
                {
                    "label": str(it["label"]),
                    "value": _num(it.get("value")),
                    "pct": _num(it.get("pct")),
                }
            )
    return out


def _activity(x: object) -> dict:
    d = x if isinstance(x, dict) else {}
    items = [
        {"label": str(it["label"]), "value": _num(it.get("value"))}
        for it in (d.get("items") or [])
        if isinstance(it, dict) and it.get("label")
    ]
    return {"net": _num(d.get("net")), "items": items}


def normalize_analysis(raw: dict) -> dict:
    """Coerce the model output into the AnalysisResult shape, defensively."""
    figures = []
    for f in raw.get("key_figures", []) or []:
        if isinstance(f, dict) and f.get("label"):
            figures.append(
                {
                    "label": str(f.get("label", "")),
                    "value": str(f.get("value", "")),
                    "unit": (str(f["unit"]) if f.get("unit") else None),
                }
            )

    def str_list(key: str) -> list[str]:
        return [str(x) for x in (raw.get(key) or []) if x]

    t = raw.get("multi_year_trend") or {}
    trend = {
        "years": [str(y) for y in (t.get("years") or [])],
        "revenue": _num_list(t.get("revenue")),
        "net_profit": _num_list(t.get("net_profit")),
        "gross_margin_pct": _num_list(t.get("gross_margin_pct")),
        "net_margin_pct": _num_list(t.get("net_margin_pct")),
        "roe_pct": _num_list(t.get("roe_pct")),
        "roa_pct": _num_list(t.get("roa_pct")),
        "total_debt": _num_list(t.get("total_debt")),
        "equity": _num_list(t.get("equity")),
        "operating_cashflow": _num_list(t.get("operating_cashflow")),
        "other_income": _num_list(t.get("other_income")),
        "note": str(t.get("note", "")),
    }

    rb = raw.get("revenue_breakdown") or {}
    revenue_breakdown = {
        "items": _structure(rb.get("items")),
        "note": str(rb.get("note", "")),
    }

    ratios = [
        {
            "label": str(r["label"]),
            "value": str(r.get("value", "")),
            "benchmark": (str(r["benchmark"]) if r.get("benchmark") else None),
        }
        for r in (raw.get("ratios") or [])
        if isinstance(r, dict) and r.get("label")
    ]

    cf = raw.get("cashflow") or {}
    cashflow = {
        "operating": _activity(cf.get("operating")),
        "investing": _activity(cf.get("investing")),
        "financing": _activity(cf.get("financing")),
    }

    return {
        "key_figures": figures,
        "summary": str(raw.get("summary", "")),
        "yoy_changes": str_list("yoy_changes"),
        "risk_flags": str_list("risk_flags"),
        "multi_year_trend": trend,
        "asset_structure": _structure(raw.get("asset_structure")),
        "capital_structure": _structure(raw.get("capital_structure")),
        "revenue_breakdown": revenue_breakdown,
        "ratios": ratios,
        "cashflow": cashflow,
        "notes": str_list("notes"),
    }


async def analyze_pdf(
    pdf_bytes: bytes, symbol: str | None, industry_context: str | None = None
) -> dict:
    """Send a PDF to Claude and return a normalized AnalysisResult dict.

    ``industry_context`` (optional): a line of real industry-median figures so the
    model compares ratios against actual peers instead of a placeholder.
    """
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise LLMNotConfigured(
            "ANTHROPIC_API_KEY chưa được cấu hình. Đặt biến môi trường để bật phân tích AI."
        )

    b64 = base64.standard_b64encode(pdf_bytes).decode("ascii")
    user_text = (
        f"Phân tích báo cáo tài chính (BCTC) của mã {symbol or 'này'}. "
        "Trả về JSON đúng schema."
    )
    if industry_context:
        user_text += "\n\n" + industry_context
    payload = {
        "model": settings.anthropic_model,
        "max_tokens": settings.llm_max_tokens,
        "system": SYSTEM_PROMPT,
        "messages": [
            {
                "role": "user",
                "content": [
                    {
                        "type": "document",
                        "source": {
                            "type": "base64",
                            "media_type": "application/pdf",
                            "data": b64,
                        },
                    },
                    {"type": "text", "text": user_text},
                ],
            }
        ],
    }
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    # Large audited reports + richer output can take >2 min end to end.
    async with httpx.AsyncClient(timeout=300.0) as client:
        resp = await client.post(
            f"{settings.anthropic_base_url}/v1/messages", json=payload, headers=headers
        )
        resp.raise_for_status()
        data = resp.json()

    usage = data.get("usage", {}) or {}
    in_tok = usage.get("input_tokens", 0)
    out_tok = usage.get("output_tokens", 0)
    cost = (
        in_tok / 1_000_000 * settings.anthropic_price_in_per_mtok
        + out_tok / 1_000_000 * settings.anthropic_price_out_per_mtok
    )
    logger.info(
        "[LLM] %s analyzed: input=%d output=%d tokens ≈ $%.4f (%s)",
        symbol or "?", in_tok, out_tok, cost, settings.anthropic_model,
    )

    if data.get("stop_reason") == "max_tokens":
        logger.warning("[LLM] %s output truncated at max_tokens (%d)", symbol, out_tok)
        raise AnalysisParseError(
            "Phản hồi AI bị cắt do vượt giới hạn token đầu ra — báo cáo quá lớn. "
            "Hãy tăng llm_max_tokens hoặc dùng BCTC ngắn hơn."
        )

    text = "".join(
        block.get("text", "")
        for block in data.get("content", [])
        if block.get("type") == "text"
    )
    try:
        raw = _extract_json(text)
    except (ValueError, json.JSONDecodeError) as exc:
        raise AnalysisParseError(
            "Không phân tích được phản hồi AI (JSON không hợp lệ)."
        ) from exc
    return normalize_analysis(raw)
