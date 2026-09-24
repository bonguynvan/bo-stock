"""Crawl a symbol's audited BCTC PDF link from Vietstock (research-only).

Vietstock renders its document list client-side (JS + an anti-forgery token), so a
plain HTTP fetch can't see it. We render the page headless (Playwright/chromium) and
read the PDF anchors straight from the DOM — robust against the token mechanics. The
actual PDFs live on a plain CDN (``staticN.vietstock.vn``), downloaded with httpx.

The parsing (anchors → structured reports) is a pure function, unit-tested without a
browser. Only the ``crawl_reports`` render step needs chromium.
"""
from __future__ import annotations

import io
import logging
import re
import zipfile

import httpx

logger = logging.getLogger("vnios.report_crawler")

DOC_PAGE = "https://finance.vietstock.vn/{symbol}/tai-tai-lieu.htm?doctype=1"
_UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/120 Safari/537.36"
)
_YEAR_IN_HREF = re.compile(r"/(\d{4})/BCTC/", re.I)
_YEAR_IN_TEXT = re.compile(r"n[ăa]m\s+(\d{4})", re.I)
_DATE = re.compile(r"(\d{2})/(\d{2})/(\d{4})")
# Analyzable kinds: pdf directly, or zip (we extract the PDF inside). rar needs an
# external unrar binary → excluded (older filings only).
_ANALYZABLE_EXT = ("pdf", "zip")


def _url_segment(url: str) -> str:
    m = re.search(r"/BCTC/VN/([^/]+)/", url, re.I)
    return m.group(1).upper().replace("%20", " ") if m else ""


def _period_rank(url: str, text: str) -> int:
    """Order within a year: annual (5) > Q4 (4) > … > Q1 (1). Used as a date fallback."""
    seg = _url_segment(url)
    if seg == "NAM" or ("kiểm toán" in text.lower() and "quý" not in text.lower()):
        return 5
    q = re.search(r"QU[YÝ]\s*0*([1-4])", seg) or re.search(r"quý\s*([1-4])", text.lower())
    return int(q.group(1)) if q else 0


def classify_period(url: str, text: str = "") -> str:
    """Report reporting-period: 'annual' | 'quarterly' | 'interim'.

    interim = semi-annual REVIEWED (soát xét 6 tháng) — not a full audited year, so it
    is kept out of the multi-year valuation series. Default 'annual' (audited).
    """
    seg = _url_segment(url)
    t = text.lower()
    lu = url.lower()
    if "soát xét" in t or "soatxet" in lu or "6 tháng" in t or "_6t_" in lu:
        return "interim"
    if seg == "NAM" or ("kiểm toán" in t and "quý" not in t):
        return "annual"
    if seg.startswith("QUY") or re.search(r"quý\s*[1-4]", t) or re.search(r"_q[1-4]_", lu):
        return "quarterly"
    return "annual"


def parse_report_anchors(anchors: list[dict]) -> list[dict]:
    """Filter/parse rendered ``<a>`` tags → BCTC report records (latest first).

    Keeps PDF **and** ZIP reports (the ZIP is extracted to a PDF on download), so the
    genuinely-latest filing (often a quarterly ZIP) isn't skipped. Sorts by the
    publish date in the link text (newest first), falling back to (year, period).
    """
    seen: set[str] = set()
    out: list[dict] = []
    for a in anchors:
        href = (a.get("href") or "").strip()
        if not href or "/BCTC/" not in href.upper():
            continue
        base = href.rsplit("/", 1)[-1]
        ext = base.rsplit(".", 1)[-1].lower() if "." in base else ""
        if ext not in _ANALYZABLE_EXT or href in seen:
            continue
        seen.add(href)
        text = re.sub(r"\s+", " ", (a.get("text") or "")).strip()
        ym = _YEAR_IN_HREF.search(href) or _YEAR_IN_TEXT.search(text)
        year = int(ym.group(1)) if ym else None
        dm = _DATE.search(text)
        if dm:
            d, mo, yr = int(dm.group(1)), int(dm.group(2)), int(dm.group(3))
            date, sort_key = dm.group(0), (yr, mo, d)
            title = text[: dm.start()].strip()
        else:
            date, sort_key = None, (year or 0, _period_rank(href, text), 0)
            title = text
        out.append(
            {
                "url": href,
                "title": title or (f"BCTC {year}" if year else "BCTC"),
                "year": year,
                "date": date,
                "kind": ext,
                "period": classify_period(href, text),
                "_sort": sort_key,
            }
        )
    out.sort(key=lambda r: r["_sort"], reverse=True)
    for r in out:
        r.pop("_sort", None)
    return out


