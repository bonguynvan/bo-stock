"""Natural-language → screener filter (research-only).

Turns a plain-Vietnamese description ("ngân hàng ROE>18, P/B<1.5, cổ tức>5%") into a
``ScreenerRequest`` body the existing screener runs. The model ONLY builds a filter — it
never recommends. The output is validated/normalized so a bad LLM response can't inject
unknown fields or invalid values. Pure ``normalize_filter`` is unit-tested.
"""
from __future__ import annotations

import json
import logging

import httpx
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.config import get_settings
from app.models import Stock
from app.schemas.screener import SORTABLE_FIELDS
from app.services.llm import LLMNotConfigured, _extract_json

logger = logging.getLogger("vnios.nlscreener")

_EXCHANGES = {"HOSE", "HNX", "UPCOM"}
_FLOAT_FIELDS = (
    "pe_max", "pb_max", "roe_min", "roa_min", "revenue_growth_min",
    "debt_equity_max", "dividend_yield_min", "pe_vs_hist_max",
)
_INT_FIELDS = ("market_cap_min", "avg_volume_30d_min")


def _num(v: object) -> float | None:
    if isinstance(v, bool):
        return None
    if isinstance(v, (int, float)):
        return float(v)
    if isinstance(v, str):
        try:
            return float(v.replace(",", "").strip())
        except ValueError:
            return None
    return None


def normalize_filter(raw: object, valid_sectors: list[str]) -> dict:
    """Coerce an LLM object into a safe ScreenerRequest dict (unknown fields dropped)."""
    if not isinstance(raw, dict):
        return {}
    out: dict = {}

    for k in _FLOAT_FIELDS:
        v = _num(raw.get(k))
        if v is not None:
            out[k] = v
    for k in _INT_FIELDS:
        v = _num(raw.get(k))
        if v is not None:
            out[k] = int(v)

    # Sector: match the LLM's guess to a real industry name (case-insensitive).
    sec = raw.get("sector")
    if isinstance(sec, str) and sec.strip():
        low = sec.strip().lower()
        by_lower = {s.lower(): s for s in valid_sectors}
        if low in by_lower:
            out["sector"] = by_lower[low]
        else:
            hit = next((s for s in valid_sectors if low in s.lower() or s.lower() in low), None)
            if hit:
                out["sector"] = hit

    ex = raw.get("exchange")
    if isinstance(ex, list):
        picked = [e.strip().upper() for e in ex if isinstance(e, str) and e.strip().upper() in _EXCHANGES]
        if picked:
            out["exchange"] = picked

    if isinstance(raw.get("exclude_beneish_high_risk"), bool):
        out["exclude_beneish_high_risk"] = raw["exclude_beneish_high_risk"]

    sort_by = raw.get("sort_by")
    if isinstance(sort_by, str) and sort_by in SORTABLE_FIELDS:
        out["sort_by"] = sort_by
    if raw.get("sort_order") in ("asc", "desc"):
        out["sort_order"] = raw["sort_order"]

    lim = _num(raw.get("limit"))
    if lim is not None:
        out["limit"] = max(1, min(2000, int(lim)))

    return out


async def _distinct_sectors(session: AsyncSession) -> list[str]:
    rows = (
        await session.execute(
            select(Stock.industry).where(Stock.industry.is_not(None)).distinct().order_by(Stock.industry)
        )
    ).scalars().all()
    return [s for s in rows if s]


def _system_prompt(sectors: list[str]) -> str:
    return (
        "Bạn chuyển MÔ TẢ bằng lời của người dùng thành BỘ LỌC cổ phiếu (JSON). CHỈ tạo bộ "
        "lọc — KHÔNG khuyến nghị mua/bán. Trả về DUY NHẤT một JSON object, các khóa hợp lệ:\n"
        "pe_max, pb_max, roe_min (%), roa_min (%), revenue_growth_min (%), debt_equity_max, "
        "dividend_yield_min (%), market_cap_min (tỷ VND), avg_volume_30d_min (cổ phiếu), "
        "pe_vs_hist_max (%), exclude_beneish_high_risk (bool), sector (string), "
        "exchange (mảng con của [\"HOSE\",\"HNX\",\"UPCOM\"]), "
        f"sort_by (một trong {sorted(SORTABLE_FIELDS)}), sort_order (\"asc\"|\"desc\"), limit (1-2000).\n"
        "Bỏ qua khóa nào không suy ra được từ mô tả. Số phần trăm để dạng số (18 nghĩa là 18%).\n"
        "sector PHẢI chọn đúng một tên trong danh sách ngành sau (nếu người dùng nhắc ngành): "
        + " | ".join(sectors)
        + "\nVí dụ: \"ngân hàng ROE trên 18, P/B dưới 1.5, cổ tức trên 5%\" → "
        '{"sector":"Ngân hàng","roe_min":18,"pb_max":1.5,"dividend_yield_min":5}'
    )


async def build_filter(session: AsyncSession, query: str) -> dict:
    """Ask Claude to convert ``query`` into a validated ScreenerRequest dict. 503 if no key."""
    settings = get_settings()
    if not settings.anthropic_api_key:
        raise LLMNotConfigured(
            "ANTHROPIC_API_KEY chưa được cấu hình. Đặt biến môi trường để bật lọc bằng lời."
        )
    sectors = await _distinct_sectors(session)
    body = {
        "model": settings.anthropic_model,
        "max_tokens": 800,
        "system": _system_prompt(sectors),
        "messages": [{"role": "user", "content": [{"type": "text", "text": query.strip()}]}],
    }
    headers = {
        "x-api-key": settings.anthropic_api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(f"{settings.anthropic_base_url}/v1/messages", json=body, headers=headers)
        resp.raise_for_status()
        data = resp.json()
    text = "".join(b.get("text", "") for b in data.get("content", []) if b.get("type") == "text")
    try:
        raw = _extract_json(text)
    except (ValueError, json.JSONDecodeError):
        raw = {}
    return normalize_filter(raw, sectors)
