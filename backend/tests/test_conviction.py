"""Pure financial-trust (conviction) synthesis tests."""
from __future__ import annotations

from app.services.conviction import build_conviction_profile


def _pillar(profile: dict, key: str) -> dict:
    return next(p for p in profile["pillars"] if p["key"] == key)


def test_solid_profile_positive_corroboration() -> None:
    p = build_conviction_profile(
        beneish_flag="low_risk", altman_zone="safe", piotroski_score=8, piotroski_max=9,
        qoe_flag="strong", qoe_score=88, sector_avg_premium_pct=-20, sector_available=True,
    )
    assert p["overall"] == "solid"
    assert p["flag_counts"]["good"] == 4
    assert _pillar(p, "valuation")["status"] == "good"  # cheaper than peers
    assert any("đồng thuận tích cực" in c for c in p["cross_signals"])


def test_elevated_risk_when_qoe_and_beneish_agree() -> None:
    p = build_conviction_profile(
        beneish_flag="high_risk", altman_zone="grey", piotroski_score=3, piotroski_max=9,
        qoe_flag="weak", qoe_score=18, sector_avg_premium_pct=40, sector_available=True,
    )
    assert p["overall"] == "elevated_risk"  # beneish high is a severe flag
    assert _pillar(p, "earnings_quality")["status"] == "risk"
    assert _pillar(p, "manipulation")["status"] == "risk"
    assert _pillar(p, "valuation")["status"] == "risk"  # rich vs peers
    joined = " ".join(p["cross_signals"])
    assert "TRÙNG với rủi ro thao túng" in joined  # QoE weak + Beneish high corroboration
    assert "nền tảng cơ bản yếu" in joined  # Beneish high + low Piotroski


def test_insufficient_when_barely_any_data() -> None:
    p = build_conviction_profile(
        beneish_flag=None, altman_zone="insufficient_data", piotroski_score=None,
        piotroski_max=None, qoe_flag="insufficient_data", qoe_score=None,
        sector_avg_premium_pct=None, sector_available=False,
    )
    assert p["overall"] == "insufficient"
    assert all(pl["status"] == "unknown" for pl in p["pillars"])


def test_watch_with_single_risk_axis() -> None:
    p = build_conviction_profile(
        beneish_flag="low_risk", altman_zone="safe", piotroski_score=6, piotroski_max=9,
        qoe_flag="adequate", qoe_score=55, sector_avg_premium_pct=30, sector_available=True,
    )
    assert p["overall"] == "watch"  # only the valuation axis is a risk
    assert p["flag_counts"]["risk"] == 1


def test_insider_selling_corroborates_risk_without_changing_overall() -> None:
    base_kwargs = dict(
        beneish_flag="high_risk", altman_zone="grey", piotroski_score=3, piotroski_max=9,
        qoe_flag="weak", qoe_score=18, sector_avg_premium_pct=40, sector_available=True,
    )
    no_flow = build_conviction_profile(**base_kwargs)
    with_flow = build_conviction_profile(
        **base_kwargs, insider_net_shares=-1_500_000, foreign_net_val=-8.0, prop_net_val=-3.0,
    )
    # Flow never changes the deterministic fundamental read.
    assert with_flow["overall"] == no_flow["overall"] == "elevated_risk"
    assert with_flow["flag_counts"] == no_flow["flag_counts"]
    # Flow adds a descriptive block + corroboration cross-signals.
    dirs = {f["key"]: f["direction"] for f in with_flow["flow_signals"]}
    assert dirs == {"insider": "sell", "foreign": "sell", "prop": "sell"}
    joined = " ".join(with_flow["cross_signals"])
    assert "Người trong cuộc bán ròng" in joined
    assert "khối ngoại và tự doanh cùng bán ròng" in joined
    assert no_flow["flow_signals"] == []  # absent when no flow data supplied


def test_insider_buying_corroborates_positive() -> None:
    p = build_conviction_profile(
        beneish_flag="low_risk", altman_zone="safe", piotroski_score=8, piotroski_max=9,
        qoe_flag="strong", qoe_score=88, sector_avg_premium_pct=-20, sector_available=True,
        insider_net_shares=2_000_000,
    )
    assert p["overall"] == "solid"
    assert any("Người trong cuộc mua ròng" in c for c in p["cross_signals"])
    assert p["flow_signals"][0] == {
        "key": "insider", "label": "Nội bộ (6 tháng)", "direction": "buy",
        "text": "Nội bộ mua ròng 2.00M cp",
    }
