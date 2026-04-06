"""Pydantic request and response schemas."""

from __future__ import annotations

import uuid
from datetime import date, datetime

from pydantic import BaseModel, ConfigDict, Field


class DistrictRead(BaseModel):
    """Serialized district metadata."""

    model_config = ConfigDict(from_attributes=True)

    district_id: uuid.UUID
    country_code: str
    admin1: str
    name: str


class HeatFeatureRead(BaseModel):
    """Serialized daily heat feature row."""

    model_config = ConfigDict(from_attributes=True)

    district_id: uuid.UUID
    country_code: str
    date: date
    tmax_c: float
    tmin_c: float
    rh_mean: float
    hi_max_c: float
    hi_3day_mean: float
    hi_7day_mean: float
    consecutive_hi_days_gt_35_c: int
    consecutive_hi_days_gt_40_c: int
    consecutive_hi_days_gt_45_c: int
    warm_night_flag: bool
    anom_tmax: float | None
    anom_hi: float | None
    data_quality_score: float


class WeatherForecastDay(BaseModel):
    """Serialized forecast record for a single district-day."""

    forecast_date: date
    tmax_p10: float | None = None
    tmax_p50: float
    tmax_p90: float | None = None
    hi_max_p10: float | None = None
    hi_max_p50: float
    hi_max_p90: float | None = None
    source: str


class WeatherForecastResponse(BaseModel):
    """Weather forecast response payload."""

    district_id: uuid.UUID
    run_time: datetime
    horizon_days: int
    items: list[WeatherForecastDay]


class TriggerRule(BaseModel):
    """Rule parameters for informational campaign triggers."""

    hi_threshold_c: float = Field(..., ge=0)
    min_consecutive_days: int = Field(..., ge=1)
    prob_threshold: float = Field(..., ge=0.0, le=1.0)
    use_anomaly: bool = True
    anom_hi_threshold_c: float = Field(3.0, ge=0.0)


class TriggerEvaluateRequest(BaseModel):
    """Trigger evaluation request payload."""

    district_id: uuid.UUID
    sku_id: str
    rule: TriggerRule
    scenario: str = Field(..., pattern="^(p50|p90)$")


class TriggerWindow(BaseModel):
    """Forecast window in which a rule is active."""

    start: date
    end: date


class TriggerRecommendations(BaseModel):
    """Informational recommendations for campaign planning."""

    audience: list[str]
    message_themes: list[str]
    channels: list[str]
    availability_actions: list[str]
    measurement_plan: list[str]


class TriggerExplainability(BaseModel):
    """Minimal explainability summary for decision auditing."""

    hi_p50_peak_c: float | None = None
    prob_hi_gt_threshold: float | None = None
    anom_hi_peak_c: float | None = None


class TriggerEvaluateResponse(BaseModel):
    """Trigger evaluation response payload."""

    decision: str
    trigger_window: TriggerWindow | None
    reason_codes: list[str]
    recommendations: TriggerRecommendations
    explainability: TriggerExplainability

