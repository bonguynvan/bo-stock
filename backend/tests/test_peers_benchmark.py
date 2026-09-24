"""Unit test for the pure industry-benchmark context text."""
from __future__ import annotations

from app.services.peers import benchmark_context_text


def test_benchmark_context_text_lists_medians() -> None:
    bench = {
        "industry": "Hàng & Dịch vụ Công nghiệp",
        "peer_count": 289,
        "metrics": [
            {"label": "P/E", "median": 7.91},
            {"label": "ROE %", "median": 9.52},
            {"label": "Biên LN ròng %", "median": 4.48},
        ],
    }
    text = benchmark_context_text(bench)
    assert "TRUNG BÌNH NGÀNH" in text
    assert "289 mã" in text
    assert "P/E 7.91" in text and "ROE % 9.52" in text and "Biên LN ròng % 4.48" in text


def test_benchmark_context_text_empty_metrics() -> None:
    text = benchmark_context_text({"industry": "X", "peer_count": 3, "metrics": []})
    assert "X" in text and "3 mã" in text
