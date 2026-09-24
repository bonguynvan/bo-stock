"""Alert rules — normalize + evaluate (pure) and the GET/PUT/triggered flow."""
from __future__ import annotations

from app.services import alerts


class TestNormalize:
    def test_keeps_valid_and_assigns_ids(self) -> None:
        rules = alerts.normalize_rules([
            {"symbol": "fpt", "metric": "pe", "op": "lt", "value": "15", "note": "rẻ"},
            {"symbol": "VCB", "metric": "roe", "op": "gte", "value": 18},
        ])
        assert [r["id"] for r in rules] == [1, 2]
        assert rules[0]["symbol"] == "FPT" and rules[0]["value"] == 15.0
        assert rules[1]["metric"] == "roe"

    def test_drops_invalid(self) -> None:
        rules = alerts.normalize_rules([
            {"symbol": "", "metric": "pe", "op": "lt", "value": 1},        # no symbol
            {"symbol": "X", "metric": "bogus", "op": "lt", "value": 1},    # bad metric
            {"symbol": "X", "metric": "pe", "op": "between", "value": 1},  # bad op
            {"symbol": "X", "metric": "pe", "op": "lt", "value": "abc"},   # bad value
            "not a dict",
        ])
        assert rules == []

    def test_non_list_is_empty(self) -> None:
        assert alerts.normalize_rules(None) == []
        assert alerts.normalize_rules({"a": 1}) == []


class TestEvaluate:
    def test_fires_when_threshold_crossed(self) -> None:
        rules = alerts.normalize_rules([
            {"symbol": "FPT", "metric": "pe", "op": "lt", "value": 15},
            {"symbol": "FPT", "metric": "roe", "op": "gte", "value": 25},
        ])
        fired = alerts.evaluate_rules(rules, {"FPT": {"pe": 12.0, "roe": 20.0}})
        assert [f["metric"] for f in fired] == ["pe"]  # pe<15 fires, roe>=25 does not
        assert fired[0]["current"] == 12.0

    def test_skips_when_value_missing(self) -> None:
        rules = alerts.normalize_rules([{"symbol": "FPT", "metric": "pe", "op": "lt", "value": 15}])
        assert alerts.evaluate_rules(rules, {"FPT": {"pe": None}}) == []
        assert alerts.evaluate_rules(rules, {}) == []

    def test_all_ops(self) -> None:
        vals = {"X": {"pe": 10.0}}
        for op, should in [("lt", True), ("lte", True), ("gt", False), ("gte", False)]:
            r = alerts.normalize_rules([{"symbol": "X", "metric": "pe", "op": op, "value": 15}])
            assert bool(alerts.evaluate_rules(r, vals)) is should


async def test_router_seed_persist_and_evaluate(session) -> None:
    from app.routers.alerts import get_alerts, triggered, update_alerts, AlertsUpdate

    seeded = await get_alerts(db=session)
    assert seeded.data["rules"] == []
    assert "pe" in seeded.data["metrics"]

    # AAA in the seeded fixture has pe=10, roe=30.
    body = AlertsUpdate(rules=[
        {"symbol": "AAA", "metric": "pe", "op": "lt", "value": 15},   # fires (10<15)
        {"symbol": "AAA", "metric": "roe", "op": "gt", "value": 50},  # not (30>50 false)
    ])
    saved = await update_alerts(body, db=session)
    assert len(saved.data["rules"]) == 2

    fired = await triggered(db=session)
    assert [f["metric"] for f in fired.data] == ["pe"]
    assert fired.data[0]["current"] == 10.0
