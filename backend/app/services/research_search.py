"""Auto-search public news/announcements to help answer BCTC research questions.

For each "câu hỏi cần tự trả lời" the digest produced, search its ``search_keywords``
across public news (Google News RSS — spans CafeF/Vietstock/VnEconomy/…), then rank
findings by company-name match + recency. Research-only: we relay short snippets +
links to the original source, never full text, never advice.

Robust by design: concurrency-bounded, per-source timeouts inside news.search_news,
and any failure degrades to "not_found" (never crashes the digest flow).
"""
from __future__ import annotations

import asyncio
import logging
from datetime import datetime, timezone

from app.services import news

logger = logging.getLogger("vnios.research")

_RECENT_DAYS = 180          # findings newer than this can be "high" relevance
_MAX_QUESTIONS = 6
_MAX_KEYWORDS = 2           # searches per question (bounds fan-out)
_MAX_FINDINGS = 4
_SNIPPET = 100              # copyright: short snippet only
_sem = asyncio.Semaphore(5)  # cap concurrent Google-News requests


def _distinctive(company_name: str | None) -> str:
    """The proper-name tail of the company (last up-to-3 tokens) — e.g.
    "CTCP Thủy điện Sông Ba Hạ" → "sông ba hạ". Distinguishes the company from
    industry peers that share generic words like "thủy điện"/"ngân hàng"."""
    toks = (company_name or "").lower().split()
    return " ".join(toks[-3:]) if len(toks) >= 2 else " ".join(toks)


def _relevance(title: str, iso: str | None, symbol: str, distinctive: str, now: datetime) -> str:
    tl = title.lower()
    # Symbol as a standalone token, or the distinctive proper-name in the title —
    # so generic industry words / other tickers can't fake a "high".
    name_match = symbol.lower() in tl.split() or (bool(distinctive) and distinctive in tl)
    recent = False
    if iso:
        try:
            recent = (now - datetime.fromisoformat(iso)).days <= _RECENT_DAYS
        except ValueError:
            recent = False
    return "high" if (name_match and recent) else "medium"


async def _search(kw: str) -> list[dict]:
    async with _sem:
        try:
            return await news.search_news(kw, limit=5)
        except Exception as exc:  # noqa: BLE001 — a bad source must not sink the batch
            logger.warning("[research] search '%s' failed — %s", kw, exc)
            return []


async def _answer_one(symbol: str, distinctive: str, q: dict, now: datetime) -> dict:
    question = str(q.get("question") or "")
    keywords = [k for k in (q.get("search_keywords") or []) if k][:_MAX_KEYWORDS]
    if not keywords:
        keywords = [f"{symbol} {question[:40]}"]
    batches = await asyncio.gather(*(_search(kw) for kw in keywords))

    seen: set[str] = set()
    findings: list[dict] = []
    for items in batches:
        for it in items:
            link = it.get("link")
            if not link or link in seen:
                continue
            seen.add(link)
            iso = it.get("published_iso")
            rel = _relevance(it.get("title", ""), iso, symbol, distinctive, now)
            findings.append({
                "title": it.get("title", ""),
                "url": link,
                "source": it.get("source") or "Google News",
                "published_date": iso[:10] if iso else None,
                "relevance": rel,
                "snippet": (it.get("summary") or "")[:_SNIPPET],
                "_iso": iso or "",
            })
    findings.sort(key=lambda f: (f["relevance"] == "high", f["_iso"]), reverse=True)
    findings = findings[:_MAX_FINDINGS]
    for f in findings:
        f.pop("_iso", None)

    has_high = any(f["relevance"] == "high" for f in findings)
    status = "found" if has_high else ("partial" if findings else "not_found")
    return {"question": question, "question_type": q.get("question_type") or "other",
            "status": status, "findings": findings}


async def search_answers(symbol: str, company_name: str | None, questions: list[dict]) -> dict:
    sym = symbol.upper()
    distinctive = _distinctive(company_name)
    now = datetime.now(timezone.utc)
    qs = [q for q in questions if q.get("question")][:_MAX_QUESTIONS]
    answers = await asyncio.gather(*(_answer_one(sym, distinctive, q, now) for q in qs))
    return {"searched_at": now.isoformat(), "answers": list(answers)}
