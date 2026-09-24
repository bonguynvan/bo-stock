"""Unit tests for valuation math (pure functions, no DB / no network)."""
from __future__ import annotations

from app.services.valuation import (
    MOS,
    build_dcf,
    build_history_valuation,
    build_sector_valuation,
    build_valuation,
    classify_sector_relative,
    derive_shares,
    detect_outliers,
)


def test_classify_sector_relative_flags_cheap_fair_rich() -> None:
    # Both multiples ~2x the sector median → rich.
    assert classify_sector_relative(20, 4, 10, 2)["valuation_flag"] == "rich"
    # Both roughly at the median → fair.
    assert classify_sector_relative(10, 2, 10, 2)["valuation_flag"] == "fair"
    # Well below the median → cheap.
    assert classify_sector_relative(5, 1, 10, 2)["valuation_flag"] == "cheap"
    # Loss-making / missing multiples → unknown, no premium.
    out = classify_sector_relative(None, -1, 10, 2)
    assert out["valuation_flag"] == "unknown" and out["premium_pct"] is None


def _hist(rows: list[tuple[int, float, float, float, float]]) -> list[dict]:
    return [{"year": y, "pe": pe, "pb": pb, "eps": eps, "bvps": bvps} for y, pe, pb, eps, bvps in rows]


# NCT-like: steady P/E ~10, rising EPS — no outliers.
NCT_HISTORY = _hist([
    (2021, 10.2, 4.9, 8742, 18340),
    (2022, 10.0, 5.3, 8856, 16578),
    (2023, 14.6, 7.0, 6152, 12925),
    (2024, 9.8, 4.2, 10690, 24836),
    (2025, 7.0, 3.5, 13025, 26059),
])

# SAS-like: 2021 is a depressed year (near-zero EPS → absurd P/E 1080).
SAS_HISTORY = _hist([
    (2019, 10.8, 3.0, 2418, 11507),
    (2020, 27.8, 2.5, 977, 11242),
    (2021, 1079.8, 2.6, 29, 14898),  # outlier
    (2022, 17.6, 2.4, 1528, 12402),
    (2023, 19.0, 2.8, 1400, 8131),
    (2024, 11.1, 2.6, 3427, 14891),
    (2025, 7.5, 3.0, 4858, 13123),
])


def test_history_valuation_uses_average_pe_not_current() -> None:
    v = build_history_valuation(
        history=NCT_HISTORY, current_pe=5.77, current_pb=3.0, current_price=94600,
    )
    # pe_eps uses the HISTORICAL average P/E (~10.3), not the current 5.77.
    assert "P/E TB 5 kỳ (2021-2025)" in v["methods"]["pe_eps_avg"]["note"]
    assert not v["earnings_quality"]["fallback_used"]
    assert v["earnings_quality"]["outliers_detected"] == []
    assert v["methods"]["pe_eps_avg"]["value"] is not None


def test_history_valuation_excludes_depressed_pe_year() -> None:
    v = build_history_valuation(
        history=SAS_HISTORY, current_pe=7.5, current_pb=3.0, current_price=39000,
    )
    outlier_years = [o["year"] for o in v["earnings_quality"]["outliers_detected"]]
    assert "2021" in outlier_years  # absurd P/E year dropped
    # average P/E excludes 2021 → sane (~15, not ~170); Graham g is a capped CAGR.
    assert "g=" in v["methods"]["graham"]["note"]
    g_val = float(v["methods"]["graham"]["note"].split("g=")[1].split("%")[0])
    assert g_val <= 30.0  # capped — not the old 1002%


def test_history_valuation_fallback_when_too_few_clean() -> None:
    tiny = _hist([(2025, 8.0, 2.0, 5000, 20000)])  # 1 period
    v = build_history_valuation(
        history=tiny, current_pe=6.0, current_pb=1.5, current_price=30000,
    )
    assert v["earnings_quality"]["fallback_used"] is True
    assert "hiện tại" in v["methods"]["pe_eps_avg"]["note"]


def test_history_valuation_respects_bctc_outlier_years() -> None:
    v = build_history_valuation(
        history=NCT_HISTORY, current_pe=7.0, current_pb=3.5, current_price=94600,
        bctc_outlier_years={2025},
    )
    assert "2025" in [o["year"] for o in v["earnings_quality"]["outliers_detected"]]


def test_history_valuation_empty() -> None:
    assert "error" in build_history_valuation(
        history=[], current_pe=10, current_pb=2, current_price=1000,
    )

# SPH-like inputs: shares = 68 tỷ / 6800 = 10,000,000.
SHARES = 10_000_000.0


def test_derive_shares() -> None:
    assert derive_shares(68, 6800) == 10_000_000.0
    assert derive_shares(None, 6800) is None
    assert derive_shares(68, None) is None


def test_detect_outliers_flags_one_off_other_income() -> None:
    # 2025: profit jumps -28→34 while other income (36) dwarfs profit → flagged.
    eps = [-2814.0, 3404.0]
    flagged = detect_outliers(
        years=["2024", "2025"],
        eps=eps,
        net_profit=[-28.14, 34.04],
        ocf=[-2.39, 20.38],
        other_income=[2.85, 36.07],
    )
    assert len(flagged) == 1
    assert flagged[0]["year"] == "2025"
    assert any("Thu nhập khác" in r for r in flagged[0]["reasons"])


def test_build_valuation_fallback_when_too_few_clean_periods() -> None:
    # Only 2 periods; excluding the 2025 outlier leaves <2 → fallback to full series.
    out = build_valuation(
        current_price=6800,
        pe=2.0,
        pb=0.7,
        years=["2024", "2025"],
        net_profit=[-28.14, 34.04],
        equity=[58.39, 92.43],
        operating_cashflow=[-2.39, 20.38],
        other_income=[2.85, 36.07],
        shares=SHARES,
        exclude_outliers=True,
    )
    eq = out["earnings_quality"]
    assert eq["fallback_used"] is True
    assert "không đủ dữ liệu sạch" in eq["note"].lower()
    assert any(o["year"] == "2025" for o in eq["outliers_detected"])