def latest_report(reports: list[dict]) -> dict | None:
    """The most recent analyzable report (PDF or ZIP), or None."""
    return reports[0] if reports else None


async def crawl_reports(symbol: str) -> list[dict]:
    """Render the Vietstock document page for ``symbol`` and return BCTC reports.

    Imports Playwright lazily so the rest of the app (and tests) don't require the
    browser. Runs chromium with ``--no-sandbox`` (root in container).
    """
    from playwright.async_api import async_playwright  # lazy: only this path needs it

    url = DOC_PAGE.format(symbol=symbol.upper())
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True, args=["--no-sandbox"])
        try:
            page = await (await browser.new_context(user_agent=_UA)).new_page()
            # networkidle never settles on Vietstock (long-lived connections); load the
            # DOM, then wait for the JS-built BCTC links to appear.
            await page.goto(url, wait_until="domcontentloaded", timeout=45000)
            try:
                await page.wait_for_selector("a[href*='BCTC']", timeout=20000)
            except Exception:  # noqa: BLE001 — extract whatever rendered anyway
                logger.warning("[crawl] %s — BCTC links not detected within timeout", symbol)
            anchors = await page.eval_on_selector_all(
                "a[href]",
                "els => els.map(a => ({ href: a.href, text: a.textContent }))",
            )
        finally:
            await browser.close()
    reports = parse_report_anchors(anchors)
    logger.info("[crawl] %s — %d BCTC reports found", symbol.upper(), len(reports))
    return reports


_ENG_RE = re.compile(r"(^|[_\-\. ])(eng|en|english)([_\-\. ]|$)", re.I)


def best_pdf_from_zip(data: bytes) -> bytes:
    """Pick the main BCTC PDF from a Vietstock report ZIP.

    A report ZIP holds several PDFs (full statements + a short profit-explanation
    letter + English versions). We prefer Vietnamese files, then the LARGEST — the
    full financial statements rather than the cover letter.
    """
    z = zipfile.ZipFile(io.BytesIO(data))
    pdfs = [n for n in z.namelist() if n.lower().endswith(".pdf")]
    if not pdfs:
        raise ValueError("File nén không chứa PDF")
    vietnamese = [n for n in pdfs if not _ENG_RE.search(n.rsplit("/", 1)[-1])]
    best = max(vietnamese or pdfs, key=lambda n: z.getinfo(n).file_size)
    return z.read(best)


async def download_report(url: str, max_bytes: int) -> bytes:
    """Download a report from the Vietstock CDN → PDF bytes (extracting ZIPs)."""
    async with httpx.AsyncClient(timeout=90, follow_redirects=True) as c:
        resp = await c.get(url, headers={"User-Agent": _UA})
        resp.raise_for_status()
        data = resp.content
    if not data:
        raise ValueError("File tải về rỗng")
    if url.lower().endswith(".zip"):
        data = best_pdf_from_zip(data)
    if len(data) > max_bytes:
        raise ValueError(f"BCTC vượt quá giới hạn {max_bytes // (1024 * 1024)}MB")
    return data


def filename_from_url(url: str, symbol: str, year: int | None) -> str:
    """A clean stored .pdf filename from the CDN URL (zip basename → .pdf)."""
    tail = url.rsplit("/", 1)[-1]
    stem = tail.rsplit(".", 1)[0] if "." in tail else tail
    if stem:
        return f"{stem}.pdf"
    return f"{symbol.upper()}_BCTC_{year or 'latest'}.pdf"
