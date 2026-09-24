"""Unit tests for compass scoring (pure functions, no DB / no network)."""
from __future__ import annotations

from datetime import datetime, timezone

from app.services.compass import (
    _combine,
    catalyst_score,
    financial_quality_score,
    growth_consistency_score,
    pe_hist_score,
    relative_valuation_score,
    rsi,
    short_term_technical,
    sma,
)

NOW = datetime(2026, 6, 30, tzinfo=timezone.utc)


def test_pe_hist_score_mean_reversion() -> None:
    hist = [10.0, 11.0, 12.0, 10.0]  # avg 10.75
    cheap, ce = pe_hist_score(6.0, hist)  # ~44% below avg → high score
    rich, re = pe_hist_score(16.0, hist)  # ~49% above avg → low score
    assert cheap is not None and rich is not None
    assert cheap > 70 and rich < 30
    assert cheap > rich
    assert "rẻ hơn" in ce[0] and "đắt hơn" in re[0]


def test_pe_hist_score_insufficient_or_bad() -> None:
    assert pe_hist_score(10.0, [12.0, 11.0])[0] is None  # <3 clean years
    assert pe_hist_score(None, [10.0, 11.0, 12.0])[0] is None  # no current P/E
    assert pe_hist_score(-5.0, [10.0, 11.0, 12.0])[0] is None  # loss-making now
    # absurd historical P/E values (>60) are excluded from the average
    assert pe_hist_score(10.0, [1000.0, 11.0, 12.0])[0] is None  # only 2 clean → None


def test_sma_and_rsi_need_enough_data() -> None:
    assert sma([1, 2, 3], 5) is None
    assert sma([2, 4, 6], 3) == 4
    assert rsi([1, 2], 14) is None  # not enough points
    up = rsi(list(range(1, 30)), 14)
    assert up is not None and up > 70  # straight uptrend → overbought


def test_combine_redistributes_missing_weight() -> None:
    # one component missing → remaining weight renormalizes
    score, bd = _combine([("a", 80.0, 0.5), ("b", None, 0.5)])
    assert score == 80.0
    assert bd == {"a": 80.0, "b": None}
    assert _combine([("a", None, 1.0)]) == (None, {"a": None})


def test_short_term_technical_below_ma50_scores_low() -> None:
    # 50 flat bars at 10000 then a drop to 6800 → price below MA50, downtrend
    closes = [10000.0] * 60 + [6800.0]
    score, expl = short_term_technical(closes, [])
    assert score is not None and score < 50
    assert any("MA50" in e for e in expl)


def test_relative_valuation_uses_discount() -> None:
    s, _ = relative_valuation_score({"vs_current_price": {"discount_pct": -25.0}})
    assert s == 25.0  # 50 + (-25)
    assert relative_valuation_score({"vs_current_price": {"discount_pct": None}})[0] is None


def test_growth_consistency_null_when_outlier_leaves_one_clean_period() -> None:
    # SPH: 2 years, 2025 flagged outlier → only 2024 clean → cannot assess growth
    s, expl = growth_consistency_score(
        years=["2024", "2025"],
        revenue=[48.4, 82.29],
        net_profit=[-28.14, 34.04],
        outlier_years={"2025"},
    )
    assert s is None
    assert any("không đủ kỳ" in e.lower() for e in expl)


def test_growth_consistency_rewards_steady_growth() -> None:
    s, _ = growth_consistency_score(
        years=["2021", "2022", "2023", "2024"],
        revenue=[100, 110, 121, 133],
        net_profit=[10, 11, 12, 13],
        outlier_years=set(),
    )
    assert s is not None and s > 70


def test_financial_quality_low_for_sph_profile() -> None:
    # loss year + negative-OCF year + flagged 2025 + NEGATIVE retained earnings
    s, expl, gaps = financial_quality_score(
        years=["2024", "2025"],
        net_profit=[-28.14, 34.04],
        operating_cashflow=[-2.39, 20.38],
        capital_structure=[{"label": "LNST chưa phân phối lũy kế", "value": -15.97}],
        outlier_years={"2025"},
        debt_equity=0.16,
    )
    assert s is not None and s < 55  # must NOT look high-quality
    assert any("ÂM" in e for e in expl)  # accumulated-loss flag surfaced


def test_financial_quality_high_for_clean_profile() -> None:
    s, _, _ = financial_quality_score(
        years=["2022", "2023", "2024"],
        net_profit=[10, 12, 14],
        operating_cashflow=[9, 11, 13],
        capital_structure=[{"label": "Lợi nhuận chưa phân phối", "value": 50}],
        outlier_years=set(),
        debt_equity=0.3,
    )
    assert s is not None and s > 85


def test_financial_quality_null_without_multiyear_data() -> None:
    # No BCTC analysis (no years) → must be null + gap, NOT a high score from
    # debt/equity alone (regression for the FPT long_term=92 bug).
    s, expl, gaps = financial_quality_score(
        years=[],
        net_profit=[],
        operating_cashflow=[],
        capital_structure=[],
        outlier_years=set(),
        debt_equity=0.71,  # healthy leverage must NOT inflate the score
    )
    assert s is None
    assert gaps and any("BCTC" in g for g in gaps)


def test_catalyst_baseline_neutral() -> None:
    s, expl = catalyst_score([], None, None, NOW)
    assert s == 50.0
    assert any("Không có" in e for e in expl)


async def test_store_and_batch_scores(session) -> None:
    from app.services.compass import _store_scores, get_scores_batch

    # AAA is seeded in conftest (FK to stocks.symbol). Store then read back.
    await _store_scores(session, "aaa", 80.0, 60.0, 90.0)
    out = await get_scores_batch(session, ["AAA", "ZZZ"])
    assert out["AAA"] == {
        "short": 80.0,
        "mid": 60.0,
        "long": 90.0,
        "computed_at": out["AAA"]["computed_at"],
    }
    assert "ZZZ" not in out  # un-analyzed symbol absent → badge shows "—"

    # Upsert overwrites the existing row.
    await _store_scores(session, "AAA", 10.0, 20.0, 30.0)
    out2 = await get_scores_batch(session, ["AAA"])
    assert out2["AAA"]["short"] == 10.0 and out2["AAA"]["long"] == 30.0
