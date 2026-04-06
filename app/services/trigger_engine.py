"""Trigger evaluation for informational campaign recommendations."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from statistics import NormalDist
from typing import Any

import pandas as pd


@dataclass(slots=True)
class TriggerRuleConfig:
    """Rule configuration for forecast-based trigger evaluation."""

    hi_threshold_c: float
    min_consecutive_days: int
    prob_threshold: float
    use_anomaly: bool = True
    anom_hi_threshold_c: float = 3.0


def estimate_exceedance_probability(
    threshold_c: float,
    p10: float | None,
    p50: float,
    p90: float | None,
) -> float:
    """Estimate P(X >= threshold) from three forecast quantiles."""

    if p10 is None or p90 is None or p90 <= p10:
        return 1.0 if p50 >= threshold_c else 0.0

    normal = NormalDist(
        mu=p50,
        sigma=max((p90 - p10) / (NormalDist().inv_cdf(0.90) - NormalDist().inv_cdf(0.10)), 1e-6),
    )
    return max(0.0, min(1.0, 1.0 - normal.cdf(threshold_c)))


def select_recommendations(sku_id: str) -> dict[str, list[str]]:
    """Choose informational recommendations using a simple audience heuristic."""

    lower_sku = sku_id.lower()
    occupational = any(token in lower_sku for token in ("worker", "industrial", "field", "crew"))
    electrolyte = "electrolyte" in lower_sku or "hydration" in lower_sku

    if occupational:
        audience = ["outdoor_workers"]
        channels = ["mobile", "ooH", "retail_media"]
    elif electrolyte:
        audience = ["outdoor_workers", "commuters"]
        channels = ["mobile", "retail_media", "ooH"]
    else:
        audience = ["commuters"]
        channels = ["mobile", "retail_media"]

    return {
        "audience": audience,
        "message_themes": [
            "hydrate_before_exposure",
            "replace_electrolytes_after_sweating",
        ],
        "channels": channels,
        "availability_actions": [
            "increase_replenishment",
            "prioritize_cold_stock",
        ],
        "measurement_plan": [
            "geo_holdout_10pct",
            "pre_register_rule_version",
        ],
    }


def evaluate_trigger(
    forecast_frame: pd.DataFrame,
    rule: TriggerRuleConfig,
    scenario: str,
    sku_id: str,
) -> dict[str, Any]:
    """Evaluate whether a forecast warrants an informational trigger."""

    if scenario not in {"p50", "p90"}:
        raise ValueError("Scenario must be 'p50' or 'p90'.")
    if forecast_frame.empty:
        return {
            "decision": "NO_TRIGGER",
            "trigger_window": None,
            "reason_codes": [],
            "recommendations": select_recommendations(sku_id),
            "explainability": {
                "hi_p50_peak_c": None,
                "prob_hi_gt_threshold": None,
                "anom_hi_peak_c": None,
            },
        }

    hi_column = f"hi_max_{scenario}"
    if hi_column not in forecast_frame.columns:
        raise ValueError(f"Forecast frame is missing column '{hi_column}'.")

    frame = forecast_frame.copy().sort_values("forecast_date").reset_index(drop=True)
    frame["prob_hi_gt_threshold"] = frame.apply(
        lambda row: estimate_exceedance_probability(
            rule.hi_threshold_c,
            row.get("hi_max_p10"),
            row.get("hi_max_p50"),
            row.get("hi_max_p90"),
        ),
        axis=1,
    )
    frame["scenario_hi"] = frame[hi_column]
    if "anom_hi_p50" not in frame.columns:
        frame["anom_hi_p50"] = frame.get("anom_hi_p90", 0.0)
    if "anom_hi_p90" not in frame.columns:
        frame["anom_hi_p90"] = frame["anom_hi_p50"]
    frame["scenario_anom_hi"] = frame[f"anom_hi_{scenario}"] if f"anom_hi_{scenario}" in frame else frame["anom_hi_p50"]

    selected_window: pd.DataFrame | None = None
    for start_index in range(0, len(frame) - rule.min_consecutive_days + 1):
        candidate = frame.iloc[start_index : start_index + rule.min_consecutive_days]
        if not (candidate["scenario_hi"] >= rule.hi_threshold_c).all():
            continue

        window_probability = float(candidate["prob_hi_gt_threshold"].min())
        if window_probability < rule.prob_threshold:
            continue

        if rule.use_anomaly:
            anomaly_peak = float(candidate["scenario_anom_hi"].max())
            if anomaly_peak < rule.anom_hi_threshold_c:
                continue

        selected_window = candidate
        break

    reason_codes: list[str] = []
    recommendations = select_recommendations(sku_id)
    if selected_window is None:
        return {
            "decision": "NO_TRIGGER",
            "trigger_window": None,
            "reason_codes": reason_codes,
            "recommendations": recommendations,
            "explainability": {
                "hi_p50_peak_c": float(frame["hi_max_p50"].max()) if "hi_max_p50" in frame else None,
                "prob_hi_gt_threshold": float(frame["prob_hi_gt_threshold"].max()),
                "anom_hi_peak_c": float(frame["anom_hi_p50"].max()) if "anom_hi_p50" in frame else None,
            },
        }

    reason_codes.extend(["HI_EXCEEDS", "PERSISTENCE"])
    if rule.use_anomaly and float(selected_window["scenario_anom_hi"].max()) >= rule.anom_hi_threshold_c:
        reason_codes.append("UNUSUAL_HEAT")

    return {
        "decision": "TRIGGER",
        "trigger_window": {
            "start": selected_window["forecast_date"].iloc[0],
            "end": selected_window["forecast_date"].iloc[-1],
        },
        "reason_codes": reason_codes,
        "recommendations": recommendations,
        "explainability": {
            "hi_p50_peak_c": float(selected_window["hi_max_p50"].max()) if "hi_max_p50" in selected_window else None,
            "prob_hi_gt_threshold": float(selected_window["prob_hi_gt_threshold"].min()),
            "anom_hi_peak_c": float(selected_window["anom_hi_p50"].max()) if "anom_hi_p50" in selected_window else None,
        },
    }
