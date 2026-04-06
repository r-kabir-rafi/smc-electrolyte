"""Tests for the trigger engine."""

from __future__ import annotations

from datetime import date, timedelta

import pandas as pd

from app.services.trigger_engine import TriggerRuleConfig, evaluate_trigger


def test_trigger_window_and_reason_codes() -> None:
    """A qualifying forecast run should trigger with the expected window and reasons."""

    start = date(2025, 4, 1)
    frame = pd.DataFrame(
        [
            {"forecast_date": start + timedelta(days=0), "hi_max_p10": 38.0, "hi_max_p50": 39.0, "hi_max_p90": 41.0, "anom_hi_p50": 2.0, "anom_hi_p90": 3.0},
            {"forecast_date": start + timedelta(days=1), "hi_max_p10": 39.0, "hi_max_p50": 41.0, "hi_max_p90": 43.0, "anom_hi_p50": 4.2, "anom_hi_p90": 5.0},
            {"forecast_date": start + timedelta(days=2), "hi_max_p10": 40.0, "hi_max_p50": 42.0, "hi_max_p90": 45.0, "anom_hi_p50": 4.6, "anom_hi_p90": 5.5},
            {"forecast_date": start + timedelta(days=3), "hi_max_p10": 36.0, "hi_max_p50": 38.0, "hi_max_p90": 40.0, "anom_hi_p50": 1.0, "anom_hi_p90": 2.0},
        ]
    )
    rule = TriggerRuleConfig(
        hi_threshold_c=40.0,
        min_consecutive_days=2,
        prob_threshold=0.7,
        use_anomaly=True,
        anom_hi_threshold_c=3.0,
    )

    result = evaluate_trigger(frame, rule=rule, scenario="p50", sku_id="electrolyte_drink_main")

    assert result["decision"] == "TRIGGER"
    assert result["trigger_window"]["start"] == start + timedelta(days=1)
    assert result["trigger_window"]["end"] == start + timedelta(days=2)
    assert result["reason_codes"] == ["HI_EXCEEDS", "PERSISTENCE", "UNUSUAL_HEAT"]
    assert result["explainability"]["prob_hi_gt_threshold"] >= 0.7
