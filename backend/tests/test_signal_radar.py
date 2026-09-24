"""DB-backed tests for the signal radar (with_news=False → no network)."""
from __future__ import annotations

import pytest

from app.models import FraudScore, Stock
from app.services.signal_radar import (
    _severity,
    flag_reasons,
    flagged_among,
    get_flow_overlays,
    get_radar,
    scan_coverage,
)


@pytest.mark.asyncio
async def test_get_flow_overlays_empty_symbols_no_network() -> None:
    assert await get_flow_overlays([]) == {}
    assert await get_flow_overlays(["", "  "]) == {}


def test_flag_reasons_always_nonempty_and_specific() -> None:
    assert flag_reasons("elevated_risk", "weak", "high_risk", "distress") == [
        "Beneish: rủi ro thao túng cao", "Chất lượng lợi nhuận thấp", "Altman Z'': vùng nguy hiểm",
    ]
    # watch/elevated with no specific axis still gets a reason
    assert flag_reasons("watch", "adequate", "low_risk", "safe") == ["Hồ sơ tin cậy: cần lưu ý"]


async def test_flagged_among_filters_to_given_symbols(session) -> None:
    session.add_all([
        FraudScore(symbol="AAA", period="2024", beneish_flag="high_risk",
                   altman_em_zone="distress", piotroski_fscore=2,
                   earnings_quality_flag="weak", earnings_quality_score=15.0),
        FraudScore(symbol="BBB", period="2024", beneish_flag="low_risk",
                   altman_em_zone="safe", piotroski_fscore=8,
                   earnings_quality_flag="strong", earnings_quality_score=85.0),
    ])
    await session.commit()
    # AAA flagged + in the followed set; BBB clean; CCC not scored → only AAA
    out = await flagged_among(session, ["aaa", "BBB", "CCC"])
    assert [r["symbol"] for r in out] == ["AAA"]
    assert "Beneish: rủi ro thao túng cao" in out[0]["reasons"]
    assert "_sev" not in out[0]
    assert await flagged_among(session, []) == []


def test_severity_ranking() -> None:
    assert _severity("elevated_risk", "weak", "high_risk") == 3
    assert _severity("watch", "adequate", "low_risk") == 2
    assert _severity("mixed", "weak", None) == 1        # weak QoE alone still flags
    assert _severity("mixed", "adequate", "high_risk") == 1  # Beneish high alone flags
    assert _severity("solid", "strong", "low_risk") == 0     # clean → not on the radar


async def test_radar_returns_only_flagged_ranked(session) -> None:
    session.add_all([
        # AAA: elevated (weak QoE + Beneish high + distress) → sev 3
        FraudScore(symbol="AAA", period="2024", beneish_flag="high_risk",
                   altman_em_zone="distress", piotroski_fscore=2,
                   earnings_quality_flag="weak", earnings_quality_score=15.0),
        # BBB: clean → excluded
        FraudScore(symbol="BBB", period="2024", beneish_flag="low_risk",
                   altman_em_zone="safe", piotroski_fscore=8,
                   earnings_quality_flag="strong", earnings_quality_score=85.0),
        # CCC: weak QoE only, overall mixed → sev 1 (still on radar)
        FraudScore(symbol="CCC", period="2024", beneish_flag="low_risk",
                   altman_em_zone="safe", piotroski_fscore=6,
                   earnings_quality_flag="weak", earnings_quality_score=30.0),
    ])
    await session.commit()

    radar = await get_radar(session, with_news=False, with_foreign=False, with_prop=False, with_valuation=False)
    syms = [r["symbol"] for r in radar]
    assert "BBB" not in syms          # clean excluded
    assert syms[0] == "AAA"           # highest severity first
    assert set(syms) == {"AAA", "CCC"}
    assert radar[0]["conviction_overall"] == "elevated_risk"
    assert "_sev" not in radar[0]     # internal rank stripped from the response


async def test_radar_empty_when_no_fraud_scores(session) -> None:
    assert await get_radar(session, with_news=False, with_foreign=False, with_prop=False, with_valuation=False) == []


async def test_scan_coverage_counts_scanned_vs_total(session) -> None:
    base = await scan_coverage(session)  # the fixture seeds some stocks, none scored
    session.add_all([
        Stock(symbol="ZZ1"), Stock(symbol="ZZ2"), Stock(symbol="ZZ3"),
        FraudScore(symbol="ZZ1", period="2024", beneish_flag="low_risk"),
        FraudScore(symbol="ZZ2", period="2024", beneish_flag="high_risk"),
    ])
    await session.commit()
    cov = await scan_coverage(session)
    assert cov["total"] == base["total"] + 3       # 3 new listed stocks
    assert cov["scanned"] == base["scanned"] + 2   # 2 of them now have a forensic score