def test_build_valuation_excludes_outlier_with_enough_history() -> None:
    # 5 clean years + 1 spike year; the spike must be excluded from averages.
    years = ["2020", "2021", "2022", "2023", "2024", "2025"]
    eps_profit = [10.0, 11.0, 12.0, 13.0, 14.0, 60.0]  # 2025 = one-off spike
    out = build_valuation(
        current_price=20000,
        pe=12.0,
        pb=1.5,
        years=years,
        net_profit=eps_profit,
        equity=[80, 88, 96, 104, 112, 160],
        operating_cashflow=[9, 10, 11, 12, 13, 1],  # 2025 cash far below profit
        other_income=[0, 0, 0, 0, 0, 40],  # 2025 other income dominates
        shares=SHARES,
        exclude_outliers=True,
    )
    assert out["earnings_quality"]["fallback_used"] is False
    assert "2025" not in out["earnings_quality"]["periods_used"]
    # vs. NOT excluding: the spike inflates the PE×EPS estimate.
    raw = build_valuation(
        current_price=20000, pe=12.0, pb=1.5, years=years, net_profit=eps_profit,
        equity=[80, 88, 96, 104, 112, 160], operating_cashflow=[9, 10, 11, 12, 13, 1],
        other_income=[0, 0, 0, 0, 0, 40], shares=SHARES, exclude_outliers=False,
    )
    assert raw["methods"]["pe_eps_avg"]["value"] > out["methods"]["pe_eps_avg"]["value"]


def test_pe_eps_excludes_loss_years() -> None:
    out = build_valuation(
        current_price=10000, pe=10.0, pb=1.0,
        years=["2023", "2024", "2025"],
        net_profit=[-5.0, 8.0, 9.0],  # 2023 is a loss
        equity=[50, 55, 60], operating_cashflow=[6, 8, 9], other_income=[0, 0, 0],
        shares=SHARES, exclude_outliers=True,
    )
    assert "loại" in out["methods"]["pe_eps_avg"]["note"].lower()
    assert out["methods"]["pe_eps_avg"]["value"] is not None


def test_graham_null_on_negative_eps() -> None:
    out = build_valuation(
        current_price=5000, pe=None, pb=None,
        years=["2024", "2025"], net_profit=[-10.0, -8.0], equity=[30, 25],
        operating_cashflow=[-1, -2], other_income=[0, 0], shares=SHARES,
        exclude_outliers=True,
    )
    assert out["methods"]["graham"]["value"] is None
    assert "EPS" in out["methods"]["graham"]["note"]


def test_build_valuation_missing_shares() -> None:
    out = build_valuation(
        current_price=6800, pe=2.0, pb=0.7, years=["2025"], net_profit=[34.0],
        equity=[92.0], operating_cashflow=[20.0], other_income=[36.0], shares=None,
    )
    assert "error" in out


def test_build_dcf_basic_and_edges() -> None:
    ok = build_dcf(
        base_ocf_billion=20.0, growth_pct=8, discount_pct=13, years=5, shares=SHARES
    )
    assert ok["dcf_value"] is not None and ok["dcf_value"] > 0
    assert ok["assumptions_used"]["growth_pct"] == 8

    bad = build_dcf(
        base_ocf_billion=-2.0, growth_pct=8, discount_pct=13, years=5, shares=SHARES
    )
    assert bad["dcf_value"] is None

    no_shares = build_dcf(
        base_ocf_billion=20.0, growth_pct=8, discount_pct=13, years=5, shares=None
    )
    assert no_shares["dcf_value"] is None


def test_sector_valuation_premium_to_peers() -> None:
    # Own P/E 20 vs sector 10 (100% premium); P/B 3 vs 2 (50% premium).
    r = build_sector_valuation(
        industry="Bán lẻ", current_price=100, own_pe=20, own_pb=3,
        sector_pe_median=10, sector_pb_median=2, peer_count=8,
    )
    assert r["methods"]["pe_relative"]["value"] == 50  # 100 * 10/20
    assert r["methods"]["pe_relative"]["premium_pct"] == 100.0
    assert r["methods"]["pb_relative"]["value"] == 67  # 100 * 2/3 → 66.7
    assert r["methods"]["pb_relative"]["premium_pct"] == 50.0
    assert r["avg_premium_pct"] == 75.0
    assert "CAO hơn" in r["relative_position"]
    assert r["notes"] == []  # 8 peers, non-financial → no caveats


def test_sector_valuation_loss_making_skips_pe() -> None:
    r = build_sector_valuation(
        industry="Bất động sản", current_price=50, own_pe=None, own_pb=1.5,
        sector_pe_median=12, sector_pb_median=2, peer_count=6,
    )
    assert r["methods"]["pe_relative"]["value"] is None  # no P/E → N/A
    assert r["methods"]["pb_relative"]["value"] == 67  # 50 * 2/1.5
    assert r["methods"]["pb_relative"]["premium_pct"] == -25.0  # cheaper than peers on P/B


def test_sector_valuation_flags_financials_and_thin_peers() -> None:
    r = build_sector_valuation(
        industry="Ngân hàng", current_price=30, own_pe=8, own_pb=1.2,
        sector_pe_median=9, sector_pb_median=1.5, peer_count=2,
    )
    joined = " ".join(r["notes"])
    assert "kém tin cậy" in joined  # thin peer set
    assert "P/B thường là bội số chính" in joined  # financial-sector caveat
