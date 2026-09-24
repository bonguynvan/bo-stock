"""Unit tests for the pure Vietstock report parsing (no browser) + zip extraction."""
from __future__ import annotations

import io
import zipfile

import pytest

from app.services.report_crawler import (
    best_pdf_from_zip,
    classify_period,
    filename_from_url,
    latest_report,
    parse_report_anchors,
)

# Real rendered anchors from finance.vietstock.vn/SAS/tai-tai-lieu.htm?doctype=1
# (recent filings are ZIPs; quarterly + annual mixed).
SAS_ANCHORS = [
    {"href": "https://static2.vietstock.vn/data/HNX/2026/BCTC/VN/QUY%201/SAS_Baocaotaichinh_Q1_2026.zip",
     "text": "Báo cáo tài chính quý 1 năm 2026 22/04/2026 03:01"},
    {"href": "https://static2.vietstock.vn/data/UPCOM/2025/BCTC/VN/NAM/SAS_Baocaotaichinh_2025_Kiemtoan.zip",
     "text": "Báo cáo tài chính Kiểm toán năm 2025 31/03/2026 06:02"},
    {"href": "https://static2.vietstock.vn/data/UPCOM/2024/BCTC/VN/QUY%203/SAS_Baocaotaichinh_Q3_2024.pdf",
     "text": "Báo cáo tài chính quý 3 năm 2024 22/10/2024 01:54"},
    {"href": "https://finance.vietstock.vn/SAS/tai-chinh.htm", "text": "Tài chính"},  # not a file
    {"href": "https://static2.vietstock.vn/data/UPCOM/2019/BCTC/VN/NAM/X_2019.rar",
     "text": "BCTC 2019 26/03/2020"},  # rar excluded (can't extract without unrar)
]


def test_keeps_zip_and_pdf_sorted_by_date() -> None:
    reports = parse_report_anchors(SAS_ANCHORS)
    # Latest = Q1 2026 ZIP (22/04/2026), then 2025 audited ZIP (31/03/2026), then Q3 2024 pdf.
    assert [r["year"] for r in reports] == [2026, 2025, 2024]
    assert reports[0]["kind"] == "zip"
    assert reports[0]["date"] == "22/04/2026"
    assert "quý 1 năm 2026" in reports[0]["title"]
    # rar and the non-file link are dropped
    assert all(r["kind"] in ("pdf", "zip") for r in reports)


def test_latest_report_is_the_newest_zip() -> None:
    reports = parse_report_anchors(SAS_ANCHORS)
    latest = latest_report(reports)
    assert latest["year"] == 2026 and latest["kind"] == "zip"


def test_classify_period_annual_quarterly_interim() -> None:
    annual = "https://static2.vietstock.vn/data/UPCOM/2025/BCTC/VN/NAM/SAS_Baocaotaichinh_2025_Kiemtoan.zip"
    quarterly = "https://static2.vietstock.vn/data/HNX/2026/BCTC/VN/QUY%201/SAS_Baocaotaichinh_Q1_2026.zip"
    interim = "https://static2.vietstock.vn/data/UPCOM/2025/BCTC/VN/QUY%202/SAS_Baocaotaichinh_6T_2025_Soatxet.zip"
    assert classify_period(annual, "Báo cáo tài chính Kiểm toán năm 2025") == "annual"
    assert classify_period(quarterly, "Báo cáo tài chính quý 1 năm 2026") == "quarterly"
    assert classify_period(interim, "Báo cáo tài chính Soát xét 6 tháng đầu năm 2025") == "interim"


def test_parse_tags_period_on_each_report() -> None:
    reports = parse_report_anchors(SAS_ANCHORS)
    by_year = {r["year"]: r["period"] for r in reports}
    assert by_year[2026] == "quarterly"  # Q1 2026
    assert by_year[2025] == "annual"  # Kiểm toán năm 2025
    assert by_year[2024] == "quarterly"  # Q3 2024


def test_latest_report_empty() -> None:
    assert latest_report([]) is None
    assert parse_report_anchors([{"href": "https://x/a.pdf", "text": "no bctc"}]) == []


def test_best_pdf_from_zip_prefers_vietnamese_largest() -> None:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("1_giai_trinh_ban_vn.pdf", b"x" * 500)  # small VN letter
        z.writestr("2_bao_cao_quy_1_gop.pdf", b"y" * 9000)  # large VN full report ← pick
        z.writestr("4_bctc_q1_2026_ban_eng.pdf", b"z" * 9000)  # large but English
    chosen = best_pdf_from_zip(buf.getvalue())
    assert chosen == b"y" * 9000


def test_best_pdf_from_zip_no_pdf_raises() -> None:
    buf = io.BytesIO()
    with zipfile.ZipFile(buf, "w") as z:
        z.writestr("readme.txt", b"nope")
    with pytest.raises(ValueError):
        best_pdf_from_zip(buf.getvalue())


def test_filename_from_url_maps_zip_to_pdf() -> None:
    assert filename_from_url(
        "https://static2.vietstock.vn/data/HNX/2026/BCTC/VN/QUY%201/SAS_Baocaotaichinh_Q1_2026.zip",
        "SAS", 2026,
    ) == "SAS_Baocaotaichinh_Q1_2026.pdf"
    assert filename_from_url(
        "https://static2.vietstock.vn/data/UPCOM/2023/BCTC/VN/NAM/SPH_2023_Kiemtoan.pdf",
        "SPH", 2023,
    ) == "SPH_2023_Kiemtoan.pdf"
