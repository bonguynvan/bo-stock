"""DB-backed tests for run_screener (in-memory SQLite via the `session` fixture).

Verifies filtering, the true matched count (vs page size), and ordering against
the deterministic seed in conftest.SEED.
"""
from __future__ import annotations

from app.models import FraudScore
from app.schemas.screener import ScreenerRequest
from app.services.screener import run_screener
from tests.conftest import SEED


async def _seed_fraud(session, **flags_by_symbol: str) -> None:
    """Add FraudScore rows (earnings_quality_flag) for the given symbols."""
    for sym, qoe in flags_by_symbol.items():
        session.add(FraudScore(symbol=sym, period="2024", earnings_quality_flag=qoe,
                               earnings_quality_score=20.0 if qoe == "weak" else 80.0))
    await session.commit()


async def test_no_filters_returns_all_seeded(session) -> None:
    results, matched, universe = await run_screener(session, ScreenerRequest())
    assert len(results) == len(SEED)
    assert matched == len(SEED)
    assert universe == len(SEED)


async def test_impossible_filter_returns_none(session) -> None:
    req = ScreenerRequest(roe_min=99, pe_max=1)
    results, matched, _ = await run_screener(session, req)
    assert results == []
    assert matched == 0


async def test_single_filter_roe_is_accurate(session) -> None:
    req = ScreenerRequest(roe_min=15)
    results, matched, _ = await run_screener(session, req)
    assert {r.symbol for r in results} == {"AAA", "BBB", "EEE"}  # roe 30, 20, 18
    assert matched == 3
    assert all(r.roe is not None and r.roe >= 15 for r in results)


async def test_limit_caps_page_not_match_count(session) -> None:
    # roe>=10 matches AAA, BBB, CCC, EEE, FFF = 5 (DDD roe=5 excluded)
    req = ScreenerRequest(roe_min=10, limit=2)
    results, matched, _ = await run_screener(session, req)
    assert len(results) == 2   # page capped by limit
    assert matched == 5        # true match count, NOT the page size


async def test_sort_by_quant_score_desc(session) -> None:
    req = ScreenerRequest(sort_by="quant_score", sort_order="desc")
    results, _, _ = await run_screener(session, req)
    assert [r.symbol for r in results] == ["AAA", "EEE", "BBB", "CCC", "DDD", "FFF"]


async def test_sort_by_pe_asc(session) -> None:
    req = ScreenerRequest(sort_by="pe", sort_order="asc")
    results, _, _ = await run_screener(session, req)
    assert [r.symbol for r in results] == ["FFF", "BBB", "AAA", "EEE", "CCC", "DDD"]


async def test_attach_earnings_quality_fields(session) -> None:
    await _seed_fraud(session, AAA="strong", CCC="weak")
    results, _, _ = await run_screener(session, ScreenerRequest())
    by = {r.symbol: r for r in results}
    assert by["AAA"].earnings_quality_flag == "strong"
    assert by["AAA"].earnings_quality_score == 80.0
    assert by["CCC"].earnings_quality_flag == "weak"
    assert by["DDD"].earnings_quality_flag is None  # no fraud row → left null


async def test_attach_conviction_overall(session) -> None:
    # A full forensic row: weak QoE + Beneish high + distress + low Piotroski → elevated_risk.
    session.add(FraudScore(
        symbol="AAA", period="2024", beneish_flag="high_risk", altman_em_zone="distress",
        piotroski_fscore=2, earnings_quality_flag="weak", earnings_quality_score=15.0,
    ))
    # A clean row → solid.
    session.add(FraudScore(
        symbol="BBB", period="2024", beneish_flag="low_risk", altman_em_zone="safe",
        piotroski_fscore=8, earnings_quality_flag="strong", earnings_quality_score=85.0,
    ))
    await session.commit()
    results, _, _ = await run_screener(session, ScreenerRequest())
    by = {r.symbol: r for r in results}
    assert by["AAA"].conviction_overall == "elevated_risk"
    assert by["BBB"].conviction_overall == "solid"
    assert by["DDD"].conviction_overall is None  # no fraud row


async def test_exclude_weak_earnings_quality_filter(session) -> None:
    await _seed_fraud(session, CCC="weak", FFF="weak", AAA="strong")
    req = ScreenerRequest(exclude_weak_earnings_quality=True)
    results, matched, _ = await run_screener(session, req)
    syms = {r.symbol for r in results}
    assert "CCC" not in syms and "FFF" not in syms  # weak → hidden
    assert "AAA" in syms and "DDD" in syms  # strong + unscored stay
    assert matched == len(SEED) - 2
